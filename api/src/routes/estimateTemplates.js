import express from 'express';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';

export function createEstimateTemplatesRouter(prisma) {
  const router = express.Router();

  // GET /estimate-templates - List all templates
  router.get('/', requireInvoicingPermission('VIEW_ALL_ESTIMATES'), async (req, res) => {
    try {
      const { search, isActive } = req.query;

      let where = {};

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      } else {
        where.isActive = true;
      }

      if (search) {
        where.OR = [
          { name: { contains: search } },
          { description: { contains: search } }
        ];
      }

      const templates = await prisma.estimateTemplate.findMany({
        where,
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          _count: {
            select: { items: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      // Calculate totals for each template
      const templatesWithTotals = await Promise.all(templates.map(async (template) => {
        let total = 0;
        for (const item of template.items) {
          if (item.productId) {
            const product = await prisma.product.findUnique({ where: { id: item.productId } });
            if (product) {
              total += product.price * (item.quantity || 1);
            }
          } else if (item.bundleId) {
            const bundle = await prisma.bundle.findUnique({ where: { id: item.bundleId } });
            if (bundle) {
              total += bundle.price * (item.quantity || 1);
            }
          } else if (item.customPrice) {
            total += item.customPrice * (item.quantity || 1);
          }
        }
        return { ...template, estimatedTotal: total };
      }));

      res.json(templatesWithTotals);
    } catch (error) {
      console.error('GET /estimate-templates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimate-templates/:id - Get single template with items
  router.get('/:id', requireInvoicingPermission('VIEW_ALL_ESTIMATES'), async (req, res) => {
    try {
      const template = await prisma.estimateTemplate.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Expand item details with product/bundle info
      const itemsWithDetails = await Promise.all(template.items.map(async (item) => {
        let productData = null;
        let bundleData = null;

        if (item.productId) {
          productData = await prisma.product.findUnique({
            where: { id: item.productId },
            select: { id: true, sku: true, name: true, price: true, cost: true, description: true }
          });
        }
        if (item.bundleId) {
          bundleData = await prisma.bundle.findUnique({
            where: { id: item.bundleId },
            select: { id: true, sku: true, name: true, price: true, cost: true, description: true }
          });
        }

        return {
          ...item,
          product: productData,
          bundle: bundleData
        };
      }));

      res.json({ ...template, items: itemsWithDetails });
    } catch (error) {
      console.error('GET /estimate-templates/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimate-templates - Create new template
  router.post('/', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const {
        name,
        description,
        notes,
        internalNotes,
        termsConditions,
        validityDays,
        items
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Template name is required' });
      }

      const template = await prisma.estimateTemplate.create({
        data: {
          name,
          description,
          notes,
          internalNotes,
          termsConditions,
          validityDays: validityDays || 30,
          createdById: req.user.id,
          items: {
            create: (items || []).map((item, index) => ({
              productId: item.productId || null,
              bundleId: item.bundleId || null,
              customName: item.customName,
              customDescription: item.customDescription,
              customPrice: item.customPrice,
              quantity: item.quantity || 1,
              sortOrder: index
            }))
          }
        },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.status(201).json(template);
    } catch (error) {
      console.error('POST /estimate-templates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimate-templates/from-estimate/:estimateId - Save estimate as template
  router.post('/from-estimate/:estimateId', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.estimateId },
        include: {
          items: { orderBy: { sortOrder: 'asc' } }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Template name is required' });
      }

      const template = await prisma.estimateTemplate.create({
        data: {
          name,
          description: description || `Template created from ${estimate.estimateNumber}`,
          notes: estimate.notes,
          internalNotes: estimate.internalNotes,
          termsConditions: estimate.termsConditions,
          validityDays: 30,
          createdById: req.user.id,
          items: {
            create: estimate.items.map((item, index) => ({
              productId: item.productId || null,
              bundleId: item.fromBundleId || null,
              customName: item.productId ? null : item.name,
              customDescription: item.productId ? null : item.description,
              customPrice: item.productId ? null : item.unitPrice,
              quantity: item.quantity,
              sortOrder: index
            }))
          }
        },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.status(201).json(template);
    } catch (error) {
      console.error('POST /estimate-templates/from-estimate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /estimate-templates/:id - Update template
  router.patch('/:id', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const existing = await prisma.estimateTemplate.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const {
        name,
        description,
        notes,
        internalNotes,
        termsConditions,
        validityDays,
        isActive,
        items
      } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (notes !== undefined) updateData.notes = notes;
      if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
      if (termsConditions !== undefined) updateData.termsConditions = termsConditions;
      if (validityDays !== undefined) updateData.validityDays = validityDays;
      if (isActive !== undefined) updateData.isActive = isActive;

      // If items are provided, replace all items
      if (items !== undefined) {
        await prisma.estimateTemplateItem.deleteMany({
          where: { templateId: req.params.id }
        });

        await prisma.estimateTemplateItem.createMany({
          data: items.map((item, index) => ({
            templateId: req.params.id,
            productId: item.productId || null,
            bundleId: item.bundleId || null,
            customName: item.customName,
            customDescription: item.customDescription,
            customPrice: item.customPrice,
            quantity: item.quantity || 1,
            sortOrder: index
          }))
        });
      }

      const updated = await prisma.estimateTemplate.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /estimate-templates/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /estimate-templates/:id - Delete template (soft delete via isActive)
  router.delete('/:id', requireInvoicingPermission('DELETE_ESTIMATE'), async (req, res) => {
    try {
      const template = await prisma.estimateTemplate.findUnique({
        where: { id: req.params.id }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      await prisma.estimateTemplate.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      res.json({ message: 'Template deleted successfully' });
    } catch (error) {
      console.error('DELETE /estimate-templates/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimate-templates/:id/items - Add item to template
  router.post('/:id/items', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const template = await prisma.estimateTemplate.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const { productId, bundleId, customName, customDescription, customPrice, quantity } = req.body;

      const maxSortOrder = template.items.reduce((max, item) => Math.max(max, item.sortOrder), -1);

      const item = await prisma.estimateTemplateItem.create({
        data: {
          templateId: template.id,
          productId: productId || null,
          bundleId: bundleId || null,
          customName,
          customDescription,
          customPrice,
          quantity: quantity || 1,
          sortOrder: maxSortOrder + 1
        }
      });

      res.status(201).json(item);
    } catch (error) {
      console.error('POST /estimate-templates/:id/items error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /estimate-templates/:id/items/:itemId - Remove item from template
  router.delete('/:id/items/:itemId', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const item = await prisma.estimateTemplateItem.findUnique({
        where: { id: req.params.itemId }
      });

      if (!item || item.templateId !== req.params.id) {
        return res.status(404).json({ error: 'Item not found' });
      }

      await prisma.estimateTemplateItem.delete({
        where: { id: req.params.itemId }
      });

      res.json({ message: 'Item deleted' });
    } catch (error) {
      console.error('DELETE /estimate-templates/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
