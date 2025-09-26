// api/src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { STAGES, canAdvance, newTrackingToken } from './state.js';
import { rateLimit } from './rateLimit.js';
import { authGuard, adminGuard, unlockGuard, optionalAuth, generateToken, verifyToken } from './middleware/auth.js';
import { hashPassword, comparePassword, validatePassword } from './utils/password.js';
import { markItemAsOrdered, unmarkItemAsOrdered } from './ordered-endpoints.js';
import { addAuditEndpoint } from './audit-endpoint-fix.js';


const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0'; // Listen on all interfaces for AWS

// AWS-compatible CORS configuration - FIXED VERSION
const allowedOrigins = [];

// Add CORS_ORIGIN if specified
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()));
}

// Add SERVER_IP origins if specified
if (process.env.SERVER_IP && process.env.SERVER_IP !== 'undefined') {
  allowedOrigins.push(
    `http://${process.env.SERVER_IP}:3000`,
    `http://${process.env.SERVER_IP}:4000`,
    `http://${process.env.SERVER_IP}`
  );
}

// Always add localhost for development
allowedOrigins.push('http://localhost:3000', 'http://localhost:4000');

// Add the known AWS IP as a fallback
allowedOrigins.push('http://50.19.66.100:3000', 'http://50.19.66.100:4000');

// Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

console.log('CORS Allowed Origins:', uniqueOrigins);

app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (uniqueOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// -----------------------------
// Helpers
// -----------------------------

// Helper function to safely convert strings to floats for measurements
function toFloat(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
async function checkOrderLock(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { isLocked: true }
  });
  return order?.isLocked || false;
}

// New flexible audit logging function
async function createAuditLog({
  entityType,
  entityId,
  parentEntityId = null,
  action,
  changes = null,
  metadata = null,
  userId = null,
  userName = null
}) {
  return await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      parentEntityId,
      action,
      changes: changes ? JSON.stringify(changes) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      performedByUserId: userId,
      performedByName: userName
    }
  });
}

// Helper for order-specific audit events (backwards compatibility)
async function logAuditEvent(orderId, action, reason = null, userId = null, userName = null) {
  return createAuditLog({
    entityType: 'Order',
    entityId: orderId,
    parentEntityId: orderId,
    action,
    metadata: reason ? { message: reason } : null,
    userId,
    userName
  });
}

// Helper to log field changes
async function logFieldChanges(entityType, entityId, changes, userId, userName, parentEntityId = null) {
  if (changes.length === 0) return;
  
  return createAuditLog({
    entityType,
    entityId,
    parentEntityId,
    action: `${entityType.toUpperCase()}_UPDATED`,
    changes,
    userId,
    userName
  });
}

function normalizeIncomingItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({
      productCode: String(i?.productCode ?? i?.code ?? i?.name ?? '').trim(),
      qty: Number(i?.qty ?? i?.quantity ?? i?.count ?? 1) || 1,
      serialNumber: i?.serialNumber ? String(i.serialNumber).trim() : null,
      modelNumber: i?.modelNumber ? String(i.modelNumber).trim() : null,
      voltage: i?.voltage ? String(i.voltage).trim() : null,
      notes: i?.notes ? String(i.notes).trim() : null
    }))
    .filter((i) => i.productCode.length > 0);
}

// -----------------------------
// Authentication Routes
// -----------------------------

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    
    // Verify password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });
    
    // Generate token
    const token = generateToken(user);
    
    // Return user data and token
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/auth/me', authGuard, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role
    }
  });
});

// Logout (client-side token removal, but we can track it)
app.post('/auth/logout', authGuard, async (req, res) => {
  // Could implement token blacklist here if needed
  res.json({ message: 'Logged out successfully' });
});

// Check authentication status
app.get('/auth/check', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// -----------------------------
// MEASUREMENT ENDPOINTS (BYPASS LOCK)
// -----------------------------
// These endpoints specifically handle measurements and bypass order lock checking

// Update individual item measurements - BYPASSES LOCK
app.patch('/orders/:orderId/items/:itemId/measurements', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { height, width, length, weight, measurementUnit, weightUnit } = req.body;
    const userId = req.user?.id || 'Unknown';
    const userName = req.user?.name || 'Unknown';
    
    // Verify item exists and belongs to order
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { 
        id: true, 
        orderId: true,
        height: true,
        width: true,
        length: true,
        weight: true,
        measurementUnit: true,
        weightUnit: true
      }
    });
    
    if (!item || item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    // Create audit logs for changes
    const changes = [];
    
    if (height !== undefined && height !== item.height) {
      changes.push({
        field: 'height',
        oldValue: item.height ? String(item.height) : 'null',
        newValue: height ? String(height) : 'null'
      });
    }
    
    if (width !== undefined && width !== item.width) {
      changes.push({
        field: 'width',
        oldValue: item.width ? String(item.width) : 'null',
        newValue: width ? String(width) : 'null'
      });
    }
    
    if (length !== undefined && length !== item.length) {
      changes.push({
        field: 'length',
        oldValue: item.length ? String(item.length) : 'null',
        newValue: length ? String(length) : 'null'
      });
    }
    
    if (weight !== undefined && weight !== item.weight) {
      changes.push({
        field: 'weight',
        oldValue: item.weight ? String(item.weight) : 'null',
        newValue: weight ? String(weight) : 'null'
      });
    }
    
    if (measurementUnit !== undefined && measurementUnit !== item.measurementUnit) {
      changes.push({
        field: 'measurementUnit',
        oldValue: item.measurementUnit || 'null',
        newValue: measurementUnit || 'null'
      });
    }
    
    if (weightUnit !== undefined && weightUnit !== item.weightUnit) {
      changes.push({
        field: 'weightUnit',
        oldValue: item.weightUnit || 'null',
        newValue: weightUnit || 'null'
      });
    }
    
    if (changes.length === 0) {
      return res.json(item);
    }
    
    // Update item with new measurements
    const updatedItem = await prisma.$transaction(async (tx) => {
      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: {
          height: height !== undefined ? toFloat(height) : item.height,
          width: width !== undefined ? toFloat(width) : item.width,
          length: length !== undefined ? toFloat(length) : item.length,
          weight: weight !== undefined ? toFloat(weight) : item.weight,
          measurementUnit: measurementUnit !== undefined ? measurementUnit : item.measurementUnit,
          weightUnit: weightUnit !== undefined ? weightUnit : item.weightUnit,
          measuredAt: new Date(),
          measuredBy: userName
        }
      });
      
      // Create comprehensive audit log for measurements
      await tx.auditLog.create({
        data: {
          entityType: 'Measurement',
          entityId: itemId,
          parentEntityId: orderId,
          action: 'MEASUREMENTS_UPDATED',
          changes: JSON.stringify(changes),
          metadata: JSON.stringify({
            message: 'Measurements updated (bypassed lock)',
            updatedFields: changes.map(c => c.field).join(', ')
          }),
          performedByUserId: userId,
          performedByName: userName
        }
      });
      
      return updated;
    });
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Measurement update error:', error);
    res.status(500).json({ error: 'Failed to update measurements' });
  }
});

