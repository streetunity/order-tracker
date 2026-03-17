import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authGuard } from '../middleware/auth.js';
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from '../services/fileUploadService.js';
import {
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, BROKER_DOCUMENT_TYPES,
  getDocumentsForShipment, resolveDocumentById, deleteResolvedDocument
} from '../services/documentService.js';

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

// Middleware for admin-only routes (delete shipment, archive)
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
// HELPER: Sync status from shipment to all linked items
// =============================
async function syncShipmentStatusToItems(shipmentId, newStatus, additionalData = {}) {
  const itemUpdateData = {
    customsDocumentStatus: newStatus
  };

  if (additionalData.customsFiledDate) {
    itemUpdateData.customsFiledDate = additionalData.customsFiledDate;
  }
  if (additionalData.customsClearedDate) {
    itemUpdateData.customsClearedDate = additionalData.customsClearedDate;
  }

  const result = await prisma.orderItem.updateMany({
    where: {
      shipmentId: shipmentId,
      archivedAt: null
    },
    data: itemUpdateData
  });

  console.log(`[SHIPMENT SYNC] Synced status "${newStatus}" to ${result.count} items in shipment ${shipmentId}`);
  return result.count;
}

// =============================
// SHIPMENT CRUD OPERATIONS
// =============================

/**
 * GET /api/shipments
 */
router.get('/', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { status, search, includeArchived, archivedOnly } = req.query;

    const where = {};
    
    if (archivedOnly === 'true') {
      where.archivedAt = { not: null };
    } else if (includeArchived !== 'true') {
      where.archivedAt = null;
    }

    if (status) {
      where.customsDocumentStatus = status;
    }
    if (search) {
      where.OR = [
        { containerNumber: { contains: search } },
        { billOfLading: { contains: search } },
        { vesselName: { contains: search } }
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
            },
            _count: {
              select: { documents: true }
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

    const shipmentsWithDocCounts = shipments.map(shipment => {
      const itemDocCount = shipment.items.reduce((total, item) => {
        return total + (item._count?.documents || 0);
      }, 0);
      
      return {
        ...shipment,
        itemDocCount,
        totalDocCount: (shipment._count?.documents || 0) + itemDocCount
      };
    });

    res.json(shipmentsWithDocCounts);
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

/**
 * GET /api/shipments/active
 */
router.get('/active', authGuard, requireInternalStaff, async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        containerNumber: true,
        billOfLading: true,
        vesselName: true,
        etaDate: true,
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(shipments);
  } catch (error) {
    console.error('Error fetching active shipments:', error);
    res.status(500).json({ error: 'Failed to fetch active shipments' });
  }
});

/**
 * GET /api/shipments/stats
 */
router.get('/stats', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const [total, active, archived, byStatus] = await Promise.all([
      prisma.shipment.count(),
      prisma.shipment.count({ where: { archivedAt: null } }),
      prisma.shipment.count({ where: { archivedAt: { not: null } } }),
      prisma.shipment.groupBy({
        by: ['customsDocumentStatus'],
        where: { archivedAt: null },
        _count: true
      })
    ]);

    const itemStats = await prisma.orderItem.aggregate({
      where: { 
        shipmentId: { not: null },
        archivedAt: null
      },
      _count: true
    });

    res.json({
      total,
      active,
      archived,
      linkedItems: itemStats._count,
      byStatus: byStatus.reduce((acc, s) => {
        acc[s.customsDocumentStatus] = s._count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching shipment stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/shipments/search-items
 * MUST be before /:id to avoid Express catching it as an id param
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

/**
 * GET /api/shipments/:id
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
                  select: { id: true, name: true, email: true, phone: true, contactName: true }
                }
              }
            },
            _count: {
              select: { documents: true }
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

    const itemDocCount = shipment.items.reduce((total, item) => {
      return total + (item._count?.documents || 0);
    }, 0);

    res.json({
      ...shipment,
      itemDocCount,
      totalDocCount: shipment.documents.length + itemDocCount
    });
  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({ error: 'Failed to fetch shipment' });
  }
});

/**
 * POST /api/shipments
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

    const itemSyncData = {};

    if (customsDocumentStatus !== undefined && customsDocumentStatus !== current.customsDocumentStatus) {
      updateData.customsDocumentStatus = customsDocumentStatus;
      
      if (customsDocumentStatus === 'FILED' && !current.customsFiledDate) {
        updateData.customsFiledDate = new Date();
        itemSyncData.customsFiledDate = updateData.customsFiledDate;
      }
      if (customsDocumentStatus === 'CLEARED' && !current.customsClearedDate) {
        updateData.customsClearedDate = new Date();
        itemSyncData.customsClearedDate = updateData.customsClearedDate;
      }

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

      await syncShipmentStatusToItems(id, customsDocumentStatus, itemSyncData);
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
 * POST /api/shipments/:id/archive
 */
router.post('/:id/archive', authGuard, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (shipment.archivedAt) {
      return res.status(400).json({ error: 'Shipment is already archived' });
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archivedBy: req.user.name
      }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'ARCHIVED',
        notes: `Shipment archived by ${req.user.name}`
      }
    });

    res.json({ message: 'Shipment archived successfully', shipment: updated });
  } catch (error) {
    console.error('Error archiving shipment:', error);
    res.status(500).json({ error: 'Failed to archive shipment' });
  }
});

/**
 * POST /api/shipments/:id/unarchive
 */
router.post('/:id/unarchive', authGuard, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (!shipment.archivedAt) {
      return res.status(400).json({ error: 'Shipment is not archived' });
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: {
        archivedAt: null,
        archivedBy: null
      }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'UNARCHIVED',
        notes: `Shipment restored by ${req.user.name}`
      }
    });

    res.json({ message: 'Shipment restored successfully', shipment: updated });
  } catch (error) {
    console.error('Error unarchiving shipment:', error);
    res.status(500).json({ error: 'Failed to restore shipment' });
  }
});

