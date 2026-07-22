import express from 'express';
import { PrismaClient } from '@prisma/client';
import { rateLimit } from '../rateLimit.js';

const prisma = new PrismaClient();

export function createPublicRouter() {
  const router = express.Router();
  
  // Apply rate limiting to all public routes
  router.use(rateLimit);

  // Public kiosk board (NO AUTH) - powers the /admin/kiosk display board.
  // Replaces the removed x-admin-key backdoor. Intentionally returns ONLY the
  // minimal, non-sensitive data the board renders: customer name, and each
  // item's product code + current stage. No prices, financials, private notes,
  // contact info, serials, or measurements are exposed.
  router.get('/kiosk-board', async (req, res) => {
    try {
      const orders = await prisma.order.findMany({
        where: { isArchived: false },
        select: {
          id: true,
          currentStage: true,
          accountId: true,
          account: { select: { id: true, name: true } },
          items: {
            where: { archivedAt: null },
            select: {
              id: true,
              productCode: true,
              currentStage: true,
              archivedAt: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }]
      });

      res.json(orders);
    } catch (e) {
      console.error('GET /public/kiosk-board error:', e);
      // Never break the display board - return an empty list on error.
      res.json([]);
    }
  });

  // Public order read (no auth required) 
  router.get('/orders/:token', async (req, res) => {
    try {
      const token = req.params.token;
      const order = await prisma.order.findUnique({
        where: { trackingToken: token },
        include: {
          account: true,
          items: {
            include: { statusEvents: { orderBy: { createdAt: 'asc' } } }
          },
          statusEvents: { orderBy: { createdAt: 'asc' } },
          surveys: { orderBy: { createdAt: 'asc' } }
        }
      });
      
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const {
        id, poNumber, sku, createdAt, etaDate, currentStage, orderDate,
        shippingCarrier, trackingNumber, items, statusEvents, account, customerDocsLink,
        onsiteInstallationDate
      } = order;

      res.json({
        id,
        accountName: account?.name ?? null,
        account: account ? {
          name: account.name,
          email: account.email,
          phone: account.phone,
          address: account.address,
          machineVoltage: account.machineVoltage,
          contactName: account.contactName  // Add contactName field here
        } : null,
        poNumber,
        orderDate,
        sku,
        createdAt,
        etaDate,
        currentStage,
        shippingCarrier,
        trackingNumber,
        onsiteInstallationDate,
        items: items.map(it => ({
          id: it.id,
          productCode: it.productCode,
          qty: it.qty,
          serialNumber: it.serialNumber,
          modelNumber: it.modelNumber,
          voltage: it.voltage,
          laserWattage: it.laserWattage,
          notes: it.notes,
          currentStage: it.currentStage ?? currentStage,
          archivedAt: it.archivedAt,
          statusEvents: it.statusEvents,
          // Include measurements in public view
          height: it.height,
          width: it.width,
          length: it.length,
          weight: it.weight,
          measurementUnit: it.measurementUnit,
          weightUnit: it.weightUnit
        })),
        statusEvents,
        customerDocsLink,
        surveys: (order.surveys || []).map(s => ({
          token: s.token,
          phase: s.phase,
          status: s.status,
          completedAt: s.completedAt,
        }))
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createPublicRouter;
