// api/src/routes/reports.js
import { Router } from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { STAGES, STAGE_INDEX } from '../state.js';
import { parseReportFilters, buildWhereClause, calculateStats, formatDuration, formatCurrency, bucketByMonth, bucketByWeek, calculateCycleTime, hasBackwardMovement, calculateStageDurations, isOnTime, calculateSlippage, paginateResults } from '../utils/reportHelpers.js';
import { getStageThreshold, assessRiskLevel } from '../config/stageThresholds.js';

export function createReportsRouter(prisma) {
  const router = Router();

  // Helper to apply role-based filtering to order queries
  function buildRoleBasedOrderWhere(user, additionalWhere = {}) {
    const where = { ...additionalWhere };
    if (user.role === 'AGENT') {
      where.sku = user.name; // Filter by sales person matching agent's name
    }
    return where;
  }

  // Summary report - ROLE-FILTERED
  router.get('/summary', authGuard, async (req, res) => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const finalStage = STAGES[STAGES.length - 1];
      
      // Apply role-based filtering
      const orderWhere = buildRoleBasedOrderWhere(req.user, {});
      const orderIds = await prisma.order.findMany({ where: orderWhere, select: { id: true } });
      const orderIdList = orderIds.map(o => o.id);
      
      const activeItemsCount = await prisma.orderItem.count({
        where: { currentStage: { not: finalStage }, archivedAt: null, orderId: { in: orderIdList } }
      });
      const completedItemsCount = await prisma.orderItem.count({
        where: { currentStage: finalStage, archivedAt: null, orderId: { in: orderIdList } }
      });
      const itemsByStage = await prisma.orderItem.groupBy({
        by: ['currentStage'],
        where: { archivedAt: null, orderId: { in: orderIdList } },
        _count: { id: true }
      });
      const stageData = STAGES.map(stage => ({ stage: stage, count: itemsByStage.find(s => s.currentStage === stage)?._count.id || 0 }));
      const totalOrdersCount = orderIdList.length;
      
      let totalRevenue = 'N/A';
      let grandTotal = 0;
      if (isAdmin || req.user?.role === 'AGENT') {
        const items = await prisma.orderItem.findMany({
          where: { itemPrice: { not: null }, archivedAt: null, orderId: { in: orderIdList } },
          select: { itemPrice: true, qty: true }
        });
        for (const item of items) {
          const qty = typeof item.qty === 'number' && !isNaN(item.qty) ? item.qty : 1;
          const price = typeof item.itemPrice === 'number' && !isNaN(item.itemPrice) ? item.itemPrice : 0;
          grandTotal += qty * price;
        }
        totalRevenue = formatCurrency(grandTotal);
      }
      
      res.json({
        kpis: { activeItems: activeItemsCount, completedItems: completedItemsCount, totalOrders: totalOrdersCount, itemsByStage: stageData, activeOrders: activeItemsCount, completedOrders: completedItemsCount, ordersByStage: stageData, totalRevenue: totalRevenue, grandTotal: grandTotal, grandTotalFormatted: totalRevenue },
        meta: { timestamp: new Date().toISOString(), userRole: req.user?.role, note: 'Counts shown are for items (which progress through stages), not orders. Legacy field names maintained for compatibility.' }
      });
    } catch (error) {
      console.error('Summary endpoint error:', error);
      res.status(500).json({ error: 'Failed to generate summary' });
    }
  });

  // Sales by month - ROLE-FILTERED
  router.get('/sales-by-month', authGuard, async (req, res) => {
    try {
      const now = new Date();
      const monthParam = req.query.month ? parseInt(String(req.query.month), 10) : (now.getMonth() + 1);
      const yearParam = req.query.year ? parseInt(String(req.query.year), 10) : now.getFullYear();
      if (isNaN(monthParam) || monthParam < 1 || monthParam > 12) return res.status(400).json({ error: 'Invalid month. Use 1-12.' });
      if (isNaN(yearParam) || yearParam < 1970 || yearParam > 9999) return res.status(400).json({ error: 'Invalid year.' });
      const start = new Date(yearParam, monthParam - 1, 1);
      const end = new Date(yearParam, monthParam, 1);
      const prevMonth = monthParam === 1 ? 12 : (monthParam - 1);
      const prevYear = monthParam === 1 ? (yearParam - 1) : yearParam;
      const prevStart = new Date(prevYear, prevMonth - 1, 1);
      const prevEnd = new Date(prevYear, prevMonth, 1);
      
      // Apply role-based filtering
      const orders = await prisma.order.findMany({
        where: buildRoleBasedOrderWhere(req.user, { orderDate: { gte: start, lt: end } }),
        include: { account: { select: { name: true } }, items: { select: { qty: true, itemPrice: true } } },
        orderBy: [{ orderDate: 'asc' }]
      });
      const orderDetails = orders.map(o => {
        let subtotal = 0;
        let itemCount = 0;
        for (const it of (o.items || [])) {
          const qty = typeof it.qty === 'number' && !isNaN(it.qty) ? it.qty : 1;
          const price = typeof it.itemPrice === 'number' && !isNaN(it.itemPrice) ? it.itemPrice : 0;
          subtotal += qty * price;
          itemCount += qty;
        }
        return { id: o.id, poNumber: o.poNumber || null, customerName: o.account?.name || 'Unknown', salesPerson: o.sku || 'N/A', accountName: o.account?.name || null, orderDate: o.orderDate, itemCount, subtotal, totalFormatted: formatCurrency(subtotal), status: o.currentStage };
      });
      const periodSubtotal = orderDetails.reduce((s, d) => s + d.subtotal, 0);
      const periodOrderCount = orderDetails.length;
      const periodItemCount = orderDetails.reduce((s, d) => s + d.itemCount, 0);
      
      // Apply role-based filtering to previous period
      const prevOrders = await prisma.order.findMany({
        where: buildRoleBasedOrderWhere(req.user, { orderDate: { gte: prevStart, lt: prevEnd } }),
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
      const averageOrderValue = periodOrderCount > 0 ? periodSubtotal / periodOrderCount : 0;
      res.json({
        month: monthParam, year: yearParam, range: { start: start.toISOString(), end: end.toISOString() }, orders: orderDetails,
        kpis: { orderCount: periodOrderCount, itemCount: periodItemCount, grandTotal: periodSubtotal, grandTotalFormatted: formatCurrency(periodSubtotal), totalRevenue: formatCurrency(periodSubtotal), averageOrderValue: formatCurrency(averageOrderValue) },
        summary: { orderCount: periodOrderCount, itemCount: periodItemCount, subtotal: periodSubtotal, subtotalFormatted: formatCurrency(periodSubtotal) },
        comparison: { currentOrders: periodOrderCount, previousOrders: prevOrderCount, ordersChange: ordersChange, ordersChangePercent: ordersChangePct !== null ? (ordersChangePct * 100).toFixed(1) : 'N/A', currentRevenue: formatCurrency(periodSubtotal), previousRevenue: formatCurrency(prevSubtotal), revenueChange: deltaAbs, revenueChangeFormatted: formatCurrency(Math.abs(deltaAbs)), revenueChangePercent: deltaPct !== null ? (deltaPct * 100).toFixed(1) : 'N/A' },
        monthOverMonth: { prev: { month: prevMonth, year: prevYear, subtotal: prevSubtotal }, deltaAbs, deltaPct, deltaAbsFormatted: formatCurrency(Math.abs(deltaAbs)), deltaPctFormatted: deltaPct !== null ? `${(deltaPct * 100).toFixed(1)}%` : 'N/A' },
        meta: { note: 'Sales data is based on orderDate (when order was placed)', userRole: req.user?.role }
      });
    } catch (e) {
      console.error('sales-by-month error:', e);
      res.status(500).json({ error: 'Failed to generate sales-by-month report' });
    }
  });

  // Sales by rep - ROLE-FILTERED
  router.get('/sales-by-rep', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      filters.dateMode = 'order';
      const { monthly = 'false', activeOnly = 'false' } = req.query;
      const includeMonthly = monthly === 'true';
      const filterActiveOnly = activeOnly === 'true';
      const startTime = Date.now();

      // If activeOnly, look up active user names to filter results
      let activeRepNames = null;
      if (filterActiveOnly) {
        const activeUsers = await prisma.user.findMany({
          where: { isActive: true, role: { in: ['AGENT', 'ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'] } },
          select: { name: true }
        });
        activeRepNames = new Set(activeUsers.map(u => u.name));
      }
      
      // Apply role-based filtering
      const whereOrder = buildRoleBasedOrderWhere(req.user, buildWhereClause(filters, 'order'));
      
      const orders = await prisma.order.findMany({ where: whereOrder, include: { items: { where: { itemPrice: { not: null }, ...(filters.productCodes.length > 0 ? { productCode: { in: filters.productCodes } } : {}) }, select: { itemPrice: true, productCode: true } }, account: { select: { name: true } } } });
      const repTotals = new Map();
      const repMonthly = new Map();
      let grandTotal = 0;
      for (const order of orders) {
        const repName = order.sku || 'Unassigned';

        // Skip inactive reps if filter is on
        if (activeRepNames && repName !== 'Unassigned' && !activeRepNames.has(repName)) {
          continue;
        }

        const repId = repName.toLowerCase().replace(/\s+/g, '_');
        for (const item of order.items) {
          if (item.itemPrice) {
            const amount = item.itemPrice;
            grandTotal += amount;
            if (!repTotals.has(repId)) repTotals.set(repId, { repId, repName, total: 0, orderCount: 0, customers: new Set() });
            const repData = repTotals.get(repId);
            repData.total += amount;
            repData.orderCount += 1;
            if (order.account?.name) repData.customers.add(order.account.name);
            if (includeMonthly) {
              const month = bucketByMonth(order.orderDate || order.createdAt, filters.timezone);
              if (!repMonthly.has(repId)) repMonthly.set(repId, new Map());
              if (!repMonthly.get(repId).has(month)) repMonthly.get(repId).set(month, 0);
              repMonthly.get(repId).set(month, repMonthly.get(repId).get(month) + amount);
            }
          }
        }
      }
      const rows = Array.from(repTotals.values()).map(rep => ({ ...rep, customerCount: rep.customers.size, customers: undefined })).sort((a, b) => b.total - a.total);
      let monthlySeries = null;
      if (includeMonthly) {
        const allMonths = new Set();
        repMonthly.forEach(months => { months.forEach((_, month) => allMonths.add(month)); });
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
        meta: { date_from: filters.dateFrom, date_to: filters.dateTo, date_mode: 'order', filtersApplied: { accountId: filters.accountId, stages: filters.stages, productCodes: filters.productCodes, activeOnly: filterActiveOnly }, timezone: filters.timezone, note: 'Sales data is based on orderDate (when order was placed) and grouped by sales person (sku field)', userRole: req.user?.role },
        kpis: { grandTotal, grandTotalFormatted: formatCurrency(grandTotal), repCount: rows.length, orderCount: orders.length },
        series: monthlySeries,
        rows: rows.map(r => ({ ...r, totalFormatted: formatCurrency(r.total), avgOrderValue: r.orderCount > 0 ? r.total / r.orderCount : 0, avgOrderValueFormatted: r.orderCount > 0 ? formatCurrency(r.total / r.orderCount) : '$0.00' })),
        debug: req.query.debug === '1' ? { executionTimeMs: Date.now() - startTime, ordersProcessed: orders.length } : undefined
      };
      res.json(response);
    } catch (error) {
      console.error('Sales by rep error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sales by item - ROLE-FILTERED
  router.get('/sales-by-item', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      filters.dateMode = 'order';
      const { topN = 10 } = req.query;
      const limit = parseInt(topN, 10);
      const startTime = Date.now();
      
      // Apply role-based filtering
      const whereOrder = buildRoleBasedOrderWhere(req.user, buildWhereClause(filters, 'order'));
      
      const orders = await prisma.order.findMany({ where: whereOrder, include: { items: { where: { itemPrice: { not: null }, ...(filters.productCodes.length > 0 ? { productCode: { in: filters.productCodes } } : {}) }, select: { productCode: true, itemPrice: true, modelNumber: true, voltage: true, laserWattage: true } } } });
      const productTotals = new Map();
      let grandTotal = 0;
      for (const order of orders) {
        for (const item of order.items) {
          if (item.itemPrice) {
            const key = item.productCode;
            grandTotal += item.itemPrice;
            if (!productTotals.has(key)) productTotals.set(key, { productCode: key, total: 0, count: 0, avgPrice: 0 });
            const product = productTotals.get(key);
            product.total += item.itemPrice;
            product.count += 1;
            product.avgPrice = product.total / product.count;
          }
        }
      }
      const sorted = Array.from(productTotals.values()).sort((a, b) => b.total - a.total);
      const topItems = sorted.slice(0, limit);
      const otherItems = sorted.slice(limit);
      const otherTotal = otherItems.reduce((sum, item) => sum + item.total, 0);
      const rows = topItems.map(item => ({ ...item, totalFormatted: formatCurrency(item.total), avgPriceFormatted: formatCurrency(item.avgPrice), percentOfTotal: ((item.total / grandTotal) * 100).toFixed(1) }));
      if (otherTotal > 0) rows.push({ productCode: 'OTHER', total: otherTotal, count: otherItems.reduce((sum, item) => sum + item.count, 0), avgPrice: otherTotal / otherItems.length, totalFormatted: formatCurrency(otherTotal), avgPriceFormatted: formatCurrency(otherTotal / otherItems.length), percentOfTotal: ((otherTotal / grandTotal) * 100).toFixed(1) });
      res.json({ meta: { date_from: filters.dateFrom, date_to: filters.dateTo, date_mode: 'order', topN: limit, filtersApplied: { accountId: filters.accountId, stages: filters.stages }, note: 'Sales data is based on orderDate (when order was placed)', userRole: req.user?.role }, kpis: { grandTotal, grandTotalFormatted: formatCurrency(grandTotal), uniqueProducts: productTotals.size }, series: rows.slice(0, -1), rows, debug: req.query.debug === '1' ? { executionTimeMs: Date.now() - startTime } : undefined });
    } catch (error) {
      console.error('Sales by item error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Orders at Value Risk (OVaR) - ROLE-FILTERED
  router.get('/ovar', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const startTime = Date.now();
      const now = new Date();
      const finalStage = STAGES[STAGES.length - 1];
      const baseWhere = { currentStage: { not: finalStage }, ...(filters.accountId ? { accountId: filters.accountId } : {}), ...(filters.repId ? { createdByUserId: filters.repId } : {}), ...(filters.stages.length > 0 ? { currentStage: { in: filters.stages } } : {}) };
      
      // Apply role-based filtering
      const whereOrder = buildRoleBasedOrderWhere(req.user, baseWhere);
      
      const orders = await prisma.order.findMany({ where: whereOrder, include: { items: { where: { itemPrice: { not: null } }, select: { itemPrice: true, currentStage: true } }, account: { select: { name: true } }, statusEvents: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      let lateTotal = 0, criticalTotal = 0, warningTotal = 0;
      const lateOrders = [], criticalOrders = [], warningOrders = [];
      for (const order of orders) {
        const orderValue = order.items.reduce((sum, item) => sum + (item.itemPrice || 0), 0);
        if (orderValue === 0) continue;
        const currentStage = order.currentStage;
        const isLate = order.etaDate && now > new Date(order.etaDate);
        const lastEvent = order.statusEvents[0];
        const timeInStage = lastEvent ? (now - new Date(lastEvent.createdAt)) / 1000 : 0;
        const riskLevel = assessRiskLevel(currentStage, timeInStage);
        if (isLate) {
          lateTotal += orderValue;
          lateOrders.push({ orderId: order.id, accountName: order.account.name, poNumber: order.poNumber, value: orderValue, valueFormatted: formatCurrency(orderValue), etaDate: order.etaDate, daysLate: Math.floor((now - new Date(order.etaDate)) / (1000 * 60 * 60 * 24)), currentStage: order.currentStage, timeInStageDays: Math.floor(timeInStage / 86400) });
        } else if (riskLevel === 'critical') {
          criticalTotal += orderValue;
          criticalOrders.push({ orderId: order.id, accountName: order.account.name, poNumber: order.poNumber, value: orderValue, valueFormatted: formatCurrency(orderValue), currentStage: order.currentStage, timeInStageDays: Math.floor(timeInStage / 86400), lastUpdate: lastEvent?.createdAt, riskLevel: 'critical' });
        } else if (riskLevel === 'warning') {
          warningTotal += orderValue;
          warningOrders.push({ orderId: order.id, accountName: order.account.name, poNumber: order.poNumber, value: orderValue, valueFormatted: formatCurrency(orderValue), currentStage: order.currentStage, timeInStageDays: Math.floor(timeInStage / 86400), lastUpdate: lastEvent?.createdAt, riskLevel: 'warning' });
        }
      }
      lateOrders.sort((a, b) => b.value - a.value);
      criticalOrders.sort((a, b) => b.value - a.value);
      warningOrders.sort((a, b) => b.value - a.value);
      const totalAtRisk = lateTotal + criticalTotal + warningTotal;
      res.json({ meta: { note: 'Thresholds based on SMT manufacturing timeline document', filtersApplied: { accountId: filters.accountId, repId: filters.repId, stages: filters.stages }, userRole: req.user?.role }, kpis: { totalAtRisk, totalAtRiskFormatted: formatCurrency(totalAtRisk), lateTotal, lateTotalFormatted: formatCurrency(lateTotal), lateCount: lateOrders.length, criticalTotal, criticalTotalFormatted: formatCurrency(criticalTotal), criticalCount: criticalOrders.length, warningTotal, warningTotalFormatted: formatCurrency(warningTotal), warningCount: warningOrders.length }, series: [{ category: 'Late (Past ETA)', value: lateTotal, count: lateOrders.length, severity: 'high' }, { category: 'Critical Aging', value: criticalTotal, count: criticalOrders.length, severity: 'high' }, { category: 'Warning Aging', value: warningTotal, count: warningOrders.length, severity: 'medium' }], rows: { late: lateOrders.slice(0, 20), critical: criticalOrders.slice(0, 20), warning: warningOrders.slice(0, 20) }, debug: req.query.debug === '1' ? { executionTimeMs: Date.now() - startTime } : undefined });
    } catch (error) {
      console.error('OVaR error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createReportsRouter;
