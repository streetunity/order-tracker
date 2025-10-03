// api/src/routes/reportsCycleTime.js
/**
 * CYCLE TIME & FLOW REPORTS - Part 2 completion
 * Lock usage endpoint and export
 */

import {
  parseReportFilters,
  formatDuration
} from '../utils/reportHelpers.js';

export function addLockUsageReport(router, prisma) {
  /**
   * GET /reports/lock-usage
   * Lock duration and edit friction analysis
   */
  router.get('/lock-usage', async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const startTime = Date.now();

      // Get lock/unlock audit logs
      const lockLogs = await prisma.auditLog.findMany({
        where: {
          action: { in: ['LOCKED', 'UNLOCKED', 'EDIT_ATTEMPTED_WHILE_LOCKED'] },
          ...(filters.dateFrom || filters.dateTo ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {})
            }
          } : {})
        },
        include: {
          performedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Group by order to calculate lock durations
      const orderLocks = new Map(); // orderId -> { locked, unlocked, duration, user }
      const editAttempts = new Map(); // userId -> count
      const lockDurations = [];

      for (const log of lockLogs) {
        const orderId = log.entityId;

        if (log.action === 'LOCKED') {
          if (!orderLocks.has(orderId)) {
            orderLocks.set(orderId, []);
          }
          orderLocks.get(orderId).push({
            lockedAt: log.createdAt,
            lockedBy: log.performedByName,
            lockedById: log.performedByUserId
          });
        } else if (log.action === 'UNLOCKED') {
          const locks = orderLocks.get(orderId);
          if (locks && locks.length > 0) {
            const lastLock = locks[locks.length - 1];
            if (!lastLock.unlockedAt) {
              lastLock.unlockedAt = log.createdAt;
              lastLock.unlockedBy = log.performedByName;
              const durationSec = Math.floor((new Date(log.createdAt) - new Date(lastLock.lockedAt)) / 1000);
              lastLock.durationSec = durationSec;
              lockDurations.push(durationSec);
            }
          }
        } else if (log.action === 'EDIT_ATTEMPTED_WHILE_LOCKED') {
          const userId = log.performedByUserId || 'unknown';
          editAttempts.set(userId, (editAttempts.get(userId) || 0) + 1);
        }
      }

      // Calculate stats
      const totalLocks = Array.from(orderLocks.values()).flat().length;
      const avgDuration = lockDurations.length > 0 
        ? lockDurations.reduce((sum, d) => sum + d, 0) / lockDurations.length 
        : 0;
      const totalEditAttempts = Array.from(editAttempts.values()).reduce((sum, count) => sum + count, 0);

      // Build rows
      const lockRows = [];
      for (const [orderId, locks] of orderLocks.entries()) {
        for (const lock of locks) {
          lockRows.push({
            orderId,
            lockedAt: lock.lockedAt,
            unlockedAt: lock.unlockedAt || null,
            lockedBy: lock.lockedBy,
            unlockedBy: lock.unlockedBy || null,
            durationSec: lock.durationSec || null,
            durationFormatted: lock.durationSec ? formatDuration(lock.durationSec) : 'Still locked',
            status: lock.unlockedAt ? 'completed' : 'active'
          });
        }
      }

      const editAttemptRows = Array.from(editAttempts.entries()).map(([userId, count]) => ({
        userId,
        userName: lockLogs.find(l => l.performedByUserId === userId)?.performedByName || 'Unknown',
        attemptCount: count
      }));

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          filtersApplied: {
            repId: filters.repId
          }
        },
        kpis: {
          totalLocks,
          avgLockDurationSec: Math.round(avgDuration),
          avgLockDurationFormatted: formatDuration(avgDuration),
          totalEditAttempts,
          uniqueUsers: editAttempts.size
        },
        series: [],
        rows: {
          locks: lockRows.slice(0, 50),
          editAttempts: editAttemptRows
        },
        debug: req.query.debug === '1' ? {
          executionTimeMs: Date.now() - startTime
        } : undefined
      });
    } catch (error) {
      console.error('Lock usage error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

export default addLockUsageReport;
