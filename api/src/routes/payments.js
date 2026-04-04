/**
 * Payment Routes
 * Manual payments (check, cash, wire) and refunds.
 *
 * Card/ACH gateway charging is customer-facing only, handled via the
 * NexNP Tokenizer on /pay/invoice/:id — raw card data never passes
 * through this server (PCI SAQ-A).
 */

import express from 'express';
import { invoicingAuth } from '../middleware/invoicingAuth.js';
import { generatePaymentNumber } from '../utils/numberGenerators.js';
import { refundTransaction } from '../services/nextnpService.js';

export function createPaymentsRouter(prisma) {
  const router = express.Router();

  // GET /invoice/:invoiceId — list payments for an invoice
  router.get('/invoice/:invoiceId', invoicingAuth, async (req, res) => {
    try {
      const payments = await prisma.payment.findMany({
        where: { invoiceId: req.params.invoiceId },
        include: {
          customer:     { select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true } },
          scheduleItem: { select: { id: true, description: true, percentage: true, amount: true } },
          recordedBy:   { select: { id: true, name: true } },
        },
        orderBy: { paymentDate: 'desc' },
      });
      res.json(payments);
    } catch (error) {
      console.error('GET /payments/invoice/:invoiceId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:id — single payment
  router.get('/:id', invoicingAuth, async (req, res) => {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: {
          customer:     { select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true, email: true } },
          invoice:      { select: { id: true, invoiceNumber: true, total: true, balanceDue: true, status: true } },
          scheduleItem: true,
          recordedBy:   { select: { id: true, name: true } },
        },
      });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      res.json(payment);
    } catch (error) {
      console.error('GET /payments/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /manual — record a manual payment (check, cash, wire, other)
  router.post('/manual', invoicingAuth, async (req, res) => {
    try {
      const { invoiceId, scheduleItemId, amount, paymentMethod, referenceNumber, checkNumber, bankName, notes, paymentDate } = req.body;

      if (!invoiceId || !amount || !paymentMethod) {
        return res.status(400).json({ error: 'invoiceId, amount, and paymentMethod are required' });
      }

      const validMethods = ['CHECK', 'CASH', 'WIRE', 'OTHER'];
      if (!validMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}` });
      }

      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
      if (!invoice || invoice.isDeleted) return res.status(404).json({ error: 'Invoice not found' });
      if (invoice.status === 'VOID') return res.status(400).json({ error: 'Cannot record payment on voided invoice' });
      if (invoice.status === 'PAID') return res.status(400).json({ error: 'Invoice is already paid in full' });
      if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });
      if (amount > invoice.balanceDue) {
        return res.status(400).json({ error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}` });
      }

      const paymentNumber = await generatePaymentNumber(prisma);
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          customerId:     invoice.customerId,
          invoiceId:      invoice.id,
          scheduleItemId: scheduleItemId || null,
          amount:         parseFloat(amount),
          paymentMethod,
          referenceNumber: referenceNumber || null,
          checkNumber:     checkNumber || null,
          bankName:        bankName    || null,
          notes:           notes       || null,
          status:          'COMPLETED',
          paymentDate:     paymentDate ? new Date(paymentDate) : new Date(),
          recordedById:    req.user.id,
        },
      });

      const newAmountPaid = invoice.amountPaid + payment.amount;
      const newBalanceDue = invoice.total - newAmountPaid;
      let newStatus = invoice.status;
      if (newBalanceDue <= 0) newStatus = 'PAID';
      else if (newAmountPaid > 0 && invoice.status !== 'PARTIAL') newStatus = 'PARTIAL';

      let depositPaid = invoice.depositPaid;
      if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) depositPaid = true;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus, depositPaid },
      });

      if (scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: scheduleItemId },
          data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id },
        });
      }

      let orderCreated = null;
      if (depositPaid && !invoice.convertedToOrder) {
        try {
          const { createOrderFromInvoice, shouldCreateOrder } = await import('../services/orderCreationService.js');
          const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
          if (shouldCreateOrder(updatedInvoice)) {
            const result = await createOrderFromInvoice(prisma, { invoiceId: invoice.id, paymentId: payment.id });
            orderCreated = result.order?.id || result.orderId;
          }
        } catch (orderError) {
          console.error('[PAYMENT] Auto order creation error:', orderError);
        }
      }

      const completePayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, company: true, companyName: true } },
          invoice:  { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true, status: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      });

      res.status(201).json({ ...completePayment, orderCreated });
    } catch (error) {
      console.error('POST /payments/manual error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /:id/refund — refund a payment
  router.post('/:id/refund', invoicingAuth, async (req, res) => {
    try {
      const { amount, reason } = req.body;
      const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { invoice: true } });

      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      if (payment.status === 'REFUNDED') return res.status(400).json({ error: 'Payment already refunded' });
      if (!['COMPLETED', 'PROCESSING'].includes(payment.status)) {
        return res.status(400).json({ error: 'Can only refund completed or processing payments' });
      }

      const refundAmount = amount ? parseFloat(amount) : payment.amount;
      if (refundAmount > payment.amount) {
        return res.status(400).json({ error: `Refund amount cannot exceed payment of $${payment.amount.toFixed(2)}` });
      }

      // Issue gateway refund for NexNP card/ACH payments (from customer-facing pay page)
      if (payment.nextnpTransactionId) {
        await refundTransaction(
          payment.nextnpTransactionId,
          refundAmount < payment.amount ? refundAmount : undefined,
        );
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAmount: refundAmount, refundedAt: new Date(), refundReason: reason || 'Refund requested' },
      });

      if (payment.invoice) {
        // Only reverse invoice balance if it was already applied (COMPLETED, not PROCESSING)
        if (payment.status === 'COMPLETED') {
          const newAmountPaid = Math.max(0, payment.invoice.amountPaid - refundAmount);
          const newBalanceDue = payment.invoice.total - newAmountPaid;
          let newStatus = payment.invoice.status;
          if (newBalanceDue > 0 && newAmountPaid > 0) newStatus = 'PARTIAL';
          else if (newBalanceDue > 0 && newAmountPaid <= 0) newStatus = 'SENT';
          await prisma.invoice.update({
            where: { id: payment.invoice.id },
            data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus },
          });
        }
      }

      if (payment.scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: payment.scheduleItemId },
          data: { status: 'PENDING', paidAt: null, paymentId: null },
        });
      }

      const updatedPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: { invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true, status: true } } },
      });
      res.json(updatedPayment);
    } catch (error) {
      console.error('POST /payments/:id/refund error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET / — list all payments with filters
  router.get('/', invoicingAuth, async (req, res) => {
    try {
      const { customerId, status, method, startDate, endDate, limit = 50 } = req.query;
      const where = {};
      if (customerId) where.customerId = customerId;
      if (status)     where.status = status;
      if (method)     where.paymentMethod = method;
      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = new Date(startDate);
        if (endDate)   where.paymentDate.lte = new Date(endDate);
      }
      const payments = await prisma.payment.findMany({
        where,
        include: {
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true } },
          invoice:  { select: { id: true, invoiceNumber: true } },
          recordedBy: { select: { id: true, name: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: parseInt(limit),
      });
      res.json(payments);
    } catch (error) {
      console.error('GET /payments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createPaymentsRouter;
