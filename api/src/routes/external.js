// api/src/routes/external.js
//
// Read-only external partner API (v1).
// Auth: API key via Authorization: Bearer <key> (see middleware/apiKeyAuth.js).
// Exposes a single search that returns each matched order-tracker Account's
// orders, items, per-item status, and the public order tracking link.
//
// Data path note: the order tracker is built around Account -> orders -> items.
// This is the same data shown on the board and the customer tracking pages.
// (The invoicing-side Customer table is separate and is NOT searched here.)
// An account with no orders returns an empty orders array; that is expected,
// not an error.

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

// Shape a hydrated Account record into the external DTO. No pricing, no
// commissions, no internal notes are ever included. The response shape is
// unchanged from the original Customer-based version so existing partner
// integrations keep working.
function serializeAccount(a) {
  const orders = (a.orders ?? []).map((o) => ({
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
    customerId: a.id,
    // Populated only when this account is also linked to an invoicing customer.
    customerNumber: a.Customer?.customerNumber ?? null,
    name: a.contactName || a.name,
    companyName: a.name ?? null,
    email: a.email ?? null,
    phone: a.phone ?? null,
    accountLinked: orders.length > 0,
    orders,
  };
}

export function createExternalRouter() {
  const router = express.Router();

  // IP rate limit, then API key auth, on every route in this module.
  router.use(rateLimit);
  router.use(apiKeyAuth);

  // GET /customers?q=<search>&limit=<n>
  // Searches order-tracker Accounts by account name, contact name, email, or
  // phone (case-insensitive substring match).
  router.get('/customers', async (req, res) => {
    try {
      const q = (req.query.q ?? '').toString().trim();
      if (q.length < 2) {
        return res
          .status(400)
          .json({ error: 'Query parameter q is required and must be at least 2 characters' });
      }

      const take = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

      const OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];

      const accounts = await prisma.account.findMany({
        where: { OR },
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          Customer: { select: { customerNumber: true } },
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
      });

      res.json({
        query: q,
        count: accounts.length,
        customers: accounts.map(serializeAccount),
      });
    } catch (e) {
      console.error('External account search error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createExternalRouter;
