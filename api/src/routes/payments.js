/**
 * Payment Routes
 * Manual payments, NexNP gateway (card + ACH), refunds
 */

import express from 'express';
import { invoicingAuth } from '../middleware/invoicingAuth.js';
import { generatePaymentNumber } from '../utils/numberGenerators.js';
import { chargeCard, chargeACH, refundTransaction } from '../services/nextnpService.js';

export function createPaymentsRouter(prisma) {
  const router = express.Router();

  // ============================================
  // PAYMENT LISTING
  // ============================================

  // GET /invoice/:invoiceId - List payments for an invoice
  router.get('/invoice/:invoiceId', invoicingAuth, async (req, res) => {
    try {
      const payments = await prisma.payment.findMany({
        where: {
          invoiceId: req.params.invoiceId
        },
        include: {
          customer: {
            select: {
              id: true,
              customerNumber: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true
            }
          },
          scheduleItem: {
            select: {
              id: true,
              description: true,
              percentage: true,
              amount: true
            }
          },
          recordedBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { paymentDate: 'desc' }
      });

      res.json(payments);
    } catch (error) {
      console.error('GET /payments/invoice/:invoiceId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:id - Get single payment
  router.get('/:id', invoicingAuth, async (req, res) => {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              id: true,
              customerNumber: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true,
              email: true
            }
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              balanceDue: true,
              status: true
            }
          },
          scheduleItem: true,
          recordedBy: {
            select: { id: true, name: true }
          }
        }
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json(payment);
    } catch (error) {
      console.error('GET /payments/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // MANUAL PAYMENT RECORDING
  // ============================================

  // POST /manual - Record a manual payment (check, cash, wire)
  router.post('/manual', invoicingAuth, async (req, res) => {
    try {
      const {
        invoiceId,
        scheduleItemId,
        amount,
        paymentMethod, // CHECK, CASH, WIRE, OTHER
        referenceNumber,
        checkNumber,
        bankName,
        notes,
        paymentDate
      } = req.body;

      if (!invoiceId || !amount || !paymentMethod) {
        return res.status(400).json({
          error: 'invoiceId, amount, and paymentMethod are required'
        });
      }

      const validMethods = ['CHECK', 'CASH', 'WIRE', 'OTHER'];
      if (!validMethods.includes(paymentMethod)) {
        return res.status(400).json({
          error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}`
        });
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'VOID') {
        return res.status(400).json({ error: 'Cannot record payment on voided invoice' });
      }

      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
      }

      if (amount > invoice.balanceDue) {
        return res.status(400).json({
          error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}`
        });
      }

      const paymentNumber = await generatePaymentNumber(prisma);

      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          scheduleItemId: scheduleItemId || null,
          amount: parseFloat(amount),
          paymentMethod,
          referenceNumber: referenceNumber || null,
          checkNumber: checkNumber || null,
          bankName: bankName || null,
          notes: notes || null,
          status: 'COMPLETED',
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          recordedById: req.user.id
        }
      });

      const newAmountPaid = invoice.amountPaid + payment.amount;
      const newBalanceDue = invoice.total - newAmountPaid;

      let newStatus = invoice.status;
      if (newBalanceDue <= 0) {
        newStatus = 'PAID';
      } else if (newAmountPaid > 0 && invoice.status !== 'PARTIAL') {
        newStatus = 'PARTIAL';
      }

      let depositPaid = invoice.depositPaid;
      if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) {
        depositPaid = true;
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus, depositPaid }
      });

      if (scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: scheduleItemId },
          data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id }
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
            console.log(`[PAYMENT] Auto-created order ${orderCreated} from invoice ${invoice.id}`);
          }
        } catch (orderError) {
          console.error('[PAYMENT] Auto order creation error:', orderError);
        }
      }

      const completePayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, company: true, companyName: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true, status: true } },
          recordedBy: { select: { id: true, name: true } }
        }
      });

      res.status(201).json({ ...completePayment, orderCreated });
    } catch (error) {
      console.error('POST /payments/manual error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // NEXTNP GATEWAY — CREDIT CARD
  // ============================================

  // POST /nextnp/charge-card - Charge a credit card via NexNP
  router.post('/nextnp/charge-card', invoicingAuth, async (req, res) => {
    try {
      const {
        invoiceId,
        scheduleItemId,
        amount,
        cardNumber,
        expirationDate,
        cvc,
        billingAddress
      } = req.body;

      if (!invoiceId || !amount || !cardNumber || !expirationDate || !cvc) {
        return res.status(400).json({
          error: 'invoiceId, amount, cardNumber, expirationDate, and cvc are required'
        });
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true }
      });

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (invoice.status === 'VOID') return res.status(400).json({ error: 'Cannot pay voided invoice' });
      if (parseFloat(amount) > invoice.balanceDue) {
        return res.status(400).json({ error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}` });
      }

      // Charge via NexNP
      const chargeResult = await chargeCard({
        amount: parseFloat(amount),
        cardNumber,
        expirationDate,
        cvc,
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        email: invoice.customer?.email,
        billingAddress
      });

      // Record payment in DB
      const paymentNumber = await generatePaymentNumber(prisma);
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          scheduleItemId: scheduleItemId || null,
          amount: parseFloat(amount),
          paymentMethod: 'CREDIT_CARD',
          referenceNumber: chargeResult.transactionId,
          notes: `NexNP transaction ID: ${chargeResult.transactionId}`,
          status: 'COMPLETED',
          paymentDate: new Date(),
          recordedById: req.user.id,
          nextnpTransactionId: chargeResult.transactionId
        }
      });

      // Update invoice balances
      const newAmountPaid = invoice.amountPaid + payment.amount;
      const newBalanceDue = invoice.total - newAmountPaid;
      let newStatus = newBalanceDue <= 0 ? 'PAID' : (newAmountPaid > 0 ? 'PARTIAL' : invoice.status);

      let depositPaid = invoice.depositPaid;
      if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) depositPaid = true;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus, depositPaid }
      });

      if (scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: scheduleItemId },
          data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id }
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

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        select: { id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true, status: true }
      });

      res.status(201).json({
        success: true,
        transactionId: chargeResult.transactionId,
        payment,
        invoice: updatedInvoice,
        orderCreated
      });
    } catch (error) {
      console.error('POST /payments/nextnp/charge-card error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // NEXTNP GATEWAY — ACH
  // ============================================

  // POST /nextnp/charge-ach - Charge via ACH bank transfer
  router.post('/nextnp/charge-ach', invoicingAuth, async (req, res) => {
    try {
      const {
        invoiceId,
        scheduleItemId,
        amount,
        routingNumber,
        accountNumber,
        accountType,
        secCode
      } = req.body;

      if (!invoiceId || !amount || !routingNumber || !accountNumber || !accountType) {
        return res.status(400).json({
          error: 'invoiceId, amount, routingNumber, accountNumber, and accountType are required'
        });
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true }
      });

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (invoice.status === 'VOID') return res.status(400).json({ error: 'Cannot pay voided invoice' });
      if (parseFloat(amount) > invoice.balanceDue) {
        return res.status(400).json({ error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}` });
      }

      // Charge via NexNP ACH
      const chargeResult = await chargeACH({
        amount: parseFloat(amount),
        routingNumber,
        accountNumber,
        accountType,
        secCode: secCode || 'web',
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        description: `ACH Payment for Invoice ${invoice.invoiceNumber}`,
        email: invoice.customer?.email
      });

      // Record payment in DB
      const paymentNumber = await generatePaymentNumber(prisma);
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          scheduleItemId: scheduleItemId || null,
          amount: parseFloat(amount),
          paymentMethod: 'ACH',
          referenceNumber: chargeResult.transactionId,
          notes: `NexNP ACH transaction ID: ${chargeResult.transactionId}`,
          status: 'COMPLETED',
          paymentDate: new Date(),
          recordedById: req.user.id,
          nextnpTransactionId: chargeResult.transactionId
        }
      });

      const newAmountPaid = invoice.amountPaid + payment.amount;
      const newBalanceDue = invoice.total - newAmountPaid;
      let newStatus = newBalanceDue <= 0 ? 'PAID' : (newAmountPaid > 0 ? 'PARTIAL' : invoice.status);

      let depositPaid = invoice.depositPaid;
      if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) depositPaid = true;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus, depositPaid }
      });

      if (scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: scheduleItemId },
          data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id }
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

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        select: { id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true, status: true }
      });

      res.status(201).json({
        success: true,
        transactionId: chargeResult.transactionId,
        payment,
        invoice: updatedInvoice,
        orderCreated
      });
    } catch (error) {
      console.error('POST /payments/nextnp/charge-ach error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // REFUNDS
  // ============================================

  // POST /:id/refund - Refund a payment
  router.post('/:id/refund', invoicingAuth, async (req, res) => {
    try {
      const { amount, reason } = req.body;

      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: { invoice: true }
      });

      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      if (payment.status === 'REFUNDED') return res.status(400).json({ error: 'Payment already refunded' });
      if (payment.status !== 'COMPLETED') return res.status(400).json({ error: 'Can only refund completed payments' });

      const refundAmount = amount ? parseFloat(amount) : payment.amount;

      if (refundAmount > payment.amount) {
        return res.status(400).json({ error: `Refund amount cannot exceed payment of $${payment.amount.toFixed(2)}` });
      }

      // NexNP refund for card/ACH payments
      if (payment.nextnpTransactionId) {
        await refundTransaction(
          payment.nextnpTransactionId,
          refundAmount < payment.amount ? refundAmount : undefined
        );
      }
      // else: manual payment — just update status

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          refundedAmount: refundAmount,
          refundedAt: new Date(),
          refundReason: reason || 'Refund requested'
        }
      });

      // Update invoice
      if (payment.invoice) {
        const newAmountPaid = Math.max(0, payment.invoice.amountPaid - refundAmount);
        const newBalanceDue = payment.invoice.total - newAmountPaid;
        let newStatus = payment.invoice.status;
        if (newBalanceDue > 0 && newAmountPaid > 0) newStatus = 'PARTIAL';
        else if (newBalanceDue > 0 && newAmountPaid <= 0) newStatus = 'SENT';

        await prisma.invoice.update({
          where: { id: payment.invoice.id },
          data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus }
        });
      }

      if (payment.scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: payment.scheduleItemId },
          data: { status: 'PENDING', paidAt: null, paymentId: null }
        });
      }

      const updatedPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: {
          invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true, status: true } }
        }
      });

      res.json(updatedPayment);
    } catch (error) {
      console.error('POST /payments/:id/refund error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PAYMENT HISTORY
  // ============================================

  // GET / - List all payments (with filters)
  router.get('/', invoicingAuth, async (req, res) => {
    try {
      const { customerId, status, method, startDate, endDate, limit = 50 } = req.query;

      const where = {};
      if (customerId) where.customerId = customerId;
      if (status) where.status = status;
      if (method) where.paymentMethod = method;
      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = new Date(startDate);
        if (endDate) where.paymentDate.lte = new Date(endDate);
      }

      const payments = await prisma.payment.findMany({
        where,
        include: {
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          recordedBy: { select: { id: true, name: true } }
        },
        orderBy: { paymentDate: 'desc' },
        take: parseInt(limit)
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
