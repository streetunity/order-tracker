import express from 'express';
import { PrismaClient } from '@prisma/client';
import { markItemAsOrdered, unmarkItemAsOrdered } from '../ordered-endpoints.js';

const prisma = new PrismaClient();

export function createItemsRouter() {
  const router = express.Router();

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

  // Create items
  router.post('/:orderId/items', async (req, res) => {
    try {
      const orderId = String(req.params.orderId);
      const order = await prisma.order.findUnique({ 
        where: { id: orderId }, 
        select: { id: true, isLocked: true } 
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
              laserWattage: i.laserWattage || null,
              notes: i.notes
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
      
      res.status(201).json(created);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update item
  router.patch('/:orderId/items/:itemId', async (req, res) => {
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
          laserWattage: true,
          notes: true,
          archivedAt: true,
          currentStage: true,
          height: true,
          width: true,
          length: true,
          weight: true,
          measurementUnit: true,
          weightUnit: true,
          itemPrice: true,
          privateItemNote: true
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
        
        if (changes.some(c => measurementFields.includes(c.field))) {
          data.measuredAt = new Date();
          data.measuredBy = req.user.name;
        }
      }
      
      // Check if trying to edit regular fields on a locked order
      const editFields = ['productCode', 'qty', 'serialNumber', 'modelNumber', 'voltage', 'laserWattage', 'notes'];
      
      const hasEditFieldChanges = editFields.some(field => {
        if (!req.body.hasOwnProperty(field)) return false;
        
        if (field === 'qty') {
          const newQty = Number(req.body[field]);
          return newQty !== item.qty;
        }
        
        const currentVal = item[field] || null;
        const newVal = (req.body[field] === '' || req.body[field] === null) ? null : String(req.body[field]).trim();
        return newVal !== currentVal;
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
      
      // Process other string fields
      const stringFields = ['serialNumber', 'modelNumber', 'voltage', 'laserWattage', 'notes'];
      for (const field of stringFields) {
        if (req.body.hasOwnProperty(field)) {
          const newValue = (req.body[field] === '' || req.body[field] === null) 
            ? null 
            : String(req.body[field]).trim();
          
          if (newValue !== item[field]) {
            data[field] = newValue;
            changes.push({
              field,
              oldValue: item[field] || 'null',
              newValue: newValue || 'null'
            });
          }
        }
      }

      // Handle itemPrice and privateItemNote (admin-only fields allowed even on locked orders)
      if (req.body.hasOwnProperty('itemPrice')) {
        const newPrice = (req.body.itemPrice === '' || req.body.itemPrice === null)
          ? null
          : parseFloat(req.body.itemPrice);

        if (newPrice !== item.itemPrice) {
          data.itemPrice = newPrice;
          changes.push({
            field: 'itemPrice',
            oldValue: item.itemPrice ? String(item.itemPrice) : 'null',
            newValue: newPrice ? String(newPrice) : 'null'
          });
        }
      }

      if (req.body.hasOwnProperty('privateItemNote')) {
        const newPrivateNote = (req.body.privateItemNote === '' || req.body.privateItemNote === null)
          ? null
          : String(req.body.privateItemNote).trim();

        if (newPrivateNote !== item.privateItemNote) {
          data.privateItemNote = newPrivateNote;
          changes.push({
            field: 'privateItemNote',
            oldValue: item.privateItemNote || 'null',
            newValue: newPrivateNote || 'null'
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
        return res.json(item);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updatedItem = await tx.orderItem.update({ 
          where: { id: itemId }, 
          data 
        });
        
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
        }
        
        return updatedItem;
      });
      
      res.json(updated);
    } catch (e) {
      console.error('Error updating item:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Delete item
  router.delete('/:orderId/items/:itemId', async (req, res) => {
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

  // Mark item as ordered
  router.post('/:orderId/items/:itemId/ordered', async (req, res) => {
    await markItemAsOrdered(req, res, prisma, req.user);
  });

  // Unmark item as ordered
  router.post('/:orderId/items/:itemId/unordered', async (req, res) => {
    await unmarkItemAsOrdered(req, res, prisma, req.user);
  });

  // Item stage change
  router.post('/:orderId/items/:itemId/stage', async (req, res) => {
    try {
      const { nextStage, note, allowFastForward = false, allowBackward = false } = req.body || {};
      const { STAGES, canAdvance } = await import('../state.js');

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

  return router;
}

export default createItemsRouter;