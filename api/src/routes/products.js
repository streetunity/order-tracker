import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET;

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg'
];

export function createProductsRouter(prisma) {
  const router = express.Router();

  // GET /products - List all products with filters
  router.get('/', requireInvoicingPermission('VIEW_PRODUCTS'), async (req, res) => {
    try {
      const { search, category, isActive, includeInactive } = req.query;

      let where = {};

      // By default, only show active products unless includeInactive is true
      if (includeInactive !== 'true') {
        where.isActive = true;
      } else if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // Category filter
      if (category) {
        where.category = category;
      }

      // Search filter
      if (search) {
        where.OR = [
          { sku: { contains: search , mode: 'insensitive'} },
          { name: { contains: search , mode: 'insensitive'} },
          { description: { contains: search , mode: 'insensitive'} },
          { modelNumber: { contains: search , mode: 'insensitive'} }
        ];
      }

      const products = await prisma.product.findMany({
        where,
        include: {
          attachments: {
            orderBy: { sortOrder: 'asc' }
          },
          _count: {
            select: { bundleItems: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      // Calculate margin for each product
      const productsWithMargin = products.map(product => {
        let margin = null;
        let marginPercent = null;
        if (product.price && product.cost) {
          margin = product.price - product.cost;
          marginPercent = ((margin / product.price) * 100).toFixed(2);
        }
        return {
          ...product,
          margin,
          marginPercent,
          bundleCount: product._count.bundleItems
        };
      });

      res.json(productsWithMargin);
    } catch (error) {
      console.error('GET /products error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /products/categories - Get list of categories
  router.get('/categories', requireInvoicingPermission('VIEW_PRODUCTS'), async (req, res) => {
    try {
      const categories = await prisma.product.findMany({
        where: { category: { not: null } },
        select: { category: true },
        distinct: ['category']
      });
      res.json(categories.map(c => c.category).filter(Boolean).sort());
    } catch (error) {
      console.error('GET /products/categories error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /products/search/autocomplete - Quick search for dropdowns
  router.get('/search/autocomplete', requireInvoicingPermission('VIEW_PRODUCTS'), async (req, res) => {
    try {
      const { q, limit = 50 } = req.query;

      // Allow single character search, return empty only if no query
      if (!q || q.length < 1) {
        return res.json([]);
      }

      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          OR: [
            { sku: { contains: q , mode: 'insensitive'} },
            { name: { contains: q , mode: 'insensitive'} },
            { modelNumber: { contains: q , mode: 'insensitive'} }
          ]
        },
        select: {
          id: true,
          sku: true,
          name: true,
          price: true,
          cost: true,
          category: true,
          description: true
        },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });

      // Format for autocomplete
      const results = products.map(p => ({
        id: p.id,
        value: p.id,
        label: `${p.sku} - ${p.name}`,
        sku: p.sku,
        name: p.name,
        price: p.price,
        cost: p.cost,
        category: p.category,
        description: p.description
      }));

      res.json(results);
    } catch (error) {
      console.error('GET /products/search/autocomplete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /products/:id - Get single product with attachments
  router.get('/:id', requireInvoicingPermission('VIEW_PRODUCTS'), async (req, res) => {
    try {
      const product = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: {
          attachments: {
            orderBy: { sortOrder: 'asc' }
          },
          bundleItems: {
            include: {
              bundle: {
                select: { id: true, sku: true, name: true, isActive: true }
              }
            }
          }
        }
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Calculate margin
      let margin = null;
      let marginPercent = null;
      if (product.price && product.cost) {
        margin = product.price - product.cost;
        marginPercent = ((margin / product.price) * 100).toFixed(2);
      }

      res.json({
        ...product,
        margin,
        marginPercent
      });
    } catch (error) {
      console.error('GET /products/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /products - Create new product
  router.post('/', requireInvoicingPermission('CREATE_PRODUCT'), async (req, res) => {
    try {
      const {
        sku,
        name,
        description,
        modelNumber,
        price,
        cost,
        category,
        taxable
      } = req.body;

      // Validation
      if (!sku || !name) {
        return res.status(400).json({ error: 'SKU and name are required' });
      }

      // Check for duplicate SKU
      const existing = await prisma.product.findUnique({
        where: { sku }
      });

      if (existing) {
        return res.status(400).json({ error: 'A product with this SKU already exists' });
      }

      const product = await prisma.product.create({
        data: {
          sku,
          name,
          itemName: name,
          productServiceName: name,
          description,
          salesDescription: description,
          modelNumber,
          price: price ? parseFloat(price) : 0,
          cost: cost ? parseFloat(cost) : null,
          category,
          taxable: taxable !== false,
          isActive: true
        },
        include: {
          attachments: true
        }
      });

      // Calculate margin
      let margin = null;
      let marginPercent = null;
      if (product.price && product.cost) {
        margin = product.price - product.cost;
        marginPercent = ((margin / product.price) * 100).toFixed(2);
      }

      res.status(201).json({
        ...product,
        margin,
        marginPercent
      });
    } catch (error) {
      console.error('POST /products error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /products/:id - Update product
  router.patch('/:id', requireInvoicingPermission('EDIT_PRODUCT'), async (req, res) => {
    try {
      const existing = await prisma.product.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Whitelist allowed fields to prevent Prisma errors
      const allowedFields = [
        'sku', 'name', 'description', 'modelNumber',
        'price', 'cost', 'category', 'taxable', 'isActive'
      ];

      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      console.log('[Products PATCH] Received:', req.body);
      console.log('[Products PATCH] Updating with:', updateData);

      // Handle numeric fields
      if (updateData.price !== undefined) {
        updateData.price = updateData.price ? parseFloat(updateData.price) : 0;
      }
      if (updateData.cost !== undefined) {
        updateData.cost = updateData.cost ? parseFloat(updateData.cost) : null;
      }

      // Keep backwards compatibility fields in sync
      if (updateData.name !== undefined) {
        updateData.itemName = updateData.name;
        updateData.productServiceName = updateData.name;
      }
      if (updateData.description !== undefined) {
        updateData.salesDescription = updateData.description;
      }

      // Check for duplicate SKU if changing
      if (updateData.sku && updateData.sku !== existing.sku) {
        const duplicate = await prisma.product.findUnique({
          where: { sku: updateData.sku }
        });
        if (duplicate) {
          return res.status(400).json({ error: 'A product with this SKU already exists' });
        }
      }

      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          attachments: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      // Calculate margin
      let margin = null;
      let marginPercent = null;
      if (product.price && product.cost) {
        margin = product.price - product.cost;
        marginPercent = ((margin / product.price) * 100).toFixed(2);
      }

      res.json({
        ...product,
        margin,
        marginPercent
      });
    } catch (error) {
      console.error('PATCH /products/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /products/:id - Deactivate (soft) or permanently delete (?force=true)
  router.delete('/:id', requireInvoicingPermission('DELETE_PRODUCT'), async (req, res) => {
    try {
      const force = req.query.force === 'true';

      const product = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: { bundleItems: true, attachments: true }
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (force) {
        // Check if referenced in estimate or invoice line items
        let usageCount = 0;
        try { usageCount += await prisma.estimateItem.count({ where: { productId: req.params.id } }); } catch {}
        try { usageCount += await prisma.invoiceItem.count({ where: { productId: req.params.id } }); } catch {}

        if (usageCount > 0) {
          return res.status(400).json({
            error: `Cannot permanently delete: this product appears in ${usageCount} estimate or invoice line item(s). Deactivate it instead.`
          });
        }

        // Delete S3 attachments
        for (const att of product.attachments) {
          try {
            await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: att.s3Key }));
          } catch (s3Err) {
            console.error('S3 delete error (continuing):', s3Err);
          }
        }

        // Hard delete — cascade removes attachments and bundleItems
        await prisma.product.delete({ where: { id: req.params.id } });
        return res.json({ message: 'Product permanently deleted' });
      }

      // Soft delete (deactivate)
      if (product.bundleItems.length > 0) {
        const updated = await prisma.product.update({
          where: { id: req.params.id },
          data: { isActive: false }
        });
        return res.json({
          message: 'Product deactivated (used in bundles)',
          product: updated,
          warning: `Product is used in ${product.bundleItems.length} bundle(s)`
        });
      }

      const updated = await prisma.product.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      res.json({ message: 'Product deactivated', product: updated });
    } catch (error) {
      console.error('DELETE /products/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /products/:id/attachments - Upload attachment to S3
  router.post('/:id/attachments', requireInvoicingPermission('MANAGE_PRODUCT_ATTACHMENTS'), upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      const file = req.file;
      const { includeInEstimate, includeInInvoice, isPrimary } = req.body;

      // Validate product exists
      const product = await prisma.product.findUnique({
        where: { id }
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Validate file
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
        return res.status(400).json({ error: 'File type not allowed. Allowed: PDF, JPG, PNG, WEBP' });
      }

      // Generate S3 key
      const uniqueId = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();
      const extension = file.originalname.split('.').pop().toLowerCase();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Key = `products/${id}/${timestamp}-${uniqueId}.${extension}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          'original-name': sanitizedName,
          'product-id': id,
          'uploaded-by': req.user.name || 'unknown'
        }
      });

      await s3Client.send(command);

      // Get current max sortOrder
      const maxSort = await prisma.productAttachment.aggregate({
        where: { productId: id },
        _max: { sortOrder: true }
      });
      const nextSortOrder = (maxSort._max.sortOrder || 0) + 1;

      // If setting as primary, unset other primaries
      if (isPrimary === 'true' || isPrimary === true) {
        await prisma.productAttachment.updateMany({
          where: { productId: id, isPrimary: true },
          data: { isPrimary: false }
        });
      }

      // Save attachment record
      const attachment = await prisma.productAttachment.create({
        data: {
          productId: id,
          filename: sanitizedName,
          s3Key,
          fileSize: file.size,
          mimeType: file.mimetype,
          includeInEstimate: includeInEstimate !== 'false',
          includeInInvoice: includeInInvoice === 'true',
          isPrimary: isPrimary === 'true' || isPrimary === true,
          sortOrder: nextSortOrder
        }
      });

      res.status(201).json({
        message: 'Attachment uploaded successfully',
        attachment: {
          ...attachment,
          s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`
        }
      });
    } catch (error) {
      console.error('POST /products/:id/attachments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /products/:id/attachments - List attachments
  router.get('/:id/attachments', requireInvoicingPermission('VIEW_PRODUCTS'), async (req, res) => {
    try {
      const attachments = await prisma.productAttachment.findMany({
        where: { productId: req.params.id },
        orderBy: { sortOrder: 'asc' }
      });

      // Add S3 URLs
      const attachmentsWithUrls = attachments.map(att => ({
        ...att,
        s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${att.s3Key}`
      }));

      res.json(attachmentsWithUrls);
    } catch (error) {
      console.error('GET /products/:id/attachments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /products/:id/attachments/:attachmentId - Update attachment metadata
  router.patch('/:id/attachments/:attachmentId', requireInvoicingPermission('MANAGE_PRODUCT_ATTACHMENTS'), async (req, res) => {
    try {
      const { id, attachmentId } = req.params;
      const { includeInEstimate, includeInInvoice, isPrimary, sortOrder } = req.body;

      const attachment = await prisma.productAttachment.findFirst({
        where: { id: attachmentId, productId: id }
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // If setting as primary, unset other primaries
      if (isPrimary === true) {
        await prisma.productAttachment.updateMany({
          where: { productId: id, isPrimary: true, id: { not: attachmentId } },
          data: { isPrimary: false }
        });
      }

      const updateData = {};
      if (includeInEstimate !== undefined) updateData.includeInEstimate = includeInEstimate;
      if (includeInInvoice !== undefined) updateData.includeInInvoice = includeInInvoice;
      if (isPrimary !== undefined) updateData.isPrimary = isPrimary;
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);

      const updated = await prisma.productAttachment.update({
        where: { id: attachmentId },
        data: updateData
      });

      res.json({
        ...updated,
        s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${updated.s3Key}`
      });
    } catch (error) {
      console.error('PATCH /products/:id/attachments/:attachmentId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /products/:id/attachments/:attachmentId - Remove attachment
  router.delete('/:id/attachments/:attachmentId', requireInvoicingPermission('MANAGE_PRODUCT_ATTACHMENTS'), async (req, res) => {
    try {
      const { id, attachmentId } = req.params;

      const attachment = await prisma.productAttachment.findFirst({
        where: { id: attachmentId, productId: id }
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Delete from S3
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: attachment.s3Key
        });
        await s3Client.send(deleteCommand);
      } catch (s3Error) {
        console.error('S3 delete error (continuing):', s3Error);
      }

      // Delete from database
      await prisma.productAttachment.delete({
        where: { id: attachmentId }
      });

      res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('DELETE /products/:id/attachments/:attachmentId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
