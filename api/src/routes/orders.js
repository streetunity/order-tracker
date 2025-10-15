import express from 'express';
import { PrismaClient } from '@prisma/client';
import { newTrackingToken } from '../state.js';

const prisma = new PrismaClient();

export function createOrdersRouter() {
  const router = express.Router();

  // Helper to build role-based where clause for orders
  function buildRoleBasedWhere(user, additionalWhere = {}) {
    const where = { ...additionalWhere };
    
    // If user is an AGENT, only show orders where sku (sales person) matches their name
    if (user.role === 'AGENT') {
      where.sku = user.name;
    }
    
    // ADMIN users see all orders (no additional filtering)
    
    return where;
  }

  // Helper to check if user can access specific order
  async function canAccessOrder(user, orderId) {
    if (user.role === 'ADMIN') return true;
    
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { sku: true }
    });
    
    if (!order) return false;
    
    // Agent can only access if order's sales person matches their name
    return order.sku === user.name;
  }

  // Helper to calculate ETA - should use actual settings from database
  async function calculateETADate(orderDate = new Date()) {
    try {
      // Get the actual stage thresholds from settings
      const settings = await prisma.settings.findMany({
        where: {
          key: {
            startsWith: 'stage_threshold_'
          }
        }
      });

      // Parse settings into a map
      const thresholds = {};
      settings.forEach(setting => {
        const match = setting.key.match(/stage_threshold_(.+)_(warning|critical)/);
        if (match) {
          const stage = match[1];
          const type = match[2];
          if (!thresholds[stage]) thresholds[stage] = {};
          thresholds[stage][type] = parseFloat(setting.value);
        }
      });

      // Calculate using averages of actual settings values
      // Only include stages up to DELIVERED (exclude post-delivery stages)
      const stageDurations = {
        MANUFACTURING: thresholds.MANUFACTURING ? 
          (thresholds.MANUFACTURING.warning + thresholds.MANUFACTURING.critical) / 2 : 35,
        TESTING: thresholds.TESTING ? 
          (thresholds.TESTING.warning + thresholds.TESTING.critical) / 2 : 5.5,
        SHIPPING: thresholds.SHIPPING ? 
          (thresholds.SHIPPING.warning + thresholds.SHIPPING.critical) / 2 : 5.5,
        AT_SEA: thresholds.AT_SEA ? 
          (thresholds.AT_SEA.warning + thresholds.AT_SEA.critical) / 2 : 35,
        SMT: thresholds.SMT ? 
          (thresholds.SMT.warning + thresholds.SMT.critical) / 2 : 5.5,
        QC: thresholds.QC ? 
          (thresholds.QC.warning + thresholds.QC.critical) / 2 : 5.5,
        DELIVERED: thresholds.DELIVERED ? 
          (thresholds.DELIVERED.warning + thresholds.DELIVERED.critical) / 2 : 4.5
      };
      
      // Total should be around 96.5 days with default values
      const totalDays = Object.values(stageDurations).reduce((sum, days) => sum + days, 0);
      
      const eta = new Date(orderDate);
      eta.setDate(eta.getDate() + Math.round(totalDays));
      return eta;
    } catch (error) {
      console.error('Error calculating ETA from settings:', error);
      // Fallback to hardcoded defaults if settings not available
      const totalDays = 96.5; // Standard ETA total
      const eta = new Date(orderDate);
      eta.setDate(eta.getDate() + Math.round(totalDays));
      return eta;
    }
  }

  function normalizeIncomingItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((i) => ({
        productCode: String(i?.productCode ?? i?.code ?? i?.name ?? '').trim(),
        qty: Number(i?.qty ?? i?.quantity ?? i?.count ?? 1) || 1,
        serialNumber: i?.serialNumber ? String(i.serialNumber).trim() : null,
        modelNumber: i?.modelNumber ? String(i.modelNumber).trim() : null,
        voltage: i?.voltage ? String(i.voltage).trim() : null,
        laserWattage: i?.laserWattage ? String(i.laserWattage).trim() : null,
        notes: i?.notes ? String(i.notes).trim() : null
      }))
      .filter((i) => i.productCode.length > 0);
  }

  // List orders - ROLE-FILTERED
  router.get('/', async (req, res) => {
    try {
      const { stage, accountId, search } = req.query;
      const baseWhere = {};
      if (stage) baseWhere.currentStage = String(stage);
      if (accountId) baseWhere.accountId = String(accountId);
      if (search) {
        const q = String(search);
        baseWhere.OR = [
          { poNumber: { contains: q } },
          { sku: { contains: q } },
          { account: { is: { name: { contains: q } } } },
          { items: { some: { productCode: { contains: q } } } },
          { items: { some: { serialNumber: { contains: q } } } }
        ];
      }

      // Apply role-based filtering
      const where = buildRoleBasedWhere(req.user, baseWhere);

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

  // Get yearly total - ROLE-FILTERED
  router.get('/yearly-total', async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

      const orders = await prisma.order.findMany({
        where: {
          createdAt: {
            gte: yearStart,
            lte: yearEnd
          }
        },
        include: {
          items: {
            select: {
              itemPrice: true
            }
          }
        }
      });

      let total = 0;
      for (const order of orders) {
        for (const item of order.items) {
          if (item.itemPrice && typeof item.itemPrice === 'number') {
            total += item.itemPrice;
          }
        }
      }

      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(total);

      res.json({
        year: currentYear,
        total: total,
        formatted: formatted,
        orderCount: orders.length,
        itemCount: orders.reduce((sum, o) => sum + o.items.length, 0)
      });
    } catch (e) {
      console.error('Yearly total error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get single order - ROLE-FILTERED
  router.get('/:id', async (req, res) => {
    try {
      // Check access permission
      const hasAccess = await canAccessOrder(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only view orders assigned to you.' });
      }

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
      
      res.json({ ...order, internalNotes: order.internalNotes ?? null, auditLogs });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create order
  router.post('/', async (req, res) => {
    try {
      const { accountId, poNumber, sku, items = [], customerDocsLink, orderDate } = req.body || {};
      if (!accountId) return res.status(400).json({ error: 'accountId required' });

      const normalizedItems = normalizeIncomingItems(items);
      const trackingToken = newTrackingToken();
      const etaDate = await calculateETADate(orderDate ? new Date(orderDate) : new Date());

      const order = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            accountId: String(accountId),
            poNumber: poNumber ?? null,
            sku: sku ?? null,
            orderDate: orderDate ? new Date(orderDate) : new Date(),
            trackingToken,
            customerDocsLink: customerDocsLink ?? null,
            etaDate: etaDate,
            createdByUserId: req.user.id,
            items: { create: normalizedItems }
          },
          include: { account: true, items: true, statusEvents: true }
        });

        await tx.orderStatusEvent.create({
          data: { 
            orderId: newOrder.id, 
            stage: 'MANUFACTURING', 
            note: 'Created',
            changedByUserId: req.user.id
          }
        });
        
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

  // Update order - ROLE-FILTERED
  router.patch('/:id', async (req, res) => {
    try {
      // Check access permission
      const hasAccess = await canAccessOrder(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only edit orders assigned to you.' });
      }

      const original = await prisma.order.findUnique({
        where: { id: req.params.id }
      });
      
      if (!original) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const { customerDocsLink, internalNotes, orderDate } = req.body || {};
      
      // Handle customerDocsLink update (allowed even when locked)
      if (customerDocsLink !== undefined && customerDocsLink !== original.customerDocsLink) {
        const updatedOrder = await prisma.order.update({
          where: { id: req.params.id },
          data: { customerDocsLink },
          include: { account: true, items: true }
        });
        
        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: req.params.id,
            parentEntityId: req.params.id,
            action: 'ORDER_UPDATED',
            changes: JSON.stringify([{
              field: 'customerDocsLink',
              oldValue: original.customerDocsLink || 'null',
              newValue: customerDocsLink || 'null'
            }]),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        
        return res.json(updatedOrder);
      }
      
      if (original.isLocked) {
        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: req.params.id,
            parentEntityId: req.params.id,
            action: 'EDIT_ATTEMPTED_WHILE_LOCKED',
            metadata: JSON.stringify({ message: 'Tried to edit order fields' }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        return res.status(403).json({ error: 'Cannot edit a locked order' });
      }
      
      const { poNumber, sku, etaDate, trackingNumber, shippingCarrier, accountId } = req.body || {};
      const data = {};
      const changes = [];
      
      // Handle field updates...
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
      
      if (orderDate !== undefined) {
        const newDate = orderDate ? new Date(orderDate) : null;
        const oldDateStr = original.orderDate?.toISOString() || null;
        const newDateStr = newDate?.toISOString() || null;

        if (oldDateStr !== newDateStr) {
          data.orderDate = newDate;
          changes.push({
            field: 'orderDate',
            oldValue: oldDateStr || 'null',
            newValue: newDateStr || 'null'
          });

          if (newDate) {
            data.etaDate = await calculateETADate(newDate);
            changes.push({
              field: 'etaDate',
              oldValue: original.etaDate?.toISOString() || 'null',
              newValue: data.etaDate.toISOString()
            });
          }
        }
      }
      
      if (internalNotes !== undefined && internalNotes !== original.internalNotes) {
        data.internalNotes = internalNotes;
        changes.push({
          field: 'internalNotes',
          oldValue: original.internalNotes || 'null',
          newValue: internalNotes || 'null'
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
        
        if (changes.length > 0) {
          await tx.auditLog.create({
            data: {
              entityType: 'Order',
              entityId: req.params.id,
              parentEntityId: req.params.id,
              action: 'ORDER_UPDATED',
              changes: JSON.stringify(changes),
              performedByUserId: req.user.id,
              performedByName: req.user.name
            }
          });
        }
        
        return updated;
      });
      
      res.json(order);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete order - ROLE-FILTERED
  router.delete('/:id', async (req, res) => {
    try {
      // Check access permission
      const hasAccess = await canAccessOrder(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only delete orders assigned to you.' });
      }

      const order = await prisma.order.findUnique({ 
        where: { id: req.params.id },
        select: { id: true, isLocked: true } 
      });
      
      if (!order) return res.status(404).json({ error: 'Order not found' });
      
      if (order.isLocked) {
        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: req.params.id,
            parentEntityId: req.params.id,
            action: 'DELETE_ATTEMPTED_WHILE_LOCKED',
            metadata: JSON.stringify({ message: 'Deletion blocked' }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        return res.status(403).json({ error: 'Cannot delete a locked order. Please unlock it first.' });
      }

      await prisma.$transaction(async (tx) => {
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

  // Update internal notes - ROLE-FILTERED
  router.patch('/:id/internal-notes', async (req, res) => {
    try {
      const orderId = req.params.id;
      
      // Check access permission
      const hasAccess = await canAccessOrder(req.user, orderId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only edit orders assigned to you.' });
      }

      const { internalNotes } = req.body || {};
      
      const order = await prisma.order.findUnique({
        where: { id: String(orderId) },
        select: { id: true, internalNotes: true }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {
        const up = await tx.order.update({
          where: { id: String(orderId) },
          data: { internalNotes: internalNotes || null }
        });

        await tx.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: String(orderId),
            parentEntityId: String(orderId),
            action: 'INTERNAL_NOTES_UPDATED',
            changes: JSON.stringify([{
              field: 'internalNotes',
              oldValue: order.internalNotes || 'null',
              newValue: internalNotes || 'null'
            }]),
            performedByUserId: req.user?.id || 'Unknown',
            performedByName: req.user?.name || 'Unknown'
          }
        });

        return up;
      });

      res.json({ success: true });
    } catch (e) {
      console.error('Internal notes update error:', e);
      res.status(500).json({ error: e.message || 'Failed to update internal notes' });
    }
  });

  return router;
}

export default createOrdersRouter;
