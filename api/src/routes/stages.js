import express from 'express';
import { PrismaClient } from '@prisma/client';
import { STAGES, canAdvance } from '../state.js';
import { isManufacturer } from '../utils/roleHelpers.js';

const prisma = new PrismaClient();

// Fires any InvoicePaymentSchedule rows for this order whose triggerStage
// matches the new stage and which haven't been triggered yet. Mirrors the
// existing commission trigger pattern but operates on invoice schedule rows.
//
// Used by the 50/40/10 milestone schedule:
//   - 50% triggers on order creation (via deposit payment, not via stage)
//   - 40% triggers when all items reach QC
//   - 10% triggers when all items reach DELIVERED
async function fireInvoiceScheduleTriggers(orderId, stage) {
  // Find the invoice that produced this order
  const invoice = await prisma.invoice.findFirst({
    where: { orderId, isDeleted: false },
    select: { id: true }
  });
  if (!invoice) return;

  const now = new Date();
  const result = await prisma.invoicePaymentSchedule.updateMany({
    where: {
      invoiceId:    invoice.id,
      triggerStage: stage,
      triggeredAt:  null,
    },
    data: {
      triggeredAt: now,
      dueDate:     now,
    },
  });

  if (result.count > 0) {
    console.log(`[INVOICE_SCHEDULE] Fired ${result.count} schedule trigger(s) for order ${orderId} on stage ${stage}`);
  }
}

export function createStagesRouter() {
  const router = express.Router();

  // Get commission functions from global (set up in index.js)
  const getCommissionFunctions = () => global.commissionFunctions || {};

  // Update ORDER stage (affects all items in order) - WITH COMMISSION + INVOICE SCHEDULE TRIGGERS
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

      // Trigger invoice payment schedule milestone if any schedule row matches this stage
      try {
        await fireInvoiceScheduleTriggers(order.id, nextStage);
      } catch (scheduleError) {
        console.error('Error firing invoice schedule trigger:', scheduleError);
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

      // Check if all items have reached the stage to trigger downstream actions
      // (commission payout + invoice schedule milestones)
      if (!isManufacturer(req.user.role)) {
        try {
          const allItems = await prisma.orderItem.findMany({
            where: { orderId: orderId }
          });

          const allAtStage = allItems.every(i =>
            i.id === itemId
              ? true // current item just updated to nextStage
              : STAGES.indexOf(i.currentStage) >= STAGES.indexOf(nextStage)
          );

          if (allAtStage) {
            // Commission payout trigger (existing — only relevant for SHIPPING/DELIVERED)
            if (['SHIPPING', 'DELIVERED'].includes(nextStage)) {
              try {
                const { checkCommissionPayoutTrigger } = getCommissionFunctions();
                if (checkCommissionPayoutTrigger) {
                  await checkCommissionPayoutTrigger(orderId, nextStage);
                  console.log(`Commission payout trigger checked for order ${orderId} (all items at ${nextStage})`);
                }
              } catch (commissionError) {
                console.error('Error checking commission payout trigger:', commissionError);
              }
            }

            // Invoice payment schedule milestone trigger (new — fires when a row matches)
            try {
              await fireInvoiceScheduleTriggers(orderId, nextStage);
            } catch (scheduleError) {
              console.error('Error firing invoice schedule trigger:', scheduleError);
            }
          }
        } catch (e) {
          console.error('Stage trigger check error:', e);
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
