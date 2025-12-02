import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1"
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/msword', // .doc
  'application/vnd.ms-excel' // .xls
];

/**
 * Sanitize string for S3 metadata (must be ASCII-safe)
 * Uses URL encoding to handle non-ASCII characters like Chinese
 */
function sanitizeForMetadata(str) {
  if (!str) return '';
  // URL encode to make ASCII-safe, then limit length
  return encodeURIComponent(str).substring(0, 1024);
}

/**
 * Encode filename for Content-Disposition header using RFC 5987
 * This properly handles Unicode characters (Chinese, etc.)
 */
function encodeRFC5987(filename) {
  // RFC 5987 encoding: UTF-8''url-encoded-filename
  return `UTF-8''${encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')}`;
}

/**
 * Upload file to S3
 */
export async function uploadFileToS3({ fileBuffer, originalName, mimeType, orderId, uploadedBy }) {
  try {
    // Validate file size
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new Error('File type not allowed. Allowed types: PDF, JPG, PNG, WEBP, DOCX, XLSX');
    }

    // Generate unique S3 key (use safe characters only)
    const fileExtension = originalName.split('.').pop();
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const s3Key = `orders/${orderId}/${timestamp}-${uniqueId}.${fileExtension}`;

    // Upload to S3 with ASCII-safe metadata
    // Non-ASCII characters (Chinese, etc.) must be URL-encoded
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        'original-name': sanitizeForMetadata(originalName),
        'uploaded-by': sanitizeForMetadata(uploadedBy),
        'order-id': String(orderId || '')
      }
    });

    await s3Client.send(command);

    // Return file metadata
    // The original filename is returned as-is for database storage
    return {
      s3Key,
      s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
      fileName: originalName, // Original filename preserved for DB
      fileSize: fileBuffer.length,
      fileType: mimeType
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Delete file from S3
 */
export async function deleteFileFromS3(s3Key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Generate signed URL for secure download (expires in 1 hour)
 * @param {string} s3Key - The S3 object key
 * @param {string} originalFileName - Optional original filename for Content-Disposition
 */
export async function getSignedDownloadUrl(s3Key, originalFileName = null) {
  try {
    const commandParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    // If original filename provided, set Content-Disposition to suggest download filename
    // Uses RFC 5987 encoding for proper Unicode (Chinese, etc.) support
    if (originalFileName) {
      // Provide both ASCII fallback and UTF-8 encoded version for browser compatibility
      const asciiName = originalFileName.replace(/[^\x00-\x7F]/g, '_'); // Replace non-ASCII with underscore
      const encodedName = encodeRFC5987(originalFileName);
      commandParams.ResponseContentDisposition = `attachment; filename="${asciiName}"; filename*=${encodedName}`;
    }

    const command = new GetObjectCommand(commandParams);

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
    return signedUrl;
  } catch (error) {
    console.error('S3 signed URL error:', error);
    throw new Error(`Failed to generate download URL: ${error.message}`);
  }
}

/**
 * Validate file before upload
 */
export function validateFile(file) {
  const errors = [];

  if (!file) {
    errors.push('No file provided');
    return errors;
  }

  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    errors.push('File type not allowed');
  }

  return errors;
}
