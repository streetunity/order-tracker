/**
 * Global Customer Documents Routes
 *
 * CRUD for "Read Me" files uploaded once in admin settings that automatically
 * appear in every customer order's customer-files page.
 * Uses the same S3 multipart upload pattern as customerDocuments.js.
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
import { authGuard, adminGuard } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET   = process.env.S3_CUSTOMER_DOCS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'order-tracker-documents';
const CHUNK_SIZE = 10 * 1024 * 1024;
const URL_EXPIRY = 3600;

function sanitizeFileName(originalName) {
  if (!originalName) return `file-${Date.now()}`;
  const lastDot   = originalName.lastIndexOf('.');
  const extension = lastDot > 0 ? originalName.substring(lastDot).toLowerCase() : '';
  const baseName  = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;
  let sanitized   = baseName.replace(/[^\x20-\x7E]/g, '');
  sanitized = sanitized.replace(/[\s]+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  sanitized = sanitized.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  if (!sanitized || sanitized.length === 0) sanitized = `file-${Date.now()}`;
  return sanitized + extension;
}

function generateS3Key(fileName) {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `global-customer-docs/${Date.now()}-${sanitized}`;
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (n < 1024)       return n + ' B';
  if (n < 1048576)    return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

async function generateInlineUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3Client, command, { expiresIn: URL_EXPIRY });
}

// ─────────────────────────────────────────────────────────────
// GET / — list all active global docs (any authenticated user)
// ─────────────────────────────────────────────────────────────
router.get('/', authGuard, async (req, res) => {
  try {
    const docs = await prisma.globalCustomerDocument.findMany({
      where: { isComplete: true, isActive: true },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'asc' }],
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => {
        const url = await generateInlineUrl(doc.s3Key);
        return {
          id:               doc.id,
          fileName:         doc.fileName,
          displayName:      doc.displayName || doc.fileName,
          fileSize:         Number(doc.fileSize),
          fileSizeFormatted: formatFileSize(doc.fileSize),
          mimeType:         doc.mimeType,
          sortOrder:        doc.sortOrder,
          description:      doc.description,
          uploadedBy:       doc.uploadedBy,
          uploadedAt:       doc.uploadedAt,
          url,
          isGlobal: true,
        };
      })
    );

    res.json(withUrls);
  } catch (error) {
    console.error('Error listing global documents:', error);
    res.status(500).json({ error: 'Failed to list global documents' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /initiate — start multipart upload (admin only)
// ─────────────────────────────────────────────────────────────
router.post('/initiate', adminGuard, async (req, res) => {
  try {
    const { fileName, fileSize, mimeType, description } = req.body;
    const user = req.user;

    if (!fileName || !fileSize || !mimeType)
      return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required' });

    const sanitizedFileName = sanitizeFileName(fileName);
    const s3Key = generateS3Key(sanitizedFileName);

    const { UploadId } = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: mimeType,
        Metadata: {
          'original-filename': sanitizedFileName,
          category: 'readme',
          'uploaded-by': (user.name || 'unknown').replace(/[^\x20-\x7E]/g, ''),
        },
      })
    );

    const maxSort = await prisma.globalCustomerDocument.aggregate({
      _max: { sortOrder: true },
    });

    const document = await prisma.globalCustomerDocument.create({
      data: {
        fileName:    sanitizedFileName,
        fileSize:    BigInt(fileSize),
        mimeType,
        s3Bucket:    BUCKET,
        s3Key,
        description,
        sortOrder:   (maxSort._max.sortOrder ?? 0) + 1,
        uploadedById: user.id,
        uploadId:    UploadId,
        isComplete:  false,
        isActive:    true,
      },
    });

    res.json({
      documentId:       document.id,
      uploadId:         UploadId,
      s3Key,
      bucket:           BUCKET,
      chunkSize:        CHUNK_SIZE,
      totalParts:       Math.ceil(fileSize / CHUNK_SIZE),
      sanitizedFileName,
    });
  } catch (error) {
    console.error('Error initiating global upload:', error);
    res.status(500).json({ error: 'Failed to initiate upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /sign-part
// ─────────────────────────────────────────────────────────────
router.post('/sign-part', adminGuard, async (req, res) => {
  try {
    const { documentId, uploadId, partNumber, s3Key } = req.body;
    if (!uploadId || !partNumber || !s3Key)
      return res.status(400).json({ error: 'uploadId, partNumber, and s3Key are required' });

    const doc = await prisma.globalCustomerDocument.findUnique({ where: { id: documentId } });
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
// POST /complete
// ─────────────────────────────────────────────────────────────
router.post('/complete', adminGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key, parts } = req.body;
    if (!uploadId || !s3Key || !Array.isArray(parts))
      return res.status(400).json({ error: 'uploadId, s3Key, and parts array are required' });

    const doc = await prisma.globalCustomerDocument.findUnique({ where: { id: documentId } });
    if (!doc)           return res.status(404).json({ error: 'Document not found' });
    if (doc.isComplete) return res.status(400).json({ error: 'Upload already completed' });

    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: s3Key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) },
      })
    );

    await prisma.globalCustomerDocument.update({
      where: { id: documentId },
      data:  { isComplete: true, uploadId: null },
    });

    res.json({ success: true, documentId });
  } catch (error) {
    console.error('Error completing global upload:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /abort
// ─────────────────────────────────────────────────────────────
router.post('/abort', adminGuard, async (req, res) => {
  try {
    const { documentId, uploadId, s3Key } = req.body;
    if (!uploadId || !s3Key) return res.status(400).json({ error: 'uploadId and s3Key are required' });
    try {
      await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: s3Key, UploadId: uploadId }));
    } catch (e) { console.warn('S3 abort (may already be gone):', e.message); }
    if (documentId) await prisma.globalCustomerDocument.delete({ where: { id: documentId } }).catch(() => {});
    res.json({ success: true });
  } catch (error) {
    console.error('Error aborting global upload:', error);
    res.status(500).json({ error: 'Failed to abort upload' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /reorder — reorder global docs
// ─────────────────────────────────────────────────────────────
router.patch('/reorder', adminGuard, async (req, res) => {
  try {
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds)) return res.status(400).json({ error: 'fileIds must be an array' });
    await prisma.$transaction(
      fileIds.map((id, index) =>
        prisma.globalCustomerDocument.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    res.json({ message: 'Reordered successfully' });
  } catch (error) {
    console.error('Error reordering global files:', error);
    res.status(500).json({ error: 'Failed to reorder files' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:id — rename / update description
// ─────────────────────────────────────────────────────────────
router.patch('/:id', adminGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, description } = req.body;
    const data = {};
    if (displayName !== undefined) data.displayName = displayName || null;
    if (description !== undefined) data.description = description;
    const doc = await prisma.globalCustomerDocument.update({ where: { id }, data });
    res.json({ id: doc.id, displayName: doc.displayName, description: doc.description });
  } catch (error) {
    console.error('Error updating global document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /:id — delete from S3 + DB
// ─────────────────────────────────────────────────────────────
router.delete('/:id', adminGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.globalCustomerDocument.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: doc.s3Bucket, Key: doc.s3Key }));
    } catch (e) { console.warn('S3 delete error:', e.message); }
    await prisma.globalCustomerDocument.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting global document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
