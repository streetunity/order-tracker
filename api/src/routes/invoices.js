import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateInvoiceNumber } from '../utils/numberGenerators.js';

export function createInvoicesRouter(prisma) {
  const router = express.Router();

  // GET /invoices - List all invoices (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, customerId } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          customer: {
            select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, email: true }
          },
          createdBy: {
            select: { id: true, name: true }
          },
          _count: {
            select: {
              items: true,
              payments: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(invoices);
    } catch (error) {
      console.error('GET /invoices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id - Get single invoice with items and payments
  router.get('/:id', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          payments: {
            orderBy: { createdAt: 'desc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          },
          estimate: {
            select: { id: true, estimateNumber: true }
          },
          order: {
            select: { id: true, poNumber: true }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (invoice.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      res.json(invoice);
    } catch (error) {
      console.error('GET /invoices/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /invoices - Create new invoice
  router.post('/', requireInvoicingPermission('CREATE_INVOICE'), async (req, res) => {
    try {
      const {
        customerId,
        invoiceDate,
        dueDate,
        items,
        subtotal,
        taxRate,
        taxAmount,
        discountType,
        discountValue,
        discountAmount,
        shippingAmount,
        total,
        balanceDue,
        paymentType,
        depositRequired,
        notes,
        internalNotes,
        termsConditions,
        estimateId
      } = req.body;

      // Validation
      if (!customerId || !items || items.length === 0) {
        return res.status(400).json({
          error: 'Missing required fields: customerId, items'
        });
      }

      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(prisma);

      // Calculate due date if not provided (NET30 = 30 days from invoice date)
      const calcDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          customerId,
          invoiceDate: invoiceDate || new Date(),
          dueDate: calcDueDate,
          subtotal,
          taxRate: taxRate || 0,
          taxAmount: taxAmount || 0,
          discountType,
          discountValue,
          discountAmount: discountAmount || 0,
          shippingAmount: shippingAmount || 0,
          total,
          balanceDue: balanceDue !== undefined ? balanceDue : total,
          paymentType: paymentType || 'FULL',
          depositRequired,
          notes,
          internalNotes,
          termsConditions,
          estimateId,
          createdById: req.user.id,
          items: {
            create: items.map((item, index) => ({
              name: item.name,
              description: item.description,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
              taxable: item.taxable !== undefined ? item.taxable : true,
              measurements: item.measurements,
              sortOrder: index
            }))
          }
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      // If created from estimate, mark estimate as converted
      if (estimateId) {
        await prisma.estimate.update({
          where: { id: estimateId },
          data: {
            status: 'CONVERTED',
            convertedToInvoiceId: invoice.id,
            convertedAt: new Date()
          }
        });
      }

      res.status(201).json(invoice);
    } catch (error) {
      console.error('POST /invoices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /invoices/:id - Update invoice
  router.put('/:id', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const existing = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (existing.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        dueDate,
        subtotal,
        taxRate,
        taxAmount,
        discountType,
        discountValue,
        discountAmount,
        shippingAmount,
        total,
        amountPaid,
        balanceDue,
        paymentType,
        depositRequired,
        depositPaid,
        status,
        notes,
        internalNotes,
        termsConditions
      } = req.body;

      const updated = await prisma.invoice.update({
        where: { id: req.params.id },
        data: {
          dueDate,
          subtotal,
          taxRate,
          taxAmount,
          discountType,
          discountValue,
          discountAmount,
          shippingAmount,
          total,
          amountPaid,
          balanceDue,
          paymentType,
          depositRequired,
          depositPaid,
          status,
          notes,
          internalNotes,
          termsConditions
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          payments: true
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PUT /invoices/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /invoices/:id - Soft delete invoice
  router.delete('/:id', requireInvoicingPermission('DELETE_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const deleted = await prisma.invoice.update({
        where: { id: req.params.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id
        }
      });

      res.json({ message: 'Invoice deleted successfully', invoice: deleted });
    } catch (error) {
      console.error('DELETE /invoices/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
