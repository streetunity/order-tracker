// api/src/routes/reportsOperational.js
import { Router } from 'express';

export function createOperationalReportsRouter(prisma) {
  const router = Router();

  /**
   * Get orders requiring action
   * FIXED: Now uses correct stage names (AT_SEA and SHIPPING instead of IN_TRANSIT)
   */
  router.get('/operational/action-required', async (req, res) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
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
          account: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          items: {
            select: {
              id: true,
              productCode: true,
              qty: true,
              currentStage: true,
              archivedAt: true
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
      const actionRequired = orders.map(order => {
        // Get time in current stage from last status event
        const lastEvent = order.statusEvents[0];
        const stageEnteredAt = lastEvent ? lastEvent.createdAt : order.createdAt;
        const daysInStage = Math.floor((now - new Date(stageEnteredAt)) / (1000 * 60 * 60 * 24));
        
        return {
          id: order.id,
          poNumber: order.poNumber,
          sku: order.sku,
          customer: order.account?.name || 'Unknown',
          stage: order.currentStage,
          createdAt: order.createdAt,
          stageEnteredAt: stageEnteredAt,
          activeItems: order.items.filter(item => !item.archivedAt).length,
          totalItems: order.items.length,
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
   * Get stage distribution
   */
  router.get('/operational/stage-distribution', async (req, res) => {
    try {
      const orders = await prisma.order.findMany({
        select: {
          currentStage: true
        }
      });

      const distribution = orders.reduce((acc, order) => {
        acc[order.currentStage] = (acc[order.currentStage] || 0) + 1;
        return acc;
      }, {});

      // Add zero counts for stages with no orders
      const allStages = ['MANUFACTURING', 'TESTING', 'SHIPPING', 'AT_SEA', 'SMT', 'QC', 'DELIVERED', 'COMPLETED'];
      allStages.forEach(stage => {
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
   * Get average completion time
   * FIXED: Now properly calculates based on actual delivery date from status events
   */
  router.get('/operational/avg-completion-time', async (req, res) => {
    try {
      const completedOrders = await prisma.order.findMany({
        where: {
          OR: [
            { currentStage: 'DELIVERED' },
            { currentStage: 'COMPLETED' }
          ]
        },
        select: {
          createdAt: true,
          orderDate: true,
          statusEvents: {
            where: {
              OR: [
                { stage: 'DELIVERED' },
                { stage: 'COMPLETED' }
              ]
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
        }
      });

      const completionTimes = completedOrders
        .filter(order => order.statusEvents.length > 0)
        .map(order => {
          const completedDate = new Date(order.statusEvents[0].createdAt);
          // Use orderDate if available, otherwise use createdAt
          const startDate = order.orderDate ? new Date(order.orderDate) : new Date(order.createdAt);
          return Math.floor((completedDate - startDate) / (1000 * 60 * 60 * 24));
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
        note: 'Calculated from orderDate (or createdAt if not set) to delivery date'
      });
    } catch (error) {
      console.error('Avg completion time error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createOperationalReportsRouter;
