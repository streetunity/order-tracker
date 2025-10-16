// api/src/routes/reportsOperational.js
import { Router } from 'express';
import { authGuard } from '../middleware/auth.js';
import { STAGES } from '../state.js';

export function createOperationalReportsRouter(prisma) {
  const router = Router();

  // Helper to apply role-based filtering
  function buildRoleBasedOrderWhere(user, additionalWhere = {}) {
    const where = { ...additionalWhere };
    if (user.role === 'AGENT') {
      where.sku = user.name; // Filter by sales person matching agent's name
    }
    return where;
  }

  /**
   * Get items requiring action - ROLE-FILTERED
   * FIXED: Now uses item stages, not order stages, and filters by agent
   */
  router.get('/operational/action-required', authGuard, async (req, res) => {
    try {
      // First get order IDs that the user has access to
      const orderWhere = buildRoleBasedOrderWhere(req.user, {});
      const accessibleOrders = await prisma.order.findMany({
        where: orderWhere,
        select: { id: true }
      });
      const orderIds = accessibleOrders.map(o => o.id);

      const items = await prisma.orderItem.findMany({
        where: {
          orderId: { in: orderIds }, // Only items from accessible orders
          archivedAt: null,
          OR: [
            { currentStage: 'MANUFACTURING' },
            { currentStage: 'TESTING' },
            { currentStage: 'SHIPPING' },
            { currentStage: 'AT_SEA' },
            { currentStage: 'SMT' },
            { currentStage: 'QC' }
          ]
        },
        include: {
          order: {
            select: {
              id: true,
              poNumber: true,
              sku: true,
              account: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              createdAt: true
            }
          },
          statusEvents: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      const now = new Date();
      const actionRequired = items.map(item => {
        // Get time in current stage from last status event
        const lastEvent = item.statusEvents[0];
        const stageEnteredAt = lastEvent ? lastEvent.createdAt : item.createdAt;
        const daysInStage = Math.floor((now - new Date(stageEnteredAt)) / (1000 * 60 * 60 * 24));
        
        return {
          itemId: item.id,
          orderId: item.order.id,
          poNumber: item.order.poNumber,
          productCode: item.productCode,
          sku: item.order.sku,
          customer: item.order.account?.name || 'Unknown',
          stage: item.currentStage,
          createdAt: item.createdAt,
          stageEnteredAt: stageEnteredAt,
          daysInStage
        };
      });

      res.json(actionRequired);
    } catch (error) {
      console.error('Action required report error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get stage distribution - ITEMS by stage, not orders - ROLE-FILTERED
   * FIXED: Now counts items, not orders, and filters by agent
   */
  router.get('/operational/stage-distribution', authGuard, async (req, res) => {
    try {
      // First get order IDs that the user has access to
      const orderWhere = buildRoleBasedOrderWhere(req.user, {});
      const accessibleOrders = await prisma.order.findMany({
        where: orderWhere,
        select: { id: true }
      });
      const orderIds = accessibleOrders.map(o => o.id);

      const items = await prisma.orderItem.findMany({
        where: {
          orderId: { in: orderIds }, // Only items from accessible orders
          archivedAt: null
        },
        select: {
          currentStage: true
        }
      });

      const distribution = items.reduce((acc, item) => {
        acc[item.currentStage] = (acc[item.currentStage] || 0) + 1;
        return acc;
      }, {});

      // Add zero counts for stages with no items
      STAGES.forEach(stage => {
        if (!distribution[stage]) {
          distribution[stage] = 0;
        }
      });

      res.json(distribution);
    } catch (error) {
      console.error('Stage distribution error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get average completion time - based on ITEMS - ROLE-FILTERED
   * FIXED: Now tracks items through stages, not orders, and filters by agent
   */
  router.get('/operational/avg-completion-time', authGuard, async (req, res) => {
    try {
      // First get order IDs that the user has access to
      const orderWhere = buildRoleBasedOrderWhere(req.user, {});
      const accessibleOrders = await prisma.order.findMany({
        where: orderWhere,
        select: { id: true }
      });
      const orderIds = accessibleOrders.map(o => o.id);

      const completedItems = await prisma.orderItem.findMany({
        where: {
          orderId: { in: orderIds }, // Only items from accessible orders
          OR: [
            { currentStage: 'DELIVERED' },
            { currentStage: 'ONSITE' },
            { currentStage: 'COMPLETED' },
            { currentStage: 'FOLLOW_UP' }
          ]
        },
        select: {
          createdAt: true,
          statusEvents: {
            where: {
              stage: 'DELIVERED'
            },
            orderBy: {
              createdAt: 'asc'
            },
            take: 1
          },
          order: {
            select: {
              orderDate: true
            }
          }
        }
      });

      const completionTimes = completedItems
        .filter(item => item.statusEvents.length > 0)
        .map(item => {
          const deliveredDate = new Date(item.statusEvents[0].createdAt);
          // Use order's orderDate if available, otherwise use item's createdAt
          const startDate = item.order.orderDate ? new Date(item.order.orderDate) : new Date(item.createdAt);
          return Math.floor((deliveredDate - startDate) / (1000 * 60 * 60 * 24));
        });

      const avgTime = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

      // Calculate median
      const sortedTimes = [...completionTimes].sort((a, b) => a - b);
      const median = sortedTimes.length > 0
        ? sortedTimes.length % 2 === 0
          ? (sortedTimes[sortedTimes.length / 2 - 1] + sortedTimes[sortedTimes.length / 2]) / 2
          : sortedTimes[Math.floor(sortedTimes.length / 2)]
        : 0;

      res.json({
        averageDays: Math.round(avgTime),
        medianDays: Math.round(median),
        minDays: sortedTimes.length > 0 ? sortedTimes[0] : 0,
        maxDays: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0,
        totalCompleted: completionTimes.length,
        note: 'Calculated from order date to item delivery. Based on items, not orders. Filtered by user role.',
        userRole: req.user?.role
      });
    } catch (error) {
      console.error('Avg completion time error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createOperationalReportsRouter;
