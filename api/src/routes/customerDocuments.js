/**
 * Customer Documents Routes
 *
 * Handles file uploads for customer-viewable content.
 * Supports categories: photos, videos, manuals, documents.
 * Uses S3 multipart upload for reliable large-file transfers.
 * Files are grouped by category and displayed on the public tracking page.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authGuard } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_CUSTOMER_DOCS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'order-tracker-documents';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const URL_EXPIRY = 3600; // 1 hour
const RETENTION_DAYS = 365;

const VALID_CATEGORIES = ['photos', 'videos', 'manuals', 'documents'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sanitizeFileName(originalName) {
  if (!originalName) return `file-${Date.now()}`;
  const lastDot = originalName.lastIndexOf('.');
  const extension = lastDot > 0 ? originalName.substring(lastDot).toLowerCase() : '';
  const baseName = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;
  let sanitized = baseName.replace(/[^\x20-\x7E]/g, '');
  sanitized = sanitized.replace(/[\s]+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  sanitized = sanitized.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  if (!sanitized || sanitized.length === 0) sanitized = `file-${Date.now()}`;
  return sanitized + extension;
}

function generateS3Key(orderId, category, fileName) {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `customer-docs/${orderId}/${category}/${Date.now()}-${sanitized}`;
}

function calculateExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + RETENTION_DAYS);
  return d;
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

async function generateInlineUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3Client, command, { expiresIn: URL_EXPIRY });
}

async function generateDownloadUrl(s3Key, displayName) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ResponseContentDisposition: `attachment; filename="${displayName}"`,
  });
  return getSignedUrl(s3Client, command, { expiresIn: URL_EXPIRY });
}

// ─────────────────────────────────────────────────────────────
// GET /:orderId  — list all files, grouped by category
// ─────────────────────────────────────────────────────────────
router.get('/:orderId', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, poNumber: true, customerDocsLink: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const docs = await prisma.customerDocument.findMany({
      where: { orderId, isComplete: true },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { uploadedAt: 'desc' }],
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => {
        const url = await generateInlineUrl(doc.s3Key);
        return {
          id: doc.id,
          fileName: doc.fileName,
          displayName: doc.displayName || doc.fileName,
          fileSize: Number(doc.fileSize),
          fileSizeFormatted: formatFileSize(doc.fileSize),
          mimeType: doc.mimeType,
          category: doc.category || 'documents',
          sortOrder: doc.sortOrder,
          description: doc.description,
          uploadedBy: doc.uploadedBy,
          uploadedAt: doc.uploadedAt,
          expiresAt: doc.expiresAt,
          url,
        };
      })
    );

    res.json({
      photos: withUrls.filter((f) => f.category === 'photos'),
      videos: withUrls.filter((f) => f.category === 'videos'),
      manuals: withUrls.filter((f) => f.category === 'manuals'),
      documents: withUrls.filter((f) => f.category === 'documents'),
      legacyDropboxLink: order.customerDocsLink || null,
      totalCount: withUrls.length,
    });
  } catch (error) {
    console.error('Error listing customer documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/initiate  — start multipart upload
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/initiate', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fileName, fileSize, mimeType, description, category = 'documents' } = req.body;
    const user = req.user;

    if (!fileName || !fileSize || !mimeType) {
      return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const sanitizedFileName = sanitizeFileName(fileName);
    const s3Key = generateS3Key(orderId, category, sanitizedFileName);

    const { UploadId } = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: mimeType,
        Metadata: {
          'original-filename': sanitizedFileName,
          'order-id': String(orderId),
          category,
          'uploaded-by': (user.name || 'unknown').replace(/[^\x20-\x7E]/g, ''),
        },
      })
    );

    const maxSort = await prisma.customerDocument.aggregate({
      where: { orderId, category },
      _max: { sortOrder: true },
    });

    const document = await prisma.customerDocument.create({
      data: {
        orderId,
        fileName: sanitizedFileName,
        fileSize: BigInt(fileSize),
        mimeType,
        s3Bucket: BUCKET,
        s3Key,
        description,
        category,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        uploadedById: user.id,
        uploadId: UploadId,
        isComplete: false,
        expiresAt: calculateExpiryDate(),
      },
    });

    res.json({
      documentId: document.id,
      uploadId: UploadId,
      s3Key,
      bucket: BUCKET,
      chunkSize: CHUNK_SIZE,
      totalParts: Math.ceil(fileSize / CHUNK_SIZE),
      sanitizedFileName,
    });
  } catch (error) {
    console.error('Error initiating upload:', error);
    res.status(500).json({ error: 'Failed to initiate upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/sign-part  — presigned URL for one chunk
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/sign-part', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, partNumber, s3Key } = req.body;
    if (!uploadId || !partNumber || !s3Key) {
      return res.status(400).json({ error: 'uploadId, partNumber, and s3Key are required' });
    }

    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.isComplete) return res.status(400).json({ error: 'Invalid or completed upload' });

    const presignedUrl = await getSignedUrl(
      s3Client,
      new UploadPartCommand({ Bucket: BUCKET, Key: s3Key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: URL_EXPIRY }
    );

    res.json({ presignedUrl, partNumber });
  } catch (error) {
    console.error('Error signing part:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/complete  — complete multipart upload
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/complete', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key, parts } = req.body;
    if (!uploadId || !s3Key || !Array.isArray(parts)) {
      return res.status(400).json({ error: 'uploadId, s3Key, and parts array are required' });
    }

    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.isComplete) return res.status(400).json({ error: 'Upload already completed' });

    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: s3Key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) },
      })
    );

    await prisma.customerDocument.update({
      where: { id: documentId },
      data: { isComplete: true, uploadId: null },
    });

    res.json({ success: true, documentId });
  } catch (error) {
    console.error('Error completing upload:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/abort  — abort in-progress upload
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/abort', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key } = req.body;
    if (!uploadId || !s3Key) return res.status(400).json({ error: 'uploadId and s3Key are required' });

    try {
      await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: s3Key, UploadId: uploadId }));
    } catch (e) {
      console.warn('S3 abort (may already be gone):', e.message);
    }

    if (documentId) {
      await prisma.customerDocument.delete({ where: { id: documentId } }).catch(() => {});
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error aborting upload:', error);
    res.status(500).json({ error: 'Failed to abort upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/notify  — email customer about new files
// Checks for admin-customized template in DB before falling
// back to the hardcoded getCustomerFilesEmailTemplate.
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/notify', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        account: true,
        customerDocuments: {
          where: { isComplete: true },
          orderBy: { uploadedAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.account?.email) return res.status(400).json({ error: 'Customer has no email address' });
    if (!order.customerDocuments?.length) return res.status(400).json({ error: 'No files to notify about' });

    const company = await prisma.companySettings.findFirst();
    let salesRep = null;
    if (order.sku) {
      salesRep = await prisma.user.findFirst({ where: { name: order.sku, isActive: true } });
    }

    const fromEmail = salesRep?.email || company?.email || process.env.SES_FROM_EMAIL;
    const fromName = salesRep?.name || company?.companyName || 'Stealth Machine Tools';

    const docs = order.customerDocuments;
    const photoCount    = docs.filter((f) => (f.category || 'documents') === 'photos').length;
    const videoCount    = docs.filter((f) => (f.category || 'documents') === 'videos').length;
    const manualCount   = docs.filter((f) => (f.category || 'documents') === 'manuals').length;
    const documentCount = docs.filter((f) => (f.category || 'documents') === 'documents').length;

    const trackingUrl = `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/track/${order.trackingToken}`;
    const orderNumber = order.id.slice(-8).toUpperCase();
    const customerName = order.account.contactName || order.account.name || 'Customer';
    const companyName = company?.companyName || 'Stealth Machine Tools';
    const companyPhone = company?.phone || '';
    const companyEmail = company?.email || '';

    const emailServiceModule = await import('../services/emailService.js');
    const emailService = emailServiceModule.default || emailServiceModule;

    // Check for admin-customized template
    const dbTemplate = await prisma.emailTemplate.findUnique({
      where: { templateKey: 'customer_files' },
    });

    let subjectLine;
    let html;

    if (dbTemplate) {
      // Use customized template — substitute variables and wrap in base email shell
      const { wrapInBaseTemplate } = await import('../services/emailTemplates.js');

      const vars = {
        customerName,
        orderNumber,
        totalCount: String(docs.length),
        photoCount: String(photoCount),
        videoCount: String(videoCount),
        manualCount: String(manualCount),
        documentCount: String(documentCount),
        trackingUrl,
        companyName,
        companyPhone,
        companyEmail,
      };

      const processTemplate = (str) => {
        let out = str;
        for (const [k, v] of Object.entries(vars)) {
          out = out.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
        }
        return out;
      };

      subjectLine = processTemplate(dbTemplate.subject);
      const processedBody    = processTemplate(dbTemplate.bodyContent || '');
      const processedClosing = processTemplate(dbTemplate.closingContent || '');
      const processedFooter  = processTemplate(dbTemplate.footerContent || `<p>${companyName}</p>`);

      const RED   = '#dc2626';
      const LIGHT = '#f5f5f5';

      const content = `
        <tr bgcolor="${RED}"><td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">New Files Available</h1>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
          ${processedBody}
          ${processedClosing ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #dddddd;">${processedClosing}</div>` : ''}
        </td></tr>
        <tr><td bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;font-size:12px;color:#666666;">
          ${processedFooter}
        </td></tr>`;

      html = wrapInBaseTemplate(content, subjectLine);
    } else {
      // Fall back to hardcoded template
      const { getCustomerFilesEmailTemplate } = await import('../services/emailTemplates.js');
      subjectLine = 'New files available for your order';
      html = getCustomerFilesEmailTemplate({
        customerName,
        orderNumber,
        photoCount,
        videoCount,
        manualCount,
        documentCount,
        totalCount: docs.length,
        trackingUrl,
        companyName,
        companyPhone,
        companyEmail,
      });
    }

    const result = await emailService.sendEmail({
      to: order.account.email,
      from: fromEmail,
      fromName,
      replyTo: fromEmail,
      subject: subjectLine,
      html,
    });

    if (result?.success) {
      console.log(`[EMAIL] Customer files notification sent for order ${orderId} to ${order.account.email}`);
      res.json({ message: 'Notification sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send notification' });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification: ' + error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:orderId/reorder  — update sortOrder for a set of files
// ─────────────────────────────────────────────────────────────
router.patch('/:orderId/reorder', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds)) return res.status(400).json({ error: 'fileIds must be an array' });

    await prisma.$transaction(
      fileIds.map((id, index) =>
        prisma.customerDocument.update({ where: { id, orderId }, data: { sortOrder: index } })
      )
    );

    res.json({ message: 'Reordered successfully' });
  } catch (error) {
    console.error('Error reordering files:', error);
    res.status(500).json({ error: 'Failed to reorder files' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /:orderId/:documentId/download
// ─────────────────────────────────────────────────────────────
router.get('/:orderId/:documentId/download', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc || !doc.isComplete) return res.status(404).json({ error: 'Document not found' });

    const name = doc.displayName || doc.fileName;
    const downloadUrl = await generateDownloadUrl(doc.s3Key, name);
    res.json({ downloadUrl, fileName: name, fileSize: Number(doc.fileSize), mimeType: doc.mimeType });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:orderId/:documentId  — rename / update description
// ─────────────────────────────────────────────────────────────
router.patch('/:orderId/:documentId', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { displayName, description } = req.body;
    const data = {};
    if (displayName !== undefined) data.displayName = displayName || null;
    if (description !== undefined) data.description = description;
    const doc = await prisma.customerDocument.update({ where: { id: documentId }, data });
    res.json({ id: doc.id, displayName: doc.displayName, description: doc.description });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /:orderId/:documentId  — delete from S3 + DB
// ─────────────────────────────────────────────────────────────
router.delete('/:orderId/:documentId', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;
    const user = req.user;
    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: doc.s3Bucket, Key: doc.s3Key }));
    } catch (e) {
      console.warn('S3 delete error:', e.message);
    }

    await prisma.customerDocument.delete({ where: { id: documentId } });

    await prisma.auditLog.create({
      data: {
        entityType: 'CustomerDocument',
        entityId: documentId,
        parentEntityId: doc.orderId,
        action: 'DELETED',
        metadata: JSON.stringify({ fileName: doc.fileName, category: doc.category }),
        performedByUserId: user.id,
        performedByName: user.name,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
