import express from 'express';
import { PrismaClient } from '@prisma/client';
import { markItemAsOrdered, unmarkItemAsOrdered } from '../ordered-endpoints.js';
import { isManufacturer, isAdminOrHigher } from '../utils/roleHelpers.js';
import { 
  canAccessItem, 
  canCreateItems, 
  canDeleteItems,
  canMarkAsOrdered,
  validateManufacturerFieldAccess,
  LOCKED_ORDER_EDITABLE_FIELDS,
  MEASUREMENT_FIELDS,
  STRING_FIELDS
} from '../helpers/itemPermissions.js';
import {
  extractItemsFromBody,
  validateQuantity,
  processStringField,
  processNumericField,
  buildFieldChange,
  hasItemsWithPrices,
  validateItemBelongsToOrder,
  getAuditAction
} from '../helpers/itemValidation.js';
import { checkCommissionPayoutTrigger, checkOrderedStatusTrigger } from '../helpers/commission.js';

const prisma = new PrismaClient();

// Helper to calculate ETA (reads from database settings, not hardcoded values)
async function calculateETADate(orderDate = new Date(), hasExtendedItems = false) {
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

    let manufacturingDays = thresholds.MANUFACTURING ?
      (thresholds.MANUFACTURING.warning + thresholds.MANUFACTURING.critical) / 2 : 35;

    // Check if order date falls within holiday season and add buffer to MANUFACTURING only
    const holidayStartSetting = await prisma.systemSetting.findUnique({
      where: { key: 'holiday_season_start' }
    });
    const holidayEndSetting = await prisma.systemSetting.findUnique({
      where: { key: 'holiday_season_end' }
    });
    const holidayBufferSetting = await prisma.systemSetting.findUnique({
      where: { key: 'holiday_buffer_days' }
    });

    const holidayStart = holidayStartSetting?.value || '10-01';
    const holidayEnd = holidayEndSetting?.value || '12-31';
    const holidayBufferDays = parseInt(holidayBufferSetting?.value || '25', 10);

    // Check if order date is in holiday season
    const orderMonth = orderDate.getMonth() + 1; // 1-12
    const orderDay = orderDate.getDate();
    const [startMonth, startDay] = holidayStart.split('-').map(Number);
    const [endMonth, endDay] = holidayEnd.split('-').map(Number);

    const isInHolidaySeason = (orderMonth > startMonth || (orderMonth === startMonth && orderDay >= startDay)) &&
                              (orderMonth < endMonth || (orderMonth === endMonth && orderDay <= endDay));

    if (isInHolidaySeason) {
      manufacturingDays += holidayBufferDays;
    }

    const stageDurations = {
      MANUFACTURING: manufacturingDays,
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

    let totalDays = Object.values(stageDurations).reduce((sum, days) => sum + days, 0);

    // Add extended shipping days if applicable (default 30 days)
    if (hasExtendedItems) {
      const extendedShippingSetting = await prisma.systemSetting.findUnique({
        where: { key: 'extended_shipping_days' }
      });
      const extendedShippingDays = parseInt(extendedShippingSetting?.value || '30', 10);
      totalDays += extendedShippingDays;
    }

    const eta = new Date(orderDate);
    eta.setDate(eta.getDate() + Math.round(totalDays));
    return eta;
  } catch (error) {
    console.error('Error calculating ETA from settings:', error);
    const totalDays = hasExtendedItems ? 126.5 : 96.5;
    const eta = new Date(orderDate);
    eta.setDate(eta.getDate() + Math.round(totalDays));
    return eta;
  }
}

// Import commission functions from global scope
const getCommissionFunctions = () => {
  if (global.calculateCommissionForOrder && global.recalculateCommissionIfPriceChanged) {
    return {
      calculateCommissionForOrder: global.calculateCommissionForOrder,
      recalculateCommissionIfPriceChanged: global.recalculateCommissionIfPriceChanged
    };
  }
  return null;
};

