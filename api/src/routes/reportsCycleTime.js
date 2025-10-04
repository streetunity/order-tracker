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

export function createCycleTimeReportsRouter(prisma) {
  const router = Router();

  /**
   * GET /reports/cycle-times
   * Cycle time analysis for completed orders
   */
  router.get('/cycle-times', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const finalStage = STAGES[STAGES.length - 1];

      // Get all completed orders
      const orders = await prisma.order.findMany({
        where: {
          currentStage: finalStage,
          ...buildWhereClause(filters, 'order')
        },
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
          const cycleTimeSec = calculateCycleTime(o.createdAt, completedAt);
          const cycleTimeDays = Math.floor(cycleTimeSec / 86400);
          
          return {
            orderId: o.id,
            poNumber: o.poNumber,
            accountName: o.account?.name || 'Unknown',
            createdBy: o.createdBy?.name || 'Unknown',
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
          date_mode: filters.dateMode
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
   * GET /reports/stage-durations
   * Average time spent in each stage
   */
  router.get('/stage-durations', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      
      // Get all items with their status events
      const items = await prisma.orderItem.findMany({
        where: buildWhereClause(filters, 'item'),
        include: {
          order: {
            where: buildWhereClause(filters, 'order'),
            select: { createdAt: true, currentStage: true }
          },
          statusEvents: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      // Calculate stage durations for each item
      const stageDurations = new Map();
      for (const stage of STAGES) {
        stageDurations.set(stage, []);
      }

      for (const item of items) {
        const durations = calculateStageDurations(item.statusEvents);
        for (const d of durations) {
          stageDurations.get(d.stage)?.push(d.durationSec);
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
          p90Formatted: formatDuration(stats.p90)
        };
      });

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo
        },
        series,
        rows: series
      });
    } catch (error) {
      console.error('Stage durations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/first-pass-yield
   * Percentage of orders/items that moved forward without rework
   */
  router.get('/first-pass-yield', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      
      const items = await prisma.orderItem.findMany({
        where: buildWhereClause(filters, 'item'),
        include: {
          order: {
            where: buildWhereClause(filters, 'order'),
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
          date_to: filters.dateTo
        },
        kpis: {
          totalItems,
          itemsWithRework,
          firstPassYield: firstPassYield.toFixed(1),
          reworkRate: ((itemsWithRework / totalItems) * 100).toFixed(1)
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

      const orders = await prisma.order.findMany({
        where: {
          currentStage: finalStage,
          ...buildWhereClause(filters, 'order')
        },
        include: {
          statusEvents: {
            where: { stage: finalStage },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      // Group by completion month
      const monthlyThroughput = new Map();
      
      for (const order of orders) {
        if (order.statusEvents.length > 0) {
          const completedDate = order.statusEvents[0].createdAt;
          const month = completedDate.toISOString().substring(0, 7); // YYYY-MM
          
          if (!monthlyThroughput.has(month)) {
            monthlyThroughput.set(month, { month, ordersCompleted: 0 });
          }
          monthlyThroughput.get(month).ordersCompleted++;
        }
      }

      const series = Array.from(monthlyThroughput.values())
        .sort((a, b) => a.month.localeCompare(b.month));

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo
        },
        kpis: {
          totalCompleted: orders.filter(o => o.statusEvents.length > 0).length,
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

      const orders = await prisma.order.findMany({
        where: {
          currentStage: finalStage,
          etaDate: { not: null },
          ...buildWhereClause(filters, 'order')
        },
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
          date_to: filters.dateTo
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
   * Identify bottlenecks in the process
   */
  router.get('/chokepoints', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const { lookbackDays = 90 } = req.query;
      const lookback = parseInt(lookbackDays, 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookback);

      // Get orders still in progress
      const orders = await prisma.order.findMany({
        where: {
          currentStage: { not: STAGES[STAGES.length - 1] },
          createdAt: { gte: cutoffDate },
          ...buildWhereClause(filters, 'order')
        },
        include: {
          statusEvents: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // Group by current stage and calculate time in stage
      const stageData = new Map();
      for (const stage of STAGES) {
        stageData.set(stage, { stage, count: 0, totalDays: 0, orders: [] });
      }

      const now = new Date();
      for (const order of orders) {
        const stage = order.currentStage;
        const lastEvent = order.statusEvents[0];
        const timeInStage = lastEvent 
          ? (now - new Date(lastEvent.createdAt)) / (1000 * 60 * 60 * 24)
          : (now - new Date(order.createdAt)) / (1000 * 60 * 60 * 24);

        const data = stageData.get(stage);
        if (data) {
          data.count++;
          data.totalDays += timeInStage;
          data.orders.push({
            orderId: order.id,
            poNumber: order.poNumber,
            daysInStage: Math.floor(timeInStage)
          });
        }
      }

      // Calculate average and identify chokepoints
      const series = Array.from(stageData.values())
        .filter(d => d.count > 0)
        .map(d => ({
          stage: d.stage,
          ordersInStage: d.count,
          avgDaysInStage: (d.totalDays / d.count).toFixed(1),
          topOrders: d.orders
            .sort((a, b) => b.daysInStage - a.daysInStage)
            .slice(0, 5)
        }))
        .sort((a, b) => b.ordersInStage - a.ordersInStage);

      res.json({
        meta: {
          lookbackDays: lookback
        },
        kpis: {
          ordersInProgress: orders.length,
          worstStage: series[0]?.stage || 'N/A',
          worstStageCount: series[0]?.ordersInStage || 0
        },
        series,
        rows: series
      });
    } catch (error) {
      console.error('Chokepoints error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createCycleTimeReportsRouter;
