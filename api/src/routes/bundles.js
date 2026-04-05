import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg'
];

export function createBundlesRouter(prisma) {
  const router = express.Router();

  // GET /bundles - List all bundles
  router.get('/', requireInvoicingPermission('VIEW_BUNDLES'), async (req, res) => {
    try {
      const { search, isActive, includeInactive } = req.query;

      let where = {};

      if (includeInactive !== 'true') {
        where.isActive = true;
      } else if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      if (search) {
        where.OR = [
          { sku: { contains: search } },
          { name: { contains: search } },
          { description: { contains: search } }
        ];
      }

      const bundles = await prisma.bundle.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, description: true, price: true, cost: true, taxable: true, isActive: true }
              }
            },
            orderBy: { sortOrder: 'asc' }
          },
          attachments: { orderBy: { sortOrder: 'asc' } }
        },
        orderBy: { name: 'asc' }
      });

      const bundlesWithCalcs = bundles.map(bundle => {
        const componentPrice = bundle.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const componentCost  = bundle.items.reduce((sum, item) => sum + ((item.product.cost || 0) * item.quantity), 0);
        // price is always the sum of components
        const price = componentPrice;
        const savings = 0; // no manual discount
        const savingsPercent = 0;
        let margin = null;
        let marginPercent = null;
        if (price > 0 && componentCost > 0) {
          margin = price - componentCost;
          marginPercent = ((margin / price) * 100).toFixed(2);
        }
        return { ...bundle, price, componentPrice, componentCost, savings, savingsPercent, margin, marginPercent, itemCount: bundle.items.length };
      });

      res.json(bundlesWithCalcs);
    } catch (error) {
      console.error('GET /bundles error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /bundles/search/autocomplete
  router.get('/search/autocomplete', requireInvoicingPermission('VIEW_BUNDLES'), async (req, res) => {
    try {
      const { q, limit = 10 } = req.query;
      if (!q || q.length < 2) return res.json([]);

      const bundles = await prisma.bundle.findMany({
        where: {
          isActive: true,
          OR: [{ sku: { contains: q } }, { name: { contains: q } }]
        },
        include: {
          items: {
            include: { product: { select: { id: true, sku: true, name: true, price: true, cost: true, taxable: true } } }
          }
        },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });

      const results = bundles.map(b => {
        const componentPrice = b.items.reduce((sum, bi) => sum + (bi.product.price * bi.quantity), 0);
        return {
          id: b.id, value: b.id, label: b.name, name: b.name,
          price: componentPrice, cost: b.cost, description: b.description,
          itemCount: b.items.length,
          items: b.items.map(item => ({
            productId: item.product.id, productSku: item.product.sku,
            productName: item.product.name, quantity: item.quantity
          }))
        };
      });

      res.json(results);
    } catch (error) {
      console.error('GET /bundles/search/autocomplete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /bundles/:id
  router.get('/:id', requireInvoicingPermission('VIEW_BUNDLES'), async (req, res) => {
    try {
      const bundle = await prisma.bundle.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, description: true, price: true, cost: true, category: true, isActive: true, attachments: { where: { isPrimary: true }, take: 1 } }
              }
            },
            orderBy: { sortOrder: 'asc' }
          },
          attachments: { orderBy: { sortOrder: 'asc' } }
        }
      });

      if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

      const componentPrice = bundle.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const componentCost  = bundle.items.reduce((sum, item) => sum + ((item.product.cost || 0) * item.quantity), 0);
      const price = componentPrice;
      let margin = null;
      let marginPercent = null;
      if (price > 0 && componentCost > 0) {
        margin = price - componentCost;
        marginPercent = ((margin / price) * 100).toFixed(2);
      }

      const attachmentsWithUrls = bundle.attachments.map(att => ({
        ...att,
        s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${att.s3Key}`
      }));

      res.json({ ...bundle, price, attachments: attachmentsWithUrls, componentPrice, componentCost, savings: 0, savingsPercent: 0, margin, marginPercent });
    } catch (error) {
      console.error('GET /bundles/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /bundles - Create new bundle (price calculated from components)
  router.post('/', requireInvoicingPermission('CREATE_BUNDLE'), async (req, res) => {
    try {
      const { sku, name, description, items } = req.body;

      if (!name) return res.status(400).json({ error: 'Name is required' });

      let bundleSku = sku;
      if (!bundleSku) {
        bundleSku = 'BDL-' + Date.now().toString(36).toUpperCase();
      }

      const existing = await prisma.bundle.findUnique({ where: { sku: bundleSku } });
      if (existing) {
        bundleSku = 'BDL-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
      }

      // Resolve component prices to calculate bundle price
      let componentPrice = 0;
      let componentCost = 0;
      if (items && Array.isArray(items) && items.length > 0) {
        const productIds = items.map(i => i.productId).filter(Boolean);
        const productRecords = await prisma.product.findMany({ where: { id: { in: productIds } } });
        const productMap = Object.fromEntries(productRecords.map(p => [p.id, p]));
        for (const item of items) {
          const p = productMap[item.productId];
          if (p) {
            componentPrice += (p.price || 0) * (item.quantity || 1);
            componentCost  += (p.cost  || 0) * (item.quantity || 1);
          }
        }
      }

      const bundle = await prisma.$transaction(async (tx) => {
        const newBundle = await tx.bundle.create({
          data: {
            sku: bundleSku,
            name,
            description,
            price: componentPrice, // always set to component total
            cost: componentCost > 0 ? componentCost : null,
            isActive: true
          }
        });

        if (items && Array.isArray(items) && items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productId) {
              await tx.bundleItem.create({
                data: { bundleId: newBundle.id, productId: item.productId, quantity: item.quantity || 1, sortOrder: i }
              });
            }
          }
        }

        return tx.bundle.findUnique({
          where: { id: newBundle.id },
          include: {
            items: {
              include: { product: { select: { id: true, sku: true, name: true, price: true, cost: true, isActive: true } } },
              orderBy: { sortOrder: 'asc' }
            },
            attachments: true
          }
        });
      });

      res.status(201).json({ ...bundle, componentPrice, savings: 0, savingsPercent: 0 });
    } catch (error) {
      console.error('POST /bundles error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /bundles/:id - Update bundle (recalculates price from items)
  router.patch('/:id', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const existing = await prisma.bundle.findUnique({
        where: { id: req.params.id },
        include: { items: { include: { product: { select: { price: true, cost: true } } } } }
      });

      if (!existing) return res.status(404).json({ error: 'Bundle not found' });

      const updateData = { ...req.body };
      delete updateData.items;
      // Never allow manual price override — always recalculate
      delete updateData.price;
      delete updateData.cost;

      if (updateData.sku && updateData.sku !== existing.sku) {
        const duplicate = await prisma.bundle.findUnique({ where: { sku: updateData.sku } });
        if (duplicate) return res.status(400).json({ error: 'A bundle with this SKU already exists' });
      }

      // Recalculate price from current items
      const componentPrice = existing.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const componentCost  = existing.items.reduce((sum, item) => sum + ((item.product.cost || 0) * item.quantity), 0);
      updateData.price = componentPrice;
      updateData.cost  = componentCost > 0 ? componentCost : null;

      const bundle = await prisma.bundle.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          items: {
            include: { product: { select: { id: true, sku: true, name: true, price: true, cost: true, isActive: true } } },
            orderBy: { sortOrder: 'asc' }
          },
          attachments: { orderBy: { sortOrder: 'asc' } }
        }
      });

      let margin = null;
      let marginPercent = null;
      if (componentPrice > 0 && componentCost > 0) {
        margin = componentPrice - componentCost;
        marginPercent = ((margin / componentPrice) * 100).toFixed(2);
      }

      res.json({ ...bundle, componentPrice, componentCost, savings: 0, savingsPercent: 0, margin, marginPercent });
    } catch (error) {
      console.error('PATCH /bundles/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /bundles/:id
  router.delete('/:id', requireInvoicingPermission('DELETE_BUNDLE'), async (req, res) => {
    try {
      const bundle = await prisma.bundle.findUnique({
        where: { id: req.params.id },
        include: { attachments: true }
      });

      if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

      for (const attachment of bundle.attachments) {
        try {
          await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: attachment.s3Key }));
        } catch (s3Error) {
          console.error('S3 delete error (continuing):', s3Error);
        }
      }

      await prisma.bundle.delete({ where: { id: req.params.id } });
      res.json({ message: 'Bundle deleted successfully' });
    } catch (error) {
      console.error('DELETE /bundles/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /bundles/:id/items - Add item (then recalculate price)
  router.post('/:id/items', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id } = req.params;
      const { productId, quantity } = req.body;

      const bundle = await prisma.bundle.findUnique({ where: { id } });
      if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const existingItem = await prisma.bundleItem.findFirst({ where: { bundleId: id, productId } });

      let item;
      if (existingItem) {
        item = await prisma.bundleItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + (quantity || 1) },
          include: { product: { select: { id: true, sku: true, name: true, price: true, cost: true, isActive: true } } }
        });
      } else {
        const maxSort = await prisma.bundleItem.aggregate({ where: { bundleId: id }, _max: { sortOrder: true } });
        item = await prisma.bundleItem.create({
          data: { bundleId: id, productId, quantity: quantity || 1, sortOrder: (maxSort._max.sortOrder || 0) + 1 },
          include: { product: { select: { id: true, sku: true, name: true, price: true, cost: true, isActive: true } } }
        });
      }

      // Recalculate and persist price
      await recalculateBundlePrice(prisma, id);

      res.status(existingItem ? 200 : 201).json({ message: existingItem ? 'Item quantity updated' : 'Item added', item });
    } catch (error) {
      console.error('POST /bundles/:id/items error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /bundles/:id/items/:itemId
  router.patch('/:id/items/:itemId', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id, itemId } = req.params;
      const { quantity, sortOrder } = req.body;

      const item = await prisma.bundleItem.findFirst({ where: { id: itemId, bundleId: id } });
      if (!item) return res.status(404).json({ error: 'Bundle item not found' });

      const updateData = {};
      if (quantity !== undefined) updateData.quantity = parseFloat(quantity);
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);

      const updated = await prisma.bundleItem.update({
        where: { id: itemId },
        data: updateData,
        include: { product: { select: { id: true, sku: true, name: true, price: true, cost: true, isActive: true } } }
      });

      await recalculateBundlePrice(prisma, id);

      res.json(updated);
    } catch (error) {
      console.error('PATCH /bundles/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /bundles/:id/items/:itemId
  router.delete('/:id/items/:itemId', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id, itemId } = req.params;

      const item = await prisma.bundleItem.findFirst({ where: { id: itemId, bundleId: id } });
      if (!item) return res.status(404).json({ error: 'Bundle item not found' });

      await prisma.bundleItem.delete({ where: { id: itemId } });
      await recalculateBundlePrice(prisma, id);

      res.json({ message: 'Item removed from bundle' });
    } catch (error) {
      console.error('DELETE /bundles/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /bundles/:id/attachments
  router.post('/:id/attachments', requireInvoicingPermission('EDIT_BUNDLE'), upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      const file = req.file;
      const { includeInEstimate } = req.body;

      const bundle = await prisma.bundle.findUnique({ where: { id } });
      if (!bundle) return res.status(404).json({ error: 'Bundle not found' });
      if (!file) return res.status(400).json({ error: 'No file provided' });
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) return res.status(400).json({ error: 'File type not allowed' });

      const uniqueId = crypto.randomBytes(16).toString('hex');
      const extension = file.originalname.split('.').pop().toLowerCase();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Key = `bundles/${id}/${Date.now()}-${uniqueId}.${extension}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
        Metadata: { 'original-name': sanitizedName, 'bundle-id': id, 'uploaded-by': req.user.name || 'unknown' }
      }));

      const maxSort = await prisma.bundleAttachment.aggregate({ where: { bundleId: id }, _max: { sortOrder: true } });
      const attachment = await prisma.bundleAttachment.create({
        data: { bundleId: id, filename: sanitizedName, s3Key, fileSize: file.size, mimeType: file.mimetype, includeInEstimate: includeInEstimate !== 'false', sortOrder: (maxSort._max.sortOrder || 0) + 1 }
      });

      res.status(201).json({
        message: 'Attachment uploaded successfully',
        attachment: { ...attachment, s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}` }
      });
    } catch (error) {
      console.error('POST /bundles/:id/attachments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /bundles/:id/attachments/:attachmentId
  router.delete('/:id/attachments/:attachmentId', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id, attachmentId } = req.params;
      const attachment = await prisma.bundleAttachment.findFirst({ where: { id: attachmentId, bundleId: id } });
      if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

      try { await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: attachment.s3Key })); } catch {}
      await prisma.bundleAttachment.delete({ where: { id: attachmentId } });
      res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('DELETE /bundles/:id/attachments/:attachmentId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// Helper: recalculate and persist bundle price from current items
async function recalculateBundlePrice(prisma, bundleId) {
  const items = await prisma.bundleItem.findMany({
    where: { bundleId },
    include: { product: { select: { price: true, cost: true } } }
  });
  const componentPrice = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const componentCost  = items.reduce((sum, item) => sum + ((item.product.cost || 0) * item.quantity), 0);
  await prisma.bundle.update({
    where: { id: bundleId },
    data: { price: componentPrice, cost: componentCost > 0 ? componentCost : null }
  });
}
