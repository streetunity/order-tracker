// api/src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';

import { authGuard, adminGuard, nonManufacturerGuard } from './middleware/auth.js';
import { calculateCommissionForOrder, recalculateCommissionIfPriceChanged, checkCommissionPayoutTrigger } from './helpers/commission.js';

import { createReportsRouter } from './routes/reports.js';
import createOperationalReportsRouter from './routes/reportsOperational.js';
import createCycleTimeReportsRouter from './routes/reportsCycleTime.js';
import createSettingsRouter from './routes/settings.js';
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createOrdersRouter } from './routes/orders.js';
import { createItemsRouter } from './routes/items.js';
import { createMeasurementsRouter } from './routes/measurements.js';
import { createStagesRouter } from './routes/stages.js';
import { createLocksRouter } from './routes/locks.js';
import { createAuditRouter } from './routes/audit.js';
import { createAuditSearchRouter } from './routes/auditSearch.js';
import { createAuditBackfillRouter } from './routes/auditBackfill.js';
import { createPublicRouter } from './routes/public.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createManufacturersRouter } from './routes/manufacturers.js';
import { createCommissionsRouter } from './routes/commissions.js';
import { createCommissionSettingsRouter } from './routes/commissionSettings.js';
import { createCommissionPayoutsRouter } from './routes/commissionPayouts.js';
import { createBrokerRouter } from './routes/broker.js';
import documentsRouter from './routes/documents.js';
import itemDocumentsRouter from './routes/itemDocuments.js';
import customerDocumentsRouter from './routes/customerDocuments.js';
import publicCustomerDocumentsRouter from './routes/publicCustomerDocuments.js';
import shipmentsRouter from './routes/shipments.js';
import { createLeadsRouter } from './routes/leads.js';
import { createCustomersRouter } from './routes/customers.js';
import { createEstimatesRouter } from './routes/estimates.js';
import { createEstimatePdfRouter } from './routes/estimatePdf.js';
import { createInvoicesRouter } from './routes/invoices.js';
import { createInvoicePdfRouter } from './routes/invoicePdf.js';
import { createZapierWebhookRouter } from './routes/zapierWebhook.js';
import { createProductsRouter } from './routes/products.js';
import { createBundlesRouter } from './routes/bundles.js';
import { createEstimateTemplatesRouter } from './routes/estimateTemplates.js';
import { createPublicInvoicingRouter } from './routes/publicInvoicing.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createSignaturesRouter } from './routes/signatures.js';
import { createCustomerPortalRouter } from './routes/customerPortal.js';
import { createInvoicingReportsRouter } from './routes/invoicingReports.js';
import { createCommentsRouter } from './routes/comments.js';
import { createRemindersRouter } from './routes/reminders.js';
import { createEmailTemplateSettingsRouter } from './routes/emailTemplateSettings.js';
import createInvoicingSettingsRouter from './routes/invoicingSettings.js';
import { createNextnpWebhookHandler } from './routes/nextnpWebhook.js';

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://smt-orders.com', 'http://smt-orders.com',
  'https://www.smt-orders.com', 'http://www.smt-orders.com',
  'http://localhost:3000', 'http://localhost:4000',
  'http://50.19.66.100:3000', 'http://50.19.66.100:4000',
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(o => o.trim()));
}
if (process.env.SERVER_IP && process.env.SERVER_IP !== 'undefined') {
  allowedOrigins.push(
    `http://${process.env.SERVER_IP}:3000`,
    `http://${process.env.SERVER_IP}:4000`,
    `http://${process.env.SERVER_IP}`,
  );
}
const uniqueOrigins = [...new Set(allowedOrigins)];
console.log('CORS Allowed Origins:', uniqueOrigins);

app.use(cors({
  origin: (origin, cb) => (!origin || uniqueOrigins.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS')),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'x-auth-token'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
}));

// ── NexNP WEBHOOK — must be BEFORE express.json() ────────────────────────────
// express.raw() captures the raw Buffer needed for HMAC-SHA256 signature verification.
// If express.json() ran first, req.body would already be a parsed object and
// we couldn't reconstruct the exact bytes NexNP signed.
app.post(
  '/public/nextnp-webhook',
  express.raw({ type: '*/*' }),
  createNextnpWebhookHandler(prisma),
);
console.log('✅ NexNP webhook endpoint loaded (raw body, pre-json)');

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    hasAuth: !!req.headers.authorization || !!req.headers['x-auth-token'],
    origin: req.headers.origin,
  });
  next();
});

