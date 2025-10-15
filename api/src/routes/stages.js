import express from 'express';
import { PrismaClient } from '@prisma/client';
import { STAGES, canAdvance } from '../state.js';

const prisma = new PrismaClient();

export function createStagesRouter() {
  const router = express.Router();

  router.post('/:id/stage', async (req, res) => {
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

  return router;
}

export default createStagesRouter;
