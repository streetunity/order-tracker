import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from "../services/fileUploadService.js";
import { authGuard } from "../middleware/auth.js";

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage (files go directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Document type constants
export const DOCUMENT_TYPES = {
  ISF: 'ISF',
  ARRIVAL_NOTICE: 'ARRIVAL_NOTICE',
  BILL_OF_LADING: 'BILL_OF_LADING',
  COMMERCIAL_INVOICE: 'COMMERCIAL_INVOICE',
  PACKING_LIST: 'PACKING_LIST',
  DELIVERY_ORDER: 'DELIVERY_ORDER',
  OTHER: 'OTHER'
};

export const REQUIRED_DOCUMENT_TYPES = [
  'ISF',
  'ARRIVAL_NOTICE',
  'BILL_OF_LADING',
  'COMMERCIAL_INVOICE',
  'PACKING_LIST',
  'DELIVERY_ORDER'
];

export const DOCUMENT_TYPE_LABELS = {
  ISF: 'ISF (International Security Filing)',
  ARRIVAL_NOTICE: 'Arrival Notice',
  BILL_OF_LADING: 'Bill of Lading',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  PACKING_LIST: 'Packing List',
  DELIVERY_ORDER: 'Delivery Order',
  OTHER: 'Other'
};

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
      include: { order: true }
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

    // Create document record
    const document = await prisma.itemDocument.create({
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

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

/**
 * Get all documents for an item with checklist status
 * GET /api/items/:itemId/documents
 */
router.get("/items/:itemId/documents", authGuard, async (req, res) => {
  try {
    const { itemId } = req.params;

    // Get item and check access
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Get documents
    const documents = await prisma.itemDocument.findMany({
      where: { itemId },
      orderBy: { uploadedAt: 'desc' }
    });

    // Build checklist
    const checklist = {};
    for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
      const count = documents.filter(d => d.documentType === key).length;
      checklist[key] = {
        uploaded: count > 0,
        count,
        label
      };
    }

    // Calculate stats
    const uploadedRequired = REQUIRED_DOCUMENT_TYPES.filter(
      type => checklist[type].uploaded
    ).length;

    res.json({
      documents,
      checklist,
      stats: {
        complete: uploadedRequired === REQUIRED_DOCUMENT_TYPES.length,
        uploadedRequired,
        totalRequired: REQUIRED_DOCUMENT_TYPES.length
      }
    });
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

/**
 * Get signed download URL for document
 * GET /api/items/:itemId/documents/:documentId/download
 */
router.get("/items/:itemId/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    const document = await prisma.itemDocument.findUnique({
      where: { id: documentId },
      include: { item: { include: { order: true } } }
    });

    if (!document || document.itemId !== itemId) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && document.item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Pass original filename to preserve it in downloads (supports Chinese characters)
    const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);

    res.json({ downloadUrl, fileName: document.fileName });
  } catch (error) {
    console.error("Download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * Delete document
 * DELETE /api/items/:itemId/documents/:documentId
 */
router.delete("/items/:itemId/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    const document = await prisma.itemDocument.findUnique({
      where: { id: documentId },
      include: { item: { include: { order: true } } }
    });

    if (!document || document.itemId !== itemId) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check permissions (only uploader, admin, or super admin can delete)
    const canDelete =
      document.uploadedBy === req.user.name ||
      req.user.role === 'SUPER_ADMIN' ||
      req.user.role === 'ADMIN';

    if (!canDelete) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    // Delete from S3
    await deleteFileFromS3(document.s3Key);

    // Delete from database
    await prisma.itemDocument.delete({
      where: { id: documentId }
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

    // Use manufacturer from auth middleware
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
      documents: documents.filter(d => d.documentType !== 'OTHER'), // Hide OTHER from manufacturers
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

    // MANUFACTURERS CAN ONLY UPLOAD REQUIRED TYPES (NOT OTHER)
    if (!REQUIRED_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: 'Invalid document type. Allowed types: ISF, Arrival Notice, Bill of Lading, Commercial Invoice, Packing List, Delivery Order'
      });
    }

    // Validate file
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Verify item is assigned to this manufacturer
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true }
    });

    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    // Upload to S3
    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: item.orderId,
      uploadedBy: username
    });

    // Create document record
    const document = await prisma.itemDocument.create({
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

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Get document and verify access
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

    // Pass original filename to preserve it in downloads (supports Chinese characters)
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

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Get document and verify access
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

    // Manufacturer can only delete documents they uploaded
    if (document.uploadedBy !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    // Delete from S3
    await deleteFileFromS3(document.s3Key);

    // Delete from database
    await prisma.itemDocument.delete({
      where: { id: documentId }
    });

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Manufacturer delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