// ── Commission helpers (global) ───────────────────────────────────────────────
global.calculateCommissionForOrder = calculateCommissionForOrder;
global.recalculateCommissionIfPriceChanged = recalculateCommissionIfPriceChanged;
global.checkCommissionPayoutTrigger = checkCommissionPayoutTrigger;

// ── Initialise routers ────────────────────────────────────────────────────────
const reportsRouter            = createReportsRouter(prisma);
const operationalReportsRouter = createOperationalReportsRouter(prisma);
const cycleTimeReportsRouter   = createCycleTimeReportsRouter(prisma);
const settingsRouter           = createSettingsRouter(prisma);
const authRouter               = createAuthRouter();
const usersRouter              = createUsersRouter();
const accountsRouter           = createAccountsRouter(prisma);
const ordersRouter             = createOrdersRouter(prisma);
const itemsRouter              = createItemsRouter();
const measurementsRouter       = createMeasurementsRouter();
const stagesRouter             = createStagesRouter();
const locksRouter              = createLocksRouter();
const auditRouter              = createAuditRouter();
const auditSearchRouter        = createAuditSearchRouter();
const auditBackfillRouter      = createAuditBackfillRouter();
const publicRouter             = createPublicRouter();
const notificationsRouter      = createNotificationsRouter(prisma);
const manufacturersRouter      = createManufacturersRouter(prisma);
const commissionsRouter        = createCommissionsRouter(prisma);
const commissionSettingsRouter = createCommissionSettingsRouter(prisma);
const commissionPayoutsRouter  = createCommissionPayoutsRouter(prisma);
const brokerRouter             = createBrokerRouter();
const leadsRouter              = createLeadsRouter(prisma);
const customersRouter          = createCustomersRouter(prisma);
const estimatesRouter          = createEstimatesRouter(prisma);
const estimatePdfRouter        = createEstimatePdfRouter(prisma);
const invoicesRouter           = createInvoicesRouter(prisma);
const invoicePdfRouter         = createInvoicePdfRouter(prisma);
const zapierWebhookRouter      = createZapierWebhookRouter(prisma);
const productsRouter           = createProductsRouter(prisma);
const bundlesRouter            = createBundlesRouter(prisma);
const estimateTemplatesRouter  = createEstimateTemplatesRouter(prisma);
const publicInvoicingRouter    = createPublicInvoicingRouter(prisma);
const paymentsRouter           = createPaymentsRouter(prisma);
const signaturesRouter         = createSignaturesRouter(prisma);
const customerPortalRouter     = createCustomerPortalRouter(prisma);
const invoicingReportsRouter   = createInvoicingReportsRouter(prisma);
const commentsRouter           = createCommentsRouter();
const remindersRouter          = createRemindersRouter();
const emailTemplateSettingsRouter = createEmailTemplateSettingsRouter(prisma);
const invoicingSettingsRouter  = createInvoicingSettingsRouter(prisma);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date(), environment: process.env.NODE_ENV || 'development' }));

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.use('/public', publicRouter);
app.use('/public', publicCustomerDocumentsRouter);
app.use('/public', publicInvoicingRouter);
app.use('/signatures', signaturesRouter);
app.use('/portal', customerPortalRouter);
console.log('✅ Public routes loaded');

// Local PDF serving (dev)
app.get('/pdfs/:filename', (req, res) => {
  const pdfDir  = new URL('../uploads/pdfs', import.meta.url).pathname;
  const pdfPath = `${pdfDir}/${req.params.filename}`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${req.params.filename}"`);
  res.sendFile(pdfPath, err => err && res.status(404).json({ error: 'PDF not found' }));
});

