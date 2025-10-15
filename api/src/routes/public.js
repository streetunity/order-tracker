import express from 'express';
import { PrismaClient } from '@prisma/client';
import { rateLimit } from '../rateLimit.js';

const prisma = new PrismaClient();

export function createPublicRouter() {
  const router = express.Router();
  
  // Apply rate limiting to all public routes
  router.use(rateLimit);

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
          statusEvents: { orderBy: { createdAt: 'asc' } }
        }
      });
      
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const {
        id, poNumber, sku, createdAt, etaDate, currentStage, orderDate,
        shippingCarrier, trackingNumber, items, statusEvents, account, customerDocsLink
      } = order;

      res.json({
        id,
        accountName: account?.name ?? null,
        account: account ? {
          name: account.name,
          email: account.email,
          phone: account.phone,
          address: account.address,
          machineVoltage: account.machineVoltage
        } : null,
        poNumber,
        orderDate,
        sku,
        createdAt,
        etaDate,
        currentStage,
        shippingCarrier,
        trackingNumber,
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
        customerDocsLink
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createPublicRouter;
