import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createAuditRouter() {
  const router = express.Router();

  // Helper function to build entity type filter based on tab
  function getEntityTypeFilter(tab) {
    switch (tab) {
      case 'orders':
        return ['Order', 'OrderItem'];
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

  // ONE-TIME BACKFILL: Populate missing metadata on commission audit logs
  // POST /api/audit/backfill-commission-metadata
  router.post('/backfill-commission-metadata', async (req, res) => {
    try {
      console.log('🔄 Starting commission audit metadata backfill...');
      
      // Find all commission-related audit logs
      const commissionLogs = await prisma.auditLog.findMany({
        where: {
          entityType: {
            in: ['Commission', 'CommissionPayout', 'ItemCommission']
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`📋 Found ${commissionLogs.length} commission audit logs to process`);

      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const log of commissionLogs) {
        try {
          // Parse existing metadata
          let existingMetadata = {};
          try {
            if (log.metadata) existingMetadata = JSON.parse(log.metadata);
          } catch {}

          // Check if already has enriched metadata (skip if complete)
          if (existingMetadata.salesPerson && existingMetadata.itemName && existingMetadata.stage !== undefined) {
            skipped++;
            continue;
          }

          // Try to find the payout record
          let payout = null;
          let itemCommission = null;
          let orderItem = null;
          let order = null;
          let account = null;

          // entityId could be a CommissionPayout ID or ItemCommission ID
          if (log.entityType === 'CommissionPayout') {
            payout = await prisma.commissionPayout.findUnique({
              where: { id: log.entityId },
              include: {
                itemCommission: {
                  include: {
                    orderItem: {
                      include: {
                        order: {
                          include: {
                            account: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            });

            if (payout) {
              itemCommission = payout.itemCommission;
              orderItem = itemCommission?.orderItem;
              order = orderItem?.order;
              account = order?.account;
            }
          } else if (log.entityType === 'ItemCommission') {
            itemCommission = await prisma.itemCommission.findUnique({
              where: { id: log.entityId },
              include: {
                orderItem: {
                  include: {
                    order: {
                      include: {
                        account: true
                      }
                    }
                  }
                }
              }
            });

            if (itemCommission) {
              orderItem = itemCommission.orderItem;
              order = orderItem?.order;
              account = order?.account;
            }
          }

          // Build enriched metadata
          const enrichedMetadata = { ...existingMetadata };

          // Sales person (agent)
          if (!enrichedMetadata.salesPerson) {
            if (itemCommission?.salesPerson) {
              enrichedMetadata.salesPerson = itemCommission.salesPerson;
            } else if (order?.sku) {
              enrichedMetadata.salesPerson = order.sku;
            }
          }

          // Customer name
          if (!enrichedMetadata.customerName && account?.name) {
            enrichedMetadata.customerName = account.name;
          }

          // Item name
          if (!enrichedMetadata.itemName && orderItem?.productCode) {
            enrichedMetadata.itemName = orderItem.productCode;
          }

          // Stage (P1/P2)
          if (enrichedMetadata.stage === undefined && payout?.stage) {
            enrichedMetadata.stage = payout.stage;
          }

          // Amount
          if (enrichedMetadata.amount === undefined && payout?.amount !== undefined) {
            enrichedMetadata.amount = payout.amount;
          }

          // Check if we actually added any new data
          const newMetadataStr = JSON.stringify(enrichedMetadata);
          const oldMetadataStr = log.metadata || '{}';
          
          if (newMetadataStr !== oldMetadataStr && Object.keys(enrichedMetadata).length > Object.keys(existingMetadata).length) {
            // Update the audit log
            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: newMetadataStr }
            });
            updated++;
            console.log(`✅ Updated log ${log.id}: ${log.action} - added metadata for ${enrichedMetadata.salesPerson || 'unknown agent'}`);
          } else {
            skipped++;
          }
        } catch (logError) {
          console.error(`❌ Error processing log ${log.id}:`, logError.message);
          errors++;
        }
      }

      const summary = {
        total: commissionLogs.length,
        updated,
        skipped,
        errors,
        message: `Backfill complete: ${updated} updated, ${skipped} skipped, ${errors} errors`
      };

      console.log('🏁 Backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Backfill error:', e);
      res.status(500).json({ error: 'Failed to backfill commission metadata', details: e.message });
    }
  });

  // ONE-TIME BACKFILL: Populate missing metadata on user audit logs
  // POST /api/audit/backfill-user-metadata
  router.post('/backfill-user-metadata', async (req, res) => {
    try {
      console.log('🔄 Starting user audit metadata backfill...');
      
      // Find all user-related audit logs
      const userLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'User'
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`📋 Found ${userLogs.length} user audit logs to process`);

      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const log of userLogs) {
        try {
          // Parse existing metadata
          let existingMetadata = {};
          try {
            if (log.metadata) existingMetadata = JSON.parse(log.metadata);
          } catch {}

          // Check if already has enriched metadata (skip if complete)
          if (existingMetadata.userName && existingMetadata.userRole) {
            skipped++;
            continue;
          }

          // Try to find the user record
          const user = await prisma.user.findUnique({
            where: { id: log.entityId },
            select: { id: true, name: true, email: true, role: true }
          });

          // Build enriched metadata
          const enrichedMetadata = { ...existingMetadata };

          if (user) {
            if (!enrichedMetadata.userName) {
              enrichedMetadata.userName = user.name || user.email;
            }
            if (!enrichedMetadata.userEmail) {
              enrichedMetadata.userEmail = user.email;
            }
            if (!enrichedMetadata.userRole) {
              enrichedMetadata.userRole = user.role;
            }
          }

          // Also try to extract from changes if available
          if (!enrichedMetadata.userName || !enrichedMetadata.userRole) {
            let changes = [];
            try {
              if (log.changes) changes = JSON.parse(log.changes);
            } catch {}

            for (const change of changes) {
              if (change.field === 'name' && !enrichedMetadata.userName) {
                enrichedMetadata.userName = change.newValue || change.oldValue;
              }
              if (change.field === 'role' && !enrichedMetadata.userRole) {
                enrichedMetadata.userRole = change.newValue || change.oldValue;
              }
              if (change.field === 'email' && !enrichedMetadata.userEmail) {
                enrichedMetadata.userEmail = change.newValue || change.oldValue;
              }
            }
          }

          // Check if we actually added any new data
          const newMetadataStr = JSON.stringify(enrichedMetadata);
          const oldMetadataStr = log.metadata || '{}';
          
          if (newMetadataStr !== oldMetadataStr && Object.keys(enrichedMetadata).length > Object.keys(existingMetadata).length) {
            // Update the audit log
            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: newMetadataStr }
            });
            updated++;
            console.log(`✅ Updated log ${log.id}: ${log.action} - added metadata for ${enrichedMetadata.userName || 'unknown user'}`);
          } else {
            skipped++;
          }
        } catch (logError) {
          console.error(`❌ Error processing log ${log.id}:`, logError.message);
          errors++;
        }
      }

      const summary = {
        total: userLogs.length,
        updated,
        skipped,
        errors,
        message: `Backfill complete: ${updated} updated, ${skipped} skipped, ${errors} errors`
      };

      console.log('🏁 Backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Backfill error:', e);
      res.status(500).json({ error: 'Failed to backfill user metadata', details: e.message });
    }
  });

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
            { changes: { contains: searchTerm } },
            { metadata: { contains: searchTerm } },
            { performedByName: { contains: searchTerm } },
            { action: { contains: searchTerm } },
            { entityId: { contains: searchTerm } },
            { parentEntityId: { contains: searchTerm } }
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

  // Raw SQL search endpoint for better full-text searching across JSON fields
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

      console.log('🔍 Raw search called with:', { tab, page, limit, startDate, endDate, search });

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const offset = (pageNum - 1) * limitNum;

      // Build SQL conditions
      const conditions = [];
      const params = [];

      // Tab filter
      const entityTypes = getEntityTypeFilter(tab);
      if (entityTypes) {
        const placeholders = entityTypes.map(() => '?').join(', ');
        conditions.push(`entityType IN (${placeholders})`);
        params.push(...entityTypes);
      }

      // Date filters
      if (startDate) {
        conditions.push('createdAt >= ?');
        params.push(new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        conditions.push('createdAt < ?');
        params.push(endDateTime.toISOString());
      }

      // Text search - use LIKE with % wildcards for SQLite
      // Search in both changes and metadata fields, plus other text fields
      if (search && search.trim()) {
        const searchTerm = search.trim();
        
        // Build a comprehensive OR clause for searching
        // Using INSTR for more reliable substring matching in SQLite
        conditions.push(`(
          INSTR(LOWER(COALESCE(changes, '')), LOWER(?)) > 0 OR
          INSTR(LOWER(COALESCE(metadata, '')), LOWER(?)) > 0 OR
          INSTR(LOWER(COALESCE(performedByName, '')), LOWER(?)) > 0 OR
          INSTR(LOWER(COALESCE(action, '')), LOWER(?)) > 0 OR
          INSTR(LOWER(COALESCE(entityId, '')), LOWER(?)) > 0 OR
          INSTR(LOWER(COALESCE(parentEntityId, '')), LOWER(?)) > 0
        )`);
        // Push the search term 6 times (once for each field)
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        
        console.log('🔍 Search term:', searchTerm);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      console.log('🔍 WHERE clause:', whereClause);
      console.log('🔍 Params:', params);

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM AuditLog ${whereClause}`;
      const countResult = await prisma.$queryRawUnsafe(countQuery, ...params);
      const totalCount = Number(countResult[0]?.count || 0);
      
      console.log('🔍 Total count:', totalCount);

      // Fetch logs
      const dataQuery = `
        SELECT * FROM AuditLog 
        ${whereClause}
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
      `;
      const logs = await prisma.$queryRawUnsafe(dataQuery, ...params, limitNum, offset);
      
      console.log('🔍 Logs found:', logs.length);

      // Fetch OrderItem details
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
          performedByName: log.performedByName
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
          hasMore: offset + logs.length < totalCount
        }
      });
    } catch (e) {
      console.error('Audit raw search error:', e);
      console.error('Error stack:', e.stack);
      res.status(500).json({ error: 'Failed to search audit logs', details: e.message });
    }
  });

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
