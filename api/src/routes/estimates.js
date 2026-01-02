import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateEstimateNumber } from '../utils/numberGenerators.js';

export function createEstimatesRouter(prisma) {
  const router = express.Router();

  // GET /estimates - List all estimates (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, customerId } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      const estimates = await prisma.estimate.findMany({
        where,
        include: {
          customer: {
            select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, email: true }
          },
          createdBy: {
            select: { id: true, name: true }
          },
          _count: {
            select: { items: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(estimates);
    } catch (error) {
      console.error('GET /estimates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id - Get single estimate with items
  router.get('/:id', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          },
          invoices: {
            select: { id: true, invoiceNumber: true, status: true }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (estimate.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      res.json(estimate);
    } catch (error) {
      console.error('GET /estimates/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates - Create new estimate
  router.post('/', requireInvoicingPermission('CREATE_ESTIMATE'), async (req, res) => {
    try {
      const {
        customerId,
        estimateDate,
        expiryDate,
        items,
        subtotal,
        taxRate,
        taxAmount,
        discountType,
        discountValue,
        discountAmount,
        shippingAmount,
        total,
        notes,
        internalNotes,
        termsConditions
      } = req.body;

      // Validation
      if (!customerId || !items || items.length === 0) {
        return res.status(400).json({
          error: 'Missing required fields: customerId, items'
        });
      }

      // Generate estimate number
      const estimateNumber = await generateEstimateNumber(prisma);

      // Calculate expiry date if not provided (30 days from estimate date)
      const calcExpiryDate = expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const estimate = await prisma.estimate.create({
        data: {
          estimateNumber,
          customerId,
          estimateDate: estimateDate || new Date(),
          expiryDate: calcExpiryDate,
          subtotal,
          taxRate: taxRate || 0,
          taxAmount: taxAmount || 0,
          discountType,
          discountValue,
          discountAmount: discountAmount || 0,
          shippingAmount: shippingAmount || 0,
          total,
          notes,
          internalNotes,
          termsConditions,
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

      res.status(201).json(estimate);
    } catch (error) {
      console.error('POST /estimates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /estimates/:id - Update estimate
  router.put('/:id', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const existing = await prisma.estimate.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (existing.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        expiryDate,
        subtotal,
        taxRate,
        taxAmount,
        discountType,
        discountValue,
        discountAmount,
        shippingAmount,
        total,
        status,
        notes,
        internalNotes,
        termsConditions
      } = req.body;

      const updated = await prisma.estimate.update({
        where: { id: req.params.id },
        data: {
          expiryDate,
          subtotal,
          taxRate,
          taxAmount,
          discountType,
          discountValue,
          discountAmount,
          shippingAmount,
          total,
          status,
          notes,
          internalNotes,
          termsConditions
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PUT /estimates/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /estimates/:id - Soft delete estimate
  router.delete('/:id', requireInvoicingPermission('DELETE_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const deleted = await prisma.estimate.update({
        where: { id: req.params.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id
        }
      });

      res.json({ message: 'Estimate deleted successfully', estimate: deleted });
    } catch (error) {
      console.error('DELETE /estimates/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
