/**
 * Public Customer Documents Routes
 * 
 * These routes are accessible WITHOUT authentication.
 * Used on the public tracking page for customers to view/download their documents.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = express.Router();
const prisma = new PrismaClient();

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const DOWNLOAD_URL_EXPIRY = 3600; // 1 hour for download URLs

// Helper: Format file size for display
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Helper: Get file icon based on MIME type
function getFileIcon(mimeType) {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'document';
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return 'archive';
  return 'file';
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

/**
 * GET /public/order/:poNumber/customer-documents
 * List customer documents for public tracking page
 * No authentication required - uses PO number for lookup
 */
router.get('/order/:poNumber/customer-documents', async (req, res) => {
  try {
    const { poNumber } = req.params;

    // Find order by PO number
    const order = await prisma.order.findFirst({
      where: { 
        poNumber: poNumber,
        isArchived: false
      },
      select: {
        id: true,
        poNumber: true,
        customerDocsLink: true // Include legacy link during transition
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get completed, non-expired documents
    const now = new Date();
    const documents = await prisma.customerDocument.findMany({
      where: {
        orderId: order.id,
        isComplete: true,
        expiresAt: { gt: now }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    // Format response for public consumption (no internal details)
    const formattedDocs = documents.map(doc => ({
      id: doc.id,
      fileName: doc.fileName,
      fileSize: Number(doc.fileSize),
      fileSizeFormatted: formatFileSize(Number(doc.fileSize)),
      mimeType: doc.mimeType,
      fileType: getFileIcon(doc.mimeType),
      description: doc.description,
      uploadedAt: doc.uploadedAt
    }));

    res.json({
      documents: formattedDocs,
      count: formattedDocs.length,
      // Include legacy Dropbox link if no new documents exist
      legacyLink: formattedDocs.length === 0 ? order.customerDocsLink : null
    });
  } catch (error) {
    console.error('Error listing public customer documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * GET /public/order/:poNumber/customer-documents/:documentId/download
 * Get a presigned download URL for public access
 * No authentication required - validates document belongs to PO number
 */
router.get('/order/:poNumber/customer-documents/:documentId/download', async (req, res) => {
  try {
    const { poNumber, documentId } = req.params;

    // Find order by PO number
    const order = await prisma.order.findFirst({
      where: { 
        poNumber: poNumber,
        isArchived: false
      },
      select: { id: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Find document and verify it belongs to this order
    const document = await prisma.customerDocument.findFirst({
      where: {
        id: documentId,
        orderId: order.id,
        isComplete: true,
        expiresAt: { gt: new Date() }
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found or expired' });
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
    console.error('Error generating public download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * GET /public/track/:trackingToken/customer-documents
 * Alternative: List documents using tracking token instead of PO number
 */
router.get('/track/:trackingToken/customer-documents', async (req, res) => {
  try {
    const { trackingToken } = req.params;

    // Find order by tracking token
    const order = await prisma.order.findUnique({
      where: { trackingToken },
      select: {
        id: true,
        poNumber: true,
        customerDocsLink: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get completed, non-expired documents
    const now = new Date();
    const documents = await prisma.customerDocument.findMany({
      where: {
        orderId: order.id,
        isComplete: true,
        expiresAt: { gt: now }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    // Format response
    const formattedDocs = documents.map(doc => ({
      id: doc.id,
      fileName: doc.fileName,
      fileSize: Number(doc.fileSize),
      fileSizeFormatted: formatFileSize(Number(doc.fileSize)),
      mimeType: doc.mimeType,
      fileType: getFileIcon(doc.mimeType),
      description: doc.description,
      uploadedAt: doc.uploadedAt
    }));

    res.json({
      documents: formattedDocs,
      count: formattedDocs.length,
      legacyLink: formattedDocs.length === 0 ? order.customerDocsLink : null
    });
  } catch (error) {
    console.error('Error listing public customer documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * GET /public/track/:trackingToken/customer-documents/:documentId/download
 * Download using tracking token
 */
router.get('/track/:trackingToken/customer-documents/:documentId/download', async (req, res) => {
  try {
    const { trackingToken, documentId } = req.params;

    // Find order by tracking token
    const order = await prisma.order.findUnique({
      where: { trackingToken },
      select: { id: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Find document
    const document = await prisma.customerDocument.findFirst({
      where: {
        id: documentId,
        orderId: order.id,
        isComplete: true,
        expiresAt: { gt: new Date() }
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found or expired' });
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
    console.error('Error generating public download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

export default router;
