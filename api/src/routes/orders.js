import express from 'express';
import { newTrackingToken } from '../state.js';
import { isAdminOrHigher, isManufacturer, isBroker, isReadOnly } from '../utils/roleHelpers.js';

export function createOrdersRouter(prisma) {
  const router = express.Router();

  // Get commission functions from global (set up in index.js)
  const getCommissionFunctions = () => global.commissionFunctions || {};

  // Helper to build role-based where clause for orders
  async function buildRoleBasedWhere(user, additionalWhere = {}) {
    const where = { ...additionalWhere };

    // MANUFACTURERS: Only see orders that have items assigned to their manufacturer
    if (isManufacturer(user.role)) {
      if (!user.manufacturer || !user.manufacturer.id) {
        // No manufacturer profile = no access
        console.log(`[MANUFACTURER FILTER] User ${user.name} has no manufacturer profile - blocking all orders`);
        where.id = 'impossible-id-no-matches'; // Force no results
        return where;
      }

      // Only show orders that have at least one item assigned to this manufacturer
      where.items = {
        some: {
          manufacturerId: user.manufacturer.id
        }
      };

      console.log(`[MANUFACTURER FILTER] User: ${user.name}, Manufacturer ID: ${user.manufacturer.id}, Filtering orders by assigned items`);
      return where;
    }

    // AGENTS: see orders where they are the primary (sku) OR an active rep on a
    // split commission for that order. Combined with any other filters via AND.
    if (user.role === 'AGENT') {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { sku: user.name },
            { commissions: { some: { reps: { some: { salesPersonName: user.name, isActive: true } } } } },
          ],
        },
      ];
      console.log(`[AGENT FILTER] User: ${user.name}, Role: ${user.role}, sku or active split rep`);
    }

    // BROKERS: Can see all orders (read-only access, similar to ADMIN viewing)
    // ADMIN and higher users see all orders (no additional filtering)

    return where;
  }

  // Helper to check if user can access specific order
  async function canAccessOrder(user, orderId) {
    // Admins and higher can access all orders
    if (isAdminOrHigher(user.role)) return true;

    // Brokers can access all orders (read-only)
    if (isBroker(user.role)) return true;

    // Manufacturers: Check if they have any items in this order
    if (isManufacturer(user.role)) {
      if (!user.manufacturer || !user.manufacturer.id) return false;
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            where: {
              manufacturerId: user.manufacturer.id
            },
            select: { id: true }
          }
        }
      });
      
      if (!order) return false;
      const hasAccess = order.items.length > 0;
      
      if (!hasAccess) {
        console.log(`[ACCESS DENIED] Manufacturer ${user.name} tried to access order ${orderId} with no assigned items`);
      }
      
      return hasAccess;
    }
    
    // Agents: allowed if they are the primary (sku) OR an active rep on a split.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { sku: true, commissions: { select: { reps: { where: { isActive: true }, select: { salesPersonName: true } } } } }
    });

    if (!order) return false;

    const isPrimary = order.sku === user.name;
    const isActiveRep = (order.commissions || []).some(c => (c.reps || []).some(r => r.salesPersonName === user.name));
    const hasAccess = isPrimary || isActiveRep;

    if (!hasAccess) {
      console.log(`[ACCESS DENIED] Agent ${user.name} tried to access order with sku: ${order.sku}`);
    }

    return hasAccess;
  }

  // Helper to calculate ETA
  async function calculateETADate(orderDate = new Date()) {
    try {
      const settings = await prisma.settings.findMany({
        where: {
          key: {
            startsWith: 'stage_threshold_'
          }
        }
      });

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
      
      const totalDays = Object.values(stageDurations).reduce((sum, days) => sum + days, 0);
      
      const eta = new Date(orderDate);
      eta.setDate(eta.getDate() + Math.round(totalDays));
      return eta;
    } catch (error) {
      console.error('Error calculating ETA from settings:', error);
      const totalDays = 96.5;
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

  // List orders - ROLE-FILTERED (including manufacturers)
  router.get('/', async (req, res) => {
    try {
      const { stage, accountId, search, includeArchived } = req.query;
      const baseWhere = {};
      if (stage) baseWhere.currentStage = String(stage);
      if (accountId) baseWhere.accountId = String(accountId);

      // Filter archived orders by default (unless explicitly requested)
      if (includeArchived === 'true') {
        // Show only archived orders
        baseWhere.isArchived = true;
      } else if (includeArchived === 'all') {
        // Show both archived and non-archived orders
        // Don't add any filter
      } else {
        // Default: show only non-archived orders
        baseWhere.isArchived = false;
      }

      if (search) {
        const q = String(search);
        baseWhere.OR = [
          { poNumber: { contains: q , mode: 'insensitive'} },
          { sku: { contains: q , mode: 'insensitive'} },
          { account: { is: { name: { contains: q , mode: 'insensitive'} } } },
          { account: { is: { contactName: { contains: q , mode: 'insensitive'} } } },
          { items: { some: { productCode: { contains: q , mode: 'insensitive'} } } },
          { items: { some: { serialNumber: { contains: q , mode: 'insensitive'} } } },
          { items: { some: { manufacturer: { is: { name: { contains: q , mode: 'insensitive'} } } } } }
        ];
      }

      // Apply role-based filtering
      const where = await buildRoleBasedWhere(req.user, baseWhere);

      const orders = await prisma.order.findMany({
        where,
        include: {
          account: true,
          items: { 
            include: { 
              statusEvents: { orderBy: { createdAt: 'asc' } },
              manufacturer: true // Include manufacturer info
            } 
          },
          statusEvents: { orderBy: { createdAt: 'asc' } },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: [{ createdAt: 'desc' }]
      });

      // For manufacturers, filter items to only show assigned ones
      let filteredOrders = orders;
      if (isManufacturer(req.user.role) && req.user.manufacturer) {
        filteredOrders = orders.map(order => ({
          ...order,
          items: order.items.filter(item => item.manufacturerId === req.user.manufacturer.id)
        })).filter(order => order.items.length > 0); // Remove orders with no assigned items
      }

      console.log(`[GET /orders] User: ${req.user.name} (${req.user.role}) - Returned ${filteredOrders.length} orders`);

      res.json(filteredOrders);
    } catch (e) {
      console.error('GET /orders error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get yearly total - BLOCKED FOR MANUFACTURERS
  router.get('/yearly-total', async (req, res) => {
    try {
      // Block manufacturers from seeing sales totals
      if (isManufacturer(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Manufacturers cannot view sales totals.' });
      }

      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

      const where = await buildRoleBasedWhere(req.user, {
        createdAt: {
          gte: yearStart,
          lte: yearEnd
        }
      });

      const orders = await prisma.order.findMany({
        where,
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
        itemCount: orders.reduce((sum, o) => sum + o.items.length, 0),
        userRole: req.user?.role
      });
    } catch (e) {
      console.error('Yearly total error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get single order - ROLE-FILTERED
  router.get('/:id', async (req, res) => {
    try {
      const hasAccess = await canAccessOrder(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only view orders assigned to you.' });
      }

      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: {
          account: true,
          items: { 
            include: { 
              statusEvents: { orderBy: { createdAt: 'asc' } },
              manufacturer: true
            } 
          },
          statusEvents: { orderBy: { createdAt: 'asc' } },
          createdBy: {
            select: { id: true, name: true, email: true }
          },
          _count: { select: { commissions: true } },
          commissions: { select: { reps: { where: { isActive: true }, orderBy: { role: 'asc' }, select: { salesPersonName: true, sharePercentage: true, role: true } } } }
        }
      });

      if (!order) return res.status(404).json({ error: 'Not found' });
      
      // For manufacturers, filter items to only show assigned ones
      if (isManufacturer(req.user.role) && req.user.manufacturer) {
        order.items = order.items.filter(item => item.manufacturerId === req.user.manufacturer.id);
      }
      
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
      
      const { commissions: _omitCommissions, ...orderRest } = order;
      const activeCommissionReps = (order.commissions || []).flatMap(c => c.reps || []);
      res.json({ ...orderRest, hasCommission: (order._count?.commissions || 0) > 0, commissionReps: activeCommissionReps, activeRepCount: activeCommissionReps.length, internalNotes: order.internalNotes ?? null, auditLogs });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create order - BLOCKED FOR MANUFACTURERS - WITH COMMISSION INTEGRATION
  router.post('/', async (req, res) => {
    try {
      // Block read-only users (manufacturers and brokers) from creating orders
      if (isReadOnly(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to create orders.' });
      }

      const { accountId, poNumber, sku, items = [], customerDocsLink, brokerDocsLink, orderDate, discount } = req.body || {};
      if (!accountId) return res.status(400).json({ error: 'accountId required' });

      const normalizedItems = normalizeIncomingItems(items);
      const trackingToken = newTrackingToken();
      // Don't calculate ETA for new orders - items start in PENDING_FUNDING
      // ETA will be calculated when first item moves to MANUFACTURING
      const etaDate = null;

      const order = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            accountId: String(accountId),
            poNumber: poNumber ?? null,
            sku: sku ?? null,
            orderDate: orderDate ? new Date(orderDate) : new Date(),
            trackingToken,
            customerDocsLink: customerDocsLink ?? null,
            brokerDocsLink: (brokerDocsLink && req.user.role === 'SUPER_ADMIN') ? brokerDocsLink : null,
            etaDate: etaDate,
            discount: discount ?? 0,
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

      // Create commission for the order (if sales person assigned)
      try {
        const { createCommissionForOrder } = getCommissionFunctions();
        if (createCommissionForOrder && order.sku) {
          await createCommissionForOrder(order);
          console.log(`Commission created for order ${order.id} with sales person ${order.sku}`);
        }
      } catch (commissionError) {
        console.error('Error creating commission:', commissionError);
        // Don't fail the order creation if commission fails
      }

      res.status(201).json(order);
    } catch (e) {
      console.error('Order creation error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Update order - BLOCKED FOR MANUFACTURERS
  router.patch('/:id', async (req, res) => {
    try {
      // Block read-only users (manufacturers and brokers) from editing orders
      if (isReadOnly(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to edit orders.' });
      }

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
      
      const { customerDocsLink, brokerDocsLink, internalNotes, orderDate } = req.body || {};

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

      // Handle broker docs link - SUPER_ADMIN only
      if (brokerDocsLink !== undefined && brokerDocsLink !== original.brokerDocsLink) {
        // Only super admins can update broker docs link
        if (req.user.role !== 'SUPER_ADMIN') {
          return res.status(403).json({ error: 'Only super admins can update broker documents link' });
        }

        const updatedOrder = await prisma.order.update({
          where: { id: req.params.id },
          data: { brokerDocsLink },
          include: { account: true, items: true }
        });

        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: req.params.id,
            parentEntityId: req.params.id,
            action: 'ORDER_UPDATED',
            changes: JSON.stringify([{
              field: 'brokerDocsLink',
              oldValue: original.brokerDocsLink || 'null',
              newValue: brokerDocsLink || 'null'
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
      
      const { poNumber, sku, etaDate, trackingNumber, shippingCarrier, accountId, onsiteInstallationDate } = req.body || {};
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
      
      // Track if sales person (sku) is changing for commission update
      const skuChanged = sku !== undefined && sku !== original.sku;
      if (skuChanged) {
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

      if (onsiteInstallationDate !== undefined) {
        const newDate = onsiteInstallationDate ? new Date(onsiteInstallationDate) : null;
        const oldDateStr = original.onsiteInstallationDate?.toISOString() || null;
        const newDateStr = newDate?.toISOString() || null;

        if (oldDateStr !== newDateStr) {
          data.onsiteInstallationDate = newDate;
          changes.push({
            field: 'onsiteInstallationDate',
            oldValue: oldDateStr || 'null',
            newValue: newDateStr || 'null'
          });
        }
      }

      // Handle discount field - Track if it changes for commission recalculation
      const { discount } = req.body || {};
      let discountChanged = false;
      if (discount !== undefined) {
        const discountValue = typeof discount === 'number' ? discount : parseFloat(discount);
        const originalDiscount = original.discount || 0;

        if (!isNaN(discountValue) && discountValue !== originalDiscount) {
          data.discount = discountValue;
          discountChanged = true;
          changes.push({
            field: 'discount',
            oldValue: String(originalDiscount),
            newValue: String(discountValue)
          });
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
      
      // Handle commission update if sales person changed
      if (skuChanged) {
        try {
          const { createCommissionForOrder } = getCommissionFunctions();
          if (createCommissionForOrder) {
            // Check if commission exists
            const existingCommission = await prisma.commission.findFirst({
              where: { orderId: req.params.id }
            });
            
            if (!existingCommission && sku) {
              // Create new commission if sales person added
              await createCommissionForOrder(order);
              console.log(`Commission created for order ${order.id} with new sales person ${sku}`);
            } else if (existingCommission && !sku) {
              // Flag commission if sales person removed
              await prisma.commission.update({
                where: { id: existingCommission.id },
                data: {
                  isFlagged: true,
                  flagReason: 'NO_SALES_REP',
                  flagDetails: JSON.stringify({
                    message: 'Sales person was removed from order',
                    timestamp: new Date()
                  })
                }
              });
            } else if (existingCommission && sku) {
              // Update commission with new sales person
              await prisma.commission.update({
                where: { id: existingCommission.id },
                data: {
                  salesPersonName: sku,
                  isFlagged: true,
                  flagReason: 'SALES_REP_CHANGED',
                  flagDetails: JSON.stringify({
                    oldSalesRep: original.sku,
                    newSalesRep: sku,
                    timestamp: new Date()
                  })
                }
              });
            }
          }
        } catch (commissionError) {
          console.error('Error updating commission:', commissionError);
        }
      }

      // Recalculate commission if discount changed
      if (discountChanged) {
        try {
          const { recalculateCommissionIfPriceChanged } = getCommissionFunctions();
          if (recalculateCommissionIfPriceChanged) {
            await recalculateCommissionIfPriceChanged(req.params.id);
            console.log(`Commission recalculated for order ${req.params.id} due to discount change`);
          }
        } catch (commissionError) {
          console.error('Error recalculating commission after discount change:', commissionError);
        }
      }

      res.json(order);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete order - BLOCKED FOR MANUFACTURERS - WITH COMMISSION FLAGGING
  router.delete('/:id', async (req, res) => {
    try {
      // Block read-only users (manufacturers and brokers) from deleting orders
      if (isReadOnly(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to delete orders.' });
      }

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

      // Delete commission records before deleting order (cascades to ItemCommissions and Payouts)
      try {
        const commissions = await prisma.commission.findMany({
          where: { orderId: req.params.id }
        });

        if (commissions.length > 0) {
          // Log commission deletion for audit purposes
          for (const commission of commissions) {
            await prisma.auditLog.create({
              data: {
                entityType: 'Commission',
                entityId: commission.id,
                parentEntityId: req.params.id,
                action: 'COMMISSION_DELETED_WITH_ORDER',
                metadata: JSON.stringify({
                  deletedAt: new Date(),
                  deletedBy: req.user.name,
                  orderId: req.params.id,
                  salesPerson: commission.salesPersonName,
                  message: 'Commission deleted because order was deleted'
                }),
                performedByUserId: req.user.id,
                performedByName: req.user.name
              }
            });
          }

          // Delete all commissions for this order (cascades to related records)
          await prisma.commission.deleteMany({
            where: { orderId: req.params.id }
          });

          console.log(`Deleted ${commissions.length} commission(s) for order ${req.params.id}`);
        }
      } catch (commissionError) {
        console.error('Error deleting commissions:', commissionError);
        // Don't fail the entire operation if commission deletion fails
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

  // Update internal notes - BLOCKED FOR MANUFACTURERS
  router.patch('/:id/internal-notes', async (req, res) => {
    try {
      // Block read-only users (manufacturers and brokers)
      if (isReadOnly(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to edit internal notes.' });
      }

      const orderId = req.params.id;
      
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

  // Archive/Unarchive order - BLOCKED FOR MANUFACTURERS
  router.patch('/:id/archive', async (req, res) => {
    try {
      // Block read-only users (manufacturers and brokers)
      if (isReadOnly(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to archive orders.' });
      }

      const orderId = req.params.id;

      const hasAccess = await canAccessOrder(req.user, orderId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only archive orders assigned to you.' });
      }

      const { isArchived } = req.body || {};

      if (typeof isArchived !== 'boolean') {
        return res.status(400).json({ error: 'isArchived must be a boolean value' });
      }

      const order = await prisma.order.findUnique({
        where: { id: String(orderId) },
        select: { id: true, isArchived: true }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {
        const up = await tx.order.update({
          where: { id: String(orderId) },
          data: {
            isArchived,
            archivedAt: isArchived ? new Date() : null,
            archivedBy: isArchived ? req.user.name : null
          }
        });

        await tx.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: String(orderId),
            parentEntityId: String(orderId),
            action: isArchived ? 'ORDER_ARCHIVED' : 'ORDER_UNARCHIVED',
            metadata: JSON.stringify({
              previousState: order.isArchived,
              newState: isArchived,
              archivedBy: req.user.name
            }),
            performedByUserId: req.user?.id || 'Unknown',
            performedByName: req.user?.name || 'Unknown'
          }
        });

        return up;
      });

      res.json({ success: true, order: updatedOrder });
    } catch (e) {
      console.error('Archive order error:', e);
      res.status(500).json({ error: e.message || 'Failed to archive order' });
    }
  });

  return router;
}

export default createOrdersRouter;