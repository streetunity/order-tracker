import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateEstimateNumber } from '../utils/numberGenerators.js';
import { generateEstimatePDF, uploadPDFToS3, getPDFSignedUrl, getPDFFromS3 } from '../services/pdfService.js';
import { sendEstimateEmail, trackEmailOpen } from '../services/emailService.js';

export function createEstimatesRouter(prisma) {
  const router = express.Router();

  /**
   * Calculate estimate totals from items
   */
  function calculateTotals(items, taxRate = 0, discountType = null, discountValue = null, shippingAmount = 0) {
    // Calculate subtotal (sum of item amounts)
    const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);

    // Calculate total cost for margin
    const totalCost = items.reduce((sum, item) => {
      const cost = item.unitCost || 0;
      return sum + (cost * (item.quantity || 1));
    }, 0);

    // Calculate discount
    let discountAmount = 0;
    if (discountType && discountValue) {
      if (discountType === 'PERCENTAGE') {
        discountAmount = subtotal * (discountValue / 100);
      } else if (discountType === 'FIXED') {
        discountAmount = discountValue;
      }
    }

    // Calculate taxable amount (items where taxable = true)
    const taxableAmount = items
      .filter(item => item.taxable !== false)
      .reduce((sum, item) => sum + (item.amount || 0), 0);

    // Calculate tax on (taxable amount - proportional discount)
    const taxableAfterDiscount = taxableAmount - (discountAmount * (taxableAmount / subtotal || 0));
    const taxAmount = taxableAfterDiscount * (taxRate / 100);

    // Calculate total
    const total = subtotal - discountAmount + taxAmount + shippingAmount;

    // Calculate margin
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

  // GET /estimates - List all estimates (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, customerId, search, dateFrom, dateTo } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      // Date range filter
      if (dateFrom || dateTo) {
        where.estimateDate = {};
        if (dateFrom) where.estimateDate.gte = new Date(dateFrom);
        if (dateTo) where.estimateDate.lte = new Date(dateTo);
      }

      // Search filter (estimate number or customer name)
      if (search) {
        where.OR = [
          { estimateNumber: { contains: search } },
          { customer: { firstName: { contains: search } } },
          { customer: { lastName: { contains: search } } },
          { customer: { company: { contains: search } } },
          { customer: { companyName: { contains: search } } }
        ];
      }

      const estimates = await prisma.estimate.findMany({
        where,
        include: {
          customer: {
            select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true, companyName: true, email: true }
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
        taxRate,
        discountType,
        discountValue,
        shippingAmount,
        notes,
        internalNotes,
        termsConditions
      } = req.body;

      // Validation
      if (!customerId) {
        return res.status(400).json({
          error: 'Missing required field: customerId'
        });
      }

      // Generate estimate number
      const estimateNumber = await generateEstimateNumber(prisma);

      // Calculate expiry date if not provided (30 days from estimate date)
      const calcExpiryDate = expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Prepare items data
      const itemsToCreate = (items || []).map((item, index) => ({
        name: item.name,
        description: item.description,
        sku: item.sku,
        productId: item.productId,
        fromBundleId: item.fromBundleId,
        fromBundleName: item.fromBundleName,
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

      const estimate = await prisma.estimate.create({
        data: {
          estimateNumber,
          customerId,
          estimateDate: estimateDate ? new Date(estimateDate) : new Date(),
          expiryDate: new Date(calcExpiryDate),
          expirationDate: new Date(calcExpiryDate),
          subtotal: totals.subtotal,
          taxRate: taxRate || 0,
          taxAmount: totals.taxAmount,
          discountType,
          discountValue,
          discountAmount: totals.discountAmount,
          shippingAmount: shippingAmount || 0,
          total: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent,
          notes,
          internalNotes,
          termsConditions,
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
        where: { id: req.params.id },
        include: { items: true }
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
        taxRate,
        discountType,
        discountValue,
        shippingAmount,
        status,
        notes,
        internalNotes,
        termsConditions
      } = req.body;

      // Recalculate totals with existing items
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
        totalCost: totals.totalCost,
        marginAmount: totals.marginAmount,
        marginPercent: totals.marginPercent
      };

      // Only update provided fields
      if (expiryDate !== undefined) {
        updateData.expiryDate = new Date(expiryDate);
        updateData.expirationDate = new Date(expiryDate);
      }
      if (taxRate !== undefined) updateData.taxRate = taxRate;
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = discountValue;
      if (shippingAmount !== undefined) updateData.shippingAmount = shippingAmount;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
      if (termsConditions !== undefined) updateData.termsConditions = termsConditions;

      const updated = await prisma.estimate.update({
        where: { id: req.params.id },
        data: updateData,
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

  // PATCH /estimates/:id - Partial update estimate
  router.patch('/:id', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
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

      // Whitelist of allowed fields for estimate updates
      const allowedFields = [
        'customerId', 'estimateDate', 'expirationDate', 'validUntil',
        'status', 'notes', 'internalNotes', 'terms',
        'subtotal', 'taxRate', 'taxAmount', 'discountType', 'discountValue', 'discountAmount', 'total',
        'shippingAddress', 'shippingCity', 'shippingState', 'shippingZipCode', 'shippingCountry',
        'billingAddress', 'billingCity', 'billingState', 'billingZipCode', 'billingCountry',
        'assignedToId', 'sentAt', 'viewedAt', 'acceptedAt', 'rejectedAt', 'rejectionReason'
      ];

      // Filter to only allowed fields
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const updated = await prisma.estimate.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /estimates/:id error:', error);
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

  // ============================================
  // LINE ITEM MANAGEMENT
  // ============================================

  // POST /estimates/:id/items - Add line item(s) from product
  router.post('/:id/items', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: { items: true }
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

      const { productId, quantity, customName, customDescription, customPrice, customCost, taxable } = req.body;

      let itemData;
      const maxSortOrder = estimate.items.reduce((max, item) => Math.max(max, item.sortOrder), -1);

      if (productId) {
        // Add from product catalog
        const product = await prisma.product.findUnique({
          where: { id: productId }
        });

        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const qty = quantity || 1;
        itemData = {
          estimateId: estimate.id,
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
        // Add custom line item
        if (!customName) {
          return res.status(400).json({ error: 'Product ID or custom name is required' });
        }

        const qty = quantity || 1;
        const price = customPrice || 0;
        itemData = {
          estimateId: estimate.id,
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

      const newItem = await prisma.estimateItem.create({
        data: itemData
      });

      // Recalculate estimate totals
      const allItems = [...estimate.items, newItem];
      const totals = calculateTotals(
        allItems,
        estimate.taxRate,
        estimate.discountType,
        estimate.discountValue,
        estimate.shippingAmount
      );

      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.status(201).json({ item: newItem, estimate: updatedEstimate });
    } catch (error) {
      console.error('POST /estimates/:id/items error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/bundles - Add bundle (explodes to individual items)
  router.post('/:id/bundles', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: { items: true }
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

      const { bundleId, quantity } = req.body;

      if (!bundleId) {
        return res.status(400).json({ error: 'Bundle ID is required' });
      }

      const bundle = await prisma.bundle.findUnique({
        where: { id: bundleId },
        include: {
          items: {
            include: {
              product: true
            },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!bundle) {
        return res.status(404).json({ error: 'Bundle not found' });
      }

      if (!bundle.isActive) {
        return res.status(400).json({ error: 'Bundle is inactive' });
      }

      const bundleQty = quantity || 1;
      const maxSortOrder = estimate.items.reduce((max, item) => Math.max(max, item.sortOrder), -1);

      // Calculate component total for price distribution
      const componentTotal = bundle.items.reduce((sum, bi) => {
        return sum + (bi.product.price * bi.quantity);
      }, 0);

      // Create items for each bundle component with proportional pricing
      const newItems = [];
      for (let i = 0; i < bundle.items.length; i++) {
        const bundleItem = bundle.items[i];
        const itemQty = bundleItem.quantity * bundleQty;

        // Calculate proportional price from bundle price
        const productTotal = bundleItem.product.price * bundleItem.quantity;
        const priceRatio = componentTotal > 0 ? productTotal / componentTotal : 0;
        const adjustedUnitPrice = (bundle.price * priceRatio) / bundleItem.quantity;

        const item = await prisma.estimateItem.create({
          data: {
            estimateId: estimate.id,
            productId: bundleItem.productId,
            fromBundleId: bundle.id,
            fromBundleName: bundle.name,
            name: bundleItem.product.name,
            description: bundleItem.product.description,
            sku: bundleItem.product.sku,
            quantity: itemQty,
            unitPrice: adjustedUnitPrice,
            unitCost: bundleItem.product.cost,
            amount: itemQty * adjustedUnitPrice,
            taxable: bundleItem.product.taxable,
            sortOrder: maxSortOrder + 1 + i
          }
        });
        newItems.push(item);
      }

      // Recalculate estimate totals
      const allItems = [...estimate.items, ...newItems];
      const totals = calculateTotals(
        allItems,
        estimate.taxRate,
        estimate.discountType,
        estimate.discountValue,
        estimate.shippingAmount
      );

      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.status(201).json({ items: newItems, estimate: updatedEstimate });
    } catch (error) {
      console.error('POST /estimates/:id/bundles error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /estimates/:id/items/:itemId - Update a line item
  router.patch('/:id/items/:itemId', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: { items: true }
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

      const existingItem = estimate.items.find(i => i.id === req.params.itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const { quantity, unitPrice, name, description, taxable, discountType, discountValue } = req.body;

      // Build update data
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (taxable !== undefined) updateData.taxable = taxable;
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = discountValue;

      // Handle quantity and price changes
      const newQty = quantity !== undefined ? quantity : existingItem.quantity;
      const newPrice = unitPrice !== undefined ? unitPrice : existingItem.unitPrice;

      updateData.quantity = newQty;
      updateData.unitPrice = newPrice;
      updateData.amount = newQty * newPrice;

      // Calculate item-level discount if applicable
      if (discountType && discountValue) {
        if (discountType === 'PERCENTAGE') {
          updateData.discountAmount = updateData.amount * (discountValue / 100);
        } else if (discountType === 'FIXED') {
          updateData.discountAmount = discountValue;
        }
      } else {
        updateData.discountAmount = 0;
      }

      const updatedItem = await prisma.estimateItem.update({
        where: { id: req.params.itemId },
        data: updateData
      });

      // Recalculate estimate totals
      const allItems = estimate.items.map(i =>
        i.id === req.params.itemId ? updatedItem : i
      );
      const totals = calculateTotals(
        allItems,
        estimate.taxRate,
        estimate.discountType,
        estimate.discountValue,
        estimate.shippingAmount
      );

      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json({ item: updatedItem, estimate: updatedEstimate });
    } catch (error) {
      console.error('PATCH /estimates/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /estimates/:id/items/:itemId - Remove a line item
  router.delete('/:id/items/:itemId', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: { items: true }
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

      const existingItem = estimate.items.find(i => i.id === req.params.itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Item not found' });
      }

      await prisma.estimateItem.delete({
        where: { id: req.params.itemId }
      });

      // Recalculate estimate totals
      const remainingItems = estimate.items.filter(i => i.id !== req.params.itemId);
      const totals = calculateTotals(
        remainingItems,
        estimate.taxRate,
        estimate.discountType,
        estimate.discountValue,
        estimate.shippingAmount
      );

      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json({ message: 'Item deleted', estimate: updatedEstimate });
    } catch (error) {
      console.error('DELETE /estimates/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/recalculate - Recalculate totals
  router.post('/:id/recalculate', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const { taxRate, discountType, discountValue, shippingAmount } = req.body;

      const totals = calculateTotals(
        estimate.items,
        taxRate !== undefined ? taxRate : estimate.taxRate,
        discountType !== undefined ? discountType : estimate.discountType,
        discountValue !== undefined ? discountValue : estimate.discountValue,
        shippingAmount !== undefined ? shippingAmount : estimate.shippingAmount
      );

      const updateData = {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        totalCost: totals.totalCost,
        marginAmount: totals.marginAmount,
        marginPercent: totals.marginPercent
      };

      if (taxRate !== undefined) updateData.taxRate = taxRate;
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = discountValue;
      if (shippingAmount !== undefined) updateData.shippingAmount = shippingAmount;

      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: updateData,
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json(updatedEstimate);
    } catch (error) {
      console.error('POST /estimates/:id/recalculate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/items/reorder - Reorder items
  router.post('/:id/items/reorder', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
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

      const { itemIds } = req.body;

      if (!itemIds || !Array.isArray(itemIds)) {
        return res.status(400).json({ error: 'itemIds array is required' });
      }

      // Update sort order for each item
      const updates = itemIds.map((itemId, index) =>
        prisma.estimateItem.update({
          where: { id: itemId },
          data: { sortOrder: index }
        })
      );

      await prisma.$transaction(updates);

      const updatedEstimate = await prisma.estimate.findUnique({
        where: { id: estimate.id },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json(updatedEstimate);
    } catch (error) {
      console.error('POST /estimates/:id/items/reorder error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // VERSIONING & CLONE
  // ============================================

  // GET /estimates/:id/versions - Get all versions of an estimate
  router.get('/:id/versions', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
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

      // Find all versions with the same root estimate number (without version suffix)
      const baseNumber = estimate.estimateNumber.replace(/-v\d+$/, '');

      const versions = await prisma.estimate.findMany({
        where: {
          OR: [
            { estimateNumber: baseNumber },
            { estimateNumber: { startsWith: `${baseNumber}-v` } }
          ],
          isDeleted: false
        },
        include: {
          customer: {
            select: { id: true, firstName: true, lastName: true, company: true, companyName: true }
          },
          createdBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { version: 'desc' }
      });

      res.json(versions);
    } catch (error) {
      console.error('GET /estimates/:id/versions error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/new-version - Create new version of an estimate
  router.post('/:id/new-version', requireInvoicingPermission('CREATE_ESTIMATE'), async (req, res) => {
    try {
      const original = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!original) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (original.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Get the base estimate number (without version suffix)
      const baseNumber = original.estimateNumber.replace(/-v\d+$/, '');

      // Find highest version number
      const existingVersions = await prisma.estimate.findMany({
        where: {
          OR: [
            { estimateNumber: baseNumber },
            { estimateNumber: { startsWith: `${baseNumber}-v` } }
          ]
        },
        select: { version: true }
      });

      const maxVersion = existingVersions.reduce((max, e) => Math.max(max, e.version || 1), 1);
      const newVersion = maxVersion + 1;
      const newEstimateNumber = `${baseNumber}-v${newVersion}`;

      // Create the new version with same data
      const newEstimate = await prisma.estimate.create({
        data: {
          estimateNumber: newEstimateNumber,
          version: newVersion,
          parentEstimateId: original.parentEstimateId || original.id,
          customerId: original.customerId,
          estimateDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subtotal: original.subtotal,
          taxRate: original.taxRate,
          taxAmount: original.taxAmount,
          discountType: original.discountType,
          discountValue: original.discountValue,
          discountAmount: original.discountAmount,
          shippingAmount: original.shippingAmount,
          total: original.total,
          totalCost: original.totalCost,
          marginAmount: original.marginAmount,
          marginPercent: original.marginPercent,
          notes: original.notes,
          internalNotes: original.internalNotes,
          termsConditions: original.termsConditions,
          createdById: req.user.id,
          status: 'DRAFT',
          items: {
            create: original.items.map((item, index) => ({
              name: item.name,
              description: item.description,
              sku: item.sku,
              productId: item.productId,
              fromBundleId: item.fromBundleId,
              fromBundleName: item.fromBundleName,
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
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      // Mark original as superseded if it was active
      if (original.status === 'SENT' || original.status === 'VIEWED') {
        await prisma.estimate.update({
          where: { id: original.id },
          data: { status: 'EXPIRED' }
        });
      }

      res.status(201).json(newEstimate);
    } catch (error) {
      console.error('POST /estimates/:id/new-version error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/clone - Clone estimate with new number
  router.post('/:id/clone', requireInvoicingPermission('CREATE_ESTIMATE'), async (req, res) => {
    try {
      const original = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!original) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (original.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const { customerId } = req.body;
      const targetCustomerId = customerId || original.customerId;

      // Generate new estimate number
      const estimateNumber = await generateEstimateNumber(prisma);

      // Create the cloned estimate
      const clonedEstimate = await prisma.estimate.create({
        data: {
          estimateNumber,
          version: 1,
          customerId: targetCustomerId,
          estimateDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subtotal: original.subtotal,
          taxRate: original.taxRate,
          taxAmount: original.taxAmount,
          discountType: original.discountType,
          discountValue: original.discountValue,
          discountAmount: original.discountAmount,
          shippingAmount: original.shippingAmount,
          total: original.total,
          totalCost: original.totalCost,
          marginAmount: original.marginAmount,
          marginPercent: original.marginPercent,
          notes: original.notes,
          internalNotes: `Cloned from ${original.estimateNumber}`,
          termsConditions: original.termsConditions,
          createdById: req.user.id,
          status: 'DRAFT',
          items: {
            create: original.items.map((item, index) => ({
              name: item.name,
              description: item.description,
              sku: item.sku,
              productId: item.productId,
              fromBundleId: item.fromBundleId,
              fromBundleName: item.fromBundleName,
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
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      res.status(201).json(clonedEstimate);
    } catch (error) {
      console.error('POST /estimates/:id/clone error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/from-template/:templateId - Create estimate from template
  router.post('/from-template/:templateId', requireInvoicingPermission('CREATE_ESTIMATE'), async (req, res) => {
    try {
      const template = await prisma.estimateTemplate.findUnique({
        where: { id: req.params.templateId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      if (!template.isActive) {
        return res.status(400).json({ error: 'Template is inactive' });
      }

      const { customerId, estimateDate, expiryDate, taxRate } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'Customer ID is required' });
      }

      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Generate estimate number
      const estimateNumber = await generateEstimateNumber(prisma);

      // Resolve template items to actual product/bundle prices
      const itemsToCreate = [];
      for (const templateItem of template.items) {
        let itemData = {
          quantity: templateItem.quantity || 1,
          sortOrder: templateItem.sortOrder,
          taxable: true
        };

        if (templateItem.productId) {
          const product = await prisma.product.findUnique({
            where: { id: templateItem.productId }
          });
          if (product) {
            itemData.productId = product.id;
            itemData.name = product.name;
            itemData.description = product.description;
            itemData.sku = product.sku;
            itemData.unitPrice = product.price;
            itemData.unitCost = product.cost;
            itemData.taxable = product.taxable;
            itemData.amount = itemData.quantity * product.price;
          }
        } else if (templateItem.bundleId) {
          // For bundles, we explode them into individual items
          const bundle = await prisma.bundle.findUnique({
            where: { id: templateItem.bundleId },
            include: {
              items: {
                include: { product: true },
                orderBy: { sortOrder: 'asc' }
              }
            }
          });
          if (bundle && bundle.isActive) {
            const bundleQty = templateItem.quantity || 1;
            const componentTotal = bundle.items.reduce((sum, bi) => {
              return sum + (bi.product.price * bi.quantity);
            }, 0);

            for (const bundleItem of bundle.items) {
              const itemQty = bundleItem.quantity * bundleQty;
              const productTotal = bundleItem.product.price * bundleItem.quantity;
              const priceRatio = componentTotal > 0 ? productTotal / componentTotal : 0;
              const adjustedUnitPrice = (bundle.price * priceRatio) / bundleItem.quantity;

              itemsToCreate.push({
                productId: bundleItem.productId,
                fromBundleId: bundle.id,
                fromBundleName: bundle.name,
                name: bundleItem.product.name,
                description: bundleItem.product.description,
                sku: bundleItem.product.sku,
                quantity: itemQty,
                unitPrice: adjustedUnitPrice,
                unitCost: bundleItem.product.cost,
                amount: itemQty * adjustedUnitPrice,
                taxable: bundleItem.product.taxable,
                sortOrder: templateItem.sortOrder
              });
            }
            continue; // Skip adding the bundle item itself
          }
        } else if (templateItem.customName) {
          itemData.name = templateItem.customName;
          itemData.description = templateItem.customDescription;
          itemData.unitPrice = templateItem.customPrice || 0;
          itemData.amount = itemData.quantity * itemData.unitPrice;
        }

        if (itemData.name) {
          itemsToCreate.push(itemData);
        }
      }

      // Recalculate sort orders
      itemsToCreate.forEach((item, index) => {
        item.sortOrder = index;
      });

      // Calculate totals
      const totals = calculateTotals(itemsToCreate, taxRate || 0, null, null, 0);

      const calcExpiryDate = expiryDate || new Date(Date.now() + (template.validityDays || 30) * 24 * 60 * 60 * 1000);

      // Create the estimate
      const estimate = await prisma.estimate.create({
        data: {
          estimateNumber,
          version: 1,
          customerId,
          estimateDate: estimateDate ? new Date(estimateDate) : new Date(),
          expiryDate: new Date(calcExpiryDate),
          expirationDate: new Date(calcExpiryDate),
          subtotal: totals.subtotal,
          taxRate: taxRate || 0,
          taxAmount: totals.taxAmount,
          discountType: null,
          discountValue: null,
          discountAmount: 0,
          shippingAmount: 0,
          total: totals.total,
          totalCost: totals.totalCost,
          marginAmount: totals.marginAmount,
          marginPercent: totals.marginPercent,
          notes: template.notes,
          internalNotes: template.internalNotes,
          termsConditions: template.termsConditions,
          createdById: req.user.id,
          status: 'DRAFT',
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

      res.status(201).json(estimate);
    } catch (error) {
      console.error('POST /estimates/from-template/:templateId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PDF & EMAIL
  // ============================================

  // POST /estimates/:id/generate-pdf - Generate PDF for estimate
  router.post('/:id/generate-pdf', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
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

      // Get company settings
      const companySettings = await prisma.invoicingSettings.findFirst();

      // Generate PDF
      const pdfBuffer = await generateEstimatePDF(estimate, companySettings);

      // Upload to S3
      const s3Key = `estimates/${estimate.id}/${estimate.estimateNumber}.pdf`;
      await uploadPDFToS3(pdfBuffer, s3Key);

      // Update estimate with PDF reference
      const updated = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          pdfS3Key: s3Key,
          pdfGeneratedAt: new Date()
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      // Return signed URL for download
      const downloadUrl = await getPDFSignedUrl(s3Key, `${estimate.estimateNumber}.pdf`);

      res.json({
        estimate: updated,
        pdfUrl: downloadUrl,
        message: 'PDF generated successfully'
      });
    } catch (error) {
      console.error('POST /estimates/:id/generate-pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id/pdf - Download PDF
  router.get('/:id/pdf', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
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

      if (!estimate.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not generated yet. Call generate-pdf first.' });
      }

      // Get signed download URL
      const downloadUrl = await getPDFSignedUrl(estimate.pdfS3Key, `${estimate.estimateNumber}.pdf`);

      res.json({ pdfUrl: downloadUrl });
    } catch (error) {
      console.error('GET /estimates/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/send - Send estimate via email
  router.post('/:id/send', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
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

      const {
        toEmail,
        ccEmails = [],
        customMessage = '',
        attachProductPDFs = true,
        regeneratePDF = false
      } = req.body;

      // Use customer email if toEmail not specified
      const recipientEmail = toEmail || estimate.customer?.email;
      if (!recipientEmail) {
        return res.status(400).json({ error: 'Recipient email is required' });
      }

      // Get company settings
      const companySettings = await prisma.invoicingSettings.findFirst();

      // Generate PDF if not exists or if regenerate requested
      if (!estimate.pdfS3Key || regeneratePDF) {
        const pdfBuffer = await generateEstimatePDF(estimate, companySettings);
        const s3Key = `estimates/${estimate.id}/${estimate.estimateNumber}.pdf`;
        await uploadPDFToS3(pdfBuffer, s3Key);

        await prisma.estimate.update({
          where: { id: estimate.id },
          data: {
            pdfS3Key: s3Key,
            pdfGeneratedAt: new Date()
          }
        });

        // Reload estimate with updated pdfS3Key
        estimate.pdfS3Key = s3Key;
      }

      // Get user email settings
      const userEmailSettings = await prisma.userEmailSettings.findUnique({
        where: { userId: req.user.id }
      });

      // Send email
      const emailResult = await sendEstimateEmail(estimate, {
        toEmail: recipientEmail,
        ccEmails,
        customMessage,
        senderName: userEmailSettings?.fromName || req.user.name || 'Sales Team',
        senderEmail: req.user.email,
        replyTo: req.user.email,
        companySettings,
        attachProductPDFs,
        prisma
      });

      // Log email
      await prisma.emailLog.create({
        data: {
          estimateId: estimate.id,
          fromEmail: req.user.email,
          toEmail: recipientEmail,
          replyTo: req.user.email,
          subject: `Estimate ${estimate.estimateNumber} from ${companySettings?.companyName || 'Stealth Machine Tools'}`,
          sesMessageId: emailResult.messageId,
          status: 'SENT',
          sentById: req.user.id
        }
      });

      // Update estimate status and counts
      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          status: estimate.status === 'DRAFT' ? 'SENT' : estimate.status,
          lastSentAt: new Date(),
          sentCount: { increment: 1 }
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json({
        estimate: updatedEstimate,
        emailResult: {
          messageId: emailResult.messageId,
          sentTo: recipientEmail,
          ccEmails
        },
        message: 'Estimate sent successfully'
      });
    } catch (error) {
      console.error('POST /estimates/:id/send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id/email-history - Get email history for estimate
  router.get('/:id/email-history', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
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

      const emailLogs = await prisma.emailLog.findMany({
        where: { estimateId: estimate.id },
        include: {
          sentBy: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { sentAt: 'desc' }
      });

      res.json(emailLogs);
    } catch (error) {
      console.error('GET /estimates/:id/email-history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