// Get measurement history for an item
app.get('/orders/:orderId/items/:itemId/measurement-history', authGuard, async (req, res) => {
  try {
    const { itemId, orderId } = req.params;
    
    // Verify item exists and belongs to order
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { id: true, orderId: true }
    });
    
    if (!item || item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    // Get measurement-related audit logs
    const history = await prisma.auditLog.findMany({
      where: {
        AND: [
          { entityId: itemId },
          { 
            OR: [
              { entityType: 'Measurement' },
              { action: 'MEASUREMENTS_UPDATED' }
            ]
          }
        ]
      },
      include: {
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    // Parse and format the history
    const formattedHistory = history.map(log => {
      let changes = [];
      let metadata = {};
      
      try {
        if (log.changes) {
          changes = JSON.parse(log.changes);
        }
        if (log.metadata) {
          metadata = JSON.parse(log.metadata);
        }
      } catch (e) {
        console.error('Error parsing log data:', e);
      }
      
      return {
        id: log.id,
        timestamp: log.createdAt,
        changes: changes,
        message: metadata.message || null,
        updatedFields: metadata.updatedFields || null,
        performedBy: log.performedBy,
        performedByName: log.performedByName
      };
    });
    
    res.json(formattedHistory);
  } catch (error) {
    console.error('Error fetching measurement history:', error);
    res.status(500).json({ error: 'Failed to fetch measurement history' });
  }
});

// Bulk update measurements for multiple items - BYPASSES LOCK
app.patch('/orders/:orderId/measurements/bulk', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { items } = req.body; // Array of { itemId, height, width, length, weight, measurementUnit, weightUnit }
    const userName = req.user?.name || 'Unknown';
    const userId = req.user?.id || 'Unknown';
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    // Verify all items belong to the order
    const itemIds = items.map(item => item.itemId);
    const existingItems = await prisma.orderItem.findMany({
      where: {
        id: { in: itemIds },
        orderId: orderId
      },
      select: {
        id: true,
        height: true,
        width: true,
        length: true,
        weight: true,
        measurementUnit: true,
        weightUnit: true
      }
    });
    
    if (existingItems.length !== items.length) {
      return res.status(400).json({ error: 'Some items do not belong to this order' });
    }
    
    // Create a map for easy lookup
    const existingItemsMap = new Map(existingItems.map(item => [item.id, item]));
    
    const updates = await prisma.$transaction(async (tx) => {
      const updatedItems = [];
      const allChanges = [];
      
      for (const updateData of items) {
        const existing = existingItemsMap.get(updateData.itemId);
        if (!existing) continue;
        
        const itemChanges = [];
        const data = {};
        
        // Track changes for each field
        if (updateData.height !== undefined && updateData.height !== existing.height) {
          data.height = updateData.height;
          itemChanges.push({
            field: 'height',
            oldValue: existing.height ? String(existing.height) : 'null',
            newValue: updateData.height ? String(updateData.height) : 'null'
          });
        }
        
        if (updateData.width !== undefined && updateData.width !== existing.width) {
          data.width = updateData.width;
          itemChanges.push({
            field: 'width',
            oldValue: existing.width ? String(existing.width) : 'null',
            newValue: updateData.width ? String(updateData.width) : 'null'
          });
        }
        
        if (updateData.length !== undefined && updateData.length !== existing.length) {
          data.length = updateData.length;
          itemChanges.push({
            field: 'length',
            oldValue: existing.length ? String(existing.length) : 'null',
            newValue: updateData.length ? String(updateData.length) : 'null'
          });
        }
        
        if (updateData.weight !== undefined && updateData.weight !== existing.weight) {
          data.weight = updateData.weight;
          itemChanges.push({
            field: 'weight',
            oldValue: existing.weight ? String(existing.weight) : 'null',
            newValue: updateData.weight ? String(updateData.weight) : 'null'
          });
        }
        
        if (updateData.measurementUnit !== undefined && updateData.measurementUnit !== existing.measurementUnit) {
          data.measurementUnit = updateData.measurementUnit;
          itemChanges.push({
            field: 'measurementUnit',
            oldValue: existing.measurementUnit || 'null',
            newValue: updateData.measurementUnit || 'null'
          });
        }
        
        if (updateData.weightUnit !== undefined && updateData.weightUnit !== existing.weightUnit) {
          data.weightUnit = updateData.weightUnit;
          itemChanges.push({
            field: 'weightUnit',
            oldValue: existing.weightUnit || 'null',
            newValue: updateData.weightUnit || 'null'
          });
        }
        
        if (Object.keys(data).length > 0) {
          data.measuredAt = new Date();
          data.measuredBy = userName;
          
          const updated = await tx.orderItem.update({
            where: { id: updateData.itemId },
            data
          });
          
          updatedItems.push(updated);
          
          if (itemChanges.length > 0) {
            allChanges.push({
              itemId: updateData.itemId,
              changes: itemChanges
            });
            
            // Create audit log for this item
            await tx.auditLog.create({
              data: {
                entityType: 'Measurement',
                entityId: updateData.itemId,
                parentEntityId: orderId,
                action: 'MEASUREMENTS_BULK_UPDATED',
                changes: JSON.stringify(itemChanges),
                metadata: JSON.stringify({
                  message: 'Bulk measurements update (bypassed lock)',
                  updatedFields: itemChanges.map(c => c.field).join(', ')
                }),
                performedByUserId: userId,
                performedByName: userName
              }
            });
          }
        }
      }
      
      // Create a summary audit log for the bulk operation
      if (updatedItems.length > 0) {
        await tx.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: orderId,
            parentEntityId: orderId,
            action: 'BULK_MEASUREMENTS_UPDATED',
            metadata: JSON.stringify({
              message: `Bulk measurements update for ${updatedItems.length} items`,
              itemsUpdated: updatedItems.map(item => item.id)
            }),
            performedByUserId: userId,
            performedByName: userName
          }
        });
      }
      
      return updatedItems;
    });
    
    res.json({ 
      updated: updates.length, 
      items: updates 
    });
  } catch (error) {
    console.error('Bulk measurement update error:', error);
    res.status(500).json({ error: 'Failed to update measurements' });
  }
});

