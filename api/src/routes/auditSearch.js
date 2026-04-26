import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createAuditSearchRouter() {
  const router = express.Router();

  // Helper function to build entity type filter based on tab
  function getEntityTypeFilter(tab) {
    switch (tab) {
      case 'orders':
        return ['Order', 'OrderItem', 'Container'];
      case 'customers':
        return ['Account'];
      case 'users':
        return ['User'];
      case 'commissions':
        return ['Commission', 'CommissionPayout', 'CommissionRate', 'ItemCommission'];
      case 'documents':
        return ['Document', 'ItemDocument', 'ShipmentDocument', 'CustomerDocument', 'OrderDocument'];
      case 'recent':
      default:
        return null; // No filter - show all
    }
  }

  // Enhanced search endpoint with filtering, pagination, date range, and text search
  router.get('/search', async (req, res) => {
    try {
      const {
        tab = 'recent',
        page = 1,
        limit = 50,
        startDate,
        endDate,
        search
      } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      // Build where clause conditions
      const whereConditions = [];

      // Tab filter (entity type)
      const entityTypes = getEntityTypeFilter(tab);
      if (entityTypes) {
        whereConditions.push({ entityType: { in: entityTypes } });
      }

      // Date range filter
      if (startDate) {
        whereConditions.push({
          createdAt: { gte: new Date(startDate) }
        });
      }
      if (endDate) {
        // Add one day to include the end date fully
        const endDateTime = new Date(endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        whereConditions.push({
          createdAt: { lt: endDateTime }
        });
      }

      // Text search filter - search across multiple fields
      // Use raw query for better JSON field searching in SQLite
      if (search && search.trim()) {
        const searchTerm = search.trim().toLowerCase();
        whereConditions.push({
          OR: [
            { changes: { contains: searchTerm , mode: 'insensitive'} },
            { metadata: { contains: searchTerm , mode: 'insensitive'} },
            { performedByName: { contains: searchTerm , mode: 'insensitive'} },
            { action: { contains: searchTerm , mode: 'insensitive'} },
            { entityId: { contains: searchTerm , mode: 'insensitive'} },
            { parentEntityId: { contains: searchTerm , mode: 'insensitive'} }
          ]
        });
      }

      const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

      // Get total count for pagination info
      const totalCount = await prisma.auditLog.count({ where });

      // Fetch logs with pagination
      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          performedBy: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
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

      // Format logs
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

      // Return with pagination metadata
      res.json({
        logs: formattedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          hasMore: skip + logs.length < totalCount
        }
      });
    } catch (e) {
      console.error('Audit search error:', e);
      res.status(500).json({ error: 'Failed to search audit logs' });
    }
  });

  // /search-raw — functionally identical to /search above. Kept as a separate
  // endpoint because the frontend (web/app/history/page.jsx) routes search
  // queries here. Now backed by the same safe Prisma API — no raw SQL.
  // Previously used $queryRawUnsafe with SQLite-only syntax (INSTR, unquoted
  // identifiers); rewritten during the Postgres migration.
  router.get('/search-raw', async (req, res) => {
    try {
      const {
        tab = 'recent',
        page = 1,
        limit = 50,
        startDate,
        endDate,
        search
      } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      const whereConditions = [];

      const entityTypes = getEntityTypeFilter(tab);
      if (entityTypes) {
        whereConditions.push({ entityType: { in: entityTypes } });
      }

      if (startDate) {
        whereConditions.push({ createdAt: { gte: new Date(startDate) } });
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        whereConditions.push({ createdAt: { lt: endDateTime } });
      }

      if (search && search.trim()) {
        const searchTerm = search.trim();
        whereConditions.push({
          OR: [
            { changes:         { contains: searchTerm, mode: 'insensitive' } },
            { metadata:        { contains: searchTerm, mode: 'insensitive' } },
            { performedByName: { contains: searchTerm, mode: 'insensitive' } },
            { action:          { contains: searchTerm, mode: 'insensitive' } },
            { entityId:        { contains: searchTerm, mode: 'insensitive' } },
            { parentEntityId:  { contains: searchTerm, mode: 'insensitive' } },
          ],
        });
      }

      const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

      const totalCount = await prisma.auditLog.count({ where });

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      });

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
        };

        if (log.entityType === 'OrderItem' && log.entityId && orderItemMap[log.entityId]) {
          result.orderItem = orderItemMap[log.entityId];
        }

        return result;
      });

      res.json({
        logs: formattedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          hasMore: skip + logs.length < totalCount,
        },
      });
    } catch (e) {
      console.error('Audit raw search error:', e);
      console.error('Error stack:', e.stack);
      res.status(500).json({ error: 'Failed to search audit logs', details: e.message });
    }
  });

  return router;
}

export default createAuditSearchRouter;