/**
 * DELETE /api/shipments/:id
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

    if (shipment.archivedAt) {
      return res.status(400).json({ error: 'Cannot link items to archived shipments. Restore the shipment first.' });
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

    const updateData = { shipmentId: id };
    if (shipment.customsDocumentStatus) {
      updateData.customsDocumentStatus = shipment.customsDocumentStatus;
    }
    if (shipment.customsFiledDate) {
      updateData.customsFiledDate = shipment.customsFiledDate;
    }
    if (shipment.customsClearedDate) {
      updateData.customsClearedDate = shipment.customsClearedDate;
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });

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

// =============================
// SHIPMENT DOCUMENTS
// =============================

/**
 * GET /api/shipments/:id/documents
 * Uses documentService for unified view across both tables
 */
router.get('/:id/documents', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const result = await getDocumentsForShipment(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Error fetching shipment documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * POST /api/shipments/:id/documents
 * Upload document to shipment (creates ShipmentDocument)
 */
router.post('/:id/documents', authGuard, requireBrokerOrStaff, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    const allowedTypes = req.user.role === 'BROKER' ? BROKER_DOCUMENT_TYPES : Object.keys(DOCUMENT_TYPES);
    if (!documentType || !allowedTypes.includes(documentType)) {
      return res.status(400).json({ error: `Invalid document type. Allowed: ${allowedTypes.join(', ')}` });
    }

    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: `shipment-${id}`,
      uploadedBy: username
    });

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
 * Uses documentService to resolve across both tables
 */
router.get('/:id/documents/:documentId/download', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id, documentId } = req.params;

    const resolved = await resolveDocumentById(documentId, { shipmentId: id });
    if (!resolved) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const downloadUrl = await getSignedDownloadUrl(resolved.document.s3Key, resolved.document.fileName);
    res.json({ downloadUrl, fileName: resolved.document.fileName });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * DELETE /api/shipments/:id/documents/:documentId
 * Uses documentService to resolve and delete from correct table
 */
router.delete('/:id/documents/:documentId', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id, documentId } = req.params;

    const resolved = await resolveDocumentById(documentId, { shipmentId: id });
    if (!resolved) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only uploader or admin can delete
    if (resolved.document.uploadedBy !== req.user.name && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to delete this document' });
    }

    await deleteResolvedDocument(resolved, deleteFileFromS3);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting shipment document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
