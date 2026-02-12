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
  'application/vnd.ms-excel', // .xls
  'application/rtf', // .rtf
  'text/rtf' // .rtf (alternative MIME type)
];

/**
 * Sanitize filename by removing non-ASCII characters (Chinese, etc.)
 * Keeps alphanumeric, dots, dashes, underscores, and spaces
 * If result is empty, generates a timestamp-based name
 */
function sanitizeFileName(originalName) {
  if (!originalName) return `file-${Date.now()}`;
  
  // Get extension
  const lastDot = originalName.lastIndexOf('.');
  const extension = lastDot > 0 ? originalName.substring(lastDot) : '';
  const baseName = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;
  
  // Remove non-ASCII characters, keep alphanumeric, spaces, dashes, underscores
  let sanitized = baseName.replace(/[^\x20-\x7E]/g, ''); // Keep printable ASCII only
  
  // Replace multiple spaces/special chars with single underscore
  sanitized = sanitized.replace(/[\s]+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Remove leading/trailing underscores and collapse multiple underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  
  // If nothing left after sanitization, use timestamp
  if (!sanitized || sanitized.length === 0) {
    sanitized = `file-${Date.now()}`;
  }
  
  return sanitized + extension.toLowerCase();
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
      throw new Error('File type not allowed. Allowed types: PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX, RTF');
    }

    // Sanitize filename - removes Chinese and other non-ASCII characters
    const sanitizedFileName = sanitizeFileName(originalName);

    // Generate unique S3 key
    const fileExtension = sanitizedFileName.split('.').pop();
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const s3Key = `orders/${orderId}/${timestamp}-${uniqueId}.${fileExtension}`;

    // Upload to S3 with ASCII-safe metadata
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        'original-name': sanitizedFileName,
        'uploaded-by': uploadedBy ? uploadedBy.replace(/[^\x20-\x7E]/g, '') : 'unknown',
        'order-id': String(orderId || '')
      }
    });

    await s3Client.send(command);

    // Return file metadata with sanitized filename
    return {
      s3Key,
      s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
      fileName: sanitizedFileName, // Store sanitized name in database
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
 * @param {string} fileName - Optional filename for Content-Disposition
 */
export async function getSignedDownloadUrl(s3Key, fileName = null) {
  try {
    const commandParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    // If filename provided, set Content-Disposition to suggest download filename
    if (fileName) {
      commandParams.ResponseContentDisposition = `attachment; filename="${fileName}"`;
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
