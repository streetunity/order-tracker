// api/src/routes/external.js
//
// Read-only external partner API (v1).
// Auth: API key via Authorization: Bearer <key> (see middleware/apiKeyAuth.js).
// Exposes a single customer search that returns each matched customer's orders,
// items, per-item status, and the public order tracking link.
//
// Data path note: items live on the order-tracker side, reached through the
// Customer -> Account -> orders -> items link. A customer with no linked Account
// (accountId null) returns an empty orders array; that is expected, not an error.

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { rateLimit } from '../rateLimit.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';

const prisma = new PrismaClient();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://smt-orders.com';

// Per-order public tracking page, e.g. https://smt-orders.com/t/<trackingToken>
function trackingUrl(trackingToken) {
  return trackingToken ? `${PUBLIC_BASE_URL}/t/${trackingToken}` : null;
}

// Shape a hydrated Customer record into the external DTO. No pricing, no
// commissions, no internal notes are ever included.
function serializeCustomer(c) {
  const orders = (c.account?.orders ?? []).map((o) => ({
    orderId: o.id,
    poNumber: o.poNumber ?? null,
    currentStage: o.currentStage ?? null,
    trackingUrl: trackingUrl(o.trackingToken),
    items: (o.items ?? []).map((it) => ({
      productCode: it.productCode,
      qty: it.qty,
      serialNumber: it.serialNumber ?? null,
      modelNumber: it.modelNumber ?? null,
      currentStage: it.currentStage ?? null,
    })),
  }));

  return {
    customerId: c.id,
    customerNumber: c.customerNumber,
    name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim(),
    companyName: c.companyName ?? c.company ?? null,
    email: c.email,
    phone: c.phone ?? null,
    accountLinked: !!c.accountId,
    orders,
  };
}

export function createExternalRouter() {
  const router = express.Router();

  // IP rate limit, then API key auth, on every route in this module.
  router.use(rateLimit);
  router.use(apiKeyAuth);

  // GET /customers?q=<search>&limit=<n>
  // Searches by customer name, company name, email, or phone (case-insensitive).
  router.get('/customers', async (req, res) => {
    try {
      const q = (req.query.q ?? '').toString().trim();
      if (q.length < 2) {
        return res
          .status(400)
          .json({ error: 'Query parameter q is required and must be at least 2 characters' });
      }

      const take = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

      const tokens = q.split(/\s+/).filter(Boolean);
      const OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
      // Full-name queries ("Jane Smith") won't match a single first/last field,
      // so add a combined first+last clause when the query has 2+ tokens.
      if (tokens.length >= 2) {
        OR.push({
          AND: [
            { firstName: { contains: tokens[0], mode: 'insensitive' } },
            { lastName: { contains: tokens[tokens.length - 1], mode: 'insensitive' } },
          ],
        });
      }

      const customers = await prisma.customer.findMany({
        where: { isDeleted: false, OR },
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            include: {
              orders: {
                where: { isArchived: false },
                orderBy: { createdAt: 'desc' },
                include: {
                  items: {
                    where: { archivedAt: null },
                    orderBy: { createdAt: 'asc' },
                  },
                },
              },
            },
          },
        },
      });

      res.json({
        query: q,
        count: customers.length,
        customers: customers.map(serializeCustomer),
      });
    } catch (e) {
      console.error('External customers search error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createExternalRouter;
