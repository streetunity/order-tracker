import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authGuard } from '../middleware/auth.js';
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from '../services/fileUploadService.js';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, BROKER_DOCUMENT_TYPES } from './itemDocuments.js';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware for internal staff (admin + agent) - can manage shipments
const requireInternalStaff = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Middleware for admin-only routes (delete shipment)
const requireAdmin = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Middleware for broker, admin, or agent (can view/upload docs)
const requireBrokerOrStaff = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT', 'BROKER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// =============================
// SHIPMENT CRUD OPERATIONS
// =============================

/**
 * GET /api/shipments
 * List all shipments with item counts
 */
router.get('/', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { status, search } = req.query;

    const where = {};
    if (status) {
      where.customsDocumentStatus = status;
    }
    if (search) {
      where.OR = [
        { containerNumber: { contains: search } },
        { billOfLading: { contains: search } }
      ];
    }

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        items: {
          where: { archivedAt: null },
          select: {
            id: true,
            productCode: true,
            currentStage: true,
            order: {
              select: {
                id: true,
                poNumber: true,
                account: {
                  select: { name: true }
                }
              }
            }
          }
        },
        documents: {
          select: {
            id: true,
            documentType: true
          }
        },
        _count: {
          select: { items: true, documents: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(shipments);
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

/**
 * GET /api/shipments/:id
 * Get single shipment with full details
 */
router.get('/:id', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        items: {
          where: { archivedAt: null },
          include: {
            order: {
              select: {
                id: true,
                poNumber: true,
                sku: true,
                account: {
                  select: { id: true, name: true, email: true, phone: true }
                }
              }
            }
          }
        },
        documents: {
          orderBy: { uploadedAt: 'desc' }
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50
        }
      }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    res.json(shipment);
  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({ error: 'Failed to fetch shipment' });
  }
});

/**
 * POST /api/shipments
 * Create a new shipment (Admin or Agent)
 */
router.post('/', authGuard, requireInternalStaff, async (req, res) => {
  try {
    const { containerNumber, billOfLading, etaDate, vesselName, portOfOrigin, portOfDestination } = req.body;

    if (!containerNumber && !billOfLading) {
      return res.status(400).json({ error: 'Container number or Bill of Lading is required' });
    }

    const shipment = await prisma.shipment.create({
      data: {
        containerNumber,
        billOfLading,
        etaDate: etaDate ? new Date(etaDate) : null,
        vesselName,
        portOfOrigin,
        portOfDestination,
        createdByUserId: req.user.id,
        createdByName: req.user.name
      }
    });

    // Log creation
    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: shipment.id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'CREATED',
        notes: `Created shipment ${containerNumber || billOfLading}`
      }
    });

    res.json(shipment);
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

/**
 * PUT /api/shipments/:id
 * Update shipment details
 */
router.put('/:id', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { containerNumber, billOfLading, etaDate, vesselName, portOfOrigin, portOfDestination, customsDocumentStatus, customsNotes } = req.body;

    const current = await prisma.shipment.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const updateData = {};
    if (containerNumber !== undefined) updateData.containerNumber = containerNumber;
    if (billOfLading !== undefined) updateData.billOfLading = billOfLading;
    if (etaDate !== undefined) updateData.etaDate = etaDate ? new Date(etaDate) : null;
    if (vesselName !== undefined) updateData.vesselName = vesselName;
    if (portOfOrigin !== undefined) updateData.portOfOrigin = portOfOrigin;
    if (portOfDestination !== undefined) updateData.portOfDestination = portOfDestination;
    if (customsNotes !== undefined) updateData.customsNotes = customsNotes;

    // Handle customs status changes
    if (customsDocumentStatus !== undefined && customsDocumentStatus !== current.customsDocumentStatus) {
      updateData.customsDocumentStatus = customsDocumentStatus;
      
      if (customsDocumentStatus === 'FILED' && !current.customsFiledDate) {
        updateData.customsFiledDate = new Date();
      }
      if (customsDocumentStatus === 'CLEARED' && !current.customsClearedDate) {
        updateData.customsClearedDate = new Date();
      }

      // Log status change
      await prisma.shipmentActivityLog.create({
        data: {
          shipmentId: id,
          userId: req.user.id,
          userName: req.user.name,
          action: 'STATUS_UPDATED',
          oldStatus: current.customsDocumentStatus,
          newStatus: customsDocumentStatus,
          notes: customsNotes
        }
      });
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          where: { archivedAt: null },
          select: { id: true, productCode: true }
        },
        _count: { select: { items: true, documents: true } }
      }
    });

    res.json(shipment);
  } catch (error) {
    console.error('Error updating shipment:', error);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
});

/**
 * DELETE /api/shipments/:id
 * Delete a shipment (only if no items linked) - Admin only
 */
router.delete('/:id', authGuard, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (shipment._count.items > 0) {
      return res.status(400).json({ error: 'Cannot delete shipment with linked items. Unlink items first.' });
    }

    // Delete documents and activity logs (cascade)
    await prisma.shipment.delete({ where: { id } });

    res.json({ message: 'Shipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting shipment:', error);
    res.status(500).json({ error: 'Failed to delete shipment' });
  }
});

// =============================
// ITEM LINKING
// =============================

/**
 * POST /api/shipments/:id/link-item
 * Link an item to a shipment (Admin or Agent)
 */
