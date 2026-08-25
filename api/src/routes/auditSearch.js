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

  // ───────────────────────────────────────────────────────────────────────────
  // Emails tab — every email the system sends.
  //
  // Emails are recorded in two tables with different lifecycles (kept separate
  // by design): AlertEmailLog (system/notification emails — stage moves, broker
  // digests, commission approvals, surveys, install confirmations) and EmailLog
  // (invoicing emails — invoices and estimates, with open/bounce tracking).
  // This endpoint returns a normalized, paginated union of both so they show up
  // together on the audit history "Emails" tab. Read-only.
  // ───────────────────────────────────────────────────────────────────────────
  router.get('/emails', async (req, res) => {
    try {
      const { page = 1, limit = 50, startDate, endDate, search } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      // Shared date-range filter on sentAt.
      const dateFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1); // include the whole end day
        dateFilter.lt = end;
      }
      const hasDate = Object.keys(dateFilter).length > 0;

      const term = search && search.trim() ? search.trim() : null;

      // Where clause for AlertEmailLog (system/notification emails).
      const alertWhere = { AND: [] };
      if (hasDate) alertWhere.AND.push({ sentAt: dateFilter });
      if (term) {
        alertWhere.AND.push({
          OR: [
            { toEmail: { contains: term, mode: 'insensitive' } },
            { fromEmail: { contains: term, mode: 'insensitive' } },
            { toName: { contains: term, mode: 'insensitive' } },
            { fromName: { contains: term, mode: 'insensitive' } },
            { subject: { contains: term, mode: 'insensitive' } },
            { category: { contains: term, mode: 'insensitive' } },
            { status: { contains: term, mode: 'insensitive' } },
            { triggeredByName: { contains: term, mode: 'insensitive' } },
          ],
        });
      }

      // Where clause for EmailLog (invoicing emails).
      const invoiceWhere = { AND: [] };
      if (hasDate) invoiceWhere.AND.push({ sentAt: dateFilter });
      if (term) {
        invoiceWhere.AND.push({
          OR: [
            { toEmail: { contains: term, mode: 'insensitive' } },
            { fromEmail: { contains: term, mode: 'insensitive' } },
            { subject: { contains: term, mode: 'insensitive' } },
            { status: { contains: term, mode: 'insensitive' } },
          ],
        });
      }

      // Two-source offset pagination: count both, over-fetch (skip+limit) from
      // each, merge, sort by sentAt desc, then slice the requested window.
      const [alertCount, invoiceCount, alertRows, invoiceRows] = await Promise.all([
        prisma.alertEmailLog.count({ where: alertWhere }),
        prisma.emailLog.count({ where: invoiceWhere }),
        prisma.alertEmailLog.findMany({
          where: alertWhere,
          orderBy: { sentAt: 'desc' },
          take: skip + limitNum,
        }),
        prisma.emailLog.findMany({
          where: invoiceWhere,
          orderBy: { sentAt: 'desc' },
          take: skip + limitNum,
          include: {
            sentBy: { select: { name: true, email: true } },
            invoice: { select: { invoiceNumber: true } },
            estimate: { select: { estimateNumber: true } },
          },
        }),
      ]);

      const totalCount = alertCount + invoiceCount;

      // Normalize AlertEmailLog rows.
      const normalizedAlerts = alertRows.map((r) => {
        let metadata = {};
        try { if (r.metadata) metadata = JSON.parse(r.metadata); } catch {}
        return {
          id: `alert:${r.id}`,
          source: 'alert',
          entityType: 'Email',
          timestamp: r.sentAt,
          action: r.status === 'FAILED' ? 'EMAIL_FAILED' : 'EMAIL_SENT',
          status: r.status,
          category: r.category || 'NOTIFICATION',
          fromEmail: r.fromEmail,
          fromName: r.fromName,
          toEmail: r.toEmail,
          toName: r.toName,
          subject: r.subject,
          sesMessageId: r.sesMessageId,
          errorMessage: r.errorMessage,
          orderId: r.orderId,
          orderItemId: r.orderItemId,
          relatedType: null,
          relatedNumber: null,
          performedByName: r.triggeredByName || 'System',
          metadata,
        };
      });

      // Normalize EmailLog (invoicing) rows.
      const normalizedInvoices = invoiceRows.map((r) => {
        const relatedType = r.invoiceId ? 'Invoice' : r.estimateId ? 'Estimate' : null;
        const relatedNumber = r.invoice?.invoiceNumber || r.estimate?.estimateNumber || null;
        return {
          id: `invoice:${r.id}`,
          source: 'invoicing',
          entityType: 'Email',
          timestamp: r.sentAt,
          action: r.status === 'FAILED' ? 'EMAIL_FAILED' : 'EMAIL_SENT',
          status: r.status,
          category: relatedType ? relatedType.toUpperCase() : 'INVOICING',
          fromEmail: r.fromEmail,
          fromName: null,
          toEmail: r.toEmail,
          toName: null,
          subject: r.subject,
          sesMessageId: r.sesMessageId,
          errorMessage: null,
          orderId: null,
          orderItemId: null,
          relatedType,
          relatedNumber,
          performedByName: r.sentBy?.name || r.sentBy?.email || 'System',
          metadata: {
            openedAt: r.openedAt || null,
            deliveredAt: r.deliveredAt || null,
            bouncedAt: r.bouncedAt || null,
          },
        };
      });

      // Merge, sort by timestamp desc, and slice the requested page window.
      const merged = [...normalizedAlerts, ...normalizedInvoices].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      const pageItems = merged.slice(skip, skip + limitNum);

      res.json({
        logs: pageItems,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          hasMore: skip + pageItems.length < totalCount,
        },
      });
    } catch (e) {
      console.error('Audit emails fetch error:', e);
      res.status(500).json({ error: 'Failed to fetch email log', details: e.message });
    }
  });

  return router;
}

export default createAuditSearchRouter;