export function createItemsRouter() {
  const router = express.Router();

  // Create items - BLOCKED FOR MANUFACTURERS
  router.post('/:orderId/items', async (req, res) => {
    try {
      // Check permissions
      if (!canCreateItems(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Manufacturers cannot create new items.' });
      }

      const orderId = String(req.params.orderId);
      const order = await prisma.order.findUnique({ 
        where: { id: orderId }, 
        select: { id: true, isLocked: true, sku: true } 
      });
      
      if (!order) return res.status(404).json({ error: 'Order not found' });
      
      if (order.isLocked) {
        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: orderId,
            parentEntityId: orderId,
            action: 'EDIT_ATTEMPTED_WHILE_LOCKED',
            metadata: JSON.stringify({ message: 'Tried to add items' }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        return res.status(403).json({ error: 'Cannot add items to a locked order. Please unlock it first.' });
      }

      const items = extractItemsFromBody(req.body);

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
              manufacturerId: i.manufacturerId,
              voltage: i.voltage,
              laserWattage: i.laserWattage || null,
              notes: i.notes,
              hasExtendedShipping: i.hasExtendedShipping || false,
              itemPrice: i.itemPrice,
              privateItemNote: i.privateItemNote
            }
          });
          createdItems.push(row);
        }
        
        await tx.auditLog.create({
          data: {
            entityType: 'OrderItem',
            entityId: createdItems[0].id,
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
      
      // Check if we need to recalculate commission after adding items with prices
      if (hasItemsWithPrices(created)) {
        const commissionFns = getCommissionFunctions();
        if (commissionFns && commissionFns.recalculateCommissionIfPriceChanged) {
          try {
            console.log(`[COMMISSION] Recalculating commission for order ${orderId} after items added with prices`);
            await commissionFns.recalculateCommissionIfPriceChanged(orderId);
          } catch (error) {
            console.error(`[COMMISSION] Error recalculating commission for order ${orderId}:`, error);
          }
        }
      }
      
      res.status(201).json(created);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update item - MANUFACTURERS CAN ONLY EDIT SERIAL NUMBER
  router.patch('/:orderId/items/:itemId', async (req, res) => {
    try {
      const { orderId, itemId } = req.params;
      
      // Check if user has access to this item
      const hasAccess = await canAccessItem(req.user, itemId, prisma);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only edit items assigned to you.' });
      }
      
      // Validate manufacturer field access
      const accessCheck = validateManufacturerFieldAccess(req.body, req.user.role, req.user.name);
      if (!accessCheck.allowed) {
        return res.status(403).json({ error: accessCheck.error });
      }

      const item = await prisma.orderItem.findUnique({ 
        where: { id: itemId }, 
        select: { 
          id: true, orderId: true, productCode: true, qty: true,
          serialNumber: true, modelNumber: true, voltage: true,
          laserWattage: true, notes: true, archivedAt: true,
          currentStage: true, height: true, width: true, length: true,
          weight: true, measurementUnit: true, weightUnit: true,
          itemPrice: true, privateItemNote: true, hasExtendedShipping: true,
          containers: true, manufacturerId: true, isOrdered: true,
          orderedAt: true, orderedBy: true
        } 
      });
      
      const validation = await validateItemBelongsToOrder(prisma, itemId, orderId);
      if (!validation.valid) {
        return res.status(404).json({ error: validation.error });
      }
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { isLocked: true, sku: true }
      });
      
      const data = {};
      const changes = [];
      let priceChanged = false;
      let orderedStatusChanged = false;
      let stageChanged = false;
      let movedToManufacturing = false;
      
      // Handle fields that can be edited even when locked
      // Archive/restore
      if (req.body.archivedAt !== undefined && !isManufacturer(req.user.role)) {
        const newArchived = req.body.archivedAt ? new Date(req.body.archivedAt) : null;
        const change = buildFieldChange('archivedAt', item.archivedAt, newArchived);
        if (change) {
          data.archivedAt = newArchived;
          changes.push(change);
        }
      }
      
      // Containers
      if (req.body.hasOwnProperty('containers') && !isManufacturer(req.user.role)) {
        const newContainers = typeof req.body.containers === 'string' 
          ? req.body.containers 
          : JSON.stringify(req.body.containers);
        
        const change = buildFieldChange('containers', item.containers, newContainers);
        if (change) {
          data.containers = newContainers;
          changes.push(change);
        }
      }
      
      // Measurements
      const hasMeasurementFields = MEASUREMENT_FIELDS.some(field => req.body.hasOwnProperty(field));
      if (hasMeasurementFields && !isManufacturer(req.user.role)) {
        for (const field of MEASUREMENT_FIELDS) {
          if (req.body.hasOwnProperty(field)) {
            const newValue = ['height', 'width', 'length', 'weight'].includes(field) 
              ? processNumericField(req.body[field])
              : processStringField(req.body[field]);
            
            const change = buildFieldChange(field, item[field], newValue);
            if (change) {
              data[field] = newValue;
              changes.push(change);
            }
          }
        }
        
        if (changes.some(c => MEASUREMENT_FIELDS.includes(c.field))) {
          data.measuredAt = new Date();
          data.measuredBy = req.user.name;
        }
      }
      
      // Serial number is ALWAYS editable by everyone
      if (req.body.hasOwnProperty('serialNumber')) {
        const newSerialNumber = processStringField(req.body.serialNumber);
        const change = buildFieldChange('serialNumber', item.serialNumber, newSerialNumber);
        if (change) {
          data.serialNumber = newSerialNumber;
          changes.push(change);
        }
      }
      
      // For non-manufacturers, process remaining fields
      if (!isManufacturer(req.user.role)) {
        // Check if trying to edit regular fields on a locked order
        const editFields = ['productCode', 'qty', 'modelNumber', 'voltage', 'laserWattage', 'notes', 'manufacturerId'];
        
        const hasEditFieldChanges = editFields.some(field => {
          if (!req.body.hasOwnProperty(field)) return false;
          
          if (field === 'qty') {
            const validation = validateQuantity(req.body[field]);
            return validation.valid && validation.value !== item.qty;
          }
          
          const newVal = processStringField(req.body[field]);
          return newVal !== item[field];
        });

        if (hasEditFieldChanges && order.isLocked) {
          await prisma.auditLog.create({
            data: {
              entityType: 'Order',
              entityId: orderId,
              parentEntityId: orderId,
              action: 'EDIT_ATTEMPTED_WHILE_LOCKED',
              metadata: JSON.stringify({ message: 'Tried to edit item details' }),
              performedByUserId: req.user.id,
              performedByName: req.user.name
            }
          });
          return res.status(403).json({ 
            error: 'Cannot edit item details in a locked order. Please unlock it first.' 
          });
        }
        
        // Process fields (only if not locked)
        if (!order.isLocked) {
          // Product code
          if (req.body.hasOwnProperty('productCode')) {
            const newCode = processStringField(req.body.productCode);
            const change = buildFieldChange('productCode', item.productCode, newCode);
            if (change) {
              data.productCode = newCode;
              changes.push(change);
            }
          }
          
          // Quantity
          if (req.body.hasOwnProperty('qty')) {
            const validation = validateQuantity(req.body.qty);
            if (!validation.valid) {
              return res.status(400).json({ error: validation.error });
            }
            const change = buildFieldChange('qty', item.qty, validation.value);
            if (change) {
              data.qty = validation.value;
              changes.push(change);
            }
          }
          
          // String fields
          for (const field of STRING_FIELDS) {
            if (req.body.hasOwnProperty(field)) {
              const newValue = processStringField(req.body[field]);
              const change = buildFieldChange(field, item[field], newValue);
              if (change) {
                data[field] = newValue;
                changes.push(change);
              }
            }
          }
          
          // Manufacturer ID
          if (req.body.hasOwnProperty('manufacturerId')) {
            const newManufacturerId = processStringField(req.body.manufacturerId);
            const change = buildFieldChange('manufacturerId', item.manufacturerId, newManufacturerId);
            if (change) {
              data.manufacturerId = newManufacturerId;
              changes.push(change);
            }
          }
        }

        // Fields editable even when locked
        // Item price
        if (req.body.hasOwnProperty('itemPrice')) {
          const newPrice = processNumericField(req.body.itemPrice);
          const change = buildFieldChange('itemPrice', item.itemPrice, newPrice);
          if (change) {
            data.itemPrice = newPrice;
            priceChanged = true;
            changes.push(change);
          }
        }

        // Private note
        if (req.body.hasOwnProperty('privateItemNote')) {
          const newNote = processStringField(req.body.privateItemNote);
          const change = buildFieldChange('privateItemNote', item.privateItemNote, newNote);
          if (change) {
            data.privateItemNote = newNote;
            changes.push(change);
          }
        }

        // Extended shipping
        if (req.body.hasOwnProperty('hasExtendedShipping')) {
          const newExtended = req.body.hasExtendedShipping === true;
          const change = buildFieldChange('hasExtendedShipping', item.hasExtendedShipping || false, newExtended);
          if (change) {
            data.hasExtendedShipping = newExtended;
            changes.push(change);
          }
        }

        // Ordered status - CRITICAL: Track if this changes from false to true
        if (req.body.hasOwnProperty('isOrdered')) {
          const newIsOrdered = req.body.isOrdered === true;
          
          if (newIsOrdered && !item.isOrdered) {
            data.isOrdered = true;
            data.orderedAt = req.body.orderedAt ? new Date(req.body.orderedAt) : new Date();
            data.orderedBy = req.user.name;
            orderedStatusChanged = true; // Flag to trigger commission check
            
            changes.push(
              buildFieldChange('isOrdered', false, true),
              buildFieldChange('orderedAt', null, data.orderedAt),
              buildFieldChange('orderedBy', null, req.user.name)
            );
          } else if (!newIsOrdered && item.isOrdered) {
            data.isOrdered = false;
            data.orderedAt = null;
            data.orderedBy = null;
            
            changes.push(
              buildFieldChange('isOrdered', true, false),
              buildFieldChange('orderedAt', item.orderedAt, null),
              buildFieldChange('orderedBy', item.orderedBy, null)
            );
          }
        }
        
        // Current stage
        if (req.body.hasOwnProperty('currentStage')) {
          const newStage = req.body.currentStage;
          const change = buildFieldChange('currentStage', item.currentStage, newStage);
          if (change) {
            data.currentStage = newStage;
            changes.push(change);
            stageChanged = true;
            // Check if moving from PENDING_FUNDING to MANUFACTURING
            if (item.currentStage === 'PENDING_FUNDING' && newStage === 'MANUFACTURING') {
              movedToManufacturing = true;
            }
          }
        }
      }
      
      // Filter out null changes
      const validChanges = changes.filter(c => c !== null);
      
      if (Object.keys(data).length === 0) {
        return res.json(item);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updatedItem = await tx.orderItem.update({ 
          where: { id: itemId }, 
          data 
        });
        
        if (validChanges.length > 0) {
          const action = getAuditAction(validChanges);
          
          await tx.auditLog.create({
            data: {
              entityType: action?.includes('CONTAINER') ? 'Container' : (action?.includes('MEASUREMENT') ? 'Measurement' : 'OrderItem'),
              entityId: itemId,
              parentEntityId: orderId,
              action: action || 'ORDERITEM_UPDATED',
              changes: JSON.stringify(validChanges),
              metadata: JSON.stringify({
                message: `Item updated`,
                updatedFields: validChanges.map(c => c.field).join(', '),
                updatedByRole: req.user.role
              }),
              performedByUserId: req.user.id,
              performedByName: req.user.name
            }
          });
        }
        
        return updatedItem;
      });
      
      // CRITICAL: If item was marked as ordered, trigger commission checks
      if (orderedStatusChanged) {
        try {
          console.log(`[COMMISSION] Item ${itemId} marked as ordered - triggering commission checks`);
          await checkOrderedStatusTrigger(orderId, itemId);
        } catch (error) {
          console.error(`[COMMISSION] Error triggering commission for newly ordered item ${itemId}:`, error);
          // Don't fail the update if commission triggering fails
        }
      }
      
      // If price changed, recalculate commission
      if (priceChanged) {
        const commissionFns = getCommissionFunctions();
        if (commissionFns && commissionFns.recalculateCommissionIfPriceChanged) {
          try {
            console.log(`[COMMISSION] Recalculating commission for order ${orderId} after item price change`);
            await commissionFns.recalculateCommissionIfPriceChanged(orderId);
          } catch (error) {
            console.error(`[COMMISSION] Error recalculating commission for order ${orderId}:`, error);
          }
        }
      }

      // Calculate ETA if item moved to MANUFACTURING or was marked as ordered (and not in PENDING_FUNDING)
      const shouldCalculateETA = movedToManufacturing || (orderedStatusChanged && updated.currentStage !== 'PENDING_FUNDING');

      if (shouldCalculateETA) {
        try {
          console.log(`[ETA] Item ${itemId} ${movedToManufacturing ? 'moved to MANUFACTURING' : 'marked as ordered'} - checking order ETA`);
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
              orderDate: true,
              etaDate: true,
              items: {
                select: { hasExtendedShipping: true }
              }
            }
          });

          // Only calculate ETA if not already set
          if (!order.etaDate) {
            // Check if any items have extended shipping
            const hasExtendedItems = order.items?.some(item => item.hasExtendedShipping === true) || false;
            const etaDate = await calculateETADate(order.orderDate ? new Date(order.orderDate) : new Date(), hasExtendedItems);
            await prisma.order.update({
              where: { id: orderId },
              data: { etaDate }
            });
            console.log(`[ETA] Order ${orderId} ETA set to ${etaDate} ${hasExtendedItems ? '(with extended shipping)' : ''}`);
          } else {
            console.log(`[ETA] Order ${orderId} already has ETA set, skipping calculation`);
          }
        } catch (error) {
          console.error(`[ETA] Error calculating ETA for order ${orderId}:`, error);
          // Don't fail the update if ETA calculation fails
        }
      }

      res.json(updated);
    } catch (e) {
      console.error('Error updating item:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Delete item - BLOCKED FOR MANUFACTURERS
  router.delete('/:orderId/items/:itemId', async (req, res) => {
    try {
      if (!canDeleteItems(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Manufacturers cannot delete items.' });
      }

      const { orderId, itemId } = req.params;
      
      const hasAccess = await canAccessItem(req.user, itemId, prisma);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only delete items assigned to you.' });
      }

      const validation = await validateItemBelongsToOrder(prisma, itemId, orderId);
      if (!validation.valid) {
        return res.status(404).json({ error: validation.error });
      }
      
      const item = validation.item;
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { isLocked: true }
      });
      
      if (order.isLocked) {
        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: orderId,
            parentEntityId: orderId,
            action: 'DELETE_ATTEMPTED_WHILE_LOCKED',
            metadata: JSON.stringify({ message: 'Tried to delete item' }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        return res.status(403).json({ 
          error: 'Cannot delete items from a locked order. Please unlock it first.' 
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            entityType: 'OrderItem',
            entityId: itemId,
            parentEntityId: orderId,
            action: 'ITEM_DELETED',
            metadata: JSON.stringify({
              entity: 'OrderItem',
              entityId: itemId
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

  // Mark item as ordered
  router.post('/:orderId/items/:itemId/ordered', async (req, res) => {
    if (!canMarkAsOrdered(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Manufacturers cannot mark items as ordered.' });
    }
    await markItemAsOrdered(req, res, prisma, req.user);
  });

  // Unmark item as ordered
  router.post('/:orderId/items/:itemId/unordered', async (req, res) => {
    if (!canMarkAsOrdered(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Manufacturers cannot unmark items as ordered.' });
    }
    await unmarkItemAsOrdered(req, res, prisma, req.user);
  });

  // Item stage change - MANUFACTURER CAN ONLY MOVE ASSIGNED ITEMS
  router.post('/:orderId/items/:itemId/stage', async (req, res) => {
    try {
      const { itemId, orderId } = req.params;
      
      const hasAccess = await canAccessItem(req.user, itemId, prisma);
      if (!hasAccess) {
        console.log(`[ACCESS DENIED] User ${req.user.name} (${req.user.role}) tried to change stage for item ${itemId}`);
        return res.status(403).json({ error: 'Access denied. You can only change stages for items assigned to you.' });
      }

      const { nextStage, note, allowFastForward = false, allowBackward = false } = req.body || {};
      const { STAGES, canAdvance } = await import('../state.js');

      if (!nextStage) return res.status(400).json({ error: 'nextStage required' });
      if (!STAGES.includes(nextStage)) return res.status(400).json({ error: 'invalid stage' });

      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: { order: true, manufacturer: true }
      });
      
      if (!item || item.orderId !== orderId) {
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
        
        console.log(`[STAGE CHANGE] User ${req.user.name} (${req.user.role}) moved item ${itemId} from ${currentStage} to ${nextStage}`);
        
        return tx.orderItemStatusEvent.create({
          data: {
            orderItemId: item.id,
            stage: nextStage,
            note: note ?? (isForward ? null : `Correction: ${currentStage} → ${nextStage}`),
            changedByUserId: req.user.id
          }
        });
      });

      // CRITICAL: Trigger commission payout if stage matches payout trigger AND item is ordered
      try {
        await checkCommissionPayoutTrigger(orderId, itemId, currentStage, nextStage);
      } catch (error) {
        console.error(`[COMMISSION] Error triggering commission payout for item ${itemId}:`, error);
        // Don't fail the stage change if commission triggering fails
      }

      res.json({ ok: true, event });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createItemsRouter;
