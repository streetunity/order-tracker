import express from 'express';
import { PrismaClient } from '@prisma/client';
import { STAGES, canAdvance } from '../state.js';
import { isManufacturer } from '../utils/roleHelpers.js';

const prisma = new PrismaClient();

export function createStagesRouter() {
  const router = express.Router();

  // Update ORDER stage (affects all items in order)
  router.post('/:id/stage', async (req, res) => {
    try {
      // MANUFACTURERS CANNOT CHANGE ORDER-LEVEL STAGES - only item-level
      if (isManufacturer(req.user.role)) {
        return res.status(403).json({ 
          error: 'Manufacturers cannot change order stages. Please use the item-level stage endpoint to update individual items assigned to you.' 
        });
      }

      const { nextStage, note, allowFastForward = false } = req.body || {};
      if (!nextStage) return res.status(400).json({ error: 'nextStage required' });
      if (!STAGES.includes(nextStage)) return res.status(400).json({ error: 'invalid stage' });

      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (!order) return res.status(404).json({ error: 'Not found' });

      if (!canAdvance(order.currentStage, nextStage, !!allowFastForward)) {
        return res.status(400).json({ error: `Cannot move from ${order.currentStage} to ${nextStage}` });
      }

      const event = await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { currentStage: nextStage } });
        return tx.orderStatusEvent.create({
          data: { orderId: order.id, stage: nextStage, note: note ?? null, changedByUserId: req.user.id }
        });
      });

      res.json({ ok: true, event });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update ITEM stage (for individual items) - manufacturers can ONLY use this for assigned items
  router.post('/:orderId/items/:itemId/stage', async (req, res) => {
    try {
      const { orderId, itemId } = req.params;
      const { nextStage, note, allowFastForward = false } = req.body || {};
      
      if (!nextStage) return res.status(400).json({ error: 'nextStage required' });
      if (!STAGES.includes(nextStage)) return res.status(400).json({ error: 'invalid stage' });

      // Get the item with manufacturer info
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: {
          order: true,
          manufacturer: true
        }
      });

      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (item.orderId !== orderId) return res.status(400).json({ error: 'Item does not belong to this order' });

      // MANUFACTURER ACCESS CONTROL: Can only update items assigned to them
      if (isManufacturer(req.user.role)) {
        if (!req.user.manufacturer || !req.user.manufacturer.id) {
          return res.status(403).json({ error: 'Your user account is not linked to a manufacturer profile.' });
        }
        
        if (item.manufacturerId !== req.user.manufacturer.id) {
          return res.status(403).json({ 
            error: 'Access denied. You can only update stage for items assigned to your manufacturer.' 
          });
        }
      }

      // Check stage advancement rules
      if (!canAdvance(item.currentStage, nextStage, !!allowFastForward)) {
        return res.status(400).json({ error: `Cannot move from ${item.currentStage} to ${nextStage}` });
      }

      const event = await prisma.$transaction(async (tx) => {
        // Update item stage
        await tx.orderItem.update({
          where: { id: itemId },
          data: { currentStage: nextStage }
        });

        // Create status event for the item
        const statusEvent = await tx.orderItemStatusEvent.create({
          data: {
            orderItemId: itemId,
            stage: nextStage,
            note: note ?? null,
            changedByUserId: req.user.id
          }
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            entityType: 'OrderItem',
            entityId: itemId,
            parentEntityId: orderId,
            action: 'ITEM_STAGE_CHANGED',
            changes: JSON.stringify([{
              field: 'currentStage',
              oldValue: item.currentStage,
              newValue: nextStage
            }]),
            metadata: JSON.stringify({
              note: note || null,
              productCode: item.productCode,
              manufacturerId: item.manufacturerId,
              manufacturerName: item.manufacturer?.name || null
            }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });

        return statusEvent;
      });

      res.json({ ok: true, event });
    } catch (e) {
      console.error('Item stage update error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createStagesRouter;
