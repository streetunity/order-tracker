import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from "../services/fileUploadService.js";
import { authGuard } from "../middleware/auth.js";
import {
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENT_TYPES, BROKER_DOCUMENT_TYPES,
  getDocumentsForItem, resolveDocumentById, deleteResolvedDocument, buildChecklist
} from "../services/documentService.js";
import { queueBrokerDocumentNotification } from "../services/brokerEmailService.js";

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage (files go directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Re-export constants for backward compatibility
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

    if (!DOCUMENT_TYPES[documentType]) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

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

    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to upload to this item" });
    }
    if (req.user.role === 'MANUFACTURER' && item.manufacturerId !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to upload to this item" });
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
            customerName: item.order?.account?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      return doc;
    });

    // Queue broker digest notification if item is AT_SEA and uploader is not a broker
    if (item.currentStage === 'AT_SEA' && req.user.role !== 'BROKER') {
      queueBrokerDocumentNotification(prisma, {
        item,
        document,
        uploadedBy: username,
        documentType,
        isShipmentDoc: false
      }).catch(err => console.error('[BROKER EMAIL] Queue error:', err.message));
    }

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

/**
 * GET /api/items/:itemId/documents
 */
router.get("/items/:itemId/documents", authGuard, async (req, res) => {
  try {
    const { itemId } = req.params;

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
 * GET /api/items/:itemId/documents/:documentId/download
 */
router.get("/items/:itemId/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

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
 * DELETE /api/items/:itemId/documents/:documentId
 */
router.delete("/items/:itemId/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

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

    const canDelete =
      resolved.document.uploadedBy === req.user.name ||
      req.user.role === 'SUPER_ADMIN' ||
      req.user.role === 'ADMIN';

    if (!canDelete) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    await prisma.$transaction(async (tx) => {
      await deleteResolvedDocument(resolved, deleteFileFromS3, tx);

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
// =============================

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

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId }
    });

    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    // Use the unified service so ShipmentDocuments and sibling ItemDocuments
    // are returned. Then filter to keep:
    //   - all ShipmentDocuments (shared across the shipment), and
    //   - ItemDocuments belonging only to items this manufacturer owns.
    const result = await getDocumentsForItem(itemId);
    if (!result) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (item.shipmentId) {
      const myItems = await prisma.orderItem.findMany({
        where: { shipmentId: item.shipmentId, manufacturerId, archivedAt: null },
        select: { id: true },
      });
      const myItemIds = new Set(myItems.map(i => i.id));

      const filtered = (result.documents || []).filter(d => {
        if (!d.itemId) return true;          // ShipmentDocument: always visible
        return myItemIds.has(d.itemId);       // ItemDocument: only own items
      });

      const { checklist, stats } = buildChecklist(filtered);
      result.documents = filtered;
      result.checklist = checklist;
      result.stats = stats;
    }

    // Hide OTHER-typed documents from the manufacturer view (legacy behavior).
    result.documents = (result.documents || []).filter(d => d.documentType !== 'OTHER');

    res.json(result);
  } catch (error) {
    console.error("Manufacturer get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

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

    // Queue broker digest notification if item is AT_SEA
    if (item.currentStage === 'AT_SEA') {
      queueBrokerDocumentNotification(prisma, {
        item,
        document,
        uploadedBy: username,
        documentType,
        isShipmentDoc: false
      }).catch(err => console.error('[BROKER EMAIL] Queue error:', err.message));
    }

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Manufacturer upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

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

    // Verify the requesting item belongs to this manufacturer.
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { manufacturerId: true, shipmentId: true }
    });
    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    // Resolve across both tables (ShipmentDocument + ItemDocument).
    const resolved = await resolveDocumentById(documentId, { itemId });
    if (!resolved) {
      return res.status(404).json({ error: "Document not found" });
    }

    // For ItemDocuments (own or sibling), the doc's item must also be
    // owned by this manufacturer. ShipmentDocuments are implicitly OK
    // because resolveDocumentById already confirmed the shipment match
    // and the manufacturer's item ownership is verified above.
    if (resolved.table === 'ItemDocument') {
      const docItem = await prisma.orderItem.findUnique({
        where: { id: resolved.document.itemId },
        select: { manufacturerId: true }
      });
      if (!docItem || docItem.manufacturerId !== manufacturerId) {
        return res.status(403).json({ error: "Not authorized" });
      }
    }

    const downloadUrl = await getSignedDownloadUrl(resolved.document.s3Key, resolved.document.fileName);
    res.json({ downloadUrl, fileName: resolved.document.fileName });
  } catch (error) {
    console.error("Manufacturer download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

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

    // Verify the requesting item belongs to this manufacturer.
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

    // Resolve across both tables (ShipmentDocument + ItemDocument).
    const resolved = await resolveDocumentById(documentId, { itemId });
    if (!resolved) {
      return res.status(404).json({ error: "Document not found" });
    }

    // For ItemDocuments (own or sibling), the doc's item must belong to
    // this manufacturer. ShipmentDocuments are shared with the shipment
    // and access is implied by item ownership (already verified above).
    if (resolved.table === 'ItemDocument') {
      const docItem = await prisma.orderItem.findUnique({
        where: { id: resolved.document.itemId },
        select: { manufacturerId: true }
      });
      if (!docItem || docItem.manufacturerId !== manufacturerId) {
        return res.status(403).json({ error: "Not authorized" });
      }
    }

    // Manufacturers can only delete documents they uploaded themselves.
    if (resolved.document.uploadedBy !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    await prisma.$transaction(async (tx) => {
      await deleteResolvedDocument(resolved, deleteFileFromS3, tx);

      await tx.auditLog.create({
        data: {
          entityType: resolved.table,
          entityId: documentId,
          parentEntityId: resolved.table === 'ShipmentDocument'
            ? (item.shipmentId || item.orderId)
            : item.orderId,
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
            deletedByRole: 'MANUFACTURER',
            manufacturerName: req.user.manufacturer?.name,
            sourceTable: resolved.table
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