// -----------------------------
// User Management Routes (Admin only)
// -----------------------------

// List all users
app.get('/users', adminGuard, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single user
app.get('/users/:id', adminGuard, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create new user with audit logging
app.post('/users', adminGuard, async (req, res) => {
  try {
    const { email, name, password, role = 'AGENT' } = req.body;
    
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }
    
    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.message });
    }
    
    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user with audit log
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          password: hashedPassword,
          role: role.toUpperCase(),
          isActive: true
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      });
      
      // Log user creation using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'User',
          entityId: newUser.id,
          action: 'USER_CREATED',
          metadata: JSON.stringify({
            entity: 'User',
            entityId: newUser.id,
            data: {
              email: newUser.email,
              name: newUser.name,
              role: newUser.role
            }
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return newUser;
    });
    
    res.status(201).json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user with field change logging
app.patch('/users/:id', adminGuard, async (req, res) => {
  try {
    const original = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    
    if (!original) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { name, email, role, isActive, password } = req.body;
    const data = {};
    const changes = [];
    
    if (name !== undefined && name !== original.name) {
      data.name = name;
      changes.push({
        field: 'name',
        oldValue: original.name,
        newValue: name
      });
    }
    
    if (email !== undefined && email.toLowerCase() !== original.email) {
      data.email = email.toLowerCase();
      changes.push({
        field: 'email',
        oldValue: original.email,
        newValue: data.email
      });
    }
    
    if (role !== undefined && role.toUpperCase() !== original.role) {
      data.role = role.toUpperCase();
      changes.push({
        field: 'role',
        oldValue: original.role,
        newValue: data.role
      });
    }
    
    if (isActive !== undefined && isActive !== original.isActive) {
      data.isActive = isActive;
      changes.push({
        field: 'isActive',
        oldValue: String(original.isActive),
        newValue: String(isActive)
      });
    }
    
    // Handle password update
    if (password) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ error: passwordValidation.message });
      }
      data.password = await hashPassword(password);
      changes.push({
        field: 'password',
        oldValue: '[hidden]',
        newValue: '[changed]'
      });
    }
    
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.params.id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          updatedAt: true
        }
      });
      
      // Log field changes using new audit system
      if (changes.length > 0) {
        await tx.auditLog.create({
          data: {
            entityType: 'User',
            entityId: req.params.id,
            action: 'USER_UPDATED',
            changes: JSON.stringify(changes),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
      }
      
      return updated;
    });
    
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete user (soft delete by deactivating) with logging
app.delete('/users/:id', adminGuard, async (req, res) => {
  try {
    // Don't allow deleting yourself
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });
      
      // Log deactivation using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'User',
          entityId: req.params.id,
          action: 'USER_DEACTIVATED',
          metadata: JSON.stringify({ message: 'User account deactivated' }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
    });
    
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Public routes (rate-limited)
// -----------------------------
app.use('/public', rateLimit);

// Public order read (no auth required)
app.get('/public/orders/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const order = await prisma.order.findUnique({
      where: { trackingToken: token },
      include: {
        account: true,
        items: {
          include: { statusEvents: { orderBy: { createdAt: 'asc' } } }
        },
        statusEvents: { orderBy: { createdAt: 'asc' } }
      }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const {
      id, poNumber, sku, createdAt, etaDate, currentStage,
      shippingCarrier, trackingNumber, items, statusEvents, account, customerDocsLink
    } = order;

    res.json({
      id,
      accountName: account?.name ?? null,
      account: account ? {
        name: account.name,
        email: account.email,
        phone: account.phone,
        address: account.address,
        machineVoltage: account.machineVoltage
      } : null,
      poNumber,
      sku,
      createdAt,
      etaDate,
      currentStage,
      shippingCarrier,
      trackingNumber,
      items: items.map(it => ({
        id: it.id,
        productCode: it.productCode,
        qty: it.qty,
        serialNumber: it.serialNumber,
        modelNumber: it.modelNumber,
        voltage: it.voltage,
        notes: it.notes,
        currentStage: it.currentStage ?? currentStage,
        archivedAt: it.archivedAt,
        statusEvents: it.statusEvents,
        // Include measurements in public view
        height: it.height,
        width: it.width,
        length: it.length,
        weight: it.weight,
        measurementUnit: it.measurementUnit,
        weightUnit: it.weightUnit
      })),
      statusEvents,
      customerDocsLink
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Lock/Unlock routes
// -----------------------------

// Lock an order (both admin and agent can lock)
app.post('/orders/:id/lock', authGuard, async (req, res) => {
  try {
    const { reason } = req.body || {};
    
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, isLocked: true }
    });
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.isLocked) return res.status(400).json({ error: 'Order is already locked' });
    
    // Lock the order
    const updatedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: req.user.name
      }
    });
    
    // Log the lock action
    await logAuditEvent(
      req.params.id, 
      'LOCKED', 
      reason, 
      req.user.id,
      req.user.name
    );
    
    res.json({ 
      success: true, 
      order: updatedOrder,
      message: 'Order has been locked'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unlock an order (ADMIN ONLY)
app.post('/orders/:id/unlock', unlockGuard, async (req, res) => {
  try {
    const { reason } = req.body || {};
    
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ 
        error: 'A reason with at least 10 characters is required to unlock an order' 
      });
    }
    
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, isLocked: true }
    });
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.isLocked) return res.status(400).json({ error: 'Order is not locked' });
    
    // Unlock the order
    const updatedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedBy: null
      }
    });
    
    // Log the unlock action
    await logAuditEvent(
      req.params.id, 
      'UNLOCKED', 
      reason.trim(), 
      req.user.id,
      req.user.name
    );
    
    res.json({ 
      success: true, 
      order: updatedOrder,
      message: 'Order has been unlocked'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get audit log for an order - using new audit system
app.get('/orders/:id/audit-log', authGuard, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { 
        OR: [
          { entityId: req.params.id },
          { parentEntityId: req.params.id }
        ]
      },
      include: {
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Parse and format the logs for better readability
    const formattedLogs = logs.map(log => {
      let parsedMetadata = {};
      let parsedChanges = null;
      
      try {
        if (log.metadata) {
          parsedMetadata = JSON.parse(log.metadata);
        }
        if (log.changes) {
          parsedChanges = JSON.parse(log.changes);
        }
      } catch (e) {
        // Keep original if parsing fails
      }
      
      return {
        ...log,
        parsedReason: parsedMetadata,
        changes: parsedChanges
      };
    });
    
    res.json(formattedLogs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Order Management Routes
// -----------------------------

// List orders
app.get('/orders', authGuard, async (req, res) => {
  try {
    const { stage, accountId, search } = req.query;
    const where = {};
    if (stage) where.currentStage = String(stage);
    if (accountId) where.accountId = String(accountId);
    if (search) {
      const q = String(search);
      where.OR = [
        { poNumber: { contains: q } },
        { sku: { contains: q } },
        { account: { is: { name: { contains: q } } } },
        { items: { some: { productCode: { contains: q } } } },
        { items: { some: { serialNumber: { contains: q } } } }
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        account: true,
        items: { include: { statusEvents: { orderBy: { createdAt: 'asc' } } } },
        statusEvents: { orderBy: { createdAt: 'asc' } },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: [{ createdAt: 'desc' }]
    });

    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single order
app.get('/orders/:id', authGuard, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        account: true,
        items: { include: { statusEvents: { orderBy: { createdAt: 'asc' } } } },
        statusEvents: { orderBy: { createdAt: 'asc' } },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    if (!order) return res.status(404).json({ error: 'Not found' });
    
    // Get audit logs from new system
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: req.params.id },
          { parentEntityId: req.params.id }
        ]
      },
      include: {
        performedBy: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    res.json({ ...order, auditLogs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update order with field change logging
app.patch('/orders/:id', authGuard, async (req, res) => {
  try {
    const original = await prisma.order.findUnique({
      where: { id: req.params.id }
    });
    
    if (!original) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Handle customerDocsLink update (allowed even when locked)
    const { customerDocsLink } = req.body || {};
    if (customerDocsLink !== undefined && customerDocsLink !== original.customerDocsLink) {
      const updatedOrder = await prisma.order.update({
        where: { id: req.params.id },
        data: { customerDocsLink },
        include: { account: true, items: true }
      });
      await createAuditLog({
        entityType: 'Order',
        entityId: req.params.id,
        parentEntityId: req.params.id,
        action: 'ORDER_UPDATED',
        changes: [{
          field: 'customerDocsLink',
          oldValue: original.customerDocsLink || 'null',
          newValue: customerDocsLink || 'null'
        }],
        userId: req.user.id,
        userName: req.user.name
      });
      return res.json(updatedOrder);
    }
    
    if (original.isLocked) {
      await logAuditEvent(
        req.params.id,
        'EDIT_ATTEMPTED_WHILE_LOCKED',
        'Tried to edit order fields',
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ error: 'Cannot edit a locked order' });
    }
    
    const { poNumber, sku, etaDate, trackingNumber, shippingCarrier, accountId } = req.body || {};
    const data = {};
    const changes = [];
    
    if (poNumber !== undefined && poNumber !== original.poNumber) {
      data.poNumber = poNumber;
      changes.push({
        field: 'poNumber',
        oldValue: original.poNumber || 'null',
        newValue: poNumber || 'null'
      });
    }
    
    if (sku !== undefined && sku !== original.sku) {
      data.sku = sku;
      changes.push({
        field: 'sku',
        oldValue: original.sku || 'null',
        newValue: sku || 'null'
      });
    }
    
    if (etaDate !== undefined) {
      const newDate = etaDate ? new Date(etaDate) : null;
      const oldDateStr = original.etaDate?.toISOString() || null;
      const newDateStr = newDate?.toISOString() || null;
      
      if (oldDateStr !== newDateStr) {
        data.etaDate = newDate;
        changes.push({
          field: 'etaDate',
          oldValue: oldDateStr || 'null',
          newValue: newDateStr || 'null'
        });
      }
    }
    
    if (trackingNumber !== undefined && trackingNumber !== original.trackingNumber) {
      data.trackingNumber = trackingNumber;
      changes.push({
        field: 'trackingNumber',
        oldValue: original.trackingNumber || 'null',
        newValue: trackingNumber || 'null'
      });
    }
    
    if (shippingCarrier !== undefined && shippingCarrier !== original.shippingCarrier) {
      data.shippingCarrier = shippingCarrier;
      changes.push({
        field: 'shippingCarrier',
        oldValue: original.shippingCarrier || 'null',
        newValue: shippingCarrier || 'null'
      });
    }
    
    if (accountId !== undefined && accountId !== original.accountId) {
      data.accountId = accountId;
      changes.push({
        field: 'accountId',
        oldValue: original.accountId,
        newValue: accountId
      });
    }
    
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: req.params.id },
        data,
        include: { account: true, items: true }
      });
      
      // Log field changes using new audit system
      if (changes.length > 0) {
        await logFieldChanges('Order', req.params.id, changes, req.user.id, req.user.name, req.params.id);
      }
      
      return updated;
    });
    
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete order
app.delete('/orders/:id', authGuard, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ 
      where: { id: req.params.id },
      select: { id: true, isLocked: true } 
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (order.isLocked) {
      await logAuditEvent(
        req.params.id, 
        'DELETE_ATTEMPTED_WHILE_LOCKED', 
        null, 
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ error: 'Cannot delete a locked order. Please unlock it first.' });
    }

    await prisma.$transaction(async (tx) => {
      // Log deletion before deleting using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: req.params.id,
          parentEntityId: req.params.id,
          action: 'ORDER_DELETED',
          metadata: JSON.stringify({ message: 'Order and all items deleted' }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      await tx.order.delete({ where: { id: req.params.id } });
    });
    
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark item as ordered (Admin only)
app.post('/orders/:id/items/:itemId/ordered', authGuard, async (req, res) => {
  await markItemAsOrdered(req, res, prisma, req.user);
});

// Unmark item as ordered (Admin only, requires reason)
app.post('/orders/:id/items/:itemId/unordered', authGuard, async (req, res) => {
  await unmarkItemAsOrdered(req, res, prisma, req.user);
});

// Create order with logging
app.post('/orders', authGuard, async (req, res) => {
  try {
    const { accountId, poNumber, sku, items = [], customerDocsLink } = req.body || {};
    if (!accountId) return res.status(400).json({ error: 'accountId required' });

    const normalizedItems = normalizeIncomingItems(items);
    const trackingToken = newTrackingToken();

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          accountId: String(accountId),
          poNumber: poNumber ?? null,
          sku: sku ?? null,
          trackingToken,
          customerDocsLink: customerDocsLink ?? null,
          createdByUserId: req.user.id,
          items: { create: normalizedItems }
        },
        include: { account: true, items: true, statusEvents: true }
      });

      // Create initial status event
      await tx.orderStatusEvent.create({
        data: { 
          orderId: newOrder.id, 
          stage: 'MANUFACTURING', 
          note: 'Created',
          changedByUserId: req.user.id
        }
      });
      
      // Log order creation using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: newOrder.id,
          parentEntityId: newOrder.id,
          action: 'ORDER_CREATED',
          metadata: JSON.stringify({
            entity: 'Order',
            entityId: newOrder.id,
            data: {
              accountId: newOrder.accountId,
              poNumber: newOrder.poNumber,
              sku: newOrder.sku,
              itemCount: normalizedItems.length
            }
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return newOrder;
    });

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Account Management Routes with Audit Logging
// -----------------------------

app.get('/accounts', authGuard, async (_req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      select: { 
        id: true, 
        name: true, 
        email: true, 
        address: true,
        phone: true,
        machineVoltage: true,
        notes: true,
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/accounts/:id', authGuard, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: { orders: true }
    });
    if (!account) return res.status(404).json({ error: 'Not found' });
    res.json(account);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create account with logging
app.post('/accounts', authGuard, async (req, res) => {
  try {
    const { name, email, address, phone, machineVoltage, notes } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name required' });
    }
    
    const account = await prisma.$transaction(async (tx) => {
      const newAccount = await tx.account.create({
        data: { 
          name: String(name).trim(), 
          email: email ? String(email).trim() : null,
          address: address ? String(address).trim() : null,
          phone: phone ? String(phone).trim() : null,
          machineVoltage: machineVoltage ? String(machineVoltage).trim() : null,
          notes: notes ? String(notes).trim() : null
        }
      });
      
      // Log account creation using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Account',
          entityId: newAccount.id,
          action: 'ACCOUNT_CREATED',
          metadata: JSON.stringify({
            entity: 'Account',
            entityId: newAccount.id,
            data: {
              name: newAccount.name,
              email: newAccount.email,
              phone: newAccount.phone
            }
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return newAccount;
    });
    
    res.status(201).json(account);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update account with comprehensive field change logging - FIXED VERSION
app.patch('/accounts/:id', authGuard, async (req, res) => {
  try {
    const original = await prisma.account.findUnique({
      where: { id: req.params.id }
    });
    
    if (!original) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const { name, email, address, phone, machineVoltage, notes } = req.body || {};
    const data = {};
    const changes = [];
    
    if (name !== undefined && String(name).trim() !== original.name) {
      data.name = String(name).trim();
      changes.push({
        field: 'name',
        oldValue: original.name,
        newValue: data.name
      });
    }
    
    if (email !== undefined) {
      const newEmail = email ? String(email).trim() : null;
      if (newEmail !== original.email) {
        data.email = newEmail;
        changes.push({
          field: 'email',
          oldValue: original.email || 'null',
          newValue: newEmail || 'null'
        });
      }
    }
    
    if (address !== undefined) {
      const newAddress = address ? String(address).trim() : null;
      if (newAddress !== original.address) {
        data.address = newAddress;
        changes.push({
          field: 'address',
          oldValue: original.address || 'null',
          newValue: newAddress || 'null'
        });
      }
    }
    
    if (phone !== undefined) {
      const newPhone = phone ? String(phone).trim() : null;
      if (newPhone !== original.phone) {
        data.phone = newPhone;
        changes.push({
          field: 'phone',
          oldValue: original.phone || 'null',
          newValue: newPhone || 'null'
        });
      }
    }
    
    if (machineVoltage !== undefined) {
      const newVoltage = machineVoltage ? String(machineVoltage).trim() : null;
      if (newVoltage !== original.machineVoltage) {
        data.machineVoltage = newVoltage;
        changes.push({
          field: 'machineVoltage',
          oldValue: original.machineVoltage || 'null',
          newValue: newVoltage || 'null'
        });
      }
    }
    
    if (notes !== undefined) {
      const newNotes = notes ? String(notes).trim() : null;
      if (newNotes !== original.notes) {
        data.notes = newNotes;
        changes.push({
          field: 'notes',
          oldValue: original.notes || 'null',
          newValue: newNotes || 'null'
        });
      }
    }
    
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.account.update({
        where: { id: req.params.id },
        data
      });
      
      // Use the new flexible audit log - THIS IS THE FIX
      if (changes.length > 0) {
        await tx.auditLog.create({
          data: {
            entityType: 'Account',
            entityId: req.params.id,
            action: 'ACCOUNT_UPDATED',
            changes: JSON.stringify(changes),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
      }
      
      return updated;
    });
    
    res.json(account);
  } catch (e) {
    console.error('Account update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete account with logging
app.delete('/accounts/:id', authGuard, async (req, res) => {
  try {
    // First check if account exists and get order count
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          select: {
            id: true,
            poNumber: true,
            createdAt: true
          }
        }
      }
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if there are any associated orders
    if (account.orders && account.orders.length > 0) {
      // Build a helpful error message with order details
      const orderDetails = account.orders.slice(0, 3).map(o => 
        `PO#${o.poNumber || 'N/A'} (${new Date(o.createdAt).toLocaleDateString()})`
      ).join(', ');
      
      const moreOrders = account.orders.length > 3 
        ? ` and ${account.orders.length - 3} more` 
        : '';
      
      return res.status(400).json({
        error: `Cannot delete customer "${account.name}" because they have ${account.orders.length} associated order(s): ${orderDetails}${moreOrders}. Please delete all orders first.`
      });
    }
    
    // Safe to delete - no orders associated
    await prisma.$transaction(async (tx) => {
      // Log deletion using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Account',
          entityId: account.id,
          action: 'ACCOUNT_DELETED',
          metadata: JSON.stringify({ 
            message: `Account "${account.name}" deleted (no associated orders)` 
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      // Delete the account
      await tx.account.delete({ 
        where: { id: req.params.id } 
      });
    });
    
    res.status(204).end();
  } catch (e) {
    // This will catch any foreign key constraint errors as a fallback
    if (e.code === 'P2003') {
      console.error('Foreign key constraint error:', e);
      return res.status(400).json({ 
        error: 'Cannot delete this customer because they have associated orders. Please delete all orders first.' 
      });
    }
    console.error('Account deletion error:', e);
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Stage Management Routes
// -----------------------------

// Advance whole order stage
app.post('/orders/:id/stage', authGuard, async (req, res) => {
  try {
    const { nextStage, note, allowFastForward = false } = req.body || {};
    if (!nextStage) return res.status(400).json({ error: 'nextStage required' });
    if (!STAGES.includes(nextStage)) return res.status(400).json({ error: 'invalid stage' });

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Not found' });

    if (!canAdvance(order.currentStage, nextStage, !!allowFastForward)) {
      return res.status(400).json({ error: `Cannot move from ${order.currentStage} to ${nextStage}` });
    }

    const event = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { currentStage: nextStage }
      });
      return tx.orderStatusEvent.create({
        data: { 
          orderId: order.id, 
          stage: nextStage, 
          note: note ?? null,
          changedByUserId: req.user.id
        }
      });
    });

    res.json({ ok: true, event });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Item-level stage change
app.post('/orders/:orderId/items/:itemId/stage', authGuard, async (req, res) => {
  try {
    const {
      nextStage,
      note,
      allowFastForward = false,
      allowBackward = false
    } = req.body || {};

    if (!nextStage) return res.status(400).json({ error: 'nextStage required' });
    if (!STAGES.includes(nextStage)) return res.status(400).json({ error: 'invalid stage' });

    const item = await prisma.orderItem.findUnique({
      where: { id: req.params.itemId },
      include: { order: true }
    });
    if (!item || item.orderId !== req.params.orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }

    const currentStage = item.currentStage ?? item.order.currentStage ?? 'MANUFACTURING';
    const isForward = STAGES.indexOf(nextStage) >= STAGES.indexOf(currentStage);

    if (isForward) {
      if (!canAdvance(currentStage, nextStage, !!allowFastForward)) {
        return res.status(400).json({ error: `Cannot move item from ${currentStage} to ${nextStage}` });
      }
    } else if (!allowBackward) {
      return res.status(400).json({ error: `Backward move from ${currentStage} to ${nextStage} not allowed` });
    }

    const event = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { currentStage: nextStage }
      });
      return tx.orderItemStatusEvent.create({
        data: {
          orderItemId: item.id,
          stage: nextStage,
          note: note ?? (isForward ? null : `Correction: ${currentStage} → ${nextStage}`),
          changedByUserId: req.user.id
        }
      });
    });

    res.json({ ok: true, event });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Item CRUD Routes with Audit Logging
// -----------------------------

// Create items with logging
app.post('/orders/:orderId/items', authGuard, async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const order = await prisma.order.findUnique({ 
      where: { id: orderId }, 
      select: { id: true, isLocked: true } 
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (order.isLocked) {
      await logAuditEvent(
        orderId, 
        'EDIT_ATTEMPTED_WHILE_LOCKED', 
        'Tried to add items', 
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ error: 'Cannot add items to a locked order. Please unlock it first.' });
    }

    const body = req.body || {};
    let items = [];

    if (Array.isArray(body)) {
      items = normalizeIncomingItems(body);
    } else if (Array.isArray(body.items)) {
      items = normalizeIncomingItems(body.items);
    } else {
      items = normalizeIncomingItems([body]);
    }

    if (items.length === 0) return res.status(400).json({ error: 'No valid items provided' });

    const created = await prisma.$transaction(async (tx) => {
      const createdItems = [];
      for (const i of items) {
        const row = await tx.orderItem.create({
          data: { 
            orderId, 
            productCode: i.productCode, 
            qty: i.qty,
            serialNumber: i.serialNumber,
            modelNumber: i.modelNumber,
            voltage: i.voltage,
            notes: i.notes
          }
        });
        createdItems.push(row);
      }
      
      // Log item creation using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'OrderItem',
          entityId: createdItems[0].id, // Use first item's ID
          parentEntityId: orderId,
          action: 'ITEMS_ADDED',
          metadata: JSON.stringify({
            entity: 'OrderItem',
            count: createdItems.length,
            items: createdItems.map(item => ({
              id: item.id,
              productCode: item.productCode,
              qty: item.qty
            }))
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return createdItems;
    });
    
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update item with comprehensive field change logging - MODIFIED TO ALLOW MEASUREMENTS ON LOCKED ORDERS
app.patch('/orders/:orderId/items/:itemId', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const item = await prisma.orderItem.findUnique({ 
      where: { id: itemId }, 
      select: { 
        id: true, 
        orderId: true,
        productCode: true,
        qty: true,
        serialNumber: true,
        modelNumber: true,
        voltage: true,
        notes: true,
        archivedAt: true,
        currentStage: true,
        height: true,
        width: true,
        length: true,
        weight: true,
        measurementUnit: true,
        weightUnit: true
      } 
    });
    
    if (!item || item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isLocked: true }
    });
    
    const data = {};
    const changes = [];
    
    // Archive/restore is allowed even when locked
    if (req.body.archivedAt !== undefined) {
      const newArchived = req.body.archivedAt ? new Date(req.body.archivedAt) : null;
      const oldArchived = item.archivedAt;
      
      const oldArchivedStr = oldArchived ? oldArchived.toISOString() : null;
      const newArchivedStr = newArchived ? newArchived.toISOString() : null;
      
      if (oldArchivedStr !== newArchivedStr) {
        data.archivedAt = newArchived;
        changes.push({
          field: 'archivedAt',
          oldValue: oldArchivedStr || 'null',
          newValue: newArchivedStr || 'null'
        });
      }
    }
    
    // Measurements are allowed even when locked
    const measurementFields = ['height', 'width', 'length', 'weight', 'measurementUnit', 'weightUnit'];
    const hasMeasurementFields = measurementFields.some(field => req.body.hasOwnProperty(field));
    
    if (hasMeasurementFields) {
      // Process measurement fields
      if (req.body.hasOwnProperty('height') && req.body.height !== item.height) {
        data.height = req.body.height;
        changes.push({
          field: 'height',
          oldValue: item.height ? String(item.height) : 'null',
          newValue: req.body.height ? String(req.body.height) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('width') && req.body.width !== item.width) {
        data.width = req.body.width;
        changes.push({
          field: 'width',
          oldValue: item.width ? String(item.width) : 'null',
          newValue: req.body.width ? String(req.body.width) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('length') && req.body.length !== item.length) {
        data.length = req.body.length;
        changes.push({
          field: 'length',
          oldValue: item.length ? String(item.length) : 'null',
          newValue: req.body.length ? String(req.body.length) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('weight') && req.body.weight !== item.weight) {
        data.weight = req.body.weight;
        changes.push({
          field: 'weight',
          oldValue: item.weight ? String(item.weight) : 'null',
          newValue: req.body.weight ? String(req.body.weight) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('measurementUnit') && req.body.measurementUnit !== item.measurementUnit) {
        data.measurementUnit = req.body.measurementUnit;
        changes.push({
          field: 'measurementUnit',
          oldValue: item.measurementUnit || 'null',
          newValue: req.body.measurementUnit || 'null'
        });
      }
      
      if (req.body.hasOwnProperty('weightUnit') && req.body.weightUnit !== item.weightUnit) {
        data.weightUnit = req.body.weightUnit;
        changes.push({
          field: 'weightUnit',
          oldValue: item.weightUnit || 'null',
          newValue: req.body.weightUnit || 'null'
        });
      }
      
      // Add measurement metadata if measurements were updated
      if (changes.some(c => measurementFields.includes(c.field))) {
        data.measuredAt = new Date();
        data.measuredBy = req.user.name;
      }
    }
    
    // Check if trying to edit non-archive/non-measurement fields on a locked order
    const editFields = ['productCode', 'qty', 'serialNumber', 'modelNumber', 'voltage', 'notes'];
    const hasEditFields = editFields.some(field => req.body.hasOwnProperty(field));
    
    if (hasEditFields && order.isLocked) {
      await logAuditEvent(
        orderId, 
        'EDIT_ATTEMPTED_WHILE_LOCKED', 
        'Tried to edit item details', 
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ 
        error: 'Cannot edit item details in a locked order. Please unlock it first. Use /measurements endpoint for dimension updates.' 
      });
    }
    
    // Process all other fields (only if not locked)
    if (req.body.hasOwnProperty('productCode') && typeof req.body.productCode === 'string') {
      const newCode = req.body.productCode.trim();
      if (newCode !== item.productCode) {
        data.productCode = newCode;
        changes.push({
          field: 'productCode',
          oldValue: item.productCode,
          newValue: newCode
        });
      }
    }
    
    if (req.body.hasOwnProperty('qty')) {
      const q = Number(req.body.qty);
      if (!Number.isFinite(q) || q <= 0) {
        return res.status(400).json({ error: 'qty must be a positive number' });
      }
      if (q !== item.qty) {
        data.qty = q;
        changes.push({
          field: 'qty',
          oldValue: String(item.qty),
          newValue: String(q)
        });
      }
    }
    
    if (req.body.hasOwnProperty('serialNumber')) {
      const newSerial = (req.body.serialNumber === '' || req.body.serialNumber === null) 
        ? null 
        : String(req.body.serialNumber).trim();
      
      if (newSerial !== item.serialNumber) {
        data.serialNumber = newSerial;
        changes.push({
          field: 'serialNumber',
          oldValue: item.serialNumber || 'null',
          newValue: newSerial || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('modelNumber')) {
      const newModel = (req.body.modelNumber === '' || req.body.modelNumber === null)
        ? null
        : String(req.body.modelNumber).trim();
      
      if (newModel !== item.modelNumber) {
        data.modelNumber = newModel;
        changes.push({
          field: 'modelNumber',
          oldValue: item.modelNumber || 'null',
          newValue: newModel || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('voltage')) {
      const newVoltage = (req.body.voltage === '' || req.body.voltage === null)
        ? null
        : String(req.body.voltage).trim();
      
      if (newVoltage !== item.voltage) {
        data.voltage = newVoltage;
        changes.push({
          field: 'voltage',
          oldValue: item.voltage || 'null',
          newValue: newVoltage || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('notes')) {
      const newNotes = (req.body.notes === '' || req.body.notes === null)
        ? null
        : String(req.body.notes).trim();
      
      if (newNotes !== item.notes) {
        data.notes = newNotes;
        changes.push({
          field: 'notes',
          oldValue: item.notes || 'null',
          newValue: newNotes || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('currentStage')) {
      const newStage = req.body.currentStage;
      if (newStage !== item.currentStage) {
        data.currentStage = newStage;
        changes.push({
          field: 'currentStage',
          oldValue: item.currentStage || 'null',
          newValue: newStage || 'null'
        });
      }
    }
    
    if (Object.keys(data).length === 0) {
      console.log('No changes detected for item:', itemId);
      return res.json(item);
    }

    console.log('Updating item with data:', data);
    console.log('Changes to log:', changes);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({ 
        where: { id: itemId }, 
        data 
      });
      
      console.log('Item updated successfully:', updatedItem);
      
      // Log field changes using appropriate audit type
      if (changes.length > 0) {
        const isMeasurementUpdate = changes.every(c => measurementFields.includes(c.field));
        
        await tx.auditLog.create({
          data: {
            entityType: isMeasurementUpdate ? 'Measurement' : 'OrderItem',
            entityId: itemId,
            parentEntityId: orderId,
            action: isMeasurementUpdate ? 'MEASUREMENTS_UPDATED' : 'ORDERITEM_UPDATED',
            changes: JSON.stringify(changes),
            metadata: isMeasurementUpdate ? JSON.stringify({
              message: 'Measurements updated via item endpoint',
              updatedFields: changes.map(c => c.field).join(', ')
            }) : null,
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        console.log('Audit log created for changes');
      }
      
      return updatedItem;
    });
    
    console.log('Transaction completed, returning updated item');
    res.json(updated);
  } catch (e) {
    console.error('Error updating item:', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete item with logging
app.delete('/orders/:orderId/items/:itemId', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const item = await prisma.orderItem.findUnique({ 
      where: { id: itemId }, 
      select: { id: true, orderId: true, productCode: true } 
    });
    if (!item || item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isLocked: true }
    });
    
    if (order.isLocked) {
      await logAuditEvent(
        orderId, 
        'DELETE_ATTEMPTED_WHILE_LOCKED', 
        'Tried to delete item', 
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ 
        error: 'Cannot delete items from a locked order. Please unlock it first.' 
      });
    }

    await prisma.$transaction(async (tx) => {
      // Log deletion using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'OrderItem',
          entityId: itemId,
          parentEntityId: orderId,
          action: 'ITEM_DELETED',
          metadata: JSON.stringify({
            entity: 'OrderItem',
            entityId: itemId,
            productCode: item.productCode
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      await tx.orderItem.delete({ where: { id: itemId } });
    });
    
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Comprehensive Audit Log Retrieval
// -----------------------------
app.get('/comprehensive-audit/:entityId', authGuard, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: req.params.entityId },
          { parentEntityId: req.params.entityId }
        ]
      },
      include: {
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Parse and format the logs
    const formattedLogs = logs.map(log => {
      let changes = [];
      let metadata = {};
      
      try {
        if (log.changes) {
          changes = JSON.parse(log.changes);
        }
        if (log.metadata) {
          metadata = JSON.parse(log.metadata);
        }
      } catch (e) {
        console.error('Error parsing log data:', e);
      }
      
      return {
        id: log.id,
        action: log.action,
        entity: log.entityType,
        entityId: log.entityId,
        changes: changes,
        data: metadata.data || null,
        message: metadata.message || null,
        performedBy: log.performedBy,
        performedByName: log.performedByName,
        createdAt: log.createdAt
      };
    });
    
    res.json(formattedLogs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add /audit/:entityId endpoint for history page (duplicate of comprehensive-audit)
app.get('/audit/:entityId', authGuard, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: req.params.entityId },
          { parentEntityId: req.params.entityId }
        ]
      },
      include: {
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Parse and format the logs
    const formattedLogs = logs.map(log => {
      let changes = [];
      let metadata = {};
      
      try {
        if (log.changes) {
          changes = JSON.parse(log.changes);
        }
        if (log.metadata) {
          metadata = JSON.parse(log.metadata);
        }
      } catch (e) {
        console.error('Error parsing log data:', e);
      }
      
      return {
        id: log.id,
        action: log.action,
        entity: log.entityType,
        entityId: log.entityId,
        changes: changes,
        data: metadata.data || null,
        message: metadata.message || null,
        performedBy: log.performedBy,
        performedByName: log.performedByName,
        createdAt: log.createdAt
      };
    });
    
    res.json(formattedLogs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------

// -----------------------------
// Startup
// -----------------------------
app.listen(PORT, HOST, () => {
  console.log(`API server running at http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\nDefault credentials (change in production!):`);
  console.log(`Admin: admin@stealthmachinetools.com / admin123`);
  console.log(`Agent: john@stealthmachinetools.com / agent123`);
});
