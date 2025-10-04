// api/src/routes/reportsOperational.js
import { Router } from 'express';

export default function createOperationalReportsRouter(prisma) {
  const router = Router();

  // Get orders requiring action
  router.get('/operational/action-required', async (req, res) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          OR: [
            { currentStage: 'MANUFACTURING' },
            { currentStage: 'IN_TRANSIT' }
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
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      const actionRequired = orders.map(order => ({
        id: order.id,
        poNumber: order.poNumber,
        sku: order.sku,
        customer: order.account?.name || 'Unknown',
        stage: order.currentStage,
        createdAt: order.createdAt,
        activeItems: order.items.filter(item => !item.archivedAt).length,
        daysInStage: Math.floor((new Date() - new Date(order.createdAt)) / (1000 * 60 * 60 * 24))
      }));

      res.json(actionRequired);
    } catch (error) {
      console.error('Action required report error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get stage distribution
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

      res.json(distribution);
    } catch (error) {
      console.error('Stage distribution error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get average completion time
  router.get('/operational/avg-completion-time', async (req, res) => {
    try {
      const completedOrders = await prisma.order.findMany({
        where: {
          currentStage: 'DELIVERED'
        },
        select: {
          createdAt: true,
          statusEvents: {
            where: {
              stage: 'DELIVERED'
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
          const deliveredDate = new Date(order.statusEvents[0].createdAt);
          const createdDate = new Date(order.createdAt);
          return Math.floor((deliveredDate - createdDate) / (1000 * 60 * 60 * 24));
        });

      const avgTime = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

      res.json({
        averageDays: Math.round(avgTime),
        totalCompleted: completionTimes.length
      });
    } catch (error) {
      console.error('Avg completion time error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
