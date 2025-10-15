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
 * 
 * FIXED: Now uses orderDate for sales reports instead of createdAt
 * Added sales-by-month endpoint here (moved from index.js)
 * FIXED: Sales by rep now uses sku field (which stores sales person name)
 * ADDED: /summary endpoint for main reports dashboard
 * FIXED: Removed archivedAt filter from Order queries (only OrderItems have this field)
 * FIXED: Dashboard now shows items by stage, not orders (orders don't progress through stages)
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
  // DASHBOARD SUMMARY
  // ========================================

  /**
   * GET /reports/summary
   * Dashboard summary for main reports page
   * Shows high-level KPIs and ITEM distribution (not order distribution)
   * FIXED: Now shows items by stage since orders don't progress through stages
   */
  router.get('/summary', authGuard, async (req, res) => {
    try {
      const isAdmin = req.user?.role === 'admin';
      
      // Get total active items (not in final stage)
      const finalStage = STAGES[STAGES.length - 1];
      const activeItemsCount = await prisma.orderItem.count({
        where: {
          currentStage: { not: finalStage },
          archivedAt: null
        }
      });

      // Get completed items count
      const completedItemsCount = await prisma.orderItem.count({
        where: {
          currentStage: finalStage,
          archivedAt: null
        }
      });

      // Get items by stage (not orders)
      const itemsByStage = await prisma.orderItem.groupBy({
        by: ['currentStage'],
        where: { archivedAt: null },
        _count: { id: true }
      });

      const stageData = STAGES.map(stage => ({
        stage: stage,
        count: itemsByStage.find(s => s.currentStage === stage)?._count.id || 0
      }));

      // Get total orders count for reference
      const totalOrdersCount = await prisma.order.count();

      // Calculate total revenue (admin only)
      let totalRevenue = 'N/A';
      let grandTotal = 0;
      if (isAdmin) {
        const items = await prisma.orderItem.findMany({
          where: { 
            itemPrice: { not: null },
            archivedAt: null
          },
          select: {
            itemPrice: true,
            qty: true
          }
        });

        for (const item of items) {
          const qty = typeof item.qty === 'number' && !isNaN(item.qty) ? item.qty : 1;
          const price = typeof item.itemPrice === 'number' && !isNaN(item.itemPrice) ? item.itemPrice : 0;
          grandTotal += qty * price;
        }
        totalRevenue = formatCurrency(grandTotal);
      }

      res.json({
        kpis: {
          activeItems: activeItemsCount,
          completedItems: completedItemsCount,
          totalOrders: totalOrdersCount,
          totalRevenue: totalRevenue,
          grandTotal: grandTotal,
          grandTotalFormatted: totalRevenue,
          itemsByStage: stageData
        },
        meta: {
          timestamp: new Date().toISOString(),
          userRole: req.user?.role,
          note: 'Item counts shown because items progress through stages, not orders'
        }
      });
    } catch (error) {
      console.error('Summary endpoint error:', error);
      res.status(500).json({ error: 'Failed to generate summary' });
    }
  });

  // ========================================
  // SALES & REVENUE REPORTS
  // ========================================

  /**
   * GET /reports/sales-by-month
   * Monthly sales breakdown based on orderDate
   * FIXED: Now uses orderDate correctly
   */
  router.get('/sales-by-month', adminGuard, async (req, res) => {
    try {
      const now = new Date();
      const monthParam = req.query.month ? parseInt(String(req.query.month), 10) : (now.getMonth() + 1); // 1-12
      const yearParam = req.query.year ? parseInt(String(req.query.year), 10) : now.getFullYear();

      if (isNaN(monthParam) || monthParam < 1 || monthParam > 12) {
        return res.status(400).json({ error: 'Invalid month. Use 1-12.' });
      }
      if (isNaN(yearParam) || yearParam < 1970 || yearParam > 9999) {
        return res.status(400).json({ error: 'Invalid year.' });
      }

      // Selected month range [inclusive, exclusive)
      const start = new Date(yearParam, monthParam - 1, 1);
      const end = new Date(yearParam, monthParam, 1);

      // Previous month range
      const prevMonth = monthParam === 1 ? 12 : (monthParam - 1);
      const prevYear = monthParam === 1 ? (yearParam - 1) : yearParam;
      const prevStart = new Date(prevYear, prevMonth - 1, 1);
      const prevEnd = new Date(prevYear, prevMonth, 1);

      // Fetch orders filtered by orderDate (NOT createdAt)
      const orders = await prisma.order.findMany({
        where: {
          orderDate: {
            gte: start,
            lt: end
          }
        },
        include: {
          account: { select: { name: true } },
          items: { select: { qty: true, itemPrice: true } }
        },
        orderBy: [{ orderDate: 'asc' }]
      });

      // Compute totals for current period
      const orderDetails = orders.map(o => {
        // Subtotal by summing qty * itemPrice when available; fallback to itemPrice if qty missing
        let subtotal = 0;
        let itemCount = 0;
        for (const it of (o.items || [])) {
          const qty = typeof it.qty === 'number' && !isNaN(it.qty) ? it.qty : 1;
          const price = typeof it.itemPrice === 'number' && !isNaN(it.itemPrice) ? it.itemPrice : 0;
          subtotal += qty * price;
          itemCount += qty;
        }
        return {
          id: o.id,
          poNumber: o.poNumber || null,
          customerName: o.account?.name || 'Unknown',
          salesPerson: o.sku || 'N/A',  // sku field stores sales person
          accountName: o.account?.name || null,
          orderDate: o.orderDate,
          itemCount,
          subtotal,
          totalFormatted: formatCurrency(subtotal),
          status: o.currentStage
        };
      });

      const periodSubtotal = orderDetails.reduce((s, d) => s + d.subtotal, 0);
      const periodOrderCount = orderDetails.length;
      const periodItemCount = orderDetails.reduce((s, d) => s + d.itemCount, 0);

      // Previous month totals for MoM comparison
      const prevOrders = await prisma.order.findMany({
        where: {
          orderDate: {
            gte: prevStart,
            lt: prevEnd
          }
        },
        include: { items: { select: { qty: true, itemPrice: true } } }
      });
      
      let prevSubtotal = 0;
      let prevOrderCount = prevOrders.length;
      for (const o of prevOrders) {
        for (const it of (o.items || [])) {
          const qty = typeof it.qty === 'number' && !isNaN(it.qty) ? it.qty : 1;
          const price = typeof it.itemPrice === 'number' && !isNaN(it.itemPrice) ? it.itemPrice : 0;
          prevSubtotal += qty * price;
        }
      }

      const deltaAbs = periodSubtotal - prevSubtotal;
      const deltaPct = prevSubtotal === 0 ? null : (deltaAbs / prevSubtotal);
      const ordersChange = periodOrderCount - prevOrderCount;
      const ordersChangePct = prevOrderCount === 0 ? null : (ordersChange / prevOrderCount);

      // Format average order value
      const averageOrderValue = periodOrderCount > 0 ? periodSubtotal / periodOrderCount : 0;

      res.json({
        month: monthParam,
        year: yearParam,
        range: { start: start.toISOString(), end: end.toISOString() },
        orders: orderDetails,
        kpis: {
          orderCount: periodOrderCount,
          itemCount: periodItemCount,
          grandTotal: periodSubtotal,
          grandTotalFormatted: formatCurrency(periodSubtotal),
          totalRevenue: formatCurrency(periodSubtotal),
          averageOrderValue: formatCurrency(averageOrderValue)
        },
        summary: {
          orderCount: periodOrderCount,
          itemCount: periodItemCount,
          subtotal: periodSubtotal,
          subtotalFormatted: formatCurrency(periodSubtotal)
        },
        comparison: {
          currentOrders: periodOrderCount,
          previousOrders: prevOrderCount,
          ordersChange: ordersChange,
          ordersChangePercent: ordersChangePct !== null ? (ordersChangePct * 100).toFixed(1) : 'N/A',
          currentRevenue: formatCurrency(periodSubtotal),
          previousRevenue: formatCurrency(prevSubtotal),
          revenueChange: deltaAbs,
          revenueChangeFormatted: formatCurrency(Math.abs(deltaAbs)),
          revenueChangePercent: deltaPct !== null ? (deltaPct * 100).toFixed(1) : 'N/A'
        },
        monthOverMonth: {
          prev: { month: prevMonth, year: prevYear, subtotal: prevSubtotal },
          deltaAbs,
          deltaPct,
          deltaAbsFormatted: formatCurrency(Math.abs(deltaAbs)),
          deltaPctFormatted: deltaPct !== null ? `${(deltaPct * 100).toFixed(1)}%` : 'N/A'
        },
        meta: {
          note: 'Sales data is based on orderDate (when order was placed)'
        }
      });
    } catch (e) {
      console.error('sales-by-month error:', e);
      res.status(500).json({ error: 'Failed to generate sales-by-month report' });
    }
  });

  /**
   * GET /reports/sales-by-rep
   * Sales broken down by sales representative
   * Returns total revenue per rep with optional monthly breakdown
   * FIXED: Now uses sku field (which stores sales person name) instead of createdBy
   */
  router.get('/sales-by-rep', adminGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      // Force date_mode to 'order' for sales reports
      filters.dateMode = 'order';
      const { monthly = 'false' } = req.query;
      const includeMonthly = monthly === 'true';
      const startTime = Date.now();

      // Build where clause for orders
      const whereOrder = buildWhereClause(filters, 'order');

      // Fetch orders with items (using sku field for sales person)
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
          account: {
            select: {
              name: true
            }
          }
        }
      });

      // Aggregate by rep (using sku field)
      const repTotals = new Map();
      const repMonthly = new Map(); // rep -> month -> total
      let grandTotal = 0;

      for (const order of orders) {
        // Use sku field as the sales person name
        const repName = order.sku || 'Unassigned';
        const repId = repName.toLowerCase().replace(/\s+/g, '_'); // Create a consistent ID from the name

        for (const item of order.items) {
          if (item.itemPrice) {
            const amount = item.itemPrice;
            grandTotal += amount;

            // Add to rep total
            if (!repTotals.has(repId)) {
              repTotals.set(repId, { 
                repId, 
                repName, 
                total: 0,
                orderCount: 0,
                customers: new Set()
              });
            }
            const repData = repTotals.get(repId);
            repData.total += amount;
            repData.orderCount += 1;
            if (order.account?.name) {
              repData.customers.add(order.account.name);
            }

            // Monthly breakdown - FIXED to use orderDate
            if (includeMonthly) {
              const month = bucketByMonth(order.orderDate || order.createdAt, filters.timezone);
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
        .map(rep => ({
          ...rep,
          customerCount: rep.customers.size,
          customers: undefined // Remove the Set from the response
        }))
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
          date_mode: 'order', // Always use orderDate for sales reports
          filtersApplied: {
            accountId: filters.accountId,
            stages: filters.stages,
            productCodes: filters.productCodes
          },
          timezone: filters.timezone,
          note: 'Sales data is based on orderDate (when order was placed) and grouped by sales person (sku field)'
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
          totalFormatted: formatCurrency(r.total),
          avgOrderValue: r.orderCount > 0 ? r.total / r.orderCount : 0,
          avgOrderValueFormatted: r.orderCount > 0 ? formatCurrency(r.total / r.orderCount) : '$0.00'
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
   * GET /reports/sales-by-item
   * Top N products by revenue
   * FIXED: Now uses orderDate for filtering
   */
  router.get('/sales-by-item', adminGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      // Force date_mode to 'order' for sales reports
      filters.dateMode = 'order';
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
          date_mode: 'order', // Always use orderDate for sales reports
          topN: limit,
          filtersApplied: {
            accountId: filters.accountId,
            stages: filters.stages
          },
          note: 'Sales data is based on orderDate (when order was placed)'
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
