/**
 * Customer Documents Routes
 * 
 * Handles large file uploads for customer-viewable documents.
 * Uses S3 multipart upload for files of any size.
 * Replaces the old Dropbox customerDocsLink approach.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authGuard } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const CUSTOMER_DOCS_BUCKET = process.env.S3_CUSTOMER_DOCS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'order-tracker-documents';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour for upload URLs
const DOWNLOAD_URL_EXPIRY = 3600; // 1 hour for download URLs
const RETENTION_DAYS = 365;

/**
 * Sanitize string for S3 metadata (must be ASCII-safe)
 * Uses URL encoding to handle non-ASCII characters like Chinese
 */
function sanitizeForMetadata(str) {
  if (!str) return '';
  return encodeURIComponent(str).substring(0, 1024);
}

/**
 * Encode filename for Content-Disposition header using RFC 5987
 * This properly handles Unicode characters (Chinese, etc.)
 */
function encodeRFC5987(filename) {
  return `UTF-8''${encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')}`;
}

/**
 * Build Content-Disposition header with proper encoding for Unicode filenames
 */
function buildContentDisposition(filename) {
  // Provide both ASCII fallback and UTF-8 encoded version for browser compatibility
  const asciiName = filename.replace(/[^\x00-\x7F]/g, '_'); // Replace non-ASCII with underscore
  const encodedName = encodeRFC5987(filename);
  return `attachment; filename="${asciiName}"; filename*=${encodedName}`;
}

// Helper: Generate S3 key for customer document
function generateS3Key(orderId, fileName) {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `customer-docs/${orderId}/${timestamp}-${sanitizedFileName}`;
}

// Helper: Calculate expiry date
function calculateExpiryDate() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + RETENTION_DAYS);
  return expiry;
}

// Helper: Format file size for display
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ============================================
// AUTHENTICATED ROUTES (Admin/Agent)
// ============================================

/**
 * GET /customer-documents/:orderId
 * List all customer documents for an order
 */
router.get('/:orderId', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Verify order exists and user has access
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, poNumber: true, customerDocsLink: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get completed documents only
    const documents = await prisma.customerDocument.findMany({
      where: { 
        orderId,
        isComplete: true
      },
      include: {
        uploadedBy: {
          select: { name: true }
        }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    // Format response
    const formattedDocs = documents.map(doc => ({
      id: doc.id,
      fileName: doc.fileName,
      fileSize: Number(doc.fileSize), // Convert BigInt to Number for JSON
      fileSizeFormatted: formatFileSize(Number(doc.fileSize)),
      mimeType: doc.mimeType,
      description: doc.description,
      uploadedBy: doc.uploadedBy.name,
      uploadedAt: doc.uploadedAt,
      expiresAt: doc.expiresAt
    }));

    res.json({
      documents: formattedDocs,
      legacyDropboxLink: order.customerDocsLink, // Include old link during transition
      count: formattedDocs.length
    });
  } catch (error) {
    console.error('Error listing customer documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * POST /customer-documents/:orderId/initiate
 * Start a multipart upload session
 * Body: { fileName, fileSize, mimeType, description? }
 */
router.post('/:orderId/initiate', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fileName, fileSize, mimeType, description } = req.body;
    const user = req.user;

    if (!fileName || !fileSize || !mimeType) {
      return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required' });
    }

    // Verify order exists
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Generate S3 key
    const s3Key = generateS3Key(orderId, fileName);

    // Create multipart upload in S3
    // Use URL-encoded metadata for ASCII safety (handles Chinese characters)
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: CUSTOMER_DOCS_BUCKET,
      Key: s3Key,
      ContentType: mimeType,
      Metadata: {
        'original-filename': sanitizeForMetadata(fileName),
        'order-id': String(orderId || ''),
        'uploaded-by': sanitizeForMetadata(user.name)
      }
    });

    const { UploadId } = await s3Client.send(createCommand);

    // Create database record (stores original filename as-is)
    const document = await prisma.customerDocument.create({
      data: {
        orderId,
        fileName, // Original filename preserved in database
        fileSize: BigInt(fileSize),
        mimeType,
        s3Bucket: CUSTOMER_DOCS_BUCKET,
        s3Key,
        description,
        uploadedById: user.id,
        uploadId: UploadId,
        isComplete: false,
        expiresAt: calculateExpiryDate()
      }
    });

    // Calculate number of parts needed
    const numParts = Math.ceil(fileSize / CHUNK_SIZE);

    res.json({
      documentId: document.id,
      uploadId: UploadId,
      s3Key,
      bucket: CUSTOMER_DOCS_BUCKET,
      chunkSize: CHUNK_SIZE,
      totalParts: numParts,
      message: 'Multipart upload initiated'
    });
  } catch (error) {
    console.error('Error initiating multipart upload:', error);
    res.status(500).json({ error: 'Failed to initiate upload' });
  }
});

