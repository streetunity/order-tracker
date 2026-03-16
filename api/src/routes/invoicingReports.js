/**
 * Invoicing Reports Routes
 * Sales pipeline, win/loss, AR aging, sales summary, revenue projections
 */

import express from 'express';
import { invoicingAuth } from '../middleware/invoicingAuth.js';

export function createInvoicingReportsRouter(prisma) {
  const router = express.Router();

  // ============================================
  // SALES PIPELINE
  // ============================================

  router.get('/pipeline', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate, assignedTo } = req.query;

      const where = { isDeleted: false };

      if (startDate || endDate) {
        where.estimateDate = {};
        if (startDate) where.estimateDate.gte = new Date(startDate);
        if (endDate)   where.estimateDate.lte = new Date(endDate);
      }
      if (assignedTo) where.createdById = assignedTo;

      const estimates = await prisma.estimate.findMany({
        where,
        select: { id: true, status: true, total: true, estimateDate: true, expiryDate: true, customerId: true }
      });

      const stages = {
        DRAFT: { count: 0, value: 0 },
        SENT:  { count: 0, value: 0 },
        VIEWED: { count: 0, value: 0 },
        ACCEPTED: { count: 0, value: 0 },
        DECLINED: { count: 0, value: 0 },
        EXPIRED: { count: 0, value: 0 },
        CONVERTED: { count: 0, value: 0 }
      };

      estimates.forEach(est => {
        if (stages[est.status]) {
          stages[est.status].count++;
          stages[est.status].value += est.total || 0;
        }
      });

      const totalCount  = estimates.length;
      const totalValue  = estimates.reduce((s, e) => s + (e.total || 0), 0);
      const avgValue    = totalCount > 0 ? totalValue / totalCount : 0;

      // Shape for frontend: array of { status, count, totalValue }
      const pipeline = Object.entries(stages).map(([status, data]) => ({
        status,
        count:      data.count,
        totalValue: data.value
      }));

      res.json({
        pipeline,
        summary: {
          totalCount,
          totalValue,
          avgValue
        }
      });
    } catch (error) {
      console.error('GET /reports/pipeline error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WIN/LOSS ANALYSIS
  // ============================================

  router.get('/win-loss', invoicingAuth, async (req, res) => {
    try {
      // Use status as proxy for won/lost since outcome fields don't exist in schema
      const { startDate, endDate } = req.query;

      const where = {
        isDeleted: false,
        status: { in: ['ACCEPTED', 'DECLINED', 'CONVERTED', 'EXPIRED'] }
      };

      if (startDate || endDate) {
        where.updatedAt = {};
        if (startDate) where.updatedAt.gte = new Date(startDate);
        if (endDate)   where.updatedAt.lte = new Date(endDate);
      }

      const estimates = await prisma.estimate.findMany({
        where,
        select: {
          id: true,
          estimateNumber: true,
          status: true,
          total: true,
          updatedAt: true,
          customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
          createdBy: { select: { id: true, name: true } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      const won  = estimates.filter(e => ['ACCEPTED', 'CONVERTED'].includes(e.status));
      const lost = estimates.filter(e => ['DECLINED', 'EXPIRED'].includes(e.status));

      const lossReasonCounts = {};
      lost.forEach(e => {
        const reason = e.status === 'EXPIRED' ? 'Expired' : 'Declined';
        lossReasonCounts[reason] = (lossReasonCounts[reason] || 0) + 1;
      });

      const lossReasons = Object.entries(lossReasonCounts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

      res.json({
        summary: {
          totalWon:       won.length,
          totalLost:      lost.length,
          totalWonValue:  won.reduce((s, e) => s + (e.total || 0), 0),
          winRate:        estimates.length > 0 ? (won.length / estimates.length * 100) : 0
        },
        lossReasons
      });
    } catch (error) {
      console.error('GET /reports/win-loss error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // TIME TO CLOSE
  // ============================================

  router.get('/time-to-close', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const where = {
        isDeleted: false,
        status: 'CONVERTED'
      };

      if (startDate || endDate) {
        where.updatedAt = {};
        if (startDate) where.updatedAt.gte = new Date(startDate);
        if (endDate)   where.updatedAt.lte = new Date(endDate);
      }

      const estimates = await prisma.estimate.findMany({
        where,
        select: {
          id: true,
          estimateDate: true,
          updatedAt: true,
          total: true,
          createdBy: { select: { id: true, name: true } }
        }
      });

      const closeTimes = estimates.map(e => {
        const created   = new Date(e.estimateDate);
        const converted = new Date(e.updatedAt);
        const days = Math.round((converted - created) / (1000 * 60 * 60 * 24));
        return { days: Math.max(0, days), total: e.total, salesRep: e.createdBy?.name };
      });

      const avgDays = closeTimes.length > 0
        ? closeTimes.reduce((s, t) => s + t.days, 0) / closeTimes.length
        : 0;

      const byMonthMap = {};
      estimates.forEach(e => {
        const d = new Date(e.updatedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonthMap[key]) byMonthMap[key] = { count: 0, totalDays: 0 };
        const days = Math.max(0, Math.round((d - new Date(e.estimateDate)) / (1000 * 60 * 60 * 24)));
        byMonthMap[key].count++;
        byMonthMap[key].totalDays += days;
      });

      const byMonth = Object.entries(byMonthMap)
        .map(([month, data]) => ({ month, count: data.count, avgDays: data.count > 0 ? data.totalDays / data.count : 0 }))
        .sort((a, b) => a.month.localeCompare(b.month));

      res.json({
        overall: {
          avgDays,
          minDays: closeTimes.length > 0 ? Math.min(...closeTimes.map(t => t.days)) : 0,
          maxDays: closeTimes.length > 0 ? Math.max(...closeTimes.map(t => t.days)) : 0,
          count:   closeTimes.length
        },
        byMonth
      });
    } catch (error) {
      console.error('GET /reports/time-to-close error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ACCOUNTS RECEIVABLE AGING
  // ============================================

  router.get('/ar-aging', invoicingAuth, async (req, res) => {
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          isDeleted: false,
          status: { in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] },
          balanceDue: { gt: 0 }
        },
        include: {
          customer: {
            select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true, email: true }
          }
        },
        orderBy: { dueDate: 'asc' }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const buckets = { current: 0, over30: 0, over60: 0, over90: 0 };
      const invoiceList = [];

      invoices.forEach(inv => {
        if (!inv.dueDate) return;
        const dueDate = new Date(inv.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

        if (daysOverdue <= 0)       buckets.current += inv.balanceDue;
        else if (daysOverdue <= 30) buckets.over30  += inv.balanceDue;
        else if (daysOverdue <= 60) buckets.over60  += inv.balanceDue;
        else                        buckets.over90  += inv.balanceDue;

        invoiceList.push({
          id:            inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName:  inv.customer?.companyName || `${inv.customer?.firstName || ''} ${inv.customer?.lastName || ''}`.trim(),
          dueDate:       inv.dueDate,
          balanceDue:    inv.balanceDue,
          daysOverdue:   Math.max(0, daysOverdue),
          ageBucket:     daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? 'over30' : daysOverdue <= 60 ? 'over60' : 'over90'
        });
      });

      const totalOutstanding = invoices.reduce((s, i) => s + i.balanceDue, 0);

      res.json({
        summary: { totalOutstanding },
        buckets,
        invoices: invoiceList.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 30)
      });
    } catch (error) {
      console.error('GET /reports/ar-aging error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // SALES SUMMARY
  // ============================================

  router.get('/sales-summary', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate, groupBy = 'month' } = req.query;

      const endDateObj   = endDate   ? new Date(endDate)   : new Date();
      const startDateObj = startDate ? new Date(startDate) : new Date(endDateObj.getFullYear(), endDateObj.getMonth() - 11, 1);

      const invoices = await prisma.invoice.findMany({
        where: {
          isDeleted: false,
          status: 'PAID',
          invoiceDate: { gte: startDateObj, lte: endDateObj }
        },
        select: {
          id: true, invoiceDate: true, total: true, amountPaid: true,
          createdBy: { select: { id: true, name: true } }
        }
      });

      const byPeriod = {};
      const byRep    = {};

      invoices.forEach(inv => {
        const date = new Date(inv.invoiceDate);
        const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!byPeriod[periodKey]) byPeriod[periodKey] = { count: 0, revenue: 0 };
        byPeriod[periodKey].count++;
        byPeriod[periodKey].revenue += inv.amountPaid || inv.total || 0;

        const repName = inv.createdBy?.name || 'Unassigned';
        if (!byRep[repName]) byRep[repName] = { count: 0, revenue: 0 };
        byRep[repName].count++;
        byRep[repName].revenue += inv.amountPaid || inv.total || 0;
      });

      const totalRevenue = invoices.reduce((s, i) => s + (i.amountPaid || i.total || 0), 0);

      res.json({
        summary: {
          totalRevenue,
          paidCount:  invoices.length,
          avgInvoice: invoices.length > 0 ? totalRevenue / invoices.length : 0
        },
        byPeriod: Object.entries(byPeriod).map(([period, d]) => ({ period, ...d })).sort((a, b) => a.period.localeCompare(b.period)),
        byRep:    Object.entries(byRep).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue)
      });
    } catch (error) {
      console.error('GET /reports/sales-summary error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // REVENUE PROJECTIONS
  // ============================================

  router.get('/revenue-projections', invoicingAuth, async (req, res) => {
    try {
      // Fetch open estimates (DRAFT, SENT, VIEWED — not yet closed)
      const estimates = await prisma.estimate.findMany({
        where: {
          isDeleted: false,
          status: { in: ['DRAFT', 'SENT', 'VIEWED'] }
        },
        select: {
          id: true,
          estimateNumber: true,
          status: true,
          total: true,
          estimateDate: true,
          expiryDate: true,
          customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
          createdBy: { select: { id: true, name: true } }
        },
        orderBy: { estimateDate: 'desc' }
      });

      // Probability weights per status
      const weights = { DRAFT: 0.2, SENT: 0.4, VIEWED: 0.65 };

      let totalPipeline   = 0;
      let weightedTotal   = 0;

      // Build byStatus map
      const statusMap = { DRAFT: { count: 0, totalValue: 0, weightedValue: 0 }, SENT: { count: 0, totalValue: 0, weightedValue: 0 }, VIEWED: { count: 0, totalValue: 0, weightedValue: 0 } };

      estimates.forEach(est => {
        const w          = weights[est.status] || 0.2;
        const val        = est.total || 0;
        const weighted   = val * w;
        totalPipeline   += val;
        weightedTotal   += weighted;

        if (statusMap[est.status]) {
          statusMap[est.status].count++;
          statusMap[est.status].totalValue  += val;
          statusMap[est.status].weightedValue += weighted;
        }
      });

      // Convert to array shape the frontend expects: [{status, count, totalValue, probability, weightedValue}]
      const byStatus = Object.entries(statusMap).map(([status, data]) => ({
        status,
        count:        data.count,
        totalValue:   data.totalValue,
        probability:  weights[status] || 0.2,   // 0–1 float; frontend does fmtP(s.probability*100)
        weightedValue: data.weightedValue
      }));

      res.json({
        summary: {
          totalPipeline,
          weightedTotal,
          estimateCount: estimates.length
        },
        byStatus
      });
    } catch (error) {
      console.error('GET /reports/revenue-projections error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CSV EXPORT
  // ============================================

  router.get('/export/:type', invoicingAuth, async (req, res) => {
    try {
      const { type } = req.params;
      const { startDate, endDate } = req.query;

      let data = [], filename = '', headers = [];

      switch (type) {
        case 'ar-aging': {
          const invoices = await prisma.invoice.findMany({
            where: { isDeleted: false, status: { in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] }, balanceDue: { gt: 0 } },
            include: { customer: true },
            orderBy: { dueDate: 'asc' }
          });
          const today = new Date();
          headers = ['Invoice #', 'Customer', 'Due Date', 'Amount Due', 'Days Overdue', 'Status'];
          data = invoices.map(inv => {
            const daysOverdue = Math.max(0, Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24)));
            return [inv.invoiceNumber, inv.customer.companyName || `${inv.customer.firstName} ${inv.customer.lastName}`, new Date(inv.dueDate).toLocaleDateString(), inv.balanceDue.toFixed(2), daysOverdue, inv.status];
          });
          filename = `ar-aging-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }
        case 'pipeline': {
          const where = { isDeleted: false };
          if (startDate) where.estimateDate = { gte: new Date(startDate) };
          if (endDate)   where.estimateDate = { ...where.estimateDate, lte: new Date(endDate) };
          const estimates = await prisma.estimate.findMany({ where, include: { customer: true, createdBy: true }, orderBy: { estimateDate: 'desc' } });
          headers = ['Estimate #', 'Customer', 'Date', 'Status', 'Total', 'Sales Rep'];
          data = estimates.map(est => [est.estimateNumber, est.customer?.companyName || `${est.customer?.firstName} ${est.customer?.lastName}`, new Date(est.estimateDate).toLocaleDateString(), est.status, est.total.toFixed(2), est.createdBy?.name || '']);
          filename = `pipeline-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }
        case 'sales-summary': {
          const where = { isDeleted: false, status: 'PAID' };
          if (startDate) where.invoiceDate = { gte: new Date(startDate) };
          if (endDate)   where.invoiceDate = { ...where.invoiceDate, lte: new Date(endDate) };
          const invoices = await prisma.invoice.findMany({ where, include: { customer: true, createdBy: true }, orderBy: { invoiceDate: 'desc' } });
          headers = ['Invoice #', 'Customer', 'Date', 'Total', 'Amount Paid', 'Sales Rep'];
          data = invoices.map(inv => [inv.invoiceNumber, inv.customer?.companyName || `${inv.customer?.firstName} ${inv.customer?.lastName}`, new Date(inv.invoiceDate).toLocaleDateString(), inv.total.toFixed(2), (inv.amountPaid || 0).toFixed(2), inv.createdBy?.name || '']);
          filename = `sales-summary-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }
        default:
          return res.status(400).json({ error: 'Invalid report type' });
      }

      const csv = [headers.join(','), ...data.map(row => row.map(cell => typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('GET /reports/export/:type error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createInvoicingReportsRouter;
