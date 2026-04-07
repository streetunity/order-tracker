import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from "../services/fileUploadService.js";
import { authGuard } from "../middleware/auth.js";
import {
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENT_TYPES, BROKER_DOCUMENT_TYPES,
  getDocumentsForItem, resolveDocumentById, deleteResolvedDocument
} from "../services/documentService.js";
import { notifyBrokersOfDocumentUpload } from "../services/brokerEmailService.js";

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage (files go directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Re-export constants for backward compatibility
// Other route files (broker.js, shipments.js) may still import from here.
// New code should import from documentService.js directly.
export { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENT_TYPES, BROKER_DOCUMENT_TYPES };

/**
 * Upload document to item
 * POST /api/items/:itemId/documents
 */
router.post("/items/:itemId/documents", authGuard, upload.single('file'), async (req, res) => {
  try {
    const { itemId } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    // Validate documentType
    if (!DOCUMENT_TYPES[documentType]) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    // Validate file
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    // Get item and check access
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: {
          include: { account: { select: { name: true } } }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to upload to this item" });
    }
    if (req.user.role === 'MANUFACTURER' && item.manufacturerId !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to upload to this item" });
    }

    // Upload to S3
    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: item.orderId, // Keep folder structure by order
      uploadedBy: username
    });

    // Create document record with audit log
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.itemDocument.create({
        data: {
          itemId,
          fileName: s3Data.fileName,
          fileSize: s3Data.fileSize,
          fileType: s3Data.fileType,
          documentType,
          s3Key: s3Data.s3Key,
          s3Url: s3Data.s3Url,
          uploadedBy: username
        }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'ItemDocument',
          entityId: doc.id,
          parentEntityId: item.orderId,
          action: 'DOCUMENT_UPLOADED',
          metadata: JSON.stringify({
            fileName: s3Data.fileName,
            fileSize: s3Data.fileSize,
            fileType: s3Data.fileType,
            documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
            itemId,
            productCode: item.productCode,
            orderPO: item.order?.poNumber,
            customerName: item.order?.account?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      return doc;
    });

    // Notify brokers if this item is currently AT_SEA and uploader is not a broker
    if (item.currentStage === 'AT_SEA' && req.user.role !== 'BROKER') {
      notifyBrokersOfDocumentUpload(prisma, {
        item,
        document,
        uploadedBy: username,
        documentType,
        isShipmentDoc: false
      }).catch(err => console.error('[BROKER EMAIL] Notification error:', err.message));
    }

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

/**
 * Get all documents for an item with checklist status
 * Uses documentService for unified view across both tables
 * GET /api/items/:itemId/documents
 */
router.get("/items/:itemId/documents", authGuard, async (req, res) => {
  try {
    const { itemId } = req.params;

    // Check permissions first
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const result = await getDocumentsForItem(itemId);
    if (!result) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

/**
 * Get signed download URL for document
 * Uses documentService to resolve across both tables
 * GET /api/items/:itemId/documents/:documentId/download
 */
router.get("/items/:itemId/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    // Check permissions
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const resolved = await resolveDocumentById(documentId, { itemId });
    if (!resolved) {
      return res.status(404).json({ error: "Document not found" });
    }

    const downloadUrl = await getSignedDownloadUrl(resolved.document.s3Key, resolved.document.fileName);
    res.json({ downloadUrl, fileName: resolved.document.fileName });
  } catch (error) {
    console.error("Download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * Delete document
 * Uses documentService to resolve and delete from correct table
 * DELETE /api/items/:itemId/documents/:documentId
 */
router.delete("/items/:itemId/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    // Get the item for permissions and audit logging
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: {
          include: { account: { select: { name: true } } }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const resolved = await resolveDocumentById(documentId, { itemId });
    if (!resolved) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check permissions (only uploader, admin, or super admin can delete)
    const canDelete =
      resolved.document.uploadedBy === req.user.name ||
      req.user.role === 'SUPER_ADMIN' ||
      req.user.role === 'ADMIN';

    if (!canDelete) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    // Delete with audit log
    await prisma.$transaction(async (tx) => {
      await deleteResolvedDocument(resolved, deleteFileFromS3, tx);

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: resolved.table,
          entityId: documentId,
          parentEntityId: resolved.table === 'ShipmentDocument' ? (item.shipmentId || item.orderId) : item.orderId,
          action: 'DOCUMENT_DELETED',
          metadata: JSON.stringify({
            fileName: resolved.document.fileName,
            fileSize: resolved.document.fileSize,
            documentType: resolved.document.documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[resolved.document.documentType],
            itemId,
            productCode: item.productCode,
            orderPO: item.order?.poNumber,
            customerName: item.order?.account?.name,
            originalUploader: resolved.document.uploadedBy,
            sourceTable: resolved.table
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
    });

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// =============================
// MANUFACTURER DOCUMENT ENDPOINTS
// (These don't deal with shared shipment documents)
// =============================

/**
 * Get documents for a manufacturer's assigned item
 * GET /api/manufacturer/item/:itemId/documents
 */
router.get("/manufacturer/item/:itemId/documents", authGuard, async (req, res) => {
  try {
    const { itemId } = req.params;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Verify item is assigned to this manufacturer
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId }
    });

    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    // Get documents
    const documents = await prisma.itemDocument.findMany({
      where: { itemId },
      orderBy: { uploadedAt: 'desc' }
    });

    // Build checklist (exclude OTHER for manufacturer view)
    const checklist = {};
    for (const type of REQUIRED_DOCUMENT_TYPES) {
      const count = documents.filter(d => d.documentType === type).length;
      checklist[type] = {
        uploaded: count > 0,
        count,
        label: DOCUMENT_TYPE_LABELS[type]
      };
    }

    const uploadedRequired = REQUIRED_DOCUMENT_TYPES.filter(
      type => checklist[type].uploaded
    ).length;

    res.json({
      documents: documents.filter(d => d.documentType !== 'OTHER'),
      checklist,
      stats: {
        complete: uploadedRequired === REQUIRED_DOCUMENT_TYPES.length,
        uploadedRequired,
        totalRequired: REQUIRED_DOCUMENT_TYPES.length
      }
    });
  } catch (error) {
    console.error("Manufacturer get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

/**
 * Upload document (manufacturer - 6 required types only, NO "Other")
 * POST /api/manufacturer/item/:itemId/documents
 */
router.post("/manufacturer/item/:itemId/documents", authGuard, upload.single('file'), async (req, res) => {
  try {
    const { itemId } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (!REQUIRED_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: 'Invalid document type. Allowed types: ISF, Arrival Notice, Bill of Lading, Commercial Invoice, Packing List, Delivery Order'
      });
    }

    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: {
          include: { account: { select: { name: true } } }
        }
      }
    });

    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: item.orderId,
      uploadedBy: username
    });

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.itemDocument.create({
        data: {
          itemId,
          fileName: s3Data.fileName,
          fileSize: s3Data.fileSize,
          fileType: s3Data.fileType,
          documentType,
          s3Key: s3Data.s3Key,
          s3Url: s3Data.s3Url,
          uploadedBy: username
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ItemDocument',
          entityId: doc.id,
          parentEntityId: item.orderId,
          action: 'DOCUMENT_UPLOADED',
          metadata: JSON.stringify({
            fileName: s3Data.fileName,
            fileSize: s3Data.fileSize,
            fileType: s3Data.fileType,
            documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
            itemId,
            productCode: item.productCode,
            orderPO: item.order?.poNumber,
            customerName: item.order?.account?.name,
            uploadedByRole: 'MANUFACTURER',
            manufacturerName: req.user.manufacturer?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      return doc;
    });

    // Notify brokers if item is AT_SEA (manufacturer uploading a required shipping doc)
    if (item.currentStage === 'AT_SEA') {
      notifyBrokersOfDocumentUpload(prisma, {
        item,
        document,
        uploadedBy: username,
        documentType,
        isShipmentDoc: false
      }).catch(err => console.error('[BROKER EMAIL] Notification error:', err.message));
    }

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Manufacturer upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

/**
 * Get signed download URL for manufacturer
 * GET /api/manufacturer/item/:itemId/documents/:documentId/download
 */
router.get("/manufacturer/item/:itemId/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    const document = await prisma.itemDocument.findUnique({
      where: { id: documentId },
      include: { item: true }
    });

    if (!document || document.itemId !== itemId) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);
    res.json({ downloadUrl, fileName: document.fileName });
  } catch (error) {
    console.error("Manufacturer download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * Delete document (manufacturer can only delete own uploads)
 * DELETE /api/manufacturer/item/:itemId/documents/:documentId
 */
router.delete("/manufacturer/item/:itemId/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    const document = await prisma.itemDocument.findUnique({
      where: { id: documentId },
      include: { 
        item: {
          include: {
            order: {
              include: { account: { select: { name: true } } }
            }
          }
        }
      }
    });

    if (!document || document.itemId !== itemId) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (document.uploadedBy !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    await deleteFileFromS3(document.s3Key);

    await prisma.$transaction(async (tx) => {
      await tx.itemDocument.delete({
        where: { id: documentId }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ItemDocument',
          entityId: documentId,
          parentEntityId: document.item.orderId,
          action: 'DOCUMENT_DELETED',
          metadata: JSON.stringify({
            fileName: document.fileName,
            fileSize: document.fileSize,
            documentType: document.documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[document.documentType],
            itemId,
            productCode: document.item.productCode,
            orderPO: document.item.order?.poNumber,
            customerName: document.item.order?.account?.name,
            deletedByRole: 'MANUFACTURER',
            manufacturerName: req.user.manufacturer?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
    });

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Manufacturer delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
