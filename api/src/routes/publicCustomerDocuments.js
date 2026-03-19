/**
 * Public Customer Documents Routes
 *
 * No authentication required — used by the public tracking page.
 * Returns files grouped by category with signed inline URLs.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = express.Router();
const prisma = new PrismaClient();

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_CUSTOMER_DOCS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'order-tracker-documents';
const URL_EXPIRY = 3600;

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

async function getSignedFileUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3Client, command, { expiresIn: URL_EXPIRY });
}

async function buildPublicResponse(order) {
  const now = new Date();
  const docs = await prisma.customerDocument.findMany({
    where: { orderId: order.id, isComplete: true, expiresAt: { gt: now } },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { uploadedAt: 'desc' }],
  });

  const withUrls = await Promise.all(
    docs.map(async (doc) => {
      const url = await getSignedFileUrl(doc.s3Key);
      return {
        id: doc.id,
        fileName: doc.displayName || doc.fileName,
        fileSize: Number(doc.fileSize),
        fileSizeFormatted: formatFileSize(doc.fileSize),
        mimeType: doc.mimeType,
        category: doc.category || 'documents',
        description: doc.description,
        url,
      };
    })
  );

  return {
    photos: withUrls.filter((f) => f.category === 'photos'),
    videos: withUrls.filter((f) => f.category === 'videos'),
    manuals: withUrls.filter((f) => f.category === 'manuals'),
    documents: withUrls.filter((f) => f.category === 'documents'),
    legacyDropboxLink: withUrls.length === 0 ? (order.customerDocsLink || null) : null,
    totalCount: withUrls.length,
  };
}

/**
 * GET /public/track/:trackingToken/customer-documents
 * Primary endpoint — used by the tracking page
 */
router.get('/track/:trackingToken/customer-documents', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { trackingToken: req.params.trackingToken },
      select: { id: true, poNumber: true, customerDocsLink: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(await buildPublicResponse(order));
  } catch (error) {
    console.error('Error fetching public customer documents:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/**
 * GET /public/track/:trackingToken/customer-documents/:documentId/download
 * Presigned download URL for a specific file
 */
router.get('/track/:trackingToken/customer-documents/:documentId/download', async (req, res) => {
  try {
    const { trackingToken, documentId } = req.params;

    const order = await prisma.order.findUnique({
      where: { trackingToken },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const doc = await prisma.customerDocument.findFirst({
      where: { id: documentId, orderId: order.id, isComplete: true, expiresAt: { gt: new Date() } },
    });
    if (!doc) return res.status(404).json({ error: 'File not found or expired' });

    const name = doc.displayName || doc.fileName;
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: doc.s3Key,
      ResponseContentDisposition: `attachment; filename="${name}"`,
    });
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: URL_EXPIRY });

    res.json({ downloadUrl, fileName: name, fileSize: Number(doc.fileSize), mimeType: doc.mimeType });
  } catch (error) {
    console.error('Error generating public download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * GET /public/order/:poNumber/customer-documents
 * Legacy PO-number-based endpoint (backwards compat)
 */
router.get('/order/:poNumber/customer-documents', async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { poNumber: req.params.poNumber, isArchived: false },
      select: { id: true, poNumber: true, customerDocsLink: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(await buildPublicResponse(order));
  } catch (error) {
    console.error('Error fetching public customer documents:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

export default router;
