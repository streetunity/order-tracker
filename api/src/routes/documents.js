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

/**
 * Upload document to order
 * POST /api/orders/:orderId/documents
 */
router.post("/orders/:orderId/documents", authGuard, upload.single('file'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const file = req.file;
    const username = req.user.name;

    // Validate file
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    // Check if order exists and user has access
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check permissions (agents can only upload to their orders)
    if (req.user.role === 'AGENT' && order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to upload to this order" });
    }

    // Upload to S3
    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId,
      uploadedBy: username
    });

    // Save to database
    const document = await prisma.orderDocument.create({
      data: {
        orderId,
        fileName: s3Data.fileName,
        fileSize: s3Data.fileSize,
        fileType: s3Data.fileType,
        s3Key: s3Data.s3Key,
        s3Url: s3Data.s3Url,
        uploadedBy: username
      }
    });

    res.json({
      message: "File uploaded successfully",
      document
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload file" });
  }
});

/**
 * Get all documents for an order
 * GET /api/orders/:orderId/documents
 */
router.get("/orders/:orderId/documents", authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Check if order exists and user has access
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Get documents
    const documents = await prisma.orderDocument.findMany({
      where: { orderId },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json({ documents });
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

/**
 * Get signed download URL for document
 * GET /api/documents/:documentId/download
 */
router.get("/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get document
    const document = await prisma.orderDocument.findUnique({
      where: { id: documentId },
      include: { order: true }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && document.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Generate signed URL
    const downloadUrl = await getSignedDownloadUrl(document.s3Key);

    res.json({
      downloadUrl,
      fileName: document.fileName
    });
  } catch (error) {
    console.error("Download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * Delete document
 * DELETE /api/documents/:documentId
 */
router.delete("/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get document
    const document = await prisma.orderDocument.findUnique({
      where: { id: documentId },
      include: { order: true }
    });

    if (!document) {
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
    await prisma.orderDocument.delete({
      where: { id: documentId }
    });

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
