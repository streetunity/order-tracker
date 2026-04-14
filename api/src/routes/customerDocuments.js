/**
 * Customer Documents Routes
 *
 * Handles file uploads for customer-viewable content.
 * Supports categories: photos, videos, manuals, documents, readme.
 * The 'readme' category merges global (settings-managed) files with
 * order-specific readme files in the GET response.
 * Uses S3 multipart upload for reliable large-file transfers.
 *
 * MANUFACTURER access:
 * - Can only upload to 'photos' and 'videos' categories.
 * - GET returns only files they personally uploaded.
 * - On upload complete, notifies assigned agent + all SUPER_ADMINs.
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
const CHUNK_SIZE = 10 * 1024 * 1024;
const URL_EXPIRY = 3600;
const RETENTION_DAYS = 365;

const VALID_CATEGORIES = ['photos', 'videos', 'manuals', 'documents', 'readme'];
const MANUFACTURER_CATEGORIES = ['photos', 'videos']; // manufacturers can only upload these

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

/**
 * Fire-and-forget: notify assigned agent + all SUPER_ADMINs when a
 * manufacturer uploads a customer file.
 */
async function notifyManufacturerUpload(orderId, uploaderName, fileName, category) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { account: { select: { name: true } } },
    });
    if (!order) return;

    const accountName = order.account?.name || 'Unknown Account';
    const orderRef    = order.poNumber || orderId.slice(-8).toUpperCase();
    const title       = `Manufacturer uploaded ${category}`;
    const message     = `${uploaderName} uploaded "${fileName}" (${category}) to order ${orderRef} — ${accountName}.`;

    // Collect recipients: assigned agent (by name in sku field) + all SUPER_ADMINs
    const recipients = [];

    if (order.sku) {
      const agent = await prisma.user.findFirst({
        where: { name: order.sku, isActive: true, role: { not: 'MANUFACTURER' } },
        select: { id: true, email: true, name: true },
      });
      if (agent) recipients.push(agent);
    }

    const superAdmins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, email: true, name: true },
    });
    for (const sa of superAdmins) {
      if (!recipients.find(r => r.id === sa.id)) recipients.push(sa);
    }

    if (!recipients.length) return;

    // Create in-app notifications
    await prisma.notification.createMany({
      data: recipients.map(r => ({
        userId:         r.id,
        type:           'MANUFACTURER_UPLOAD',
        category:       'ORDER',
        title,
        message,
        relatedOrderId: orderId,
        priority:       'NORMAL',
      })),
      skipDuplicates: true,
    });

    // Send emails
    const emailServiceModule = await import('../services/emailService.js');
    const emailService = emailServiceModule.default || emailServiceModule;
    const company     = await prisma.companySettings.findFirst();
    const companyName = company?.companyName || 'Stealth Machine Tools';
    const fromEmail   = company?.email || process.env.SES_FROM_EMAIL || 'noreply@smt-orders.com';
    const orderUrl    = `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/admin/orders/${orderId}/customer-files`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
        <div style="background:#dc2626;padding:20px 30px;">
          <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">Manufacturer File Upload</h1>
        </div>
        <div style="padding:28px 30px;color:#333;font-size:15px;line-height:1.6;">
          <p><strong>${uploaderName}</strong> has uploaded a new file to an order you are managing.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:120px;">Order</td><td style="padding:8px 12px;background:#f5f5f5;">${orderRef} &mdash; ${accountName}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:600;">File</td><td style="padding:8px 12px;">${fileName}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;">Category</td><td style="padding:8px 12px;background:#f5f5f5;">${category.charAt(0).toUpperCase() + category.slice(1)}</td></tr>
          </table>
          <p style="margin-top:24px;">
            <a href="${orderUrl}" style="background:#dc2626;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:600;display:inline-block;">View Files</a>
          </p>
        </div>
        <div style="background:#f5f5f5;padding:16px 30px;font-size:12px;color:#666;text-align:center;">
          <p style="margin:0;">${companyName}</p>
        </div>
      </div>
    `;

    await Promise.allSettled(
      recipients
        .filter(r => r.email)
        .map(r => emailService.sendEmail({
          to: r.email, from: fromEmail, fromName: companyName,
          replyTo: fromEmail,
          subject: `[SMT] Manufacturer uploaded ${category} — Order ${orderRef}`,
          html,
        }))
    );
  } catch (err) {
    console.error('[notifyManufacturerUpload] Error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /:orderId — returns order-specific docs + global readme files
// MANUFACTURER: only returns their own uploads (photos/videos)
// ─────────────────────────────────────────────────────────────
router.get('/:orderId', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const isManufacturer = req.user.role === 'MANUFACTURER';

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, poNumber: true, customerDocsLink: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Build where clause — manufacturers only see their own uploads
    const docsWhere = { orderId, isComplete: true };
    if (isManufacturer) {
      docsWhere.uploadedById = req.user.id;
      docsWhere.category = { in: MANUFACTURER_CATEGORIES };
    }

    const [docs, globalDocs] = await Promise.all([
      prisma.customerDocument.findMany({
        where: docsWhere,
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { uploadedAt: 'desc' }],
      }),
      // Manufacturers still see global readme files
      isManufacturer ? Promise.resolve([]) : prisma.globalCustomerDocument.findMany({
        where: { isComplete: true, isActive: true },
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'asc' }],
      }),
    ]);

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
          isGlobal: false,
        };
      })
    );

    const globalWithUrls = await Promise.all(
      globalDocs.map(async (doc) => {
        const url = await generateInlineUrl(doc.s3Key);
        return {
          id: doc.id,
          fileName: doc.fileName,
          displayName: doc.displayName || doc.fileName,
          fileSize: Number(doc.fileSize),
          fileSizeFormatted: formatFileSize(doc.fileSize),
          mimeType: doc.mimeType,
          category: 'readme',
          sortOrder: doc.sortOrder,
          description: doc.description,
          uploadedBy: doc.uploadedBy,
          uploadedAt: doc.uploadedAt,
          expiresAt: null,
          url,
          isGlobal: true,
        };
      })
    );

    const orderReadme = withUrls.filter(f => f.category === 'readme');

    res.json({
      photos:            withUrls.filter(f => f.category === 'photos'),
      videos:            withUrls.filter(f => f.category === 'videos'),
      manuals:           withUrls.filter(f => f.category === 'manuals'),
      documents:         withUrls.filter(f => f.category === 'documents'),
      readme:            [...globalWithUrls, ...orderReadme],
      legacyDropboxLink: order.customerDocsLink || null,
      totalCount:        withUrls.length + globalWithUrls.length,
    });
  } catch (error) {
    console.error('Error listing customer documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/initiate
// MANUFACTURER: restricted to photos/videos only
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/initiate', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fileName, fileSize, mimeType, description, category = 'documents' } = req.body;
    const user = req.user;
    const isManufacturer = user.role === 'MANUFACTURER';

    if (!fileName || !fileSize || !mimeType)
      return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required' });

    // Enforce category restrictions
    const allowedCategories = isManufacturer ? MANUFACTURER_CATEGORIES : VALID_CATEGORIES;
    if (!allowedCategories.includes(category))
      return res.status(400).json({ error: `Invalid category. Must be one of: ${allowedCategories.join(', ')}` });

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
// POST /:orderId/sign-part
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/sign-part', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, partNumber, s3Key } = req.body;
    if (!uploadId || !partNumber || !s3Key)
      return res.status(400).json({ error: 'uploadId, partNumber, and s3Key are required' });

    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.isComplete) return res.status(400).json({ error: 'Invalid or completed upload' });

    // Manufacturers can only sign their own uploads
    if (req.user.role === 'MANUFACTURER' && doc.uploadedById !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

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
// POST /:orderId/complete
// MANUFACTURER: fires async notifications on success
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/complete', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key, parts } = req.body;
    const { orderId } = req.params;
    if (!uploadId || !s3Key || !Array.isArray(parts))
      return res.status(400).json({ error: 'uploadId, s3Key, and parts array are required' });

    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc)           return res.status(404).json({ error: 'Document not found' });
    if (doc.isComplete) return res.status(400).json({ error: 'Upload already completed' });

    // Manufacturers can only complete their own uploads
    if (req.user.role === 'MANUFACTURER' && doc.uploadedById !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

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

    await prisma.auditLog.create({
      data: {
        entityType: 'CustomerDocument',
        entityId: documentId,
        parentEntityId: doc.orderId,
        action: 'UPLOADED',
        metadata: JSON.stringify({ fileName: doc.fileName, category: doc.category, fileSize: Number(doc.fileSize), mimeType: doc.mimeType }),
        performedByUserId: req.user.id,
        performedByName: req.user.name,
      },
    });

    // Notify agent + super admins async (fire-and-forget)
    if (req.user.role === 'MANUFACTURER') {
      setImmediate(() => notifyManufacturerUpload(
        orderId, req.user.name, doc.fileName, doc.category
      ));
    }

    res.json({ success: true, documentId });
  } catch (error) {
    console.error('Error completing upload:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/abort
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/abort', authGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key } = req.body;
    if (!uploadId || !s3Key) return res.status(400).json({ error: 'uploadId and s3Key are required' });
    try {
      await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: s3Key, UploadId: uploadId }));
    } catch (e) { console.warn('S3 abort (may already be gone):', e.message); }
    if (documentId) await prisma.customerDocument.delete({ where: { id: documentId } }).catch(() => {});
    res.json({ success: true });
  } catch (error) {
    console.error('Error aborting upload:', error);
    res.status(500).json({ error: 'Failed to abort upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /:orderId/notify  (admin only — not available to manufacturers)
// ─────────────────────────────────────────────────────────────
router.post('/:orderId/notify', authGuard, async (req, res) => {
  if (req.user.role === 'MANUFACTURER') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        account: true,
        customerDocuments: { where: { isComplete: true }, orderBy: { uploadedAt: 'desc' }, take: 50 },
      },
    });
    if (!order)                           return res.status(404).json({ error: 'Order not found' });
    if (!order.account?.email)            return res.status(400).json({ error: 'Customer has no email address' });
    if (!order.customerDocuments?.length) return res.status(400).json({ error: 'No files to notify about' });

    const company  = await prisma.companySettings.findFirst();
    let salesRep = null;
    if (order.sku) salesRep = await prisma.user.findFirst({ where: { name: order.sku, isActive: true } });

    const fromEmail = salesRep?.email || company?.email || process.env.SES_FROM_EMAIL;
    const fromName  = salesRep?.name  || company?.companyName || 'Stealth Machine Tools';
    const docs = order.customerDocuments;
    const photoCount    = docs.filter(f => (f.category || 'documents') === 'photos').length;
    const videoCount    = docs.filter(f => (f.category || 'documents') === 'videos').length;
    const manualCount   = docs.filter(f => (f.category || 'documents') === 'manuals').length;
    const documentCount = docs.filter(f => (f.category || 'documents') === 'documents').length;
    const trackingUrl   = `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/t/${order.trackingToken}`;
    const orderNumber   = order.id.slice(-8).toUpperCase();
    const customerName  = order.account.contactName || order.account.name || 'Customer';
    const companyName   = company?.companyName || 'Stealth Machine Tools';
    const companyPhone  = company?.phone  || '';
    const companyEmail  = company?.email  || '';

    const emailServiceModule = await import('../services/emailService.js');
    const emailService = emailServiceModule.default || emailServiceModule;
    const dbTemplate = await prisma.emailTemplate.findUnique({ where: { templateKey: 'customer_files' } });

    let subjectLine, html;
    if (dbTemplate) {
      const { wrapInBaseTemplate } = await import('../services/emailTemplates.js');
      const vars = { customerName, orderNumber, totalCount: String(docs.length), photoCount: String(photoCount), videoCount: String(videoCount), manualCount: String(manualCount), documentCount: String(documentCount), trackingUrl, companyName, companyPhone, companyEmail };
      const p = str => { let out = str; for (const [k,v] of Object.entries(vars)) out = out.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v); return out; };
      subjectLine = p(dbTemplate.subject);
      const RED = '#dc2626', LIGHT = '#f5f5f5';
      html = wrapInBaseTemplate(
        `<tr bgcolor="${RED}"><td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;"><h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">New Files Available</h1></td></tr>` +
        `<tr><td bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">${p(dbTemplate.bodyContent || '')}${dbTemplate.closingContent ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #dddddd;">${p(dbTemplate.closingContent)}</div>` : ''}</td></tr>` +
        `<tr><td bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;font-size:12px;color:#666666;">${p(dbTemplate.footerContent || `<p>${companyName}</p>`)}</td></tr>`,
        subjectLine
      );
    } else {
      const { getCustomerFilesEmailTemplate } = await import('../services/emailTemplates.js');
      subjectLine = 'New files available for your order';
      html = getCustomerFilesEmailTemplate({ customerName, orderNumber, photoCount, videoCount, manualCount, documentCount, totalCount: docs.length, trackingUrl, companyName, companyPhone, companyEmail });
    }

    const result = await emailService.sendEmail({ to: order.account.email, from: fromEmail, fromName, replyTo: fromEmail, subject: subjectLine, html });
    if (result?.success) res.json({ message: 'Notification sent successfully' });
    else res.status(500).json({ error: 'Failed to send notification' });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification: ' + error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:orderId/reorder (not available to manufacturers)
