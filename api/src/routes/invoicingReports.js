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

  // GET /pipeline - Sales pipeline by estimate status with values
  router.get('/pipeline', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate, assignedTo } = req.query;

      const where = {
        isDeleted: false
      };

      if (startDate || endDate) {
        where.estimateDate = {};
        if (startDate) where.estimateDate.gte = new Date(startDate);
        if (endDate) where.estimateDate.lte = new Date(endDate);
      }

      if (assignedTo) {
        where.createdById = assignedTo;
      }

      // Get estimates grouped by status
      const estimates = await prisma.estimate.findMany({
        where,
        select: {
          id: true,
          status: true,
          total: true,
          estimateDate: true,
          expiryDate: true,
          customerId: true
        }
      });

      // Calculate pipeline stages
      const stages = {
        DRAFT: { count: 0, value: 0, estimates: [] },
        PENDING_APPROVAL: { count: 0, value: 0, estimates: [] },
        SENT: { count: 0, value: 0, estimates: [] },
        VIEWED: { count: 0, value: 0, estimates: [] },
        ACCEPTED: { count: 0, value: 0, estimates: [] },
        DECLINED: { count: 0, value: 0, estimates: [] },
        EXPIRED: { count: 0, value: 0, estimates: [] },
        CONVERTED: { count: 0, value: 0, estimates: [] }
      };

      estimates.forEach(est => {
        if (stages[est.status]) {
          stages[est.status].count++;
          stages[est.status].value += est.total || 0;
        }
      });

      // Calculate totals
      const totalEstimates = estimates.length;
      const totalValue = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
      const activeValue = ['SENT', 'VIEWED'].reduce((sum, s) => sum + stages[s].value, 0);
      const wonValue = ['ACCEPTED', 'CONVERTED'].reduce((sum, s) => sum + stages[s].value, 0);
      const lostValue = stages['DECLINED'].value;

      res.json({
        stages,
        summary: {
          totalEstimates,
          totalValue,
          activeValue,
          wonValue,
          lostValue,
          conversionRate: totalEstimates > 0
            ? ((stages.ACCEPTED.count + stages.CONVERTED.count) / totalEstimates * 100).toFixed(1)
            : 0
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

  // GET /win-loss - Win/loss analysis with reasons
  router.get('/win-loss', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate, assignedTo } = req.query;

      const where = {
        isDeleted: false,
        outcome: { in: ['WON', 'LOST'] }
      };

      if (startDate || endDate) {
        where.outcomeDate = {};
        if (startDate) where.outcomeDate.gte = new Date(startDate);
        if (endDate) where.outcomeDate.lte = new Date(endDate);
      }

      if (assignedTo) {
        where.createdById = assignedTo;
      }

      const estimates = await prisma.estimate.findMany({
        where,
        select: {
          id: true,
          estimateNumber: true,
          outcome: true,
          outcomeReason: true,
          outcomeNotes: true,
          outcomeDate: true,
          total: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true
            }
          },
          createdBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { outcomeDate: 'desc' }
      });

      // Calculate stats
      const won = estimates.filter(e => e.outcome === 'WON');
      const lost = estimates.filter(e => e.outcome === 'LOST');

      // Group loss reasons
      const lossReasons = {};
      lost.forEach(e => {
        const reason = e.outcomeReason || 'No reason provided';
        if (!lossReasons[reason]) {
          lossReasons[reason] = { count: 0, value: 0 };
        }
        lossReasons[reason].count++;
        lossReasons[reason].value += e.total || 0;
      });

      // Sort loss reasons by count
      const sortedLossReasons = Object.entries(lossReasons)
        .map(([reason, data]) => ({ reason, ...data }))
        .sort((a, b) => b.count - a.count);

      res.json({
        summary: {
          totalDecisions: estimates.length,
          won: {
            count: won.length,
            value: won.reduce((sum, e) => sum + (e.total || 0), 0)
          },
          lost: {
            count: lost.length,
            value: lost.reduce((sum, e) => sum + (e.total || 0), 0)
          },
          winRate: estimates.length > 0
            ? (won.length / estimates.length * 100).toFixed(1)
            : 0
        },
        lossReasons: sortedLossReasons,
        recentDecisions: estimates.slice(0, 20)
      });
    } catch (error) {
      console.error('GET /reports/win-loss error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // TIME TO CLOSE
  // ============================================

  // GET /time-to-close - Average time from estimate to invoice/order
  router.get('/time-to-close', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate, assignedTo } = req.query;

      const where = {
        isDeleted: false,
        convertedToInvoiceId: { not: null }
      };

      if (startDate || endDate) {
        where.convertedAt = {};
        if (startDate) where.convertedAt.gte = new Date(startDate);
        if (endDate) where.convertedAt.lte = new Date(endDate);
      }

      if (assignedTo) {
        where.createdById = assignedTo;
      }

      const estimates = await prisma.estimate.findMany({
        where,
        select: {
          id: true,
          estimateDate: true,
          convertedAt: true,
          total: true,
          createdBy: {
            select: { id: true, name: true }
          }
        }
      });

      // Calculate time to close for each
      const closeTimes = estimates.map(e => {
        const created = new Date(e.estimateDate);
        const converted = new Date(e.convertedAt);
        const days = Math.round((converted - created) / (1000 * 60 * 60 * 24));
        return {
          days,
          total: e.total,
          salesRep: e.createdBy?.name
        };
      }).filter(t => t.days >= 0);

      // Calculate averages
      const avgDays = closeTimes.length > 0
        ? closeTimes.reduce((sum, t) => sum + t.days, 0) / closeTimes.length
        : 0;

      // Group by sales rep
      const byRep = {};
      closeTimes.forEach(t => {
        const rep = t.salesRep || 'Unassigned';
        if (!byRep[rep]) {
          byRep[rep] = { count: 0, totalDays: 0, totalValue: 0 };
        }
        byRep[rep].count++;
        byRep[rep].totalDays += t.days;
        byRep[rep].totalValue += t.total || 0;
      });

      const repStats = Object.entries(byRep).map(([name, data]) => ({
        name,
        count: data.count,
        avgDays: (data.totalDays / data.count).toFixed(1),
        totalValue: data.totalValue
      })).sort((a, b) => parseFloat(a.avgDays) - parseFloat(b.avgDays));

      // Distribution buckets
      const distribution = {
        '0-7 days': closeTimes.filter(t => t.days <= 7).length,
        '8-14 days': closeTimes.filter(t => t.days > 7 && t.days <= 14).length,
        '15-30 days': closeTimes.filter(t => t.days > 14 && t.days <= 30).length,
        '31-60 days': closeTimes.filter(t => t.days > 30 && t.days <= 60).length,
        '60+ days': closeTimes.filter(t => t.days > 60).length
      };

      res.json({
        summary: {
          totalConverted: estimates.length,
          averageDays: avgDays.toFixed(1),
          medianDays: closeTimes.length > 0
            ? closeTimes.sort((a, b) => a.days - b.days)[Math.floor(closeTimes.length / 2)].days
            : 0
        },
        distribution,
        byRep: repStats
      });
    } catch (error) {
      console.error('GET /reports/time-to-close error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ACCOUNTS RECEIVABLE AGING
  // ============================================

  // GET /ar-aging - AR aging buckets (current, 30, 60, 90+ days)
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
            select: {
              id: true,
              customerNumber: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true,
              email: true
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Aging buckets
      const buckets = {
        current: { count: 0, value: 0, invoices: [] },
        '1-30': { count: 0, value: 0, invoices: [] },
        '31-60': { count: 0, value: 0, invoices: [] },
        '61-90': { count: 0, value: 0, invoices: [] },
        '90+': { count: 0, value: 0, invoices: [] }
      };

      // By customer summary
      const byCustomer = {};

      invoices.forEach(inv => {
        const dueDate = new Date(inv.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

        let bucket;
        if (daysOverdue <= 0) {
          bucket = 'current';
        } else if (daysOverdue <= 30) {
          bucket = '1-30';
        } else if (daysOverdue <= 60) {
          bucket = '31-60';
        } else if (daysOverdue <= 90) {
          bucket = '61-90';
        } else {
          bucket = '90+';
        }

        buckets[bucket].count++;
        buckets[bucket].value += inv.balanceDue;
        buckets[bucket].invoices.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          dueDate: inv.dueDate,
          balanceDue: inv.balanceDue,
          daysOverdue: Math.max(0, daysOverdue),
          customer: inv.customer
        });

        // Aggregate by customer
        const customerId = inv.customerId;
        if (!byCustomer[customerId]) {
          byCustomer[customerId] = {
            customer: inv.customer,
            current: 0,
            '1-30': 0,
            '31-60': 0,
            '61-90': 0,
            '90+': 0,
            total: 0
          };
        }
        byCustomer[customerId][bucket] += inv.balanceDue;
        byCustomer[customerId].total += inv.balanceDue;
      });

      // Sort by total descending
      const customerSummary = Object.values(byCustomer)
        .sort((a, b) => b.total - a.total);

      // Total AR
      const totalAR = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

      res.json({
        summary: {
          totalAR,
          invoiceCount: invoices.length,
          customerCount: Object.keys(byCustomer).length
        },
        buckets: {
          current: { count: buckets.current.count, value: buckets.current.value },
          '1-30': { count: buckets['1-30'].count, value: buckets['1-30'].value },
          '31-60': { count: buckets['31-60'].count, value: buckets['31-60'].value },
          '61-90': { count: buckets['61-90'].count, value: buckets['61-90'].value },
          '90+': { count: buckets['90+'].count, value: buckets['90+'].value }
        },
        byCustomer: customerSummary.slice(0, 20),
        overdueInvoices: [
          ...buckets['1-30'].invoices,
          ...buckets['31-60'].invoices,
          ...buckets['61-90'].invoices,
          ...buckets['90+'].invoices
        ].sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 30)
      });
    } catch (error) {
      console.error('GET /reports/ar-aging error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // SALES SUMMARY
  // ============================================

  // GET /sales-summary - Sales by rep and period
  router.get('/sales-summary', invoicingAuth, async (req, res) => {
    try {
      const { startDate, endDate, groupBy = 'month' } = req.query;

      const where = {
        isDeleted: false,
        status: 'PAID'
      };

      // Default to last 12 months if no dates specified
      const endDateObj = endDate ? new Date(endDate) : new Date();
      const startDateObj = startDate
        ? new Date(startDate)
        : new Date(endDateObj.getFullYear(), endDateObj.getMonth() - 11, 1);

      where.invoiceDate = {
        gte: startDateObj,
        lte: endDateObj
      };

      const invoices = await prisma.invoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          total: true,
          amountPaid: true,
          createdById: true,
          createdBy: {
            select: { id: true, name: true }
          }
        }
      });

      // Group by period
      const byPeriod = {};
      const byRep = {};

      invoices.forEach(inv => {
        const date = new Date(inv.invoiceDate);
        let periodKey;

        if (groupBy === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
        } else if (groupBy === 'month') {
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else if (groupBy === 'quarter') {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          periodKey = `${date.getFullYear()}-Q${quarter}`;
        } else {
          periodKey = String(date.getFullYear());
        }

        // By period
        if (!byPeriod[periodKey]) {
          byPeriod[periodKey] = { count: 0, revenue: 0 };
        }
        byPeriod[periodKey].count++;
        byPeriod[periodKey].revenue += inv.amountPaid || inv.total;

        // By rep
        const repName = inv.createdBy?.name || 'Unassigned';
        if (!byRep[repName]) {
          byRep[repName] = { count: 0, revenue: 0, invoices: [] };
        }
        byRep[repName].count++;
        byRep[repName].revenue += inv.amountPaid || inv.total;
      });

      // Sort periods chronologically
      const periods = Object.entries(byPeriod)
        .map(([period, data]) => ({ period, ...data }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // Sort reps by revenue
      const reps = Object.entries(byRep)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue);

      // Calculate totals
      const totalRevenue = invoices.reduce((sum, i) => sum + (i.amountPaid || i.total), 0);

      res.json({
        summary: {
          totalInvoices: invoices.length,
          totalRevenue,
          avgInvoiceValue: invoices.length > 0 ? totalRevenue / invoices.length : 0,
          period: {
            start: startDateObj.toISOString().split('T')[0],
            end: endDateObj.toISOString().split('T')[0]
          }
        },
        byPeriod: periods,
        byRep: reps
      });
    } catch (error) {
      console.error('GET /reports/sales-summary error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // REVENUE PROJECTIONS
  // ============================================

  // GET /revenue-projections - Projected revenue from open estimates
  router.get('/revenue-projections', invoicingAuth, async (req, res) => {
    try {
      // Get open estimates (not expired, not declined)
      const estimates = await prisma.estimate.findMany({
        where: {
          isDeleted: false,
          status: { in: ['SENT', 'VIEWED', 'PENDING_APPROVAL'] },
          OR: [
            { expiryDate: { gte: new Date() } },
            { expiryDate: null }
          ]
        },
        select: {
          id: true,
          estimateNumber: true,
          status: true,
          total: true,
          estimateDate: true,
          expiryDate: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true
            }
          },
          createdBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { expiryDate: 'asc' }
      });

      // Get historical conversion rate
      const historicalStats = await prisma.estimate.aggregate({
        _count: { id: true },
        where: {
          isDeleted: false,
          outcome: { not: null }
        }
      });

      const wonCount = await prisma.estimate.count({
        where: {
          isDeleted: false,
          outcome: 'WON'
        }
      });

      const historicalConversionRate = historicalStats._count.id > 0
        ? wonCount / historicalStats._count.id
        : 0.3; // Default 30% if no history

      // Calculate projections with weighted probability
      const statusWeights = {
        'PENDING_APPROVAL': 0.3,
        'SENT': 0.4,
        'VIEWED': 0.6
      };

      let totalProjected = 0;
      let weightedProjected = 0;

      const projections = estimates.map(est => {
        const weight = statusWeights[est.status] || 0.3;
        const projected = est.total * weight;
        totalProjected += est.total;
        weightedProjected += projected;

        return {
          id: est.id,
          estimateNumber: est.estimateNumber,
          status: est.status,
          total: est.total,
          probability: (weight * 100).toFixed(0) + '%',
          weightedValue: projected,
          expiryDate: est.expiryDate,
          customer: est.customer,
          salesRep: est.createdBy?.name
        };
      });

      // Expiring soon (next 7 days)
      const oneWeek = new Date();
      oneWeek.setDate(oneWeek.getDate() + 7);

      const expiringSoon = projections.filter(p =>
        p.expiryDate && new Date(p.expiryDate) <= oneWeek
      );

      // By status
      const byStatus = {
        PENDING_APPROVAL: projections.filter(p => p.status === 'PENDING_APPROVAL'),
        SENT: projections.filter(p => p.status === 'SENT'),
        VIEWED: projections.filter(p => p.status === 'VIEWED')
      };

      res.json({
        summary: {
          openEstimates: estimates.length,
          totalPipelineValue: totalProjected,
          weightedProjection: weightedProjected,
          historicalConversionRate: (historicalConversionRate * 100).toFixed(1) + '%',
          expiringSoonCount: expiringSoon.length,
          expiringSoonValue: expiringSoon.reduce((sum, e) => sum + e.total, 0)
        },
        byStatus: {
          PENDING_APPROVAL: {
            count: byStatus.PENDING_APPROVAL.length,
            value: byStatus.PENDING_APPROVAL.reduce((sum, e) => sum + e.total, 0),
            weighted: byStatus.PENDING_APPROVAL.reduce((sum, e) => sum + e.weightedValue, 0)
          },
          SENT: {
            count: byStatus.SENT.length,
            value: byStatus.SENT.reduce((sum, e) => sum + e.total, 0),
            weighted: byStatus.SENT.reduce((sum, e) => sum + e.weightedValue, 0)
          },
          VIEWED: {
            count: byStatus.VIEWED.length,
            value: byStatus.VIEWED.reduce((sum, e) => sum + e.total, 0),
            weighted: byStatus.VIEWED.reduce((sum, e) => sum + e.weightedValue, 0)
          }
        },
        expiringSoon,
        estimates: projections.slice(0, 50)
      });
    } catch (error) {
      console.error('GET /reports/revenue-projections error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CSV EXPORT
  // ============================================

  // GET /export/:type - Export report data as CSV
  router.get('/export/:type', invoicingAuth, async (req, res) => {
    try {
      const { type } = req.params;
      const { startDate, endDate } = req.query;

      let data = [];
      let filename = '';
      let headers = [];

      switch (type) {
        case 'ar-aging': {
          const invoices = await prisma.invoice.findMany({
            where: {
              isDeleted: false,
              status: { in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] },
              balanceDue: { gt: 0 }
            },
            include: {
              customer: true
            },
            orderBy: { dueDate: 'asc' }
          });

          const today = new Date();
          headers = ['Invoice #', 'Customer', 'Due Date', 'Amount Due', 'Days Overdue', 'Status'];
          data = invoices.map(inv => {
            const daysOverdue = Math.max(0, Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24)));
            return [
              inv.invoiceNumber,
              inv.customer.companyName || inv.customer.company || `${inv.customer.firstName} ${inv.customer.lastName}`,
              new Date(inv.dueDate).toLocaleDateString(),
              inv.balanceDue.toFixed(2),
              daysOverdue,
              inv.status
            ];
          });
          filename = `ar-aging-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }

        case 'pipeline': {
          const where = { isDeleted: false };
          if (startDate) where.estimateDate = { gte: new Date(startDate) };
          if (endDate) {
            where.estimateDate = { ...where.estimateDate, lte: new Date(endDate) };
          }

          const estimates = await prisma.estimate.findMany({
            where,
            include: { customer: true, createdBy: true },
            orderBy: { estimateDate: 'desc' }
          });

          headers = ['Estimate #', 'Customer', 'Date', 'Status', 'Total', 'Sales Rep'];
          data = estimates.map(est => [
            est.estimateNumber,
            est.customer?.companyName || est.customer?.company || `${est.customer?.firstName} ${est.customer?.lastName}`,
            new Date(est.estimateDate).toLocaleDateString(),
            est.status,
            est.total.toFixed(2),
            est.createdBy?.name || ''
          ]);
          filename = `pipeline-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }

        case 'sales-summary': {
          const where = { isDeleted: false, status: 'PAID' };
          if (startDate) where.invoiceDate = { gte: new Date(startDate) };
          if (endDate) {
            where.invoiceDate = { ...where.invoiceDate, lte: new Date(endDate) };
          }

          const invoices = await prisma.invoice.findMany({
            where,
            include: { customer: true, createdBy: true },
            orderBy: { invoiceDate: 'desc' }
          });

          headers = ['Invoice #', 'Customer', 'Date', 'Total', 'Amount Paid', 'Sales Rep'];
          data = invoices.map(inv => [
            inv.invoiceNumber,
            inv.customer?.companyName || inv.customer?.company || `${inv.customer?.firstName} ${inv.customer?.lastName}`,
            new Date(inv.invoiceDate).toLocaleDateString(),
            inv.total.toFixed(2),
            inv.amountPaid.toFixed(2),
            inv.createdBy?.name || ''
          ]);
          filename = `sales-summary-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }

        default:
          return res.status(400).json({ error: 'Invalid report type' });
      }

      // Generate CSV
      const csv = [
        headers.join(','),
        ...data.map(row => row.map(cell =>
          typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
        ).join(','))
      ].join('\n');

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
