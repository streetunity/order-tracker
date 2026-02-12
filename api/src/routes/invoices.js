import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateInvoiceNumber, generatePaymentNumber } from '../utils/numberGenerators.js';
import { generateInvoicePDF, uploadPDFToS3, getPDFSignedUrl } from '../services/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';

export function createInvoicesRouter(prisma) {
  const router = express.Router();

  /**
   * Calculate invoice totals from items
   */
  function calculateTotals(items, taxRate = 0, discountType = null, discountValue = null, shippingAmount = 0) {
    const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);

    const totalCost = items.reduce((sum, item) => {
      const cost = item.unitCost || 0;
      return sum + (cost * (item.quantity || 1));
    }, 0);

    let discountAmount = 0;
    if (discountType && discountValue) {
      if (discountType === 'PERCENTAGE') {
        discountAmount = subtotal * (discountValue / 100);
      } else if (discountType === 'FIXED') {
        discountAmount = discountValue;
      }
    }

    const taxableAmount = items
      .filter(item => item.taxable !== false)
      .reduce((sum, item) => sum + (item.amount || 0), 0);

    const taxableAfterDiscount = taxableAmount - (discountAmount * (taxableAmount / subtotal || 0));
    const taxAmount = taxableAfterDiscount * (taxRate / 100);

    const total = subtotal - discountAmount + taxAmount + shippingAmount;

    const marginAmount = subtotal - totalCost;
    const marginPercent = subtotal > 0 ? (marginAmount / subtotal) * 100 : 0;

    return {
      subtotal,
      discountAmount,
      taxAmount,
      total,
      totalCost,
      marginAmount,
      marginPercent: Math.round(marginPercent * 100) / 100
    };
  }

  /**
   * Create payment schedule based on type
   */
  function createPaymentSchedule(total, scheduleType, invoiceId) {
    const schedules = {
      'DEPOSIT_BALANCE': [
        { description: 'Deposit (50%)', percentage: 50, triggersOrder: true },
        { description: 'Balance (50%)', percentage: 50, triggersOrder: false }
      ],
      '50_40_10': [
        { description: 'Deposit (50%)', percentage: 50, triggersOrder: true },
        { description: 'Progress Payment (40%)', percentage: 40, triggersOrder: false },
        { description: 'Final Payment (10%)', percentage: 10, triggersOrder: false }
      ]
    };

    const schedule = schedules[scheduleType];
    if (!schedule) return [];

    return schedule.map((item, index) => ({
      invoiceId,
      description: item.description,
      percentage: item.percentage,
      amount: Math.round((total * item.percentage / 100) * 100) / 100,
      sortOrder: index,
      triggersOrder: item.triggersOrder,
      status: 'PENDING'
    }));
  }

  // GET /invoices - List all invoices (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, customerId, search, dateFrom, dateTo, overdue } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      // Date range filter
      if (dateFrom || dateTo) {
        where.invoiceDate = {};
        if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
        if (dateTo) where.invoiceDate.lte = new Date(dateTo);
      }

      // Overdue filter
      if (overdue === 'true') {
        where.dueDate = { lt: new Date() };
        where.status = { notIn: ['PAID', 'VOID', 'CANCELLED'] };
      }

      // Search filter
      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search } },
          { customer: { firstName: { contains: search } } },
          { customer: { lastName: { contains: search } } },
          { customer: { company: { contains: search } } },
          { customer: { companyName: { contains: search } } }
        ];
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          customer: {
            select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true, email: true }
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
          paymentSchedule: {
            orderBy: { sortOrder: 'asc' }
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
        paymentTerms,
        items,
        taxRate,
        discountType,
        discountValue,
        shippingAmount,
        paymentType,
        paymentScheduleType,
        depositRequired,
        orderCreationTrigger,
        notes,
        internalNotes,
        termsConditions,
        estimateId
      } = req.body;

      // Validation
      if (!customerId) {
        return res.status(400).json({
          error: 'Missing required field: customerId'
        });
      }

      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(prisma);

      // Calculate due date based on payment terms
      let calcDueDate = dueDate;
      if (!calcDueDate && paymentTerms) {
        const days = paymentTerms === 'NET15' ? 15 : paymentTerms === 'NET30' ? 30 : paymentTerms === 'NET45' ? 45 : paymentTerms === 'NET60' ? 60 : 30;
        calcDueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      } else if (!calcDueDate) {
        calcDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      // Prepare items data
      const itemsToCreate = (items || []).map((item, index) => ({
        name: item.name,
        description: item.description,
        sku: item.sku,
        productId: item.productId,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        unitCost: item.unitCost,
        amount: (item.quantity || 1) * (item.unitPrice || 0),
        taxable: item.taxable !== undefined ? item.taxable : true,
        measurements: item.measurements,
        sortOrder: index
      }));

      // Calculate totals
      const totals = calculateTotals(
        itemsToCreate,
        taxRate || 0,
        discountType,
        discountValue,
        shippingAmount || 0
      );

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          dueDate: new Date(calcDueDate),
          paymentTerms: paymentTerms || 'NET30',
          subtotal: totals.subtotal,
          taxRate: taxRate || 0,
          taxAmount: totals.taxAmount,
          discountType,
          discountValue,
          discountAmount: totals.discountAmount,
          shippingAmount: shippingAmount || 0,
          total: totals.total,
          balanceDue: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent,
          paymentType: paymentType || 'FULL',
          paymentScheduleType: paymentScheduleType || null,
          depositRequired,
          orderCreationTrigger: orderCreationTrigger || 'DEPOSIT',
          notes,
          internalNotes,
          termsConditions,
          estimateId,
          createdById: req.user.id,
          items: {
            create: itemsToCreate
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

      // Create payment schedule if specified
      if (paymentScheduleType && paymentScheduleType !== 'NONE') {
        const scheduleItems = createPaymentSchedule(totals.total, paymentScheduleType, invoice.id);
        if (scheduleItems.length > 0) {
          await prisma.invoicePaymentSchedule.createMany({
            data: scheduleItems
          });
        }
      }

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

      // Fetch complete invoice with schedule
      const completeInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      res.status(201).json(completeInvoice);
    } catch (error) {
      console.error('POST /invoices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /invoices/from-estimate/:estimateId - Convert estimate to invoice
  router.post('/from-estimate/:estimateId', requireInvoicingPermission('CONVERT_ESTIMATE_TO_INVOICE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.estimateId },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      if (estimate.status === 'CONVERTED') {
        return res.status(400).json({ error: 'Estimate has already been converted to invoice' });
      }

      const { paymentTerms, paymentScheduleType, orderCreationTrigger, notes, internalNotes, termsConditions } = req.body;

      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(prisma);

      // Calculate due date
      const days = paymentTerms === 'NET15' ? 15 : paymentTerms === 'NET30' ? 30 : paymentTerms === 'NET45' ? 45 : paymentTerms === 'NET60' ? 60 : 30;
      const dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      // Create invoice with items from estimate
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          customerId: estimate.customerId,
          estimateId: estimate.id,
          invoiceDate: new Date(),
          dueDate,
          paymentTerms: paymentTerms || 'NET30',
          subtotal: estimate.subtotal,
          taxRate: estimate.taxRate,
          taxAmount: estimate.taxAmount,
          discountType: estimate.discountType,
          discountValue: estimate.discountValue,
          discountAmount: estimate.discountAmount,
          shippingAmount: estimate.shippingAmount,
          total: estimate.total,
          balanceDue: estimate.total,
          totalCost: estimate.totalCost,
          marginAmount: estimate.marginAmount,
          marginPercent: estimate.marginPercent,
          paymentType: paymentScheduleType ? 'SCHEDULE' : 'FULL',
          paymentScheduleType: paymentScheduleType || null,
          orderCreationTrigger: orderCreationTrigger || 'DEPOSIT',
          notes: notes || estimate.notes,
          internalNotes: internalNotes || estimate.internalNotes,
          termsConditions: termsConditions || estimate.termsConditions,
          createdById: req.user.id,
          items: {
            create: estimate.items.map((item, index) => ({
              productId: item.productId,
              name: item.name,
              description: item.description,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              amount: item.amount,
              taxable: item.taxable,
              measurements: item.measurements,
              sortOrder: index
            }))
          }
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      // Create payment schedule if specified
      if (paymentScheduleType && paymentScheduleType !== 'NONE') {
        const scheduleItems = createPaymentSchedule(estimate.total, paymentScheduleType, invoice.id);
        if (scheduleItems.length > 0) {
          await prisma.invoicePaymentSchedule.createMany({
            data: scheduleItems
          });
        }
      }

      // Mark estimate as converted
      await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          status: 'CONVERTED',
          convertedToInvoiceId: invoice.id,
          convertedAt: new Date()
        }
      });

      // Fetch complete invoice
      const completeInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } },
          estimate: { select: { id: true, estimateNumber: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      res.status(201).json(completeInvoice);
    } catch (error) {
      console.error('POST /invoices/from-estimate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /invoices/:id - Update invoice
  router.put('/:id', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const existing = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (req.user.role === 'AGENT') {
        if (existing.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        dueDate,
        paymentTerms,
        taxRate,
        discountType,
        discountValue,
        shippingAmount,
        status,
        notes,
        internalNotes,
        termsConditions
      } = req.body;

      // Recalculate totals
      const totals = calculateTotals(
        existing.items,
        taxRate !== undefined ? taxRate : existing.taxRate,
        discountType !== undefined ? discountType : existing.discountType,
        discountValue !== undefined ? discountValue : existing.discountValue,
        shippingAmount !== undefined ? shippingAmount : existing.shippingAmount
      );

      const updateData = {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        balanceDue: totals.total - existing.amountPaid,
        totalCost: totals.totalCost,
        marginAmount: totals.marginAmount,
        marginPercent: totals.marginPercent
      };

      if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
      if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
      if (taxRate !== undefined) updateData.taxRate = taxRate;
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = discountValue;
      if (shippingAmount !== undefined) updateData.shippingAmount = shippingAmount;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
      if (termsConditions !== undefined) updateData.termsConditions = termsConditions;

      const updated = await prisma.invoice.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PUT /invoices/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /invoices/:id - Partial update invoice
  router.patch('/:id', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const existing = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (req.user.role === 'AGENT') {
        if (existing.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Whitelist of allowed fields for invoice updates
      const allowedFields = [
        'customerId', 'invoiceDate', 'dueDate', 'status', 'paymentTerms',
        'notes', 'internalNotes', 'terms', 'poNumber',
        'subtotal', 'taxRate', 'taxAmount', 'discountType', 'discountValue', 'discountAmount',
        'shippingAmount', 'total', 'amountPaid', 'amountDue',
        'shippingAddress', 'shippingCity', 'shippingState', 'shippingZipCode', 'shippingCountry',
        'billingAddress', 'billingCity', 'billingState', 'billingZipCode', 'billingCountry',
        'assignedToId', 'sentAt', 'viewedAt', 'paidAt', 'voidedAt', 'voidReason'
      ];

      // Filter to only allowed fields
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const updated = await prisma.invoice.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /invoices/:id error:', error);
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

  // ============================================
  // LINE ITEM MANAGEMENT
  // ============================================

  // POST /invoices/:id/items - Add line item
  router.post('/:id/items', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (req.user.role === 'AGENT') {
        if (invoice.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const { productId, quantity, customName, customDescription, customPrice, customCost, taxable } = req.body;

      let itemData;
      const maxSortOrder = invoice.items.reduce((max, item) => Math.max(max, item.sortOrder), -1);

      if (productId) {
        const product = await prisma.product.findUnique({
          where: { id: productId }
        });

        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const qty = quantity || 1;
        itemData = {
          invoiceId: invoice.id,
          productId: product.id,
          name: product.name,
          description: product.description,
          sku: product.sku,
          quantity: qty,
          unitPrice: product.price,
          unitCost: product.cost,
          amount: qty * product.price,
          taxable: product.taxable,
          sortOrder: maxSortOrder + 1
        };
      } else {
        if (!customName) {
          return res.status(400).json({ error: 'Product ID or custom name is required' });
        }

        const qty = quantity || 1;
        const price = customPrice || 0;
        itemData = {
          invoiceId: invoice.id,
          name: customName,
          description: customDescription,
          quantity: qty,
          unitPrice: price,
          unitCost: customCost,
          amount: qty * price,
          taxable: taxable !== undefined ? taxable : true,
          sortOrder: maxSortOrder + 1
        };
      }

      const newItem = await prisma.invoiceItem.create({
        data: itemData
      });

      // Recalculate totals
      const allItems = [...invoice.items, newItem];
      const totals = calculateTotals(
        allItems,
        invoice.taxRate,
        invoice.discountType,
        invoice.discountValue,
        invoice.shippingAmount
      );

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          balanceDue: totals.total - invoice.amountPaid,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.status(201).json({ item: newItem, invoice: updatedInvoice });
    } catch (error) {
      console.error('POST /invoices/:id/items error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /invoices/:id/items/:itemId - Update line item
  router.patch('/:id/items/:itemId', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (req.user.role === 'AGENT') {
        if (invoice.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const existingItem = invoice.items.find(i => i.id === req.params.itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const { quantity, unitPrice, name, description, taxable } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (taxable !== undefined) updateData.taxable = taxable;

      const newQty = quantity !== undefined ? quantity : existingItem.quantity;
      const newPrice = unitPrice !== undefined ? unitPrice : existingItem.unitPrice;

      updateData.quantity = newQty;
      updateData.unitPrice = newPrice;
      updateData.amount = newQty * newPrice;

      const updatedItem = await prisma.invoiceItem.update({
        where: { id: req.params.itemId },
        data: updateData
      });

      // Recalculate totals
      const allItems = invoice.items.map(i =>
        i.id === req.params.itemId ? updatedItem : i
      );
      const totals = calculateTotals(
        allItems,
        invoice.taxRate,
        invoice.discountType,
        invoice.discountValue,
        invoice.shippingAmount
      );

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          balanceDue: totals.total - invoice.amountPaid,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json({ item: updatedItem, invoice: updatedInvoice });
    } catch (error) {
      console.error('PATCH /invoices/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /invoices/:id/items/:itemId - Remove line item
  router.delete('/:id/items/:itemId', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (req.user.role === 'AGENT') {
        if (invoice.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const existingItem = invoice.items.find(i => i.id === req.params.itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Item not found' });
      }

      await prisma.invoiceItem.delete({
        where: { id: req.params.itemId }
      });

      // Recalculate totals
      const remainingItems = invoice.items.filter(i => i.id !== req.params.itemId);
      const totals = calculateTotals(
        remainingItems,
        invoice.taxRate,
        invoice.discountType,
        invoice.discountValue,
        invoice.shippingAmount
      );

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          balanceDue: totals.total - invoice.amountPaid,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json({ message: 'Item deleted', invoice: updatedInvoice });
    } catch (error) {
      console.error('DELETE /invoices/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PAYMENT MANAGEMENT
  // ============================================

  // GET /invoices/:id/payments - Get payments for invoice
  router.get('/:id/payments', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const payments = await prisma.payment.findMany({
        where: { invoiceId: req.params.id },
        orderBy: { createdAt: 'desc' }
      });

      res.json(payments);
    } catch (error) {
      console.error('GET /invoices/:id/payments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /invoices/:id/payments - Record a payment
  router.post('/:id/payments', requireInvoicingPermission('RECORD_PAYMENT'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { paymentSchedule: { orderBy: { sortOrder: 'asc' } } }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const {
        amount,
        paymentMethod,
        paymentDate,
        checkNumber,
        wireReference,
        referenceNumber,
        notes,
        scheduleItemId
      } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid payment amount is required' });
      }

      if (!paymentMethod) {
        return res.status(400).json({ error: 'Payment method is required' });
      }

      // Generate payment number
      const paymentNumber = await generatePaymentNumber(prisma);

      // Create payment
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          amount,
          paymentMethod,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          checkNumber,
          wireReference,
          referenceNumber,
          notes,
          scheduleItemId,
          status: 'COMPLETED',
          recordedById: req.user.id
        }
      });

      // Update invoice amounts
      const newAmountPaid = invoice.amountPaid + amount;
      const newBalanceDue = invoice.total - newAmountPaid;

      // Determine new status
      let newStatus = invoice.status;
      if (newBalanceDue <= 0) {
        newStatus = 'PAID';
      } else if (newAmountPaid > 0) {
        newStatus = 'PARTIAL';
      }

      // Check if deposit is now paid
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
          const invoiceForOrder = await prisma.invoice.findUnique({
            where: { id: invoice.id },
            include: {
              customer: true,
              items: true
            }
          });

          if (shouldCreateOrder(invoiceForOrder)) {
            const result = await createOrderFromInvoice(prisma, {
              invoiceId: invoice.id,
              paymentId: payment.id
            });
            orderCreated = result.order?.id || result.orderId;
            console.log(`[PAYMENT] Auto-created order ${orderCreated} from invoice ${invoice.invoiceNumber}`);
          }
        } catch (orderError) {
          console.error('[PAYMENT] Auto order creation error:', orderError);
          // Don't fail payment recording if order creation fails
        }
      }

      // Fetch updated invoice
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.status(201).json({ payment, invoice: updatedInvoice });
    } catch (error) {
      console.error('POST /invoices/:id/payments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /invoices/:id/recalculate - Recalculate totals
  router.post('/:id/recalculate', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const { taxRate, discountType, discountValue, shippingAmount } = req.body;

      const totals = calculateTotals(
        invoice.items,
        taxRate !== undefined ? taxRate : invoice.taxRate,
        discountType !== undefined ? discountType : invoice.discountType,
        discountValue !== undefined ? discountValue : invoice.discountValue,
        shippingAmount !== undefined ? shippingAmount : invoice.shippingAmount
      );

      const updateData = {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        balanceDue: totals.total - invoice.amountPaid,
        totalCost: totals.totalCost,
        marginAmount: totals.marginAmount,
        marginPercent: totals.marginPercent
      };

      if (taxRate !== undefined) updateData.taxRate = taxRate;
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = discountValue;
      if (shippingAmount !== undefined) updateData.shippingAmount = shippingAmount;

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: updateData,
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json(updatedInvoice);
    } catch (error) {
      console.error('POST /invoices/:id/recalculate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /invoices/:id/void - Void an invoice
  router.post('/:id/void', requireInvoicingPermission('VOID_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.amountPaid > 0) {
        return res.status(400).json({ error: 'Cannot void invoice with payments. Refund payments first.' });
      }

      const updated = await prisma.invoice.update({
        where: { id: req.params.id },
        data: { status: 'VOID' },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('POST /invoices/:id/void error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PAYMENT SCHEDULE MANAGEMENT
  // ============================================

  // POST /invoices/:id/payment-schedule - Set up or update payment schedule
  router.post('/:id/payment-schedule', requireInvoicingPermission('EDIT_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { paymentSchedule: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { scheduleType, customSchedule } = req.body;

      // Delete existing schedule
      if (invoice.paymentSchedule.length > 0) {
        await prisma.invoicePaymentSchedule.deleteMany({
          where: { invoiceId: invoice.id }
        });
      }

      let scheduleItems = [];

      if (scheduleType === 'CUSTOM' && customSchedule) {
        // Custom schedule: array of { description, percentage, dueDate, triggersOrder }
        scheduleItems = customSchedule.map((item, index) => ({
          invoiceId: invoice.id,
          description: item.description,
          percentage: item.percentage,
          amount: Math.round((invoice.total * item.percentage / 100) * 100) / 100,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          sortOrder: index,
          triggersOrder: item.triggersOrder || index === 0,
          status: 'PENDING'
        }));
      } else if (scheduleType && scheduleType !== 'NONE') {
        scheduleItems = createPaymentSchedule(invoice.total, scheduleType, invoice.id);
      }

      if (scheduleItems.length > 0) {
        await prisma.invoicePaymentSchedule.createMany({
          data: scheduleItems
        });
      }

      // Update invoice with schedule type
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          paymentScheduleType: scheduleType || 'NONE',
          paymentType: scheduleType && scheduleType !== 'NONE' ? 'SCHEDULE' : 'FULL',
          depositRequired: scheduleItems.length > 0 ? scheduleItems[0].amount : null
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json(updatedInvoice);
    } catch (error) {
      console.error('POST /invoices/:id/payment-schedule error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PDF GENERATION
  // ============================================

  // POST /invoices/:id/generate-pdf - Generate invoice PDF
  router.post('/:id/generate-pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get company settings
      const companySettings = await prisma.companySettings.findFirst() || {
        companyName: 'Stealth Machine Tools',
        companyEmail: 'sales@stealthmachinetools.com',
        companyPhone: '(555) 123-4567',
        companyAddress: '123 Industrial Way',
        companyCity: 'Manufacturing City',
        companyState: 'TX',
        companyZip: '75001'
      };

      // Generate PDF
      const pdfBuffer = await generateInvoicePDF(invoice, companySettings);

      // Upload to S3
      const s3Key = `invoices/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      const { s3Url } = await uploadPDFToS3(pdfBuffer, s3Key);

      // Update invoice with PDF info
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          pdfS3Key: s3Key,
          pdfUrl: s3Url,
          pdfGeneratedAt: new Date()
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      // Get signed URL for download
      const pdfUrl = await getPDFSignedUrl(s3Key, `${invoice.invoiceNumber}.pdf`);

      res.json({ invoice: updatedInvoice, pdfUrl });
    } catch (error) {
      console.error('POST /invoices/:id/generate-pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id/pdf - Get PDF download URL
  router.get('/:id/pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (!invoice.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not generated yet' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const pdfUrl = await getPDFSignedUrl(invoice.pdfS3Key, `${invoice.invoiceNumber}.pdf`);

      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /invoices/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // EMAIL SENDING
  // ============================================

  // POST /invoices/:id/send - Send invoice via email
  router.post('/:id/send', requireInvoicingPermission('SEND_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const { toEmail, ccEmails, customMessage, regeneratePDF } = req.body;

      const recipientEmail = toEmail || invoice.customer?.email;
      if (!recipientEmail) {
        return res.status(400).json({ error: 'No recipient email provided' });
      }

      // Get company settings
      const companySettings = await prisma.companySettings.findFirst() || {
        companyName: 'Stealth Machine Tools',
        companyEmail: 'sales@stealthmachinetools.com',
        companyPhone: '(555) 123-4567'
      };

      // Generate PDF if needed
      let pdfS3Key = invoice.pdfS3Key;
      if (!pdfS3Key || regeneratePDF) {
        const pdfBuffer = await generateInvoicePDF(invoice, companySettings);
        const s3Key = `invoices/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
        await uploadPDFToS3(pdfBuffer, s3Key);
        pdfS3Key = s3Key;

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            pdfS3Key: s3Key,
            pdfGeneratedAt: new Date()
          }
        });
      }

      // Get user's email settings
      const userEmailSettings = await prisma.userEmailSettings.findUnique({
        where: { userId: req.user.id }
      });

      // Send email
      await sendInvoiceEmail(invoice, {
        toEmail: recipientEmail,
        ccEmails: ccEmails || [],
        customMessage,
        senderName: userEmailSettings?.senderName || req.user.name || companySettings.companyName,
        senderEmail: userEmailSettings?.senderEmail || companySettings.companyEmail,
        replyTo: userEmailSettings?.replyTo || companySettings.companyEmail,
        companySettings,
        pdfS3Key,
        prisma
      });

      // Log the email
      await prisma.emailLog.create({
        data: {
          invoiceId: invoice.id,
          toEmail: recipientEmail,
          ccEmails: ccEmails || [],
          subject: `Invoice ${invoice.invoiceNumber} from ${companySettings.companyName}`,
          sentById: req.user.id,
          sentAt: new Date(),
          status: 'SENT'
        }
      });

      // Update invoice status and tracking
      const updateData = {
        lastSentAt: new Date(),
        sentCount: invoice.sentCount + 1
      };

      if (invoice.status === 'DRAFT') {
        updateData.status = 'SENT';
      }

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: updateData,
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json({ message: 'Invoice sent successfully', invoice: updatedInvoice });
    } catch (error) {
      console.error('POST /invoices/:id/send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id/email-history - Get email history for invoice
  router.get('/:id/email-history', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const emailLogs = await prisma.emailLog.findMany({
        where: { invoiceId: req.params.id },
        include: {
          sentBy: { select: { id: true, name: true } }
        },
        orderBy: { sentAt: 'desc' }
      });

      res.json(emailLogs);
    } catch (error) {
      console.error('GET /invoices/:id/email-history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
