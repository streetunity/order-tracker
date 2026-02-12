/**
 * Customer Portal Routes
 * Token-based access for customers to view their estimates, invoices, and payments
 */

import express from 'express';
import crypto from 'crypto';
import { getPDFSignedUrl } from '../services/pdfService.js';

export function createCustomerPortalRouter(prisma) {
  const router = express.Router();

  // ============================================
  // PORTAL TOKEN VALIDATION
  // ============================================

  // GET /:token - Validate portal token and get customer info
  router.get('/:token', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        },
        select: {
          id: true,
          customerNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          company: true,
          companyName: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid or expired portal access' });
      }

      // Get summary counts
      const [estimateCount, invoiceCount, paymentCount] = await Promise.all([
        prisma.estimate.count({
          where: {
            customerId: customer.id,
            isDeleted: false,
            status: { in: ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'] }
          }
        }),
        prisma.invoice.count({
          where: {
            customerId: customer.id,
            isDeleted: false,
            status: { notIn: ['DRAFT', 'VOID'] }
          }
        }),
        prisma.payment.count({
          where: {
            customerId: customer.id,
            status: 'COMPLETED'
          }
        })
      ]);

      // Get outstanding balance
      const invoices = await prisma.invoice.findMany({
        where: {
          customerId: customer.id,
          isDeleted: false,
          status: { in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] }
        },
        select: {
          balanceDue: true
        }
      });

      const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);

      res.json({
        customer,
        summary: {
          estimateCount,
          invoiceCount,
          paymentCount,
          outstandingBalance
        }
      });
    } catch (error) {
      console.error('GET /portal/:token error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ESTIMATES
  // ============================================

  // GET /:token/estimates - List customer's estimates
  router.get('/:token/estimates', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const estimates = await prisma.estimate.findMany({
        where: {
          customerId: customer.id,
          isDeleted: false,
          status: { in: ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED'] }
        },
        select: {
          id: true,
          estimateNumber: true,
          version: true,
          status: true,
          estimateDate: true,
          expiryDate: true,
          total: true,
          signatureId: true,
          pdfS3Key: true,
          _count: {
            select: { items: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transform to include isSigned flag
      const transformed = estimates.map(est => ({
        ...est,
        isSigned: !!est.signatureId,
        itemCount: est._count.items,
        _count: undefined
      }));

      res.json(transformed);
    } catch (error) {
      console.error('GET /portal/:token/estimates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:token/estimates/:estimateId - Get estimate detail
  router.get('/:token/estimates/:estimateId', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const estimate = await prisma.estimate.findFirst({
        where: {
          id: req.params.estimateId,
          customerId: customer.id,
          isDeleted: false
        },
        include: {
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
          signature: {
            select: {
              id: true,
              signerName: true,
              signerTitle: true,
              signedAt: true,
              signatureType: true
            }
          },
          createdBy: {
            select: { name: true, email: true }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
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

      // Return customer-safe data
      res.json({
        id: estimate.id,
        estimateNumber: estimate.estimateNumber,
        version: estimate.version,
        status: estimate.status,
        estimateDate: estimate.estimateDate,
        expiryDate: estimate.expiryDate,
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
        isSigned: !!estimate.signatureId,
        signature: estimate.signature,
        pdfS3Key: estimate.pdfS3Key,
        createdBy: {
          name: estimate.createdBy?.name
        },
        company: companySettings
      });
    } catch (error) {
      console.error('GET /portal/:token/estimates/:estimateId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:token/estimates/:estimateId/pdf - Get estimate PDF URL
  router.get('/:token/estimates/:estimateId/pdf', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const estimate = await prisma.estimate.findFirst({
        where: {
          id: req.params.estimateId,
          customerId: customer.id,
          isDeleted: false
        },
        select: {
          id: true,
          estimateNumber: true,
          pdfS3Key: true,
          signedPdfS3Key: true
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Prefer signed PDF if available
      const pdfKey = estimate.signedPdfS3Key || estimate.pdfS3Key;

      if (!pdfKey) {
        return res.status(404).json({ error: 'PDF not available' });
      }

      const pdfUrl = await getPDFSignedUrl(pdfKey, `${estimate.estimateNumber}.pdf`);

      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /portal/:token/estimates/:estimateId/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // INVOICES
  // ============================================

  // GET /:token/invoices - List customer's invoices
  router.get('/:token/invoices', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const invoices = await prisma.invoice.findMany({
        where: {
          customerId: customer.id,
          isDeleted: false,
          status: { notIn: ['DRAFT', 'VOID'] }
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
          pdfS3Key: true,
          _count: {
            select: { items: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transform
      const transformed = invoices.map(inv => ({
        ...inv,
        itemCount: inv._count.items,
        _count: undefined,
        isOverdue: new Date(inv.dueDate) < new Date() && inv.balanceDue > 0
      }));

      res.json(transformed);
    } catch (error) {
      console.error('GET /portal/:token/invoices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:token/invoices/:invoiceId - Get invoice detail
  router.get('/:token/invoices/:invoiceId', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: req.params.invoiceId,
          customerId: customer.id,
          isDeleted: false
        },
        include: {
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
          payments: {
            where: { status: 'COMPLETED' },
            orderBy: { paymentDate: 'desc' },
            select: {
              id: true,
              paymentNumber: true,
              amount: true,
              paymentDate: true,
              paymentMethod: true,
              last4: true
            }
          },
          createdBy: {
            select: { name: true, email: true }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
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

      // Return customer-safe data
      res.json({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        paymentTerms: invoice.paymentTerms,
        items: invoice.items,
        paymentSchedule: invoice.paymentSchedule,
        payments: invoice.payments,
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
        pdfS3Key: invoice.pdfS3Key,
        isOverdue: new Date(invoice.dueDate) < new Date() && invoice.balanceDue > 0,
        createdBy: {
          name: invoice.createdBy?.name
        },
        company: companySettings
      });
    } catch (error) {
      console.error('GET /portal/:token/invoices/:invoiceId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:token/invoices/:invoiceId/pdf - Get invoice PDF URL
  router.get('/:token/invoices/:invoiceId/pdf', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: req.params.invoiceId,
          customerId: customer.id,
          isDeleted: false
        },
        select: {
          id: true,
          invoiceNumber: true,
          pdfS3Key: true
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (!invoice.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not available' });
      }

      const pdfUrl = await getPDFSignedUrl(invoice.pdfS3Key, `${invoice.invoiceNumber}.pdf`);

      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /portal/:token/invoices/:invoiceId/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PAYMENTS
  // ============================================

  // GET /:token/payments - List customer's payment history
  router.get('/:token/payments', async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          portalToken: req.params.token,
          isDeleted: false,
          portalEnabled: true
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Invalid portal access' });
      }

      const payments = await prisma.payment.findMany({
        where: {
          customerId: customer.id,
          status: { in: ['COMPLETED', 'PROCESSING'] }
        },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          last4: true,
          cardBrand: true,
          bankName: true,
          status: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true
            }
          }
        },
        orderBy: { paymentDate: 'desc' }
      });

      res.json(payments);
    } catch (error) {
      console.error('GET /portal/:token/payments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // TOKEN GENERATION (for internal use)
  // ============================================

  // POST /generate-token - Generate portal token for a customer (requires auth)
  // This should be called from the customers routes, but we expose it here too
  router.post('/generate-token/:customerId', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.customerId }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Generate secure random token
      const portalToken = crypto.randomBytes(32).toString('hex');

      // Update customer with new token
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          portalToken,
          portalEnabled: true
        }
      });

      res.json({
        portalToken,
        portalUrl: `/portal/${portalToken}`
      });
    } catch (error) {
      console.error('POST /portal/generate-token/:customerId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createCustomerPortalRouter;
