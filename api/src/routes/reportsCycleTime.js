// api/src/routes/reportsCycleTime.js
import { Router } from 'express';
import { authGuard } from '../middleware/auth.js';
import { STAGES } from '../state.js';
import {
  parseReportFilters,
  buildWhereClause,
  calculateStats,
  formatDuration,
  bucketByWeek,
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
   * Cycle time analysis for completed items (not orders)
   * FIXED: Now tracks items through completion, not orders
   */
  router.get('/cycle-times', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const finalStage = STAGES[STAGES.length - 1];

      // Build where clause - use created date for operational reports by default
      if (!filters.dateMode || filters.dateMode === 'completed') {
        filters.dateMode = 'created'; // Default to created for cycle time analysis
      }
      
      // Get completed items (not orders)
      const items = await prisma.orderItem.findMany({
        where: {
          currentStage: finalStage,
          archivedAt: null
        },
        include: {
          order: {
            select: { 
              poNumber: true,
              orderDate: true,
              createdAt: true,
              account: { select: { name: true } },
              createdBy: { select: { name: true } }
            }
          },
          statusEvents: {
            where: { stage: finalStage },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      // Calculate cycle times
      const cycleData = items
        .filter(item => item.statusEvents.length > 0)
        .map(item => {
          const completedAt = item.statusEvents[0].createdAt;
          // Use order's orderDate if available, otherwise item's createdAt
          const startDate = item.order.orderDate || item.createdAt;
          const cycleTimeSec = calculateCycleTime(startDate, completedAt);
          const cycleTimeDays = Math.floor(cycleTimeSec / 86400);
          
          return {
            itemId: item.id,
            productCode: item.productCode,
            poNumber: item.order.poNumber,
            accountName: item.order.account?.name || 'Unknown',
            createdBy: item.order.createdBy?.name || 'Unknown',
            orderDate: item.order.orderDate,
            createdAt: item.createdAt,
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
          note: 'Cycle time calculated from orderDate (or item createdAt if not set) to item completion'
        },
        kpis: {
          completedItems: cycleData.length,
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
   * Average time spent in each stage - base endpoint
   */
  router.get('/stage-durations', authGuard, async (req, res) => {
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
   * GET /reports/stage-durations/leaderboard
   * Same as stage-durations but with /leaderboard path
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
      console.error('Stage durations leaderboard error:', error);
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
   * Items entering each stage per week
   * FIXED: Changed from statusEvent to orderItemStatusEvent
   * ADDED: Debug logging to see what's happening
   */
  router.get('/throughput', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      
      console.log('Throughput - filters:', JSON.stringify(filters, null, 2));
      
      // Get all status events in the date range
      const whereClause = {};
      if (filters.dateFrom || filters.dateTo) {
        whereClause.createdAt = {};
        if (filters.dateFrom) whereClause.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) whereClause.createdAt.lte = filters.dateTo;
      }

      console.log('Throughput - whereClause:', JSON.stringify(whereClause, null, 2));

      // FIXED: Use orderItemStatusEvent instead of statusEvent
      const statusEvents = await prisma.orderItemStatusEvent.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' }
      });

      console.log(`Throughput - Found ${statusEvents.length} status events`);
      if (statusEvents.length > 0) {
        console.log('Throughput - First event:', statusEvents[0]);
        console.log('Throughput - Last event:', statusEvents[statusEvents.length - 1]);
      }

      // Group by stage
      const stageTransitions = new Map();
      const weeklyTransitions = new Map();
      
      for (const event of statusEvents) {
        const stage = event.stage;
        const week = bucketByWeek(event.createdAt, filters.timezone);
        
        console.log(`Event: stage=${stage}, createdAt=${event.createdAt}, week=${week}`);
        
        // Count total by stage
        if (!stageTransitions.has(stage)) {
          stageTransitions.set(stage, 0);
        }
        stageTransitions.set(stage, stageTransitions.get(stage) + 1);
        
        // Count by week and stage
        if (!weeklyTransitions.has(week)) {
          weeklyTransitions.set(week, {});
        }
        if (!weeklyTransitions.get(week)[stage]) {
          weeklyTransitions.get(week)[stage] = 0;
        }
        weeklyTransitions.get(week)[stage]++;
      }

      console.log('Throughput - stageTransitions:', Array.from(stageTransitions.entries()));
      console.log('Throughput - weeklyTransitions:', Array.from(weeklyTransitions.entries()));

      // Calculate total transitions
      const totalTransitions = statusEvents.length;

      // Format stage summary
      const rows = STAGES.map(stage => ({
        stage,
        count: stageTransitions.get(stage) || 0,
        percentage: totalTransitions > 0 
          ? ((stageTransitions.get(stage) || 0) / totalTransitions * 100).toFixed(1)
          : '0.0'
      })).filter(row => row.count > 0);

      // Format weekly series
      const weeks = Array.from(weeklyTransitions.keys()).sort();
      const series = weeks.map(week => {
        const weekData = { week };
        for (const stage of STAGES) {
          weekData[stage] = weeklyTransitions.get(week)[stage] || 0;
        }
        return weekData;
      });

      console.log('Throughput - Returning:', { totalTransitions, rows: rows.length, series: series.length });

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          note: 'Shows items entering each stage per week'
        },
        kpis: {
          totalTransitions,
          weekCount: weeks.length,
          avgWeeklyTransitions: weeks.length > 0 
            ? Math.round(totalTransitions / weeks.length)
            : 0
        },
        rows,
        series
      });
    } catch (error) {
      console.error('Throughput error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/on-time
   * On-time delivery performance
   * CRITICAL FIX: Use orderDate for filtering, not createdAt
   */
  router.get('/on-time', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      
      // FORCE orderDate filtering for on-time delivery reports
      filters.dateMode = 'order';
      
      const whereClause = buildWhereClause(filters, 'order');

      console.log('On-time report - whereClause:', JSON.stringify(whereClause, null, 2));
      console.log('On-time report - dateMode:', filters.dateMode);

      // Get ALL orders with their items and ALL item status events
      const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
          account: { select: { name: true } },
          items: {
            include: {
              statusEvents: {
                orderBy: { createdAt: 'asc' }
              }
            }
          }
        }
      });

      console.log(`On-time report - Found ${orders.length} orders matching where clause`);

      let onTimeCount = 0;
      let lateCount = 0;
      let earlyCount = 0;
      let noDeliveryEvent = 0;
      let noEtaCount = 0;
      const orderDetails = [];
      const slippageDays = [];

      for (const order of orders) {
        // Count DELIVERED events across all items
        const totalStatusEvents = order.items.reduce((sum, item) => sum + item.statusEvents.length, 0);
        const deliveredEvents = order.items.flatMap(item => 
          item.statusEvents.filter(evt => evt.stage === 'DELIVERED')
        );
        
        console.log(`Order ${order.poNumber}: etaDate=${order.etaDate}, total status events=${totalStatusEvents}, DELIVERED events=${deliveredEvents.length}, items=${order.items.length}`);
        
        // Skip if no ETA date
        if (!order.etaDate) {
          noEtaCount++;
          continue;
        }

        // If no items have reached DELIVERED, skip this order
        if (deliveredEvents.length === 0) {
          console.log(`Order ${order.poNumber}: No DELIVERED events found`);
          noDeliveryEvent++;
          continue;
        }

        // Find earliest DELIVERED event
        const sortedDeliveryEvents = deliveredEvents.sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        );
        
        const deliveredAt = sortedDeliveryEvents[0].createdAt;
        const slippage = calculateSlippage(deliveredAt, order.etaDate);
        
        console.log(`Order ${order.poNumber}: deliveredAt=${deliveredAt}, slippage=${slippage} days`);
        
        let status = 'on-time';
        if (slippage > 0) {
          status = 'late';
          lateCount++;
          slippageDays.push(slippage);
        } else if (slippage < -7) {
          status = 'early';
          earlyCount++;
        } else {
          onTimeCount++;
        }
        
        orderDetails.push({
          orderId: order.id,
          poNumber: order.poNumber,
          accountName: order.account?.name || 'Unknown',
          etaDate: order.etaDate,
          deliveredAt: deliveredAt,
          currentStage: order.currentStage,
          slippageDays: slippage,
          status
        });
      }

      const totalOrders = onTimeCount + lateCount + earlyCount;
      const onTimePercent = totalOrders > 0 
        ? (onTimeCount / totalOrders) * 100 
        : 0;

      console.log(`On-time report results: total=${totalOrders}, onTime=${onTimeCount}, late=${lateCount}, early=${earlyCount}, noETA=${noEtaCount}, noDelivery=${noDeliveryEvent}`);

      // Calculate slippage statistics
      const slippageStats = calculateStats(slippageDays);

      // Sort by slippage (worst first)
      orderDetails.sort((a, b) => b.slippageDays - a.slippageDays);

      const paginated = paginateResults(orderDetails, filters.page, filters.pageSize);

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: 'order',
          note: 'Filtered by orderDate. Shows orders where items reached DELIVERED stage.'
        },
        kpis: {
          totalOrders: totalOrders,
          ordersWithoutETA: noEtaCount,
          ordersWithoutDeliveryEvent: noDeliveryEvent,
          onTimeCount,
          lateCount,
          earlyCount,
          onTimePercent: onTimePercent.toFixed(1),
          onTimeRate: onTimePercent.toFixed(1),
          onTimeRateFormatted: `${onTimePercent.toFixed(1)}%`,
          avgSlippageDays: slippageStats.mean ? slippageStats.mean.toFixed(1) : '0.0',
          medianSlippageDays: slippageStats.median ? slippageStats.median.toFixed(1) : '0.0'
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
   * FIXED: Use order.orderDate as fallback for items without status events
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
              orderDate: true,
              createdAt: true,
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
        .map(item => {
          // Use status event time if available, otherwise use order's orderDate, then item createdAt
          const enteredAt = item.statusEvents.length > 0 
            ? item.statusEvents[0].createdAt 
            : (item.order.orderDate || item.createdAt);
          
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
