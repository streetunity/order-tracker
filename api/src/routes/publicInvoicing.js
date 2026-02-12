/**
 * Public routes for invoicing system
 * These routes do not require authentication
 * - Email tracking pixels
 * - Public estimate viewing
 * - Customer portal entry
 */

import express from 'express';
import { trackEmailOpen, trackInvoiceEmailOpen } from '../services/emailService.js';
import { getPDFSignedUrl } from '../services/pdfService.js';
import {
  createPaymentIntent,
  createACHPaymentIntent,
  getOrCreateStripeCustomer
} from '../services/stripeService.js';

export function createPublicInvoicingRouter(prisma) {
  const router = express.Router();

  // 1x1 transparent GIF for email tracking
  const TRACKING_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  // ============================================
  // EMAIL TRACKING
  // ============================================

  // GET /track/estimate/:id/open - Email open tracking pixel
  router.get('/track/estimate/:id/open', async (req, res) => {
    try {
      await trackEmailOpen(prisma, req.params.id);
    } catch (err) {
      console.error('Email tracking error:', err);
    }

    // Always return the tracking pixel regardless of success
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.send(TRACKING_PIXEL);
  });

  // ============================================
  // PUBLIC ESTIMATE VIEWING
  // ============================================

  // GET /view-estimate/:id - Public estimate view (increments view count)
  router.get('/view-estimate/:id', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true,
              email: true,
              phone: true
            }
          },
          items: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              quantity: true,
              unitPrice: true,
              amount: true,
              taxable: true,
              fromBundleName: true
            }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      if (estimate.isDeleted) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Update view tracking
      if (estimate.status === 'SENT') {
        await prisma.estimate.update({
          where: { id: estimate.id },
          data: {
            status: 'VIEWED',
            lastViewedAt: new Date(),
            viewCount: { increment: 1 }
          }
        });
      } else {
        await prisma.estimate.update({
          where: { id: estimate.id },
          data: {
            lastViewedAt: new Date(),
            viewCount: { increment: 1 }
          }
        });
      }

      // Get company settings for branding
      const companySettings = await prisma.invoicingSettings.findFirst({
        select: {
          companyName: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          phone: true,
          email: true,
          website: true
        }
      });

      // Return public-safe estimate data (no internal notes, costs, margins)
      res.json({
        id: estimate.id,
        estimateNumber: estimate.estimateNumber,
        version: estimate.version,
        status: estimate.status,
        estimateDate: estimate.estimateDate,
        expiryDate: estimate.expiryDate,
        customer: estimate.customer,
        items: estimate.items,
        subtotal: estimate.subtotal,
        discountType: estimate.discountType,
        discountValue: estimate.discountValue,
        discountAmount: estimate.discountAmount,
        taxRate: estimate.taxRate,
        taxAmount: estimate.taxAmount,
        shippingAmount: estimate.shippingAmount,
        total: estimate.total,
        notes: estimate.notes,
        termsConditions: estimate.termsConditions,
        createdBy: {
          name: estimate.createdBy?.name
        },
        company: companySettings,
        // Signature status
        isSigned: !!estimate.signatureId,
        signedAt: estimate.signatureId ? estimate.updatedAt : null
      });
    } catch (error) {
      console.error('GET /view-estimate/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /view-estimate/:id/pdf - Get PDF download URL
  router.get('/view-estimate/:id/pdf', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          estimateNumber: true,
          pdfS3Key: true,
          isDeleted: true
        }
      });

      if (!estimate || estimate.isDeleted) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      if (!estimate.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not available' });
      }

      const pdfUrl = await getPDFSignedUrl(estimate.pdfS3Key, `${estimate.estimateNumber}.pdf`);

      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /view-estimate/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // INVOICE EMAIL TRACKING
  // ============================================

  // GET /track/invoice/:id/open - Invoice email open tracking pixel
  router.get('/track/invoice/:id/open', async (req, res) => {
    try {
      await trackInvoiceEmailOpen(prisma, req.params.id);
    } catch (err) {
      console.error('Invoice email tracking error:', err);
    }

    // Always return the tracking pixel regardless of success
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.send(TRACKING_PIXEL);
  });

  // ============================================
  // PUBLIC INVOICE VIEWING
  // ============================================

  // GET /view-invoice/:id - Public invoice view (increments view count)
  router.get('/view-invoice/:id', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              companyName: true,
              email: true,
              phone: true,
              billingAddress: true,
              address: true
            }
          },
          items: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              quantity: true,
              unitPrice: true,
              amount: true,
              taxable: true
            }
          },
          paymentSchedule: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              description: true,
              percentage: true,
              amount: true,
              dueDate: true,
              status: true
            }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.isDeleted) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Update view tracking
      if (invoice.status === 'SENT') {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'VIEWED',
            lastViewedAt: new Date(),
            viewCount: { increment: 1 }
          }
        });
      } else {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            lastViewedAt: new Date(),
            viewCount: { increment: 1 }
          }
        });
      }

      // Get company settings for branding
      const companySettings = await prisma.invoicingSettings.findFirst({
        select: {
          companyName: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          phone: true,
          email: true,
          website: true
        }
      });

      // Return public-safe invoice data (no internal notes, costs, margins)
      res.json({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        paymentTerms: invoice.paymentTerms,
        customer: invoice.customer,
        items: invoice.items,
        paymentSchedule: invoice.paymentSchedule,
        subtotal: invoice.subtotal,
        discountType: invoice.discountType,
        discountValue: invoice.discountValue,
        discountAmount: invoice.discountAmount,
        taxRate: invoice.taxRate,
        taxAmount: invoice.taxAmount,
        shippingAmount: invoice.shippingAmount,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        balanceDue: invoice.balanceDue,
        notes: invoice.notes,
        termsConditions: invoice.termsConditions,
        createdBy: {
          name: invoice.createdBy?.name
        },
        company: companySettings
      });
    } catch (error) {
      console.error('GET /view-invoice/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /view-invoice/:id/pdf - Get invoice PDF download URL
  router.get('/view-invoice/:id/pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          invoiceNumber: true,
          pdfS3Key: true,
          isDeleted: true
        }
      });

      if (!invoice || invoice.isDeleted) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (!invoice.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not available' });
      }

      const pdfUrl = await getPDFSignedUrl(invoice.pdfS3Key, `${invoice.invoiceNumber}.pdf`);

      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /view-invoice/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CUSTOMER PORTAL
  // ============================================

  // GET /portal/:token - Customer portal entry
  router.get('/portal/:token', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false
        },
        select: {
          id: true,
          customerNumber: true,
          firstName: true,
          lastName: true,
          company: true,
          companyName: true,
          email: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      res.json({
        customer,
        message: 'Portal access verified'
      });
    } catch (error) {
      console.error('GET /portal/:token error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /portal/:token/estimates - Customer's estimates
  router.get('/portal/:token/estimates', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const estimates = await prisma.estimate.findMany({
        where: {
          customerId: customer.id,
          isDeleted: false
        },
        select: {
          id: true,
          estimateNumber: true,
          version: true,
          status: true,
          estimateDate: true,
          expiryDate: true,
          total: true,
          _count: {
            select: { items: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(estimates);
    } catch (error) {
      console.error('GET /portal/:token/estimates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /portal/:token/invoices - Customer's invoices
  router.get('/portal/:token/invoices', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const invoices = await prisma.invoice.findMany({
        where: {
          customerId: customer.id,
          isDeleted: false
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          invoiceDate: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          balanceDue: true,
          _count: {
            select: { items: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(invoices);
    } catch (error) {
      console.error('GET /portal/:token/invoices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PUBLIC PAYMENT (for customer payment page)
  // ============================================

  // POST /pay/invoice/:id/create-intent - Create Stripe PaymentIntent (public)
  router.post('/pay/invoice/:id/create-intent', async (req, res) => {
    try {
      const { amount, scheduleItemId } = req.body;

      if (!amount) {
        return res.status(400).json({ error: 'amount is required' });
      }

      // Get invoice with customer
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { customer: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.isDeleted) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'VOID') {
        return res.status(400).json({ error: 'Cannot pay voided invoice' });
      }

      if (invoice.status === 'PAID') {
        return res.status(400).json({ error: 'Invoice is already paid' });
      }

      if (amount > invoice.balanceDue) {
        return res.status(400).json({
          error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}`
        });
      }

      // Get or create Stripe customer
      let stripeCustomerId = invoice.customer?.stripeCustomerId;
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
          customerId: invoice.customerId,
          publicPayment: 'true'
        }
      });

      res.json(paymentIntent);
    } catch (error) {
      console.error('POST /pay/invoice/:id/create-intent error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /pay/invoice/:id/create-ach - Create Stripe ACH PaymentIntent (public)
  router.post('/pay/invoice/:id/create-ach', async (req, res) => {
    try {
      const { amount, scheduleItemId } = req.body;

      if (!amount) {
        return res.status(400).json({ error: 'amount is required' });
      }

      // Get invoice with customer
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { customer: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.isDeleted) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'VOID') {
        return res.status(400).json({ error: 'Cannot pay voided invoice' });
      }

      if (invoice.status === 'PAID') {
        return res.status(400).json({ error: 'Invoice is already paid' });
      }

      if (amount > invoice.balanceDue) {
        return res.status(400).json({
          error: `Amount exceeds balance due of $${invoice.balanceDue.toFixed(2)}`
        });
      }

      // Get or create Stripe customer
      let stripeCustomerId = invoice.customer?.stripeCustomerId;
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
          customerId: invoice.customerId,
          publicPayment: 'true'
        }
      });

      res.json(paymentIntent);
    } catch (error) {
      console.error('POST /pay/invoice/:id/create-ach error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createPublicInvoicingRouter;
