/**
 * Public routes for invoicing system — no authentication required.
 *
 * Security model:
 *   - /pay/invoice/:id/nextnp  → accepts a Tokenizer token (never raw card data)
 *   - /nextnp-webhook          → MOUNTED IN index.js BEFORE express.json()
 *                                (see api/src/routes/nextnpWebhook.js)
 *   - All other routes are read-only or notification-only
 */

import express from 'express';
import { trackEmailOpen, trackInvoiceEmailOpen } from '../services/emailService.js';
import { getPDFSignedUrl } from '../services/pdfService.js';
import { chargeWithToken, generateIdempotencyKey } from '../services/nextnpService.js';
import { generatePaymentNumber } from '../utils/numberGenerators.js';

export function createPublicInvoicingRouter(prisma) {
  const router = express.Router();

  const TRACKING_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  // ── Email tracking pixels ───────────────────────────────────────────────────

  router.get('/track/estimate/:id/open', async (req, res) => {
    try { await trackEmailOpen(prisma, req.params.id); } catch (_) {}
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', 'Pragma': 'no-cache', 'Expires': '0' });
    res.send(TRACKING_PIXEL);
  });

  router.get('/track/invoice/:id/open', async (req, res) => {
    try { await trackInvoiceEmailOpen(prisma, req.params.id); } catch (_) {}
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', 'Pragma': 'no-cache', 'Expires': '0' });
    res.send(TRACKING_PIXEL);
  });

  // ── Public estimate viewing ─────────────────────────────────────────────────

  router.get('/view-estimate/:id', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, company: true, companyName: true, email: true, phone: true } },
          items: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, sku: true, quantity: true, unitPrice: true, amount: true, taxable: true, fromBundleName: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });
      if (!estimate || estimate.isDeleted) return res.status(404).json({ error: 'Estimate not found' });
      const statusUpdate = estimate.status === 'SENT'
        ? { status: 'VIEWED', lastViewedAt: new Date(), viewCount: { increment: 1 } }
        : { lastViewedAt: new Date(), viewCount: { increment: 1 } };
      await prisma.estimate.update({ where: { id: estimate.id }, data: statusUpdate });
      const companySettings = await prisma.invoicingSettings.findFirst({
        select: { companyName: true, logoUrl: true, address: true, city: true, state: true, zipCode: true, phone: true, email: true, website: true, defaultEstimateTerms: true }
      });
      res.json({
        id: estimate.id, estimateNumber: estimate.estimateNumber, version: estimate.version,
        status: estimate.status === 'SENT' ? 'VIEWED' : estimate.status,
        estimateDate: estimate.estimateDate, expiryDate: estimate.expiryDate,
        customer: estimate.customer, items: estimate.items,
        subtotal: estimate.subtotal, discountType: estimate.discountType,
        discountValue: estimate.discountValue, discountAmount: estimate.discountAmount,
        taxRate: estimate.taxRate, taxAmount: estimate.taxAmount, shippingAmount: estimate.shippingAmount,
        total: estimate.total, notes: estimate.notes,
        termsConditions: estimate.termsConditions || companySettings?.defaultEstimateTerms || null,
        createdBy: { name: estimate.createdBy?.name }, company: companySettings,
        isSigned: !!estimate.signatureId,
      });
    } catch (error) {
      console.error('GET /view-estimate/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/accept-estimate/:id', async (req, res) => {
    try {
      const { signerName } = req.body;
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true, estimateNumber: true, total: true, customerId: true, isDeleted: true }
      });
      if (!estimate || estimate.isDeleted) return res.status(404).json({ error: 'Estimate not found' });
      if (['ACCEPTED', 'CONVERTED', 'EXPIRED', 'VOID'].includes(estimate.status)) {
        return res.status(400).json({ error: `Estimate cannot be accepted in status ${estimate.status}` });
      }
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: 'ACCEPTED' } });
      try {
        await prisma.customerActivityLog.create({
          data: {
            customerId: estimate.customerId, estimateId: estimate.id, type: 'accepted',
            description: `Estimate ${estimate.estimateNumber} accepted online${signerName ? ` by ${signerName}` : ''}`,
            actorName: signerName || 'Customer (online)',
          }
        });
      } catch (_) {}
      res.json({ success: true, estimateNumber: estimate.estimateNumber, total: estimate.total });
    } catch (error) {
      console.error('POST /accept-estimate/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/view-estimate/:id/pdf', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id }, select: { id: true, estimateNumber: true, pdfS3Key: true, isDeleted: true } });
      if (!estimate || estimate.isDeleted) return res.status(404).json({ error: 'Estimate not found' });
      if (!estimate.pdfS3Key) return res.status(404).json({ error: 'PDF not available' });
      const pdfUrl = await getPDFSignedUrl(estimate.pdfS3Key, `${estimate.estimateNumber}.pdf`);
      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /view-estimate/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Public invoice viewing ──────────────────────────────────────────────────

  router.get('/view-invoice/:id', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              id: true, firstName: true, lastName: true, company: true, companyName: true,
              email: true, phone: true, billingAddress: true, billingCity: true,
              billingState: true, billingZipCode: true,
            }
          },
          items: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, sku: true, quantity: true, unitPrice: true, amount: true, taxable: true } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' }, select: { id: true, description: true, percentage: true, amount: true, dueDate: true, status: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });
      if (!invoice || invoice.isDeleted) return res.status(404).json({ error: 'Invoice not found' });
      const statusUpdate = invoice.status === 'SENT'
        ? { status: 'VIEWED', lastViewedAt: new Date(), viewCount: { increment: 1 } }
        : { lastViewedAt: new Date(), viewCount: { increment: 1 } };
      await prisma.invoice.update({ where: { id: invoice.id }, data: statusUpdate });
      const companySettings = await prisma.invoicingSettings.findFirst({
        select: { companyName: true, logoUrl: true, address: true, city: true, state: true, zipCode: true, phone: true, email: true, website: true }
      });
      const c = invoice.customer;
      const billingLines = [
        c?.billingAddress,
        [c?.billingCity, c?.billingState, c?.billingZipCode].filter(Boolean).join(', ')
      ].filter(Boolean).join('\n');
      res.json({
        id: invoice.id, invoiceNumber: invoice.invoiceNumber,
        status: invoice.status === 'SENT' ? 'VIEWED' : invoice.status,
        invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, paymentTerms: invoice.paymentTerms,
        customer: { ...invoice.customer, billingAddressFull: billingLines || null },
        items: invoice.items, paymentSchedule: invoice.paymentSchedule,
        subtotal: invoice.subtotal, discountType: invoice.discountType,
        discountValue: invoice.discountValue, discountAmount: invoice.discountAmount,
        taxRate: invoice.taxRate, taxAmount: invoice.taxAmount, shippingAmount: invoice.shippingAmount,
        total: invoice.total, amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue,
        notes: invoice.notes, termsConditions: invoice.termsConditions,
        createdBy: { name: invoice.createdBy?.name }, company: companySettings,
      });
    } catch (error) {
      console.error('GET /view-invoice/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/view-invoice/:id/pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, select: { id: true, invoiceNumber: true, pdfS3Key: true, isDeleted: true } });
      if (!invoice || invoice.isDeleted) return res.status(404).json({ error: 'Invoice not found' });
      if (!invoice.pdfS3Key) return res.status(404).json({ error: 'PDF not available' });
      const pdfUrl = await getPDFSignedUrl(invoice.pdfS3Key, `${invoice.invoiceNumber}.pdf`);
      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /view-invoice/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Payment notification (offline/manual) ──────────────────────────────────

  router.post('/notify-payment/:id', async (req, res) => {
    try {
      const { amount, paymentMethod, referenceNumber, notes, scheduleItemId } = req.body;
      if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: 'Valid amount is required' });
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        select: { id: true, invoiceNumber: true, status: true, balanceDue: true, customerId: true, isDeleted: true }
      });
      if (!invoice || invoice.isDeleted) return res.status(404).json({ error: 'Invoice not found' });
      if (invoice.status === 'VOID') return res.status(400).json({ error: 'Cannot pay a voided invoice' });
      if (invoice.status === 'PAID') return res.status(400).json({ error: 'Invoice is already paid in full' });
      const parsedAmount = parseFloat(amount);
      if (parsedAmount > invoice.balanceDue + 0.01) {
        return res.status(400).json({ error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}` });
      }
      const settings = await prisma.invoicingSettings.findFirst();
      const paymentNumber = `${settings?.paymentPrefix || 'PAY'}-${new Date().getFullYear()}-${String(settings?.nextPaymentNumber || 1).padStart(5, '0')}`;
      const payment = await prisma.payment.create({
        data: {
          paymentNumber, customerId: invoice.customerId, invoiceId: invoice.id,
          scheduleItemId: scheduleItemId || null, amount: parsedAmount, paymentDate: new Date(),
          paymentMethod: paymentMethod || 'OTHER', referenceNumber: referenceNumber || null,
          checkNumber: paymentMethod === 'CHECK' ? referenceNumber || null : null,
          wireReference: paymentMethod === 'WIRE'  ? referenceNumber || null : null,
          status: 'PENDING', notes: notes || 'Payment submitted online by customer — awaiting confirmation',
        }
      });
      if (settings) {
        await prisma.invoicingSettings.update({ where: { id: settings.id }, data: { nextPaymentNumber: { increment: 1 } } });
      }
      try {
        await prisma.customerActivityLog.create({
          data: {
            customerId: invoice.customerId, invoiceId: invoice.id, paymentId: payment.id,
            type: 'payment_notification',
            description: `Customer submitted payment notification for $${parsedAmount.toFixed(2)} via ${paymentMethod || 'OTHER'} on invoice ${invoice.invoiceNumber}`,
            actorName: 'Customer (online)',
          }
        });
      } catch (_) {}
      res.json({ success: true, paymentNumber, message: 'Payment notification received. Our team will confirm receipt shortly.' });
    } catch (error) {
      console.error('POST /notify-payment/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Customer portal ─────────────────────────────────────────────────────────

  router.get('/portal/:token', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: { portalToken: req.params.token, isDeleted: false },
        select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true, email: true }
      });
      if (!customer) return res.status(404).json({ error: 'Invalid portal access' });
      res.json({ customer, message: 'Portal access verified' });
    } catch (error) {
      console.error('GET /portal/:token error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/portal/:token/estimates', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({ where: { portalToken: req.params.token, isDeleted: false } });
      if (!customer) return res.status(404).json({ error: 'Invalid portal access' });
      const estimates = await prisma.estimate.findMany({
        where: { customerId: customer.id, isDeleted: false },
        select: { id: true, estimateNumber: true, version: true, status: true, estimateDate: true, expiryDate: true, total: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(estimates);
    } catch (error) {
      console.error('GET /portal/:token/estimates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/portal/:token/invoices', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({ where: { portalToken: req.params.token, isDeleted: false } });
      if (!customer) return res.status(404).json({ error: 'Invalid portal access' });
      const invoices = await prisma.invoice.findMany({
        where: { customerId: customer.id, isDeleted: false },
        select: { id: true, invoiceNumber: true, status: true, invoiceDate: true, dueDate: true, total: true, amountPaid: true, balanceDue: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(invoices);
    } catch (error) {
      console.error('GET /portal/:token/invoices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── NexNP customer-facing payment (Tokenizer, PCI SAQ-A) ───────────────────
  //
  // Accepts a short-lived Tokenizer token — NOT raw card data.
  // The Tokenizer iframe runs on NexNP's PCI-compliant servers.
  // Raw card/ACH data never passes through this server.

  router.post('/pay/invoice/:id/nextnp', async (req, res) => {
    try {
      const { token, amount, scheduleItemId, idempotencyKey, billingAddress } = req.body;

      if (!token)  return res.status(400).json({ error: 'token is required' });
      if (!amount) return res.status(400).json({ error: 'amount is required' });

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { customer: true }
      });

      if (!invoice || invoice.isDeleted) return res.status(404).json({ error: 'Invoice not found' });
      if (invoice.status === 'VOID') return res.status(400).json({ error: 'Cannot pay a voided invoice' });
      if (invoice.status === 'PAID') return res.status(400).json({ error: 'Invoice is already paid in full' });
      if (parsedAmount > invoice.balanceDue + 0.01) {
        return res.status(400).json({ error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}` });
      }

      const chargeResult = await chargeWithToken({
        token,
        amount:         parsedAmount,
        invoiceNumber:  invoice.invoiceNumber,
        description:    `Payment for Invoice ${invoice.invoiceNumber}`,
        email:          invoice.customer?.email,
        idempotencyKey: idempotencyKey || generateIdempotencyKey(),
        billingAddress,
      });

      const isACH    = chargeResult.paymentMethod === 'ach';
      const dbStatus = isACH ? 'PROCESSING' : 'COMPLETED';
      // Card: mark COMPLETED immediately — authorization is real-time confirmation
      // ACH:  mark PROCESSING — settlement confirmed later via webhook

      const paymentNumber = await generatePaymentNumber(prisma);
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          customerId:          invoice.customerId,
          invoiceId:           invoice.id,
          scheduleItemId:      scheduleItemId || null,
          amount:              parsedAmount,
          paymentMethod:       isACH ? 'ACH' : 'CREDIT_CARD',
          nextnpTransactionId: chargeResult.transactionId,
          referenceNumber:     chargeResult.transactionId,
          last4:               chargeResult.last4    || null,
          cardBrand:           chargeResult.cardType || null,
          notes:               `Customer online payment via NexNP Tokenizer. TxID: ${chargeResult.transactionId}${isACH ? ' [ACH — pending settlement]' : ''}`,
          status:              dbStatus,
          paymentDate:         new Date(),
        }
      });

      let newAmountPaid = invoice.amountPaid;
      let newBalanceDue = invoice.balanceDue;
      let newStatus     = invoice.status;
      let depositPaid   = invoice.depositPaid;

      if (!isACH) {
        // Update invoice balance immediately for card payments
        newAmountPaid = invoice.amountPaid + parsedAmount;
        newBalanceDue = Math.max(0, invoice.total - newAmountPaid);
        newStatus     = newBalanceDue <= 0 ? 'PAID' : (newAmountPaid > 0 ? 'PARTIAL' : invoice.status);
        if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) depositPaid = true;
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus, depositPaid }
        });
      }
      // For ACH: invoice balance is updated when webhook confirms settlement

      if (scheduleItemId && !isACH) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: scheduleItemId },
          data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id }
        });
      }

      // Auto-create order if deposit now paid (card only)
      if (!isACH && depositPaid && !invoice.convertedToOrder) {
        try {
          const { createOrderFromInvoice, shouldCreateOrder } = await import('../services/orderCreationService.js');
          const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
          if (shouldCreateOrder(updatedInvoice)) {
            await createOrderFromInvoice(prisma, { invoiceId: invoice.id, paymentId: payment.id });
          }
        } catch (orderError) {
          console.error('[PUBLIC PAY] Order creation error:', orderError);
        }
      }

      // Activity log
      try {
        const custName = invoice.customer
          ? `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim()
          : 'Customer (online)';
        await prisma.customerActivityLog.create({
          data: {
            customerId: invoice.customerId, invoiceId: invoice.id, paymentId: payment.id,
            type: isACH ? 'payment_notification' : 'paid',
            description: `${custName} paid $${parsedAmount.toFixed(2)} via ${isACH ? 'ACH (pending settlement)' : 'credit card'} online. TxID: ${chargeResult.transactionId}`,
            actorName: custName,
          }
        });
      } catch (_) {}

      res.json({
        success:       true,
        transactionId: chargeResult.transactionId,
        paymentNumber,
        paymentMethod: chargeResult.paymentMethod,
        amountPaid:    parsedAmount,
        isACH,
        newStatus:     isACH ? invoice.status : newStatus,
        newBalanceDue: isACH ? invoice.balanceDue : newBalanceDue,
        message:       isACH
          ? 'ACH payment submitted. Funds will be confirmed within 1\u20133 business days.'
          : 'Payment successful.',
      });
    } catch (error) {
      console.error('POST /pay/invoice/:id/nextnp error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // NOTE: The NexNP webhook handler is mounted directly in index.js BEFORE
  // express.json() so it receives the raw body needed for HMAC verification.
  // See: api/src/routes/nextnpWebhook.js

  return router;
}

export default createPublicInvoicingRouter;