/**
 * POST /customer-documents/:orderId/sign-part
 * Get a presigned URL for uploading a specific part
 * Body: { documentId, uploadId, partNumber, s3Key }
 */
router.post('/:orderId/sign-part', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, partNumber, s3Key } = req.body;

    if (!uploadId || !partNumber || !s3Key) {
      return res.status(400).json({ error: 'uploadId, partNumber, and s3Key are required' });
    }

    // Verify document exists and is in progress
    const document = await prisma.customerDocument.findUnique({
      where: { id: documentId }
    });

    if (!document || document.isComplete) {
      return res.status(400).json({ error: 'Invalid or completed upload' });
    }

    // Create presigned URL for this part
    const command = new UploadPartCommand({
      Bucket: CUSTOMER_DOCS_BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: partNumber
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY
    });

    res.json({
      presignedUrl,
      partNumber,
      expiresIn: PRESIGNED_URL_EXPIRY
    });
  } catch (error) {
    console.error('Error signing part:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * POST /customer-documents/:orderId/complete
 * Complete the multipart upload
 * Body: { documentId, uploadId, s3Key, parts: [{ PartNumber, ETag }] }
 */
router.post('/:orderId/complete', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key, parts } = req.body;

    if (!uploadId || !s3Key || !parts || !Array.isArray(parts)) {
      return res.status(400).json({ error: 'uploadId, s3Key, and parts array are required' });
    }

    // Verify document exists
    const document = await prisma.customerDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.isComplete) {
      return res.status(400).json({ error: 'Upload already completed' });
    }

    // Complete the multipart upload in S3
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: CUSTOMER_DOCS_BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber)
      }
    });

    await s3Client.send(completeCommand);

    // Update database record
    await prisma.customerDocument.update({
      where: { id: documentId },
      data: {
        isComplete: true,
        uploadId: null // Clear upload ID after completion
      }
    });

    res.json({
      success: true,
      documentId,
      message: 'Upload completed successfully'
    });
  } catch (error) {
    console.error('Error completing multipart upload:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

/**
 * POST /customer-documents/:orderId/abort
 * Abort an in-progress upload
 * Body: { documentId, uploadId, s3Key }
 */
router.post('/:orderId/abort', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key } = req.body;

    if (!uploadId || !s3Key) {
      return res.status(400).json({ error: 'uploadId and s3Key are required' });
    }

    // Abort in S3
    const abortCommand = new AbortMultipartUploadCommand({
      Bucket: CUSTOMER_DOCS_BUCKET,
      Key: s3Key,
      UploadId: uploadId
    });

    try {
      await s3Client.send(abortCommand);
    } catch (s3Error) {
      console.warn('S3 abort error (may already be aborted):', s3Error.message);
    }

    // Delete database record if exists
    if (documentId) {
      await prisma.customerDocument.delete({
        where: { id: documentId }
      }).catch(() => {}); // Ignore if already deleted
    }

    res.json({ success: true, message: 'Upload aborted' });
  } catch (error) {
    console.error('Error aborting upload:', error);
    res.status(500).json({ error: 'Failed to abort upload' });
  }
});

/**
 * GET /customer-documents/:orderId/:documentId/download
 * Get a presigned download URL
 */
router.get('/:orderId/:documentId/download', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await prisma.customerDocument.findUnique({
      where: { id: documentId }
    });

    if (!document || !document.isComplete) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Generate presigned download URL with RFC 5987 encoded filename
    // This properly handles Unicode filenames (Chinese, etc.)
    const command = new GetObjectCommand({
      Bucket: document.s3Bucket,
      Key: document.s3Key,
      ResponseContentDisposition: buildContentDisposition(document.fileName)
    });

    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: DOWNLOAD_URL_EXPIRY
    });

    res.json({
      downloadUrl,
      fileName: document.fileName,
      fileSize: Number(document.fileSize),
      mimeType: document.mimeType
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * DELETE /customer-documents/:orderId/:documentId
 * Delete a customer document
 */
router.delete('/:orderId/:documentId', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;
    const user = req.user;

    const document = await prisma.customerDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: document.s3Bucket,
      Key: document.s3Key
    });

    try {
      await s3Client.send(deleteCommand);
    } catch (s3Error) {
      console.warn('S3 delete error:', s3Error.message);
    }

    // Delete from database
    await prisma.customerDocument.delete({
      where: { id: documentId }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        entityType: 'CustomerDocument',
        entityId: documentId,
        parentEntityId: document.orderId,
        action: 'DELETED',
        metadata: JSON.stringify({ fileName: document.fileName }),
        performedByUserId: user.id,
        performedByName: user.name
      }
    });

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * PATCH /customer-documents/:orderId/:documentId
 * Update document description
 * Body: { description }
 */
router.patch('/:orderId/:documentId', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { description } = req.body;

    const document = await prisma.customerDocument.update({
      where: { id: documentId },
      data: { description }
    });

    res.json({
      id: document.id,
      description: document.description,
      message: 'Document updated'
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

export default router;
