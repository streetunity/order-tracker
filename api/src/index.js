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

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ 
  origin: CORS_ORIGIN, 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

// -----------------------------
// Helpers
// -----------------------------
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
      shippingCarrier, trackingNumber, items, statusEvents, account
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
        statusEvents: it.statusEvents
      })),
      statusEvents
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

// Create order with logging
app.post('/orders', authGuard, async (req, res) => {
  try {
    const { accountId, poNumber, sku, items = [] } = req.body || {};
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
    const account = await prisma.account.findUnique({ 
      where: { id: req.params.id },
      select: { id: true, name: true } 
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    await prisma.$transaction(async (tx) => {
      // Log deletion using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Account',
          entityId: account.id,
          action: 'ACCOUNT_DELETED',
          metadata: JSON.stringify({ message: `Account "${account.name}" deleted` }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      await tx.account.delete({ where: { id: req.params.id } });
    });
    
    res.status(204).end();
  } catch (e) {
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

// Update item with comprehensive field change logging
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
        currentStage: true
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
    
    // Check if trying to edit non-archive fields on a locked order
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
        error: 'Cannot edit item details in a locked order. Please unlock it first.' 
      });
    }
    
    // Process all fields
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
      
      // Log field changes using new audit system
      if (changes.length > 0) {
        await tx.auditLog.create({
          data: {
            entityType: 'OrderItem',
            entityId: itemId,
            parentEntityId: orderId,
            action: 'ORDERITEM_UPDATED',
            changes: JSON.stringify(changes),
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

// -----------------------------
// Startup
// -----------------------------
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`\nDefault credentials (change in production!):`);
  console.log(`Admin: admin@stealthmachinetools.com / admin123`);
  console.log(`Agent: john@stealthmachinetools.com / agent123`);
});