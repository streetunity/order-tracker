import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createAuditRouter() {
  const router = express.Router();

  // NOTE: Backfill endpoints moved to auditBackfill.js:
  // - /diagnose-commission-data
  // - /backfill-commission-smart
  // - /backfill-commission-metadata
  // - /backfill-documents-synthetic
  // - /backfill-document-metadata
  // - /backfill-user-metadata

  // NOTE: Search endpoints moved to auditSearch.js:
  // - /search
  // - /search-raw

  // Get recent universal changes (all audit logs, limited to last 20)
  // Kept for backward compatibility
  router.get('/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;

      const logs = await prisma.auditLog.findMany({
        include: {
          performedBy: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      // Fetch OrderItem details for logs that reference OrderItems
      const orderItemIds = logs
        .filter(log => log.entityType === 'OrderItem' && log.entityId)
        .map(log => log.entityId);

      const orderItems = orderItemIds.length > 0 ? await prisma.orderItem.findMany({
        where: { id: { in: orderItemIds } },
        select: { id: true, productCode: true, modelNumber: true }
      }) : [];

      const orderItemMap = Object.fromEntries(orderItems.map(item => [item.id, item]));

      const formattedLogs = logs.map(log => {
        let changes = [];
        let metadata = {};
        try { if (log.changes) changes = JSON.parse(log.changes); } catch {}
        try { if (log.metadata) metadata = JSON.parse(log.metadata); } catch {}

        const result = {
          id: log.id,
          timestamp: log.createdAt,
          entityType: log.entityType,
          entityId: log.entityId,
          parentEntityId: log.parentEntityId,
          action: log.action,
          changes,
          metadata,
          performedByUserId: log.performedByUserId,
          performedByName: log.performedByName,
          performedBy: log.performedBy
        };

        // Add OrderItem details if available
        if (log.entityType === 'OrderItem' && log.entityId && orderItemMap[log.entityId]) {
          result.orderItem = orderItemMap[log.entityId];
        }

        return result;
      });

      res.json(formattedLogs);
    } catch (e) {
      console.error('Recent audit fetch error:', e);
      res.status(500).json({ error: 'Failed to fetch recent audit logs' });
    }
  });

  // Get audit logs by entity type (for filtering by orders or accounts)
  // Kept for backward compatibility
  router.get('/by-type/:entityType', async (req, res) => {
    try {
      const { entityType } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const logs = await prisma.auditLog.findMany({
        where: { entityType },
        include: {
          performedBy: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      // Fetch OrderItem details for logs that reference OrderItems
      const orderItemIds = logs
        .filter(log => log.entityType === 'OrderItem' && log.entityId)
        .map(log => log.entityId);

      const orderItems = orderItemIds.length > 0 ? await prisma.orderItem.findMany({
        where: { id: { in: orderItemIds } },
        select: { id: true, productCode: true, modelNumber: true }
      }) : [];

      const orderItemMap = Object.fromEntries(orderItems.map(item => [item.id, item]));

      const formattedLogs = logs.map(log => {
        let changes = [];
        let metadata = {};
        try { if (log.changes) changes = JSON.parse(log.changes); } catch {}
        try { if (log.metadata) metadata = JSON.parse(log.metadata); } catch {}

        const result = {
          id: log.id,
          timestamp: log.createdAt,
          entityType: log.entityType,
          entityId: log.entityId,
          parentEntityId: log.parentEntityId,
          action: log.action,
          changes,
          metadata,
          performedByUserId: log.performedByUserId,
          performedByName: log.performedByName,
          performedBy: log.performedBy
        };

        // Add OrderItem details if available
        if (log.entityType === 'OrderItem' && log.entityId && orderItemMap[log.entityId]) {
          result.orderItem = orderItemMap[log.entityId];
        }

        return result;
      });

      res.json(formattedLogs);
    } catch (e) {
      console.error('Entity type audit fetch error:', e);
      res.status(500).json({ error: 'Failed to fetch audit logs by type' });
    }
  });

  // Get audit logs for specific entity (original endpoint - kept for compatibility)
  router.get('/:entityId', async (req, res) => {
    try {
      const logs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { entityId: req.params.entityId },
            { parentEntityId: req.params.entityId }
          ]
        },
        include: {
          performedBy: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Fetch OrderItem details for logs that reference OrderItems
      const orderItemIds = logs
        .filter(log => log.entityType === 'OrderItem' && log.entityId)
        .map(log => log.entityId);

      const orderItems = orderItemIds.length > 0 ? await prisma.orderItem.findMany({
        where: { id: { in: orderItemIds } },
        select: { id: true, productCode: true, modelNumber: true }
      }) : [];

      const orderItemMap = Object.fromEntries(orderItems.map(item => [item.id, item]));

      const formattedLogs = logs.map(log => {
        let changes = [];
        let metadata = {};
        try { if (log.changes) changes = JSON.parse(log.changes); } catch {}
        try { if (log.metadata) metadata = JSON.parse(log.metadata); } catch {}

        const result = {
          id: log.id,
          timestamp: log.createdAt,
          entityType: log.entityType,
          entityId: log.entityId,
          parentEntityId: log.parentEntityId,
          action: log.action,
          changes,
          metadata,
          performedByUserId: log.performedByUserId,
          performedByName: log.performedByName,
          performedBy: log.performedBy
        };

        // Add OrderItem details if available
        if (log.entityType === 'OrderItem' && log.entityId && orderItemMap[log.entityId]) {
          result.orderItem = orderItemMap[log.entityId];
        }

        return result;
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
