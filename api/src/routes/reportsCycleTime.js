// api/src/routes/reportsCycleTime.js
import { Router } from 'express';
import { authGuard } from '../middleware/auth.js';
import { STAGES } from '../state.js';
import {
  parseReportFilters,
  buildWhereClause,
  calculateStats,
  formatDuration,
  calculateCycleTime,
  hasBackwardMovement,
  calculateStageDurations,
  isOnTime,
  calculateSlippage,
  paginateResults
} from '../utils/reportHelpers.js';
import { getStageThreshold, assessRiskLevel, getThresholdDays } from '../config/stageThresholds.js';

export function createCycleTimeReportsRouter(prisma) {
  const router = Router();

  /**
   * GET /reports/cycle-times
   * Cycle time analysis for completed orders
   * FIXED: Now properly supports filtering by order date or created date
   */
  router.get('/cycle-times', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const finalStage = STAGES[STAGES.length - 1];

      // Build where clause - use created date for operational reports by default
      if (!filters.dateMode || filters.dateMode === 'completed') {
        filters.dateMode = 'created'; // Default to created for cycle time analysis
      }
      
      const whereClause = buildWhereClause(filters, 'order');
      whereClause.currentStage = finalStage; // Only completed orders

      // Get all completed orders
      const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
          account: { select: { name: true } },
          createdBy: { select: { name: true } },
          statusEvents: {
            where: { stage: finalStage },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      // Calculate cycle times
      const cycleData = orders
        .filter(o => o.statusEvents.length > 0)
        .map(o => {
          const completedAt = o.statusEvents[0].createdAt;
          // Use orderDate if available for cycle time calculation
          const startDate = o.orderDate || o.createdAt;
          const cycleTimeSec = calculateCycleTime(startDate, completedAt);
          const cycleTimeDays = Math.floor(cycleTimeSec / 86400);
          
          return {
            orderId: o.id,
            poNumber: o.poNumber,
            accountName: o.account?.name || 'Unknown',
            createdBy: o.createdBy?.name || 'Unknown',
            orderDate: o.orderDate,
            createdAt: o.createdAt,
            completedAt: completedAt,
            cycleTimeSec,
            cycleTimeDays,
            cycleTimeFormatted: formatDuration(cycleTimeSec)
          };
        })
        .sort((a, b) => b.completedAt - a.completedAt);

      const cycleTimes = cycleData.map(d => d.cycleTimeSec);
      const stats = calculateStats(cycleTimes);

      const paginated = paginateResults(cycleData, filters.page, filters.pageSize);

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: filters.dateMode,
          note: 'Cycle time calculated from orderDate (or createdAt if not set) to completion'
        },
        kpis: {
          completedOrders: cycleData.length,
          medianCycleTime: stats.median,
          medianCycleTimeDays: Math.floor((stats.median || 0) / 86400),
          medianFormatted: formatDuration(stats.median),
          p90CycleTime: stats.p90,
          p90CycleTimeDays: Math.floor((stats.p90 || 0) / 86400),
          p90Formatted: formatDuration(stats.p90),
          minCycleTimeDays: Math.floor((stats.min || 0) / 86400),
          maxCycleTimeDays: Math.floor((stats.max || 0) / 86400)
        },
        rows: paginated
      });
    } catch (error) {
      console.error('Cycle times error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/stage-durations/leaderboard
   * Average time spent in each stage with leaderboard
   */
  router.get('/stage-durations/leaderboard', authGuard, async (req, res) => {
    try {
      const { lookbackDays = 90 } = req.query;
      const lookback = parseInt(lookbackDays, 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookback);
      
      // Get all items with their status events in the lookback period
      const items = await prisma.orderItem.findMany({
        where: {
          createdAt: { gte: cutoffDate }
        },
        include: {
          order: {
            select: { 
              poNumber: true, 
              account: { select: { name: true } },
              createdAt: true
            }
          },
          statusEvents: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      // Calculate stage durations for each item
      const stageDurations = new Map();
      const slowestItems = [];
      
      for (const stage of STAGES) {
        stageDurations.set(stage, []);
      }

      for (const item of items) {
        const durations = calculateStageDurations(item.statusEvents);
        for (const d of durations) {
          stageDurations.get(d.stage)?.push(d.durationSec);
          
          // Track slowest items
          slowestItems.push({
            productCode: item.productCode,
            poNumber: item.order.poNumber,
            accountName: item.order.account?.name || 'Unknown',
            stage: d.stage,
            durationSec: d.durationSec,
            durationFormatted: formatDuration(d.durationSec)
          });
        }
      }

      // Calculate stats for each stage
      const series = STAGES.map(stage => {
        const times = stageDurations.get(stage) || [];
        const stats = calculateStats(times);
        
        return {
          stage,
          count: times.length,
          medianDuration: stats.median,
          medianDays: Math.floor((stats.median || 0) / 86400),
          medianFormatted: formatDuration(stats.median),
          p90Duration: stats.p90,
          p90Days: Math.floor((stats.p90 || 0) / 86400),
          p90Formatted: formatDuration(stats.p90),
          maxDuration: stats.max,
          maxFormatted: formatDuration(stats.max)
        };
      }).filter(s => s.count > 0);

      // Sort slowest items
      slowestItems.sort((a, b) => b.durationSec - a.durationSec);

      res.json({
        meta: {
          lookbackDays: lookback
        },
        kpis: {
          itemsAnalyzed: items.length,
          stagesTracked: series.length
        },
        series,
        rows: {
          slowest: slowestItems.slice(0, 20)
        }
      });
    } catch (error) {
      console.error('Stage durations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/first-pass-yield
   * Percentage of orders/items that moved forward without rework
   * FIXED: Now properly filters by date mode
   */
  router.get('/first-pass-yield', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      
      // Build where clause for items and orders
      const orderWhere = buildWhereClause(filters, 'order');
      const itemWhere = {};
      
      // Add date filtering for items if needed
      if (filters.dateFrom || filters.dateTo) {
        itemWhere.createdAt = {};
        if (filters.dateFrom) itemWhere.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) itemWhere.createdAt.lte = filters.dateTo;
      }
      
      // Add product code filter if specified
      if (filters.productCodes.length > 0) {
        itemWhere.productCode = { in: filters.productCodes };
      }
      
      // Add archived filter
      if (!filters.includeArchived) {
        itemWhere.archivedAt = null;
      }
      
      const items = await prisma.orderItem.findMany({
        where: itemWhere,
        include: {
          order: {
            where: orderWhere,
            select: { poNumber: true, account: { select: { name: true } } }
          },
          statusEvents: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      let totalItems = 0;
      let itemsWithRework = 0;
      const reworkDetails = [];

      for (const item of items) {
        // Skip items without matching orders (due to where clause filtering)
        if (!item.order) continue;
        
        if (item.statusEvents.length > 0) {
          totalItems++;
          const hadBackwardMovement = hasBackwardMovement(item.statusEvents);
          
          if (hadBackwardMovement) {
            itemsWithRework++;
            reworkDetails.push({
              itemId: item.id,
              productCode: item.productCode,
              poNumber: item.order.poNumber,
              accountName: item.order.account?.name || 'Unknown',
              events: item.statusEvents.map(e => ({
                stage: e.stage,
                createdAt: e.createdAt
              }))
            });
          }
        }
      }

      const firstPassYield = totalItems > 0 
        ? ((totalItems - itemsWithRework) / totalItems) * 100 
        : 0;

      const paginated = paginateResults(reworkDetails, filters.page, filters.pageSize);

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: filters.dateMode
        },
        kpis: {
          totalItems,
          itemsWithRework,
          firstPassYield: firstPassYield.toFixed(1),
          reworkRate: totalItems > 0 ? ((itemsWithRework / totalItems) * 100).toFixed(1) : '0.0'
        },
        rows: paginated
      });
    } catch (error) {
      console.error('First pass yield error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/throughput
   * Orders/items completed per time period
   */
  router.get('/throughput', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const finalStage = STAGES[STAGES.length - 1];

      // For throughput, we filter by completion date, not created date
      // So we need custom filtering
      const baseWhere = {
        currentStage: finalStage
      };
      
      // Add account and rep filters if specified
      if (filters.accountId) baseWhere.accountId = filters.accountId;
      if (filters.repId) baseWhere.createdByUserId = filters.repId;

      const orders = await prisma.order.findMany({
        where: baseWhere,
        include: {
          statusEvents: {
            where: { stage: finalStage },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      // Filter by completion date if date filters are specified
      let filteredOrders = orders.filter(o => o.statusEvents.length > 0);
      
      if (filters.dateFrom || filters.dateTo) {
        filteredOrders = filteredOrders.filter(order => {
          const completedDate = order.statusEvents[0].createdAt;
          if (filters.dateFrom && completedDate < filters.dateFrom) return false;
          if (filters.dateTo && completedDate > filters.dateTo) return false;
          return true;
        });
      }

      // Group by completion month
      const monthlyThroughput = new Map();
      
      for (const order of filteredOrders) {
        const completedDate = order.statusEvents[0].createdAt;
        const month = completedDate.toISOString().substring(0, 7); // YYYY-MM
        
        if (!monthlyThroughput.has(month)) {
          monthlyThroughput.set(month, { month, ordersCompleted: 0 });
        }
        monthlyThroughput.get(month).ordersCompleted++;
      }

      const series = Array.from(monthlyThroughput.values())
        .sort((a, b) => a.month.localeCompare(b.month));

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          note: 'Throughput is based on completion date'
        },
        kpis: {
          totalCompleted: filteredOrders.length,
          avgMonthlyThroughput: series.length > 0 
            ? (series.reduce((sum, s) => sum + s.ordersCompleted, 0) / series.length).toFixed(1)
            : 0
        },
        series,
        rows: series
      });
    } catch (error) {
      console.error('Throughput error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/on-time
   * On-time delivery performance
   */
  router.get('/on-time', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const finalStage = STAGES[STAGES.length - 1];

      const whereClause = buildWhereClause(filters, 'order');
      whereClause.currentStage = finalStage;
      whereClause.etaDate = { not: null };

      const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
          account: { select: { name: true } },
          statusEvents: {
            where: { stage: finalStage },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      let onTimeCount = 0;
      let lateCount = 0;
      const lateOrders = [];

      for (const order of orders) {
        if (order.statusEvents.length > 0) {
          const completedAt = order.statusEvents[0].createdAt;
          const onTime = isOnTime(completedAt, order.etaDate);
          
          if (onTime) {
            onTimeCount++;
          } else {
            lateCount++;
            const slippage = calculateSlippage(completedAt, order.etaDate);
            lateOrders.push({
              orderId: order.id,
              poNumber: order.poNumber,
              accountName: order.account?.name || 'Unknown',
              etaDate: order.etaDate,
              completedAt,
              slippageDays: slippage
            });
          }
        }
      }

      const totalWithETA = onTimeCount + lateCount;
      const onTimePercent = totalWithETA > 0 
        ? (onTimeCount / totalWithETA) * 100 
        : 0;

      const paginated = paginateResults(
        lateOrders.sort((a, b) => b.slippageDays - a.slippageDays),
        filters.page,
        filters.pageSize
      );

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: filters.dateMode
        },
        kpis: {
          totalWithETA,
          onTimeCount,
          lateCount,
          onTimePercent: onTimePercent.toFixed(1)
        },
        rows: paginated
      });
    } catch (error) {
      console.error('On-time error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/chokepoints
   * Identify bottlenecks for a specific stage with risk assessment based on SMT timeline
   */
  router.get('/chokepoints', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const { targetStage = 'MANUFACTURING' } = req.query;

      // Get items currently in the target stage
      const items = await prisma.orderItem.findMany({
        where: {
          currentStage: targetStage,
          archivedAt: null
        },
        include: {
          order: {
            select: { 
              poNumber: true, 
              account: { select: { name: true } }
            }
          },
          statusEvents: {
            where: { stage: targetStage },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      const now = new Date();
      const thresholds = getThresholdDays(targetStage);
      
      // Categorize items by risk level
      let normalCount = 0;
      let warningCount = 0;
      let criticalCount = 0;
      
      const itemsWithTime = items
        .filter(item => item.statusEvents.length > 0)
        .map(item => {
          const enteredAt = item.statusEvents[0].createdAt;
          const timeInStageSec = (now - new Date(enteredAt)) / 1000;
          const timeInStageDays = (timeInStageSec / 86400).toFixed(1);
          const riskLevel = assessRiskLevel(targetStage, timeInStageSec);
          
          // Count by risk level
          if (riskLevel === 'critical') criticalCount++;
          else if (riskLevel === 'warning') warningCount++;
          else normalCount++;
          
          return {
            itemId: item.id,
            productCode: item.productCode,
            poNumber: item.order.poNumber,
            accountName: item.order.account?.name || 'Unknown',
            enteredAt,
            timeInStageSec,
            timeInStageDays,
            riskLevel
          };
        })
        .sort((a, b) => b.timeInStageSec - a.timeInStageSec);

      const times = itemsWithTime.map(i => i.timeInStageSec);
      const stats = calculateStats(times);

      const paginated = paginateResults(itemsWithTime, filters.page, filters.pageSize);

      res.json({
        meta: {
          targetStage,
          thresholds: {
            warningDays: thresholds.warning,
            criticalDays: thresholds.critical,
            note: 'Based on SMT manufacturing timeline document'
          }
        },
        kpis: {
          itemsInStage: itemsWithTime.length,
          normalCount,
          warningCount,
          criticalCount,
          medianTimeSec: stats.median,
          medianTimeDays: Math.floor((stats.median || 0) / 86400),
          medianFormatted: formatDuration(stats.median),
          p90TimeSec: stats.p90,
          p90TimeDays: Math.floor((stats.p90 || 0) / 86400),
          p90Formatted: formatDuration(stats.p90),
          maxTimeSec: stats.max,
          maxFormatted: formatDuration(stats.max)
        },
        rows: paginated
      });
    } catch (error) {
      console.error('Chokepoints error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createCycleTimeReportsRouter;
