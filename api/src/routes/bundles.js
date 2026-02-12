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

export function createBundlesRouter(prisma) {
  const router = express.Router();

  // GET /bundles - List all bundles
  router.get('/', requireInvoicingPermission('VIEW_BUNDLES'), async (req, res) => {
    try {
      const { search, isActive, includeInactive } = req.query;

      let where = {};

      // By default, only show active bundles unless includeInactive is true
      if (includeInactive !== 'true') {
        where.isActive = true;
      } else if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // Search filter
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
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  description: true,
                  price: true,
                  cost: true,
                  taxable: true,
                  isActive: true
                }
              }
            },
            orderBy: { sortOrder: 'asc' }
          },
          attachments: {
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: { name: 'asc' }
      });

      // Calculate totals and margins for each bundle
      const bundlesWithCalcs = bundles.map(bundle => {
        // Calculate component totals (if items were priced individually)
        const componentPrice = bundle.items.reduce((sum, item) => {
          return sum + (item.product.price * item.quantity);
        }, 0);
        const componentCost = bundle.items.reduce((sum, item) => {
          const cost = item.product.cost || 0;
          return sum + (cost * item.quantity);
        }, 0);

        // Bundle savings (difference between component prices and bundle price)
        const savings = componentPrice - bundle.price;
        const savingsPercent = componentPrice > 0 ? ((savings / componentPrice) * 100).toFixed(2) : 0;

        // Bundle margin (profit)
        let margin = null;
        let marginPercent = null;
        if (bundle.price && bundle.cost) {
          margin = bundle.price - bundle.cost;
          marginPercent = ((margin / bundle.price) * 100).toFixed(2);
        } else if (bundle.price && componentCost > 0) {
          // Fallback: calculate margin from component costs
          margin = bundle.price - componentCost;
          marginPercent = ((margin / bundle.price) * 100).toFixed(2);
        }

        return {
          ...bundle,
          componentPrice,
          componentCost,
          savings,
          savingsPercent,
          margin,
          marginPercent,
          itemCount: bundle.items.length
        };
      });

      res.json(bundlesWithCalcs);
    } catch (error) {
      console.error('GET /bundles error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /bundles/search/autocomplete - Quick search for dropdowns
  router.get('/search/autocomplete', requireInvoicingPermission('VIEW_BUNDLES'), async (req, res) => {
    try {
      const { q, limit = 10 } = req.query;

      if (!q || q.length < 2) {
        return res.json([]);
      }

      const bundles = await prisma.bundle.findMany({
        where: {
          isActive: true,
          OR: [
            { sku: { contains: q } },
            { name: { contains: q } }
          ]
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true }
              }
            }
          }
        },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });

      // Format for autocomplete
      const results = bundles.map(b => ({
        id: b.id,
        value: b.id,
        label: b.name,
        name: b.name,
        price: b.price,
        cost: b.cost,
        description: b.description,
        itemCount: b.items.length,
        items: b.items.map(item => ({
          productId: item.product.id,
          productSku: item.product.sku,
          productName: item.product.name,
          quantity: item.quantity
        }))
      }));

      res.json(results);
    } catch (error) {
      console.error('GET /bundles/search/autocomplete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /bundles/:id - Get single bundle with items
  router.get('/:id', requireInvoicingPermission('VIEW_BUNDLES'), async (req, res) => {
    try {
      const bundle = await prisma.bundle.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  description: true,
                  price: true,
                  cost: true,
                  category: true,
                  isActive: true,
                  attachments: {
                    where: { isPrimary: true },
                    take: 1
                  }
                }
              }
            },
            orderBy: { sortOrder: 'asc' }
          },
          attachments: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!bundle) {
        return res.status(404).json({ error: 'Bundle not found' });
      }

      // Calculate totals
      const componentPrice = bundle.items.reduce((sum, item) => {
        return sum + (item.product.price * item.quantity);
      }, 0);
      const componentCost = bundle.items.reduce((sum, item) => {
        const cost = item.product.cost || 0;
        return sum + (cost * item.quantity);
      }, 0);

      const savings = componentPrice - bundle.price;
      const savingsPercent = componentPrice > 0 ? ((savings / componentPrice) * 100).toFixed(2) : 0;

      let margin = null;
      let marginPercent = null;
      if (bundle.price && bundle.cost) {
        margin = bundle.price - bundle.cost;
        marginPercent = ((margin / bundle.price) * 100).toFixed(2);
      } else if (bundle.price && componentCost > 0) {
        margin = bundle.price - componentCost;
        marginPercent = ((margin / bundle.price) * 100).toFixed(2);
      }

      // Add S3 URLs to attachments
      const attachmentsWithUrls = bundle.attachments.map(att => ({
        ...att,
        s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${att.s3Key}`
      }));

      res.json({
        ...bundle,
        attachments: attachmentsWithUrls,
        componentPrice,
        componentCost,
        savings,
        savingsPercent,
        margin,
        marginPercent
      });
    } catch (error) {
      console.error('GET /bundles/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /bundles - Create new bundle
  router.post('/', requireInvoicingPermission('CREATE_BUNDLE'), async (req, res) => {
    try {
      const {
        sku,
        name,
        description,
        price,
        cost,
        items // Array of { productId, quantity }
      } = req.body;

      // Validation
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      if (!price || parseFloat(price) <= 0) {
        return res.status(400).json({ error: 'Price is required and must be greater than 0' });
      }

      // Auto-generate SKU from name if not provided (bundles don't really need SKUs)
      let bundleSku = sku;
      if (!bundleSku) {
        // Generate a simple internal ID - not shown to users
        bundleSku = 'BDL-' + Date.now().toString(36).toUpperCase();
      }

      // Check for duplicate SKU
      const existing = await prisma.bundle.findUnique({
        where: { sku: bundleSku }
      });

      if (existing) {
        // Just regenerate if collision (unlikely)
        bundleSku = 'BDL-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
      }

      // Create bundle with items in a transaction
      const bundle = await prisma.$transaction(async (tx) => {
        const newBundle = await tx.bundle.create({
          data: {
            sku: bundleSku,
            name,
            description,
            price: parseFloat(price),
            cost: cost ? parseFloat(cost) : null,
            isActive: true
          }
        });

        // Add items if provided
        if (items && Array.isArray(items) && items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productId) {
              await tx.bundleItem.create({
                data: {
                  bundleId: newBundle.id,
                  productId: item.productId,
                  quantity: item.quantity || 1,
                  sortOrder: i
                }
              });
            }
          }
        }

        // Fetch complete bundle with items
        return tx.bundle.findUnique({
          where: { id: newBundle.id },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    price: true,
                    cost: true,
                    isActive: true
                  }
                }
              },
              orderBy: { sortOrder: 'asc' }
            },
            attachments: true
          }
        });
      });

      // Calculate totals
      const componentPrice = bundle.items.reduce((sum, item) => {
        return sum + (item.product.price * item.quantity);
      }, 0);

      res.status(201).json({
        ...bundle,
        componentPrice,
        savings: componentPrice - bundle.price
      });
    } catch (error) {
      console.error('POST /bundles error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /bundles/:id - Update bundle
  router.patch('/:id', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const existing = await prisma.bundle.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Bundle not found' });
      }

      const updateData = { ...req.body };

      // Handle numeric fields
      if (updateData.price !== undefined) {
        updateData.price = parseFloat(updateData.price);
      }
      if (updateData.cost !== undefined) {
        updateData.cost = updateData.cost ? parseFloat(updateData.cost) : null;
      }

      // Remove items from update data - handled separately
      delete updateData.items;

      // Check for duplicate SKU if changing
      if (updateData.sku && updateData.sku !== existing.sku) {
        const duplicate = await prisma.bundle.findUnique({
          where: { sku: updateData.sku }
        });
        if (duplicate) {
          return res.status(400).json({ error: 'A bundle with this SKU already exists' });
        }
      }

      const bundle = await prisma.bundle.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  price: true,
                  cost: true,
                  isActive: true
                }
              }
            },
            orderBy: { sortOrder: 'asc' }
          },
          attachments: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      // Calculate totals
      const componentPrice = bundle.items.reduce((sum, item) => {
        return sum + (item.product.price * item.quantity);
      }, 0);

      res.json({
        ...bundle,
        componentPrice,
        savings: componentPrice - bundle.price
      });
    } catch (error) {
      console.error('PATCH /bundles/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /bundles/:id - Delete bundle
  router.delete('/:id', requireInvoicingPermission('DELETE_BUNDLE'), async (req, res) => {
    try {
      const bundle = await prisma.bundle.findUnique({
        where: { id: req.params.id },
        include: {
          attachments: true
        }
      });

      if (!bundle) {
        return res.status(404).json({ error: 'Bundle not found' });
      }

      // Delete S3 attachments
      for (const attachment of bundle.attachments) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: attachment.s3Key
          });
          await s3Client.send(deleteCommand);
        } catch (s3Error) {
          console.error('S3 delete error (continuing):', s3Error);
        }
      }

      // Delete bundle (cascades to items and attachments)
      await prisma.bundle.delete({
        where: { id: req.params.id }
      });

      res.json({ message: 'Bundle deleted successfully' });
    } catch (error) {
      console.error('DELETE /bundles/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /bundles/:id/items - Add item to bundle
  router.post('/:id/items', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id } = req.params;
      const { productId, quantity } = req.body;

      // Validate bundle exists
      const bundle = await prisma.bundle.findUnique({
        where: { id }
      });

      if (!bundle) {
        return res.status(404).json({ error: 'Bundle not found' });
      }

      // Validate product exists
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Check if product already in bundle
      const existingItem = await prisma.bundleItem.findFirst({
        where: { bundleId: id, productId }
      });

      if (existingItem) {
        // Update quantity instead of creating duplicate
        const updated = await prisma.bundleItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + (quantity || 1) },
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                price: true,
                cost: true,
                isActive: true
              }
            }
          }
        });
        return res.json({ message: 'Item quantity updated', item: updated });
      }

      // Get current max sortOrder
      const maxSort = await prisma.bundleItem.aggregate({
        where: { bundleId: id },
        _max: { sortOrder: true }
      });
      const nextSortOrder = (maxSort._max.sortOrder || 0) + 1;

      // Create new bundle item
      const item = await prisma.bundleItem.create({
        data: {
          bundleId: id,
          productId,
          quantity: quantity || 1,
          sortOrder: nextSortOrder
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              cost: true,
              isActive: true
            }
          }
        }
      });

      res.status(201).json(item);
    } catch (error) {
      console.error('POST /bundles/:id/items error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /bundles/:id/items/:itemId - Update bundle item
  router.patch('/:id/items/:itemId', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id, itemId } = req.params;
      const { quantity, sortOrder } = req.body;

      const item = await prisma.bundleItem.findFirst({
        where: { id: itemId, bundleId: id }
      });

      if (!item) {
        return res.status(404).json({ error: 'Bundle item not found' });
      }

      const updateData = {};
      if (quantity !== undefined) updateData.quantity = parseFloat(quantity);
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);

      const updated = await prisma.bundleItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              cost: true,
              isActive: true
            }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /bundles/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /bundles/:id/items/:itemId - Remove item from bundle
  router.delete('/:id/items/:itemId', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id, itemId } = req.params;

      const item = await prisma.bundleItem.findFirst({
        where: { id: itemId, bundleId: id }
      });

      if (!item) {
        return res.status(404).json({ error: 'Bundle item not found' });
      }

      await prisma.bundleItem.delete({
        where: { id: itemId }
      });

      res.json({ message: 'Item removed from bundle' });
    } catch (error) {
      console.error('DELETE /bundles/:id/items/:itemId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /bundles/:id/attachments - Upload attachment to S3
  router.post('/:id/attachments', requireInvoicingPermission('EDIT_BUNDLE'), upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      const file = req.file;
      const { includeInEstimate } = req.body;

      // Validate bundle exists
      const bundle = await prisma.bundle.findUnique({
        where: { id }
      });

      if (!bundle) {
        return res.status(404).json({ error: 'Bundle not found' });
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
      const s3Key = `bundles/${id}/${timestamp}-${uniqueId}.${extension}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          'original-name': sanitizedName,
          'bundle-id': id,
          'uploaded-by': req.user.name || 'unknown'
        }
      });

      await s3Client.send(command);

      // Get current max sortOrder
      const maxSort = await prisma.bundleAttachment.aggregate({
        where: { bundleId: id },
        _max: { sortOrder: true }
      });
      const nextSortOrder = (maxSort._max.sortOrder || 0) + 1;

      // Save attachment record
      const attachment = await prisma.bundleAttachment.create({
        data: {
          bundleId: id,
          filename: sanitizedName,
          s3Key,
          fileSize: file.size,
          mimeType: file.mimetype,
          includeInEstimate: includeInEstimate !== 'false',
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
      console.error('POST /bundles/:id/attachments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /bundles/:id/attachments/:attachmentId - Remove attachment
  router.delete('/:id/attachments/:attachmentId', requireInvoicingPermission('EDIT_BUNDLE'), async (req, res) => {
    try {
      const { id, attachmentId } = req.params;

      const attachment = await prisma.bundleAttachment.findFirst({
        where: { id: attachmentId, bundleId: id }
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
      await prisma.bundleAttachment.delete({
        where: { id: attachmentId }
      });

      res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('DELETE /bundles/:id/attachments/:attachmentId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
