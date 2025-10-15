import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createAuditRouter() {
  const router = express.Router();

  router.get('/:entityId', async (req, res) => {
    try {
      const logs = await prisma.auditLog.findMany({
        where: { OR: [{ entityId: req.params.entityId }, { parentEntityId: req.params.entityId }] },
        include: { performedBy: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' }
      });

      const formattedLogs = logs.map(log => {
        let changes = []; let metadata = {};
        try { if (log.changes) changes = JSON.parse(log.changes); } catch {}
        try { if (log.metadata) metadata = JSON.parse(log.metadata); } catch {}
        return {
          id: log.id, timestamp: log.createdAt, entityType: log.entityType,
          entityId: log.entityId, parentEntityId: log.parentEntityId,
          action: log.action, changes, metadata,
          performedByUserId: log.performedByUserId, performedByName: log.performedByName,
          performedBy: log.performedBy
        };
      });

      res.json(formattedLogs);
    } catch (e) {
      console.error('Audit fetch error:', e);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  return router;
}

export default createAuditRouter;
