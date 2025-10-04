// api/src/routes/reports.js
/**
 * REPORTING SUITE FOR ORDER TRACKER
 * 
 * Comprehensive analytics and reporting endpoints covering:
 * - Sales & Revenue metrics
 * - Cycle Time & Flow analysis
 * - On-time delivery tracking
 * - Operational friction points
 * 
 * All endpoints require authentication; financial endpoints require admin role.
 */

import { Router } from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { STAGES, STAGE_INDEX } from '../state.js';
import {
  parseReportFilters,
  buildWhereClause,
  calculateStats,
  formatDuration,
  formatCurrency,
  bucketByMonth,
  bucketByWeek,
  calculateCycleTime,
  hasBackwardMovement,
  calculateStageDurations,
  isOnTime,
  calculateSlippage,
  paginateResults
} from '../utils/reportHelpers.js';
import { getStageThreshold, assessRiskLevel } from '../config/stageThresholds.js';

export function createReportsRouter(prisma) {
  const router = Router();

  // ========================================
  // SALES & REVENUE REPORTS
  // ========================================

  /**
   * GET /reports/sales-by-rep
   * Sales broken down by sales representative
   * Returns total revenue per rep with optional monthly breakdown
   */
  router.get('/sales-by-rep', adminGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const { monthly = 'false' } = req.query;
      const includeMonthly = monthly === 'true';
      const startTime = Date.now();

      // Build where clause for orders
      const whereOrder = buildWhereClause(filters, 'order');

      // Fetch orders with items and creator info
      const orders = await prisma.order.findMany({
        where: whereOrder,
        include: {
          items: {
            where: {
              itemPrice: { not: null },
              ...(filters.productCodes.length > 0 ? { productCode: { in: filters.productCodes } } : {})
            },
            select: {
              itemPrice: true,
              productCode: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Aggregate by rep
      const repTotals = new Map();
      const repMonthly = new Map(); // rep -> month -> total
      let grandTotal = 0;

      for (const order of orders) {
        const rep = order.createdBy;
        const repId = rep?.id || 'unknown';
        const repName = rep?.name || 'Unknown';

        for (const item of order.items) {
          if (item.itemPrice) {
            const amount = item.itemPrice;
            grandTotal += amount;

            // Add to rep total
            if (!repTotals.has(repId)) {
              repTotals.set(repId, { repId, repName, total: 0, email: rep?.email });
            }
            repTotals.get(repId).total += amount;

            // Monthly breakdown
            if (includeMonthly) {
              const month = bucketByMonth(order.createdAt, filters.timezone);
              if (!repMonthly.has(repId)) {
                repMonthly.set(repId, new Map());
              }
              if (!repMonthly.get(repId).has(month)) {
                repMonthly.get(repId).set(month, 0);
              }
              repMonthly.get(repId).set(month, repMonthly.get(repId).get(month) + amount);
            }
          }
        }
      }

      // Convert to arrays and sort
      const rows = Array.from(repTotals.values())
        .sort((a, b) => b.total - a.total);

      // Build monthly series if requested
      let monthlySeries = null;
      if (includeMonthly) {
        const allMonths = new Set();
        repMonthly.forEach(months => {
          months.forEach((_, month) => allMonths.add(month));
        });
        
        monthlySeries = Array.from(allMonths).sort().map(month => {
          const data = { month };
          rows.forEach(rep => {
            const monthData = repMonthly.get(rep.repId);
            data[rep.repName] = monthData?.get(month) || 0;
          });
          return data;
        });
      }

      const response = {
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: filters.dateMode,
          filtersApplied: {
            accountId: filters.accountId,
            stages: filters.stages,
            productCodes: filters.productCodes
          },
          timezone: filters.timezone
        },
        kpis: {
          grandTotal,
          grandTotalFormatted: formatCurrency(grandTotal),
          repCount: rows.length,
          orderCount: orders.length
        },
        series: monthlySeries,
        rows: rows.map(r => ({
          ...r,
          totalFormatted: formatCurrency(r.total)
        })),
        debug: req.query.debug === '1' ? {
          executionTimeMs: Date.now() - startTime,
          ordersProcessed: orders.length
        } : undefined
      };

      res.json(response);
    } catch (error) {
      console.error('Sales by rep error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/sales-by-month
   * Monthly sales breakdown with MoM change
   */
  router.get('/sales-by-month', adminGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const startTime = Date.now();

      const whereOrder = buildWhereClause(filters, 'order');

      const orders = await prisma.order.findMany({
        where: whereOrder,
        include: {
          items: {
            where: {
              itemPrice: { not: null },
              ...(filters.productCodes.length > 0 ? { productCode: { in: filters.productCodes } } : {})
            },
            select: {
              itemPrice: true
            }
          }
        }
      });

      // Bucket by month
      const monthlyTotals = new Map();
      let grandTotal = 0;

      for (const order of orders) {
        const month = bucketByMonth(order.createdAt, filters.timezone);
        
        for (const item of order.items) {
          if (item.itemPrice) {
            grandTotal += item.itemPrice;
            monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + item.itemPrice);
          }
        }
      }

      // Convert to sorted array
      const series = Array.from(monthlyTotals.entries())
        .map(([month, total]) => ({ month, total, totalFormatted: formatCurrency(total) }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Calculate MoM changes
      series.forEach((item, index) => {
        if (index > 0) {
          const prev = series[index - 1];
          const change = item.total - prev.total;
          const changePercent = prev.total > 0 ? (change / prev.total) * 100 : 0;
          item.mom = {
            change,
            changeFormatted: formatCurrency(Math.abs(change)),
            changePercent: changePercent.toFixed(1),
            direction: change >= 0 ? 'up' : 'down'
          };
        }
      });

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: filters.dateMode,
          filtersApplied: {
            accountId: filters.accountId,
            stages: filters.stages,
            productCodes: filters.productCodes
          },
          timezone: filters.timezone
        },
        kpis: {
          grandTotal,
          grandTotalFormatted: formatCurrency(grandTotal),
          monthCount: series.length
        },
        series,
        debug: req.query.debug === '1' ? {
          executionTimeMs: Date.now() - startTime
        } : undefined
      });
    } catch (error) {
      console.error('Sales by month error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/sales-by-item
   * Top N products by revenue
   */
  router.get('/sales-by-item', adminGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const { topN = 10 } = req.query;
      const limit = parseInt(topN, 10);
      const startTime = Date.now();

      const whereOrder = buildWhereClause(filters, 'order');

      const orders = await prisma.order.findMany({
        where: whereOrder,
        include: {
          items: {
            where: {
              itemPrice: { not: null },
              ...(filters.productCodes.length > 0 ? { productCode: { in: filters.productCodes } } : {})
            },
            select: {
              productCode: true,
              itemPrice: true,
              modelNumber: true,
              voltage: true,
              laserWattage: true
            }
          }
        }
      });

      // Aggregate by product code
      const productTotals = new Map();
      let grandTotal = 0;

      for (const order of orders) {
        for (const item of order.items) {
          if (item.itemPrice) {
            const key = item.productCode;
            grandTotal += item.itemPrice;

            if (!productTotals.has(key)) {
              productTotals.set(key, {
                productCode: key,
                total: 0,
                count: 0,
                avgPrice: 0
              });
            }

            const product = productTotals.get(key);
            product.total += item.itemPrice;
            product.count += 1;
            product.avgPrice = product.total / product.count;
          }
        }
      }

      // Sort and take top N
      const sorted = Array.from(productTotals.values())
        .sort((a, b) => b.total - a.total);

      const topItems = sorted.slice(0, limit);
      const otherItems = sorted.slice(limit);
      const otherTotal = otherItems.reduce((sum, item) => sum + item.total, 0);

      const rows = topItems.map(item => ({
        ...item,
        totalFormatted: formatCurrency(item.total),
        avgPriceFormatted: formatCurrency(item.avgPrice),
        percentOfTotal: ((item.total / grandTotal) * 100).toFixed(1)
      }));

      if (otherTotal > 0) {
        rows.push({
          productCode: 'OTHER',
          total: otherTotal,
          count: otherItems.reduce((sum, item) => sum + item.count, 0),
          avgPrice: otherTotal / otherItems.length,
          totalFormatted: formatCurrency(otherTotal),
          avgPriceFormatted: formatCurrency(otherTotal / otherItems.length),
          percentOfTotal: ((otherTotal / grandTotal) * 100).toFixed(1)
        });
      }

      res.json({
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          date_mode: filters.dateMode,
          topN: limit,
          filtersApplied: {
            accountId: filters.accountId,
            stages: filters.stages
          }
        },
        kpis: {
          grandTotal,
          grandTotalFormatted: formatCurrency(grandTotal),
          uniqueProducts: productTotals.size
        },
        series: rows.slice(0, -1), // Exclude "OTHER" from series
        rows,
        debug: req.query.debug === '1' ? {
          executionTimeMs: Date.now() - startTime
        } : undefined
      });
    } catch (error) {
      console.error('Sales by item error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /reports/ovar
   * Order Value at Risk - money tied up in late or aging orders
   * Uses stage-specific thresholds based on SMT's documented manufacturing timeline
   */
  router.get('/ovar', adminGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const startTime = Date.now();
      const now = new Date();

      // Find all non-completed orders
      const finalStage = STAGES[STAGES.length - 1];
      
      const orders = await prisma.order.findMany({
        where: {
          currentStage: { not: finalStage },
          ...(filters.accountId ? { accountId: filters.accountId } : {}),
          ...(filters.repId ? { createdByUserId: filters.repId } : {}),
          ...(filters.stages.length > 0 ? { currentStage: { in: filters.stages } } : {})
        },
        include: {
          items: {
            where: {
              itemPrice: { not: null }
            },
            select: {
              itemPrice: true,
              currentStage: true
            }
          },
          account: {
            select: {
              name: true
            }
          },
          statusEvents: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      let lateTotal = 0;
      let criticalTotal = 0;
      let warningTotal = 0;
      const lateOrders = [];
      const criticalOrders = [];
      const warningOrders = [];

      for (const order of orders) {
        const orderValue = order.items.reduce((sum, item) => sum + (item.itemPrice || 0), 0);
        if (orderValue === 0) continue;

        const currentStage = order.currentStage;
        
        // Check if late (past ETA)
        const isLate = order.etaDate && now > new Date(order.etaDate);
        
        // Check aging based on stage-specific thresholds
        const lastEvent = order.statusEvents[0];
        const timeInStage = lastEvent ? (now - new Date(lastEvent.createdAt)) / 1000 : 0;
        const riskLevel = assessRiskLevel(currentStage, timeInStage);

        if (isLate) {
          lateTotal += orderValue;
          lateOrders.push({
            orderId: order.id,
            accountName: order.account.name,
            poNumber: order.poNumber,
            value: orderValue,
            valueFormatted: formatCurrency(orderValue),
            etaDate: order.etaDate,
            daysLate: Math.floor((now - new Date(order.etaDate)) / (1000 * 60 * 60 * 24)),
            currentStage: order.currentStage,
            timeInStageDays: Math.floor(timeInStage / 86400)
          });
        } else if (riskLevel === 'critical') {
          criticalTotal += orderValue;
          criticalOrders.push({
            orderId: order.id,
            accountName: order.account.name,
            poNumber: order.poNumber,
            value: orderValue,
            valueFormatted: formatCurrency(orderValue),
            currentStage: order.currentStage,
            timeInStageDays: Math.floor(timeInStage / 86400),
            lastUpdate: lastEvent?.createdAt,
            riskLevel: 'critical'
          });
        } else if (riskLevel === 'warning') {
          warningTotal += orderValue;
          warningOrders.push({
            orderId: order.id,
            accountName: order.account.name,
            poNumber: order.poNumber,
            value: orderValue,
            valueFormatted: formatCurrency(orderValue),
            currentStage: order.currentStage,
            timeInStageDays: Math.floor(timeInStage / 86400),
            lastUpdate: lastEvent?.createdAt,
            riskLevel: 'warning'
          });
        }
      }

      // Sort by value
      lateOrders.sort((a, b) => b.value - a.value);
      criticalOrders.sort((a, b) => b.value - a.value);
      warningOrders.sort((a, b) => b.value - a.value);

      const totalAtRisk = lateTotal + criticalTotal + warningTotal;

      res.json({
        meta: {
          note: 'Thresholds based on SMT manufacturing timeline document',
          filtersApplied: {
            accountId: filters.accountId,
            repId: filters.repId,
            stages: filters.stages
          }
        },
        kpis: {
          totalAtRisk,
          totalAtRiskFormatted: formatCurrency(totalAtRisk),
          lateTotal,
          lateTotalFormatted: formatCurrency(lateTotal),
          lateCount: lateOrders.length,
          criticalTotal,
          criticalTotalFormatted: formatCurrency(criticalTotal),
          criticalCount: criticalOrders.length,
          warningTotal,
          warningTotalFormatted: formatCurrency(warningTotal),
          warningCount: warningOrders.length
        },
        series: [
          { category: 'Late (Past ETA)', value: lateTotal, count: lateOrders.length, severity: 'high' },
          { category: 'Critical Aging', value: criticalTotal, count: criticalOrders.length, severity: 'high' },
          { category: 'Warning Aging', value: warningTotal, count: warningOrders.length, severity: 'medium' }
        ],
        rows: {
          late: lateOrders.slice(0, 20),
          critical: criticalOrders.slice(0, 20),
          warning: warningOrders.slice(0, 20)
        },
        debug: req.query.debug === '1' ? {
          executionTimeMs: Date.now() - startTime
        } : undefined
      });
    } catch (error) {
      console.error('OVaR error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createReportsRouter;
