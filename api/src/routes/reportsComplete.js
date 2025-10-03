// api/src/routes/reportsComplete.js
/**
 * COMPLETE REPORTING SUITE
 * Combines all report endpoints into a single router
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

export function createCompleteReportsRouter(prisma) {
  const router = Router();

  // Import and add all report endpoints
  // These will be added to the main index.js

  /**
   * GET /reports/summary
   * Dashboard summary with key metrics
   */
  router.get('/summary', authGuard, async (req, res) => {
    try {
      const filters = parseReportFilters(req.query);
      const finalStage = STAGES[STAGES.length - 1];

      // Get orders count by stage
      const ordersByStage = await prisma.order.groupBy({
        by: ['currentStage'],
        _count: true,
        where: buildWhereClause(filters, 'order')
      });

      // Get total revenue (admin only)
      let totalRevenue = null;
      if (req.user.role === 'ADMIN') {
        const revenueResult = await prisma.orderItem.aggregate({
          _sum: { itemPrice: true },
          where: {
            itemPrice: { not: null },
            order: buildWhereClause(filters, 'order')
          }
        });
        totalRevenue = revenueResult._sum.itemPrice || 0;
      }

      // Active orders
      const activeOrders = await prisma.order.count({
        where: {
          currentStage: { not: finalStage },
          ...buildWhereClause(filters, 'order')
        }
      });

      // Completed this period
      const completedOrders = await prisma.order.count({
        where: {
          currentStage: finalStage,
          ...buildWhereClause(filters, 'order')
        }
      });

      res.json({
        kpis: {
          activeOrders,
          completedOrders,
          totalRevenue: req.user.role === 'ADMIN' ? formatCurrency(totalRevenue) : 'N/A',
          ordersByStage: ordersByStage.map(s => ({
            stage: s.currentStage,
            count: s._count
          }))
        },
        meta: {
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          userRole: req.user.role
        }
      });
    } catch (error) {
      console.error('Summary error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createCompleteReportsRouter;
