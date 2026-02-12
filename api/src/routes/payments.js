/**
 * Payment Routes
 * Manual payments, Stripe integration, webhooks, refunds
 */

import express from 'express';
import { invoicingAuth } from '../middleware/invoicingAuth.js';
import { generatePaymentNumber } from '../utils/numberGenerators.js';
import {
  createPaymentIntent,
  createACHPaymentIntent,
  getPaymentIntent,
  processRefund,
  verifyWebhookSignature,
  handleWebhookEvent,
  getOrCreateStripeCustomer
} from '../services/stripeService.js';

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

      // Validate payment method
      const validMethods = ['CHECK', 'CASH', 'WIRE', 'OTHER'];
      if (!validMethods.includes(paymentMethod)) {
        return res.status(400).json({
          error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}`
        });
      }

      // Get invoice
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

      // Validate amount
      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
      }

      if (amount > invoice.balanceDue) {
        return res.status(400).json({
          error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}`
        });
      }

      // Generate payment number
      const paymentNumber = await generatePaymentNumber(prisma);

      // Create payment record
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

      // Update invoice
      const newAmountPaid = invoice.amountPaid + payment.amount;
      const newBalanceDue = invoice.total - newAmountPaid;

      let newStatus = invoice.status;
      if (newBalanceDue <= 0) {
        newStatus = 'PAID';
      } else if (newAmountPaid > 0 && invoice.status !== 'PARTIAL') {
        newStatus = 'PARTIAL';
      }

      // Check deposit status
      let depositPaid = invoice.depositPaid;
      if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) {
        depositPaid = true;
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          status: newStatus,
          depositPaid
        }
      });

      // Update payment schedule item if specified
      if (scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: scheduleItemId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            paymentId: payment.id
          }
        });
      }

      // Auto-create order if deposit paid and not already converted
      let orderCreated = null;
      if (depositPaid && !invoice.convertedToOrder) {
        try {
          const { createOrderFromInvoice, shouldCreateOrder } = await import('../services/orderCreationService.js');

          // Get fresh invoice with updated depositPaid
          const updatedInvoice = await prisma.invoice.findUnique({
            where: { id: invoice.id }
          });

          if (shouldCreateOrder(updatedInvoice)) {
            const result = await createOrderFromInvoice(prisma, {
              invoiceId: invoice.id,
              paymentId: payment.id
            });
            orderCreated = result.order?.id || result.orderId;
            console.log(`[PAYMENT] Auto-created order ${orderCreated} from invoice ${invoice.id}`);
          }
        } catch (orderError) {
          console.error('[PAYMENT] Auto order creation error:', orderError);
          // Don't fail payment recording if order creation fails
        }
      }

      // Return complete payment with relations
      const completePayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true
            }
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              amountPaid: true,
              balanceDue: true,
              status: true
            }
          },
          recordedBy: {
            select: { id: true, name: true }
          }
        }
      });

      res.status(201).json({
        ...completePayment,
        orderCreated
      });
    } catch (error) {
      console.error('POST /payments/manual error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // STRIPE PAYMENT INTENTS
  // ============================================

  // POST /stripe/create-intent - Create Stripe PaymentIntent for credit card
  router.post('/stripe/create-intent', invoicingAuth, async (req, res) => {
    try {
      const { invoiceId, scheduleItemId, amount } = req.body;

      if (!invoiceId || !amount) {
        return res.status(400).json({ error: 'invoiceId and amount are required' });
      }

      // Get invoice with customer
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'VOID') {
        return res.status(400).json({ error: 'Cannot pay voided invoice' });
      }

      if (amount > invoice.balanceDue) {
        return res.status(400).json({
          error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}`
        });
      }

      // Get or create Stripe customer
      let stripeCustomerId = invoice.customer.stripeCustomerId;
      if (!stripeCustomerId && invoice.customer) {
        const stripeCustomer = await getOrCreateStripeCustomer(invoice.customer);
        stripeCustomerId = stripeCustomer.id;

        // Save Stripe customer ID
        await prisma.customer.update({
          where: { id: invoice.customer.id },
          data: { stripeCustomerId }
        });
      }

      // Create PaymentIntent
      const paymentIntent = await createPaymentIntent({
        amount: parseFloat(amount),
        customerId: invoice.customerId,
        customerEmail: invoice.customer?.email,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        scheduleItemId,
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        metadata: {
          stripeCustomerId,
          customerId: invoice.customerId
        }
      });

      res.json(paymentIntent);
    } catch (error) {
      console.error('POST /payments/stripe/create-intent error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /stripe/create-ach - Create Stripe ACH PaymentIntent
  router.post('/stripe/create-ach', invoicingAuth, async (req, res) => {
    try {
      const { invoiceId, scheduleItemId, amount } = req.body;

      if (!invoiceId || !amount) {
        return res.status(400).json({ error: 'invoiceId and amount are required' });
      }

      // Get invoice with customer
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'VOID') {
        return res.status(400).json({ error: 'Cannot pay voided invoice' });
      }

      if (amount > invoice.balanceDue) {
        return res.status(400).json({
          error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}`
        });
      }

      // Get or create Stripe customer
      let stripeCustomerId = invoice.customer.stripeCustomerId;
      if (!stripeCustomerId && invoice.customer) {
        const stripeCustomer = await getOrCreateStripeCustomer(invoice.customer);
        stripeCustomerId = stripeCustomer.id;

        // Save Stripe customer ID
        await prisma.customer.update({
          where: { id: invoice.customer.id },
          data: { stripeCustomerId }
        });
      }

      const customerName = invoice.customer
        ? `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim()
        : 'Customer';

      // Create ACH PaymentIntent
      const paymentIntent = await createACHPaymentIntent({
        amount: parseFloat(amount),
        customerId: invoice.customerId,
        customerEmail: invoice.customer?.email,
        customerName,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        scheduleItemId,
        metadata: {
          stripeCustomerId,
          customerId: invoice.customerId
        }
      });

      res.json(paymentIntent);
    } catch (error) {
      console.error('POST /payments/stripe/create-ach error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /stripe/intent/:id - Get PaymentIntent status
  router.get('/stripe/intent/:id', invoicingAuth, async (req, res) => {
    try {
      const paymentIntent = await getPaymentIntent(req.params.id);
      res.json({
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata
      });
    } catch (error) {
      console.error('GET /payments/stripe/intent/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // STRIPE WEBHOOK
  // ============================================

  // POST /webhook - Stripe webhook handler
  // Note: This route should NOT use invoicingAuth - webhooks come from Stripe
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    try {
      const event = verifyWebhookSignature(req.body, signature);
      const result = await handleWebhookEvent(event, prisma);

      console.log('Webhook processed:', result);
      res.json({ received: true, ...result });
    } catch (error) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // REFUNDS
  // ============================================

  // POST /:id/refund - Process a refund
  router.post('/:id/refund', invoicingAuth, async (req, res) => {
    try {
      const { amount, reason } = req.body;

      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: { invoice: true }
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      if (payment.status === 'REFUNDED') {
        return res.status(400).json({ error: 'Payment already refunded' });
      }

      if (payment.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'Can only refund completed payments' });
      }

      const refundAmount = amount ? parseFloat(amount) : payment.amount;

      if (refundAmount > payment.amount) {
        return res.status(400).json({
          error: `Refund amount cannot exceed payment amount of $${payment.amount.toFixed(2)}`
        });
      }

      // Handle Stripe refund
      if (payment.stripePaymentIntentId || payment.stripeChargeId) {
        const refundResult = await processRefund({
          paymentIntentId: payment.stripePaymentIntentId,
          chargeId: payment.stripeChargeId,
          amount: refundAmount,
          reason: reason || 'requested_by_customer',
          metadata: {
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            refundedBy: req.user.id
          }
        });

        // Update payment record
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUNDED',
            refundedAmount: refundAmount,
            refundedAt: new Date(),
            refundReason: reason || 'requested_by_customer',
            stripeRefundId: refundResult.refundId
          }
        });
      } else {
        // Manual payment refund - just update status
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUNDED',
            refundedAmount: refundAmount,
            refundedAt: new Date(),
            refundReason: reason || 'Manual refund'
          }
        });
      }

      // Update invoice
      if (payment.invoice) {
        const newAmountPaid = payment.invoice.amountPaid - refundAmount;
        const newBalanceDue = payment.invoice.total - newAmountPaid;

        let newStatus = payment.invoice.status;
        if (newBalanceDue > 0 && newAmountPaid > 0) {
          newStatus = 'PARTIAL';
        } else if (newBalanceDue > 0 && newAmountPaid <= 0) {
          newStatus = 'SENT';
        }

        await prisma.invoice.update({
          where: { id: payment.invoice.id },
          data: {
            amountPaid: Math.max(0, newAmountPaid),
            balanceDue: newBalanceDue,
            status: newStatus
          }
        });
      }

      // Update payment schedule item if linked
      if (payment.scheduleItemId) {
        await prisma.invoicePaymentSchedule.update({
          where: { id: payment.scheduleItemId },
          data: {
            status: 'PENDING',
            paidAt: null,
            paymentId: null
          }
        });
      }

      // Return updated payment
      const updatedPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              amountPaid: true,
              balanceDue: true,
              status: true
            }
          }
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

      if (customerId) {
        where.customerId = customerId;
      }

      if (status) {
        where.status = status;
      }

      if (method) {
        where.paymentMethod = method;
      }

      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) {
          where.paymentDate.gte = new Date(startDate);
        }
        if (endDate) {
          where.paymentDate.lte = new Date(endDate);
        }
      }

      const payments = await prisma.payment.findMany({
        where,
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
          invoice: {
            select: {
              id: true,
              invoiceNumber: true
            }
          },
          recordedBy: {
            select: { id: true, name: true }
          }
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
