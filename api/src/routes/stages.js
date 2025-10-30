import express from 'express';
import { PrismaClient } from '@prisma/client';
import { STAGES, canAdvance } from '../state.js';
import { isManufacturer } from '../utils/roleHelpers.js';

const prisma = new PrismaClient();

export function createStagesRouter() {
  const router = express.Router();

  // Get commission functions from global (set up in index.js)
  const getCommissionFunctions = () => global.commissionFunctions || {};

  // Update ORDER stage (affects all items in order) - WITH COMMISSION PAYOUT TRIGGER
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

      const previousStage = order.currentStage;

      if (!canAdvance(previousStage, nextStage, !!allowFastForward)) {
        return res.status(400).json({ error: `Cannot move from ${previousStage} to ${nextStage}` });
      }

      const event = await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { currentStage: nextStage } });
        return tx.orderStatusEvent.create({
          data: { orderId: order.id, stage: nextStage, note: note ?? null, changedByUserId: req.user.id }
        });
      });

      // Trigger commission payout if stage reached
      try {
        const { checkCommissionPayoutTrigger } = getCommissionFunctions();
        if (checkCommissionPayoutTrigger) {
          await checkCommissionPayoutTrigger(order.id, nextStage);
          console.log(`Commission payout trigger checked for order ${order.id} stage ${nextStage}`);
        }
      } catch (commissionError) {
        console.error('Error checking commission payout trigger:', commissionError);
        // Don't fail the stage change if commission check fails
      }

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

      // Check if all items have reached the stage to trigger commission payout
      // (Optional: Only trigger if all items reach certain stage)
      if (!isManufacturer(req.user.role)) {
        try {
          const allItems = await prisma.orderItem.findMany({
            where: { orderId: orderId }
          });
          
          // Check if all items have reached or passed the trigger stage
          const triggerStages = ['SHIPPING', 'DELIVERED'];
          if (triggerStages.includes(nextStage)) {
            const allAtStage = allItems.every(i => 
              i.id === itemId ? nextStage === nextStage : // Current item
              STAGES.indexOf(i.currentStage) >= STAGES.indexOf(nextStage) // Other items
            );
            
            if (allAtStage) {
              const { checkCommissionPayoutTrigger } = getCommissionFunctions();
              if (checkCommissionPayoutTrigger) {
                await checkCommissionPayoutTrigger(orderId, nextStage);
                console.log(`Commission payout trigger checked for order ${orderId} (all items at ${nextStage})`);
              }
            }
          }
        } catch (commissionError) {
          console.error('Error checking commission payout trigger:', commissionError);
        }
      }

      res.json({ ok: true, event });
    } catch (e) {
      console.error('Item stage update error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createStagesRouter;