router.post('/:id/link-item', authGuard, requireInternalStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: { select: { poNumber: true, account: { select: { name: true } } } } }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.shipmentId) {
      return res.status(400).json({ error: 'Item is already linked to a shipment' });
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: { shipmentId: id }
    });

    // Log the linking
    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'ITEM_LINKED',
        notes: `Linked item ${item.productCode} from ${item.order.account?.name || 'Unknown'}`,
        metadata: JSON.stringify({ itemId, productCode: item.productCode, customer: item.order.account?.name })
      }
    });

    res.json({ message: 'Item linked successfully' });
  } catch (error) {
    console.error('Error linking item:', error);
    res.status(500).json({ error: 'Failed to link item' });
  }
});

/**
 * POST /api/shipments/:id/unlink-item
 * Unlink an item from a shipment (Admin or Agent)
 */
router.post('/:id/unlink-item', authGuard, requireInternalStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: { select: { account: { select: { name: true } } } } }
    });

    if (!item || item.shipmentId !== id) {
      return res.status(400).json({ error: 'Item is not linked to this shipment' });
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: { shipmentId: null }
    });

    // Log the unlinking
    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'ITEM_UNLINKED',
        notes: `Unlinked item ${item.productCode}`,
        metadata: JSON.stringify({ itemId, productCode: item.productCode })
      }
    });

    res.json({ message: 'Item unlinked successfully' });
  } catch (error) {
    console.error('Error unlinking item:', error);
    res.status(500).json({ error: 'Failed to unlink item' });
  }
});

/**
 * GET /api/shipments/search-items
 * Search for items that can be linked (not already linked)
 */
router.get('/search-items', authGuard, requireInternalStaff, async (req, res) => {
  try {
    const { search, stage } = req.query;

    const where = {
      shipmentId: null,
      archivedAt: null
    };

    if (stage) {
      where.currentStage = stage;
    }

    if (search) {
      where.OR = [
        { productCode: { contains: search } },
        { serialNumber: { contains: search } },
        { billOfLading: { contains: search } },
        { order: { poNumber: { contains: search } } },
        { order: { account: { name: { contains: search } } } }
      ];
    }

    const items = await prisma.orderItem.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            poNumber: true,
            account: { select: { name: true } }
          }
        }
      },
      take: 50,
      orderBy: { createdAt: 'desc' }
    });

    res.json(items);
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

// =============================
// SHIPMENT DOCUMENTS
// =============================

/**
 * GET /api/shipments/:id/documents
 * Get documents for a shipment with checklist
 */
router.get('/:id/documents', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const documents = await prisma.shipmentDocument.findMany({
      where: { shipmentId: id },
      orderBy: { uploadedAt: 'desc' }
    });

    // Build checklist
    const checklist = {};
    for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
      const count = documents.filter(d => d.documentType === key).length;
      checklist[key] = { uploaded: count > 0, count, label };
    }

    const REQUIRED_TYPES = ['ISF', 'ARRIVAL_NOTICE', 'BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'DELIVERY_ORDER'];
    const uploadedRequired = REQUIRED_TYPES.filter(type => checklist[type]?.uploaded).length;

    res.json({
      documents,
      checklist,
      stats: {
        complete: uploadedRequired === REQUIRED_TYPES.length,
        uploadedRequired,
        totalRequired: REQUIRED_TYPES.length
      }
    });
  } catch (error) {
    console.error('Error fetching shipment documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * POST /api/shipments/:id/documents
 * Upload document to shipment
 */
router.post('/:id/documents', authGuard, requireBrokerOrStaff, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    // Validate document type based on role
    const allowedTypes = req.user.role === 'BROKER' ? BROKER_DOCUMENT_TYPES : Object.keys(DOCUMENT_TYPES);
    if (!documentType || !allowedTypes.includes(documentType)) {
      return res.status(400).json({ error: `Invalid document type. Allowed: ${allowedTypes.join(', ')}` });
    }

    // Validate file
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Upload to S3 using shipment ID as folder
    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: `shipment-${id}`,
      uploadedBy: username
    });

    // Create document record
    const document = await prisma.shipmentDocument.create({
      data: {
        shipmentId: id,
        fileName: s3Data.fileName,
        fileSize: s3Data.fileSize,
        fileType: s3Data.fileType,
        documentType,
        s3Key: s3Data.s3Key,
        s3Url: s3Data.s3Url,
        uploadedBy: username
      }
    });

    // Log activity
    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'DOCUMENT_UPLOADED',
        notes: `Uploaded ${DOCUMENT_TYPE_LABELS[documentType] || documentType}: ${file.originalname}`
      }
    });

    res.json({ message: 'Document uploaded successfully', document });
  } catch (error) {
    console.error('Error uploading shipment document:', error);
    res.status(500).json({ error: error.message || 'Failed to upload document' });
  }
});

/**
 * GET /api/shipments/:id/documents/:documentId/download
 * Get signed download URL for shipment document
 */
router.get('/:id/documents/:documentId/download', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id, documentId } = req.params;

    const document = await prisma.shipmentDocument.findUnique({
      where: { id: documentId }
    });

    if (!document || document.shipmentId !== id) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);
    res.json({ downloadUrl, fileName: document.fileName });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * DELETE /api/shipments/:id/documents/:documentId
 * Delete shipment document
 */
router.delete('/:id/documents/:documentId', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id, documentId } = req.params;

    const document = await prisma.shipmentDocument.findUnique({
      where: { id: documentId }
    });

    if (!document || document.shipmentId !== id) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only uploader or admin can delete
    if (document.uploadedBy !== req.user.name && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to delete this document' });
    }

    await deleteFileFromS3(document.s3Key);
    await prisma.shipmentDocument.delete({ where: { id: documentId } });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting shipment document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
