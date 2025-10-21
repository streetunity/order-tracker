import express from 'express';
import { PrismaClient } from '@prisma/client';
import { isAdminOrHigher } from '../utils/roleHelpers.js';

const prisma = new PrismaClient();

export function createLocksRouter() {
  const router = express.Router();

  router.post('/:id/lock', async (req, res) => {
    try {
      const { reason } = req.body || {};
      const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, isLocked: true } });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.isLocked) return res.status(400).json({ error: 'Order is already locked' });

      const updatedOrder = await prisma.order.update({
        where: { id: req.params.id },
        data: { isLocked: true, lockedAt: new Date(), lockedBy: req.user.name }
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'Order', entityId: req.params.id, parentEntityId: req.params.id,
          action: 'LOCKED', metadata: JSON.stringify({ message: reason }),
          performedByUserId: req.user.id, performedByName: req.user.name
        }
      });

      res.json({ success: true, order: updatedOrder, message: 'Order has been locked' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/unlock', async (req, res) => {
    try {
      // Check if user is admin or higher (ADMIN, ACCOUNTANT, SUPER_ADMIN)
      if (!isAdminOrHigher(req.user.role)) {
        return res.status(403).json({ error: 'Admin access or higher required to unlock orders' });
      }
      const { reason } = req.body || {};
      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({ error: 'A reason with at least 10 characters is required to unlock an order' });
      }

      const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, isLocked: true } });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!order.isLocked) return res.status(400).json({ error: 'Order is not locked' });

      const updatedOrder = await prisma.order.update({
        where: { id: req.params.id },
        data: { isLocked: false, lockedAt: null, lockedBy: null }
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'Order', entityId: req.params.id, parentEntityId: req.params.id,
          action: 'UNLOCKED', metadata: JSON.stringify({ message: reason.trim() }),
          performedByUserId: req.user.id, performedByName: req.user.name
        }
      });

      res.json({ success: true, order: updatedOrder, message: 'Order has been unlocked' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id/audit-log', async (req, res) => {
    try {
      const logs = await prisma.auditLog.findMany({
        where: { OR: [{ entityId: req.params.id }, { parentEntityId: req.params.id }] },
        include: { performedBy: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' }
      });

      const formattedLogs = logs.map(log => {
        let parsedMetadata = {}; let parsedChanges = null;
        try { if (log.metadata) parsedMetadata = JSON.parse(log.metadata); } catch {}
        try { if (log.changes) parsedChanges = JSON.parse(log.changes); } catch {}
        return { ...log, parsedReason: parsedMetadata, changes: parsedChanges };
      });

      res.json(formattedLogs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createLocksRouter;