// ─────────────────────────────────────────────────────────────
router.patch('/:orderId/reorder', authGuard, async (req, res) => {
  if (req.user.role === 'MANUFACTURER') return res.status(403).json({ error: 'Forbidden' });
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
    // Manufacturers can only download their own files
    if (req.user.role === 'MANUFACTURER' && doc.uploadedById !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    const name = doc.displayName || doc.fileName;
    const downloadUrl = await generateDownloadUrl(doc.s3Key, name);
    res.json({ downloadUrl, fileName: name, fileSize: Number(doc.fileSize), mimeType: doc.mimeType });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:orderId/:documentId  — rename / description / re-categorize
// Manufacturers can only edit their own files, within allowed categories
// ─────────────────────────────────────────────────────────────
router.patch('/:orderId/:documentId', authGuard, async (req, res) => {
  try {
    const { orderId, documentId } = req.params;
    const { displayName, description, category } = req.body;
    const isManufacturer = req.user.role === 'MANUFACTURER';

    const existing = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    if (isManufacturer && existing.uploadedById !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    const data = {};
    if (displayName !== undefined) data.displayName = displayName || null;
    if (description !== undefined) data.description = description;
    if (category    !== undefined) {
      const allowedCategories = isManufacturer ? MANUFACTURER_CATEGORIES : VALID_CATEGORIES;
      if (!allowedCategories.includes(category))
        return res.status(400).json({ error: `Invalid category. Must be one of: ${allowedCategories.join(', ')}` });
      data.category = category;
      const maxSort = await prisma.customerDocument.aggregate({ where: { orderId, category }, _max: { sortOrder: true } });
      data.sortOrder = (maxSort._max.sortOrder ?? 0) + 1;
    }
    const doc = await prisma.customerDocument.update({ where: { id: documentId }, data });
    res.json({ id: doc.id, displayName: doc.displayName, description: doc.description, category: doc.category });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /:orderId/:documentId
// Manufacturers can only delete their own files
// ─────────────────────────────────────────────────────────────
router.delete('/:orderId/:documentId', authGuard, async (req, res) => {
  try {
    const { documentId } = req.params;
    const user = req.user;
    const doc = await prisma.customerDocument.findUnique({ where: { id: documentId } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (user.role === 'MANUFACTURER' && doc.uploadedById !== user.id)
      return res.status(403).json({ error: 'Forbidden' });
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: doc.s3Bucket, Key: doc.s3Key }));
    } catch (e) { console.warn('S3 delete error:', e.message); }
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