// ── Auth routes ───────────────────────────────────────────────────────────────
app.use('/auth', (req, res, next) => {
  if (['/me', '/logout', '/change-password'].includes(req.path)) {
    return authGuard(req, res, () => authRouter(req, res, next));
  }
  authRouter(req, res, next);
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.use('/reports', authGuard, nonManufacturerGuard, reportsRouter);
app.use('/reports', authGuard, nonManufacturerGuard, operationalReportsRouter);
app.use('/reports', authGuard, nonManufacturerGuard, cycleTimeReportsRouter);

// ── Settings ──────────────────────────────────────────────────────────────────
app.use('/settings', adminGuard, settingsRouter);

// ── Users (specific routes BEFORE adminGuard catch-all) ───────────────────────
app.get('/users/sales-reps', authGuard, async (req, res) => {
  try {
    res.json(await prisma.user.findMany({
      where: { isActive: true, showInSalesRepDropdown: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/users/search', authGuard, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    res.json(await prisma.user.findMany({
      where: { isActive: true, OR: [{ name: { contains: q } }, { email: { contains: q } }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 10,
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.use('/users', adminGuard, usersRouter);

// ── Manufacturers (specific BEFORE catch-all) ─────────────────────────────────
app.get('/manufacturers/active', authGuard, async (req, res) => {
  try {
    res.json(await prisma.manufacturer.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.use('/manufacturers', adminGuard, manufacturersRouter);

// ── Core order management ─────────────────────────────────────────────────────
app.use('/accounts', authGuard, nonManufacturerGuard, accountsRouter);
app.use('/orders', authGuard, ordersRouter);
app.use('/orders', authGuard, itemsRouter);
app.use('/orders', authGuard, measurementsRouter);
app.use('/orders', authGuard, stagesRouter);
app.use('/orders', authGuard, locksRouter);

// ── Audit (specific BEFORE catch-all) ────────────────────────────────────────
app.use('/audit', authGuard, nonManufacturerGuard, auditSearchRouter);
app.use('/audit', authGuard, nonManufacturerGuard, auditBackfillRouter);
app.use('/audit', authGuard, nonManufacturerGuard, auditRouter);
app.use('/comprehensive-audit', authGuard, nonManufacturerGuard, auditSearchRouter);
app.use('/comprehensive-audit', authGuard, nonManufacturerGuard, auditBackfillRouter);
app.use('/comprehensive-audit', authGuard, nonManufacturerGuard, auditRouter);

app.use('/notifications', authGuard, notificationsRouter);

// ── Commissions (specific BEFORE general) ────────────────────────────────────
app.use('/commissions/payouts', authGuard, commissionPayoutsRouter);
app.use('/commission-settings', authGuard, commissionSettingsRouter);
app.use('/commissions', authGuard, commissionsRouter);

// ── Other modules ─────────────────────────────────────────────────────────────
app.use('/customs', brokerRouter);
app.use('/shipments', shipmentsRouter);
app.use(documentsRouter);
app.use(itemDocumentsRouter);
app.use('/customer-documents', customerDocumentsRouter);

// ── Invoicing system ──────────────────────────────────────────────────────────
app.use('/leads', authGuard, leadsRouter);
app.use('/customers', authGuard, customersRouter);
app.use('/estimates', authGuard, estimatesRouter);
app.use('/estimates', authGuard, estimatePdfRouter);
app.use('/invoices', authGuard, invoicesRouter);
app.use('/invoices', authGuard, invoicePdfRouter);
app.use('/products', authGuard, productsRouter);
app.use('/bundles', authGuard, bundlesRouter);
app.use('/estimate-templates', authGuard, estimateTemplatesRouter);
app.use('/payments', authGuard, paymentsRouter);
app.use('/invoicing-reports', authGuard, invoicingReportsRouter);
app.use('/invoicing-settings', invoicingSettingsRouter);
app.use('/comments', commentsRouter);
app.use('/reminders', remindersRouter);
app.use('/email-templates', authGuard, emailTemplateSettingsRouter);
app.use('/zapier', zapierWebhookRouter);
console.log('✅ All routes loaded');

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
});
app.use((req, res) => {
  console.log('404:', req.method, req.path);
  res.status(404).json({ error: 'Route not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`API server running at http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('✅ All modules loaded successfully');
});

process.on('SIGTERM', () => {
  app.close(() => { prisma.$disconnect(); });
});

export default app;
