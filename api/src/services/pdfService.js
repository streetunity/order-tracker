/**
 * PDF Generation Service for Estimates and Invoices
 * Uses PDFKit for server-side PDF generation
 */

import PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET;

// Local PDF storage directory for development
const LOCAL_PDF_DIR = path.join(__dirname, '../../uploads/pdfs');

// Check if we're in development mode without S3
// Use local storage if: no bucket, placeholder bucket name, or explicit development mode
const USE_LOCAL_STORAGE = !BUCKET_NAME ||
  BUCKET_NAME === 'your-documents-bucket-name' ||
  BUCKET_NAME.includes('your-') ||
  process.env.NODE_ENV === 'development';

console.log(`[PDF Service] Storage mode: ${USE_LOCAL_STORAGE ? 'LOCAL' : 'S3'} (bucket: ${BUCKET_NAME || 'none'})`);

// Company colors
const COLORS = {
  primary: '#dc2626',     // Red
  secondary: '#1f2937',   // Dark gray
  text: '#374151',        // Gray text
  lightGray: '#f3f4f6',   // Light background
  border: '#e5e7eb'       // Border color
};

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
}

/**
 * Format date
 */
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Draw a horizontal line
 */
function drawLine(doc, y, startX = 50, endX = 545) {
  doc.strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(startX, y)
    .lineTo(endX, y)
    .stroke();
}

/**
 * Generate Estimate PDF
 */
export async function generateEstimatePDF(estimate, companySettings) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = 612;
      const contentWidth = pageWidth - 100; // 50px margins each side

      // ============================================
      // HEADER - Company Info
      // ============================================

      // Company name (large, red)
      doc.fontSize(24)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(companySettings?.companyName || 'Stealth Machine Tools', 50, 50);

      // Company contact info
      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');

      let headerY = 80;
      if (companySettings?.address) {
        doc.text(companySettings.address, 50, headerY);
        headerY += 12;
      }
      if (companySettings?.city || companySettings?.state || companySettings?.zipCode) {
        doc.text(
          `${companySettings?.city || ''}${companySettings?.city && companySettings?.state ? ', ' : ''}${companySettings?.state || ''} ${companySettings?.zipCode || ''}`.trim(),
          50, headerY
        );
        headerY += 12;
      }
      if (companySettings?.phone) {
        doc.text(`Phone: ${companySettings.phone}`, 50, headerY);
        headerY += 12;
      }
      if (companySettings?.email) {
        doc.text(`Email: ${companySettings.email}`, 50, headerY);
        headerY += 12;
      }
      if (companySettings?.website) {
        doc.text(companySettings.website, 50, headerY);
      }

      // ESTIMATE title and number (right side)
      doc.fontSize(28)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold')
        .text('ESTIMATE', 350, 50, { width: 195, align: 'right' });

      doc.fontSize(12)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(estimate.estimateNumber, 350, 85, { width: 195, align: 'right' });

      // Version badge if applicable
      if (estimate.version > 1) {
        doc.fontSize(10)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(`Version ${estimate.version}`, 350, 102, { width: 195, align: 'right' });
      }

      // ============================================
      // ESTIMATE DETAILS BOX
      // ============================================

      const detailsY = 140;

      // Draw box background
      doc.rect(350, detailsY, 195, 70)
        .fillColor(COLORS.lightGray)
        .fill();

      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');

      doc.text('Date:', 360, detailsY + 10);
      doc.font('Helvetica-Bold').text(formatDate(estimate.estimateDate), 430, detailsY + 10);

      doc.font('Helvetica').text('Valid Until:', 360, detailsY + 28);
      doc.font('Helvetica-Bold').text(formatDate(estimate.expiryDate), 430, detailsY + 28);

      doc.font('Helvetica').text('Prepared By:', 360, detailsY + 46);
      doc.font('Helvetica-Bold').text(estimate.createdBy?.name || 'Sales Team', 430, detailsY + 46);

      // ============================================
      // CUSTOMER INFO
      // ============================================

      doc.fontSize(11)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold')
        .text('PREPARED FOR:', 50, detailsY);

      doc.fontSize(10)
        .fillColor(COLORS.text)
        .font('Helvetica');

      let custY = detailsY + 18;

      if (estimate.customer) {
        const custName = `${estimate.customer.firstName || ''} ${estimate.customer.lastName || ''}`.trim();
        if (custName) {
          doc.font('Helvetica-Bold').text(custName, 50, custY);
          custY += 14;
        }
        if (estimate.customer.company || estimate.customer.companyName) {
          doc.font('Helvetica').text(estimate.customer.company || estimate.customer.companyName, 50, custY);
          custY += 14;
        }
        if (estimate.customer.email) {
          doc.text(estimate.customer.email, 50, custY);
          custY += 14;
        }
        if (estimate.customer.phone) {
          doc.text(estimate.customer.phone, 50, custY);
        }
      }

      // ============================================
      // LINE ITEMS TABLE
      // ============================================

      let tableY = 230;

      // Table header
      doc.rect(50, tableY, contentWidth, 25)
        .fillColor(COLORS.secondary)
        .fill();

      doc.fontSize(9)
        .fillColor('#ffffff')
        .font('Helvetica-Bold');

      doc.text('DESCRIPTION', 55, tableY + 8, { width: 250 });
      doc.text('QTY', 310, tableY + 8, { width: 50, align: 'center' });
      doc.text('UNIT PRICE', 365, tableY + 8, { width: 80, align: 'right' });
      doc.text('AMOUNT', 450, tableY + 8, { width: 90, align: 'right' });

      tableY += 25;

      // Table rows
      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');

      let alternateRow = false;
      const items = estimate.items || [];

      for (const item of items) {
        // Truncate name to first line only - full details go in description
        let itemName = item.name || 'Item';
        const firstLineBreak = itemName.indexOf('\n');
        if (firstLineBreak > 0) {
          itemName = itemName.substring(0, firstLineBreak).trim();
        }
        // Also cap name length
        if (itemName.length > 80) {
          itemName = itemName.substring(0, 77) + '...';
        }

        // Clean up description - remove duplicate name if description starts with it
        let cleanDescription = item.description || '';
        if (cleanDescription && item.name) {
          const nameLower = item.name.toLowerCase().trim();
          const descLower = cleanDescription.toLowerCase().trim();
          if (descLower.startsWith(nameLower)) {
            cleanDescription = cleanDescription.substring(item.name.length).trim();
            cleanDescription = cleanDescription.replace(/^[\n\r\-\s]+/, '').trim();
          }
        }

        // Check if we need a new page for at least the item name row
        if (tableY > 700) {
          doc.addPage();
          tableY = 50;
        }

        // Draw a light separator line between items
        if (alternateRow) {
          doc.strokeColor('#eeeeee')
            .lineWidth(0.5)
            .moveTo(50, tableY)
            .lineTo(545, tableY)
            .stroke();
        }

        const rowStartY = tableY;

        // Item name and price on same line
        doc.fillColor(COLORS.text)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(itemName, 55, tableY + 4, { width: 235 });

        // Quantity, Price, Amount - aligned with item name
        doc.fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(String(item.quantity || 1), 310, tableY + 4, { width: 50, align: 'center' });

        doc.text(formatCurrency(item.unitPrice), 365, tableY + 4, { width: 80, align: 'right' });

        const amount = (item.quantity || 1) * (item.unitPrice || 0);
        doc.font('Helvetica-Bold')
          .text(formatCurrency(amount), 450, tableY + 4, { width: 90, align: 'right' });

        // Move down past the name
        doc.font('Helvetica-Bold').fontSize(9);
        const nameHeight = doc.heightOfString(itemName, { width: 235 });
        tableY += nameHeight + 6;

        // Description - allow it to flow across pages naturally
        if (cleanDescription) {
          doc.font('Helvetica')
            .fontSize(8)
            .fillColor('#6b7280')
            .text(cleanDescription, 55, tableY, { width: 235 });

          // Get current Y position after text was rendered (handles page breaks)
          tableY = doc.y + 4;
        }

        // Bundle indicator
        if (item.fromBundleName) {
          if (tableY > 720) {
            doc.addPage();
            tableY = 50;
          }
          doc.fontSize(7)
            .fillColor('#9ca3af')
            .text(`From: ${item.fromBundleName}`, 55, tableY);
          tableY = doc.y + 4;
        }

        // Add spacing between items
        tableY += 8;
        alternateRow = !alternateRow;
      }

      // Sync tableY with actual document position after flowing text
      tableY = doc.y + 10;

      // Check if we need a new page for totals section (need ~100px)
      if (tableY > 650) {
        doc.addPage();
        tableY = 50;
      }

      // Bottom border
      drawLine(doc, tableY);

      // ============================================
      // TOTALS SECTION
      // ============================================

      tableY += 15;
      const totalsX = 365;

      // Subtotal - use { continued: false } and explicit positioning
      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');
      doc.text('Subtotal:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
      doc.text(formatCurrency(estimate.subtotal), 450, tableY, { width: 90, align: 'right', lineBreak: false });
      tableY += 16;

      // Discount if any
      if (estimate.discountAmount > 0) {
        const discountLabel = estimate.discountType === 'PERCENTAGE'
          ? `Discount (${estimate.discountValue}%):`
          : 'Discount:';
        doc.fillColor(COLORS.text);
        doc.text(discountLabel, totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.fillColor('#22c55e')
          .text(`-${formatCurrency(estimate.discountAmount)}`, 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      // Tax if any
      if (estimate.taxAmount > 0) {
        doc.fillColor(COLORS.text);
        doc.text(`Tax (${estimate.taxRate}%):`, totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.text(formatCurrency(estimate.taxAmount), 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      // Shipping if any
      if (estimate.shippingAmount > 0) {
        doc.fillColor(COLORS.text);
        doc.text('Shipping:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.text(formatCurrency(estimate.shippingAmount), 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      // Total
      tableY += 5;
      drawLine(doc, tableY, totalsX, 545);
      tableY += 10;

      doc.fontSize(12)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold');
      doc.text('TOTAL:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
      doc.text(formatCurrency(estimate.total), 450, tableY, { width: 90, align: 'right', lineBreak: false });

      // ============================================
      // NOTES SECTION
      // ============================================

      tableY += 40;

      if (estimate.notes) {
        if (tableY > 620) {
          doc.addPage();
          tableY = 50;
        }

        doc.fontSize(10)
          .fillColor(COLORS.secondary)
          .font('Helvetica-Bold')
          .text('NOTES', 50, tableY);

        doc.fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(estimate.notes, 50, tableY + 15, { width: contentWidth });

        tableY += 15 + doc.heightOfString(estimate.notes, { width: contentWidth }) + 20;
      }

      // ============================================
      // TERMS & CONDITIONS
      // ============================================

      const terms = estimate.termsConditions || companySettings?.defaultEstimateTerms;
      if (terms) {
        if (tableY > 580) {
          doc.addPage();
          tableY = 50;
        }

        doc.fontSize(10)
          .fillColor(COLORS.secondary)
          .font('Helvetica-Bold')
          .text('TERMS & CONDITIONS', 50, tableY);

        doc.fontSize(8)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(terms, 50, tableY + 15, { width: contentWidth });

        tableY += 15 + doc.heightOfString(terms, { width: contentWidth, fontSize: 8 }) + 20;
      }

      // ============================================
      // SIGNATURE SECTION
      // ============================================

      if (tableY > 620) {
        doc.addPage();
        tableY = 50;
      }

      tableY += 20;

      doc.fontSize(10)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold')
        .text('ACCEPTANCE', 50, tableY);

      tableY += 20;

      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text('By signing below, you accept this estimate and agree to the terms and conditions above.', 50, tableY, { width: contentWidth });

      tableY += 30;

      // Signature line
      drawLine(doc, tableY + 30, 50, 250);
      doc.fontSize(8)
        .text('Signature', 50, tableY + 35);

      drawLine(doc, tableY + 30, 300, 450);
      doc.text('Printed Name', 300, tableY + 35);

      drawLine(doc, tableY + 30, 480, 545);
      doc.text('Date', 480, tableY + 35);

      // If already signed
      if (estimate.signedAt && estimate.signatureData) {
        doc.fontSize(9)
          .fillColor('#22c55e')
          .text(`Signed by ${estimate.signedByName || 'Customer'} on ${formatDate(estimate.signedAt)}`, 50, tableY + 50);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Invoice PDF
 */
export async function generateInvoicePDF(invoice, companySettings) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = 612;
      const contentWidth = pageWidth - 100; // 50px margins each side

      // ============================================
      // HEADER - Company Info
      // ============================================

      doc.fontSize(24)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(companySettings?.companyName || 'Stealth Machine Tools', 50, 50);

      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');

      let headerY = 80;
      if (companySettings?.address) {
        doc.text(companySettings.address, 50, headerY);
        headerY += 12;
      }
      if (companySettings?.city || companySettings?.state || companySettings?.zipCode) {
        doc.text(
          `${companySettings?.city || ''}${companySettings?.city && companySettings?.state ? ', ' : ''}${companySettings?.state || ''} ${companySettings?.zipCode || ''}`.trim(),
          50, headerY
        );
        headerY += 12;
      }
      if (companySettings?.phone) {
        doc.text(`Phone: ${companySettings.phone}`, 50, headerY);
        headerY += 12;
      }
      if (companySettings?.email) {
        doc.text(`Email: ${companySettings.email}`, 50, headerY);
      }

      // INVOICE title and number (right side)
      doc.fontSize(28)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold')
        .text('INVOICE', 350, 50, { width: 195, align: 'right' });

      doc.fontSize(12)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(invoice.invoiceNumber, 350, 85, { width: 195, align: 'right' });

      // Status badge
      const statusColors = {
        DRAFT: '#6b7280',
        SENT: '#3b82f6',
        VIEWED: '#8b5cf6',
        PARTIAL: '#f59e0b',
        PAID: '#22c55e',
        OVERDUE: '#ef4444',
        VOID: '#6b7280'
      };

      doc.fontSize(10)
        .fillColor(statusColors[invoice.status] || COLORS.text)
        .font('Helvetica-Bold')
        .text(invoice.status, 350, 102, { width: 195, align: 'right' });

      // ============================================
      // INVOICE DETAILS BOX
      // ============================================

      const detailsY = 130;

      doc.rect(350, detailsY, 195, 85)
        .fillColor(COLORS.lightGray)
        .fill();

      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');

      doc.text('Invoice Date:', 360, detailsY + 10);
      doc.font('Helvetica-Bold').text(formatDate(invoice.invoiceDate), 440, detailsY + 10);

      doc.font('Helvetica').text('Due Date:', 360, detailsY + 26);
      const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== 'PAID';
      doc.font('Helvetica-Bold')
        .fillColor(isOverdue ? '#ef4444' : COLORS.text)
        .text(formatDate(invoice.dueDate), 440, detailsY + 26);

      doc.fillColor(COLORS.text)
        .font('Helvetica').text('Payment Terms:', 360, detailsY + 42);
      doc.font('Helvetica-Bold').text(invoice.paymentTerms || 'NET30', 440, detailsY + 42);

      doc.font('Helvetica').text('Balance Due:', 360, detailsY + 62);
      doc.font('Helvetica-Bold')
        .fillColor(invoice.balanceDue > 0 ? COLORS.primary : '#22c55e')
        .text(formatCurrency(invoice.balanceDue), 440, detailsY + 62);

      // ============================================
      // CUSTOMER INFO
      // ============================================

      doc.fontSize(11)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold')
        .text('BILL TO:', 50, detailsY);

      doc.fontSize(10)
        .fillColor(COLORS.text)
        .font('Helvetica');

      let custY = detailsY + 18;

      if (invoice.customer) {
        const custName = `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim();
        if (custName) {
          doc.font('Helvetica-Bold').text(custName, 50, custY);
          custY += 14;
        }
        if (invoice.customer.company || invoice.customer.companyName) {
          doc.font('Helvetica').text(invoice.customer.company || invoice.customer.companyName, 50, custY);
          custY += 14;
        }
        if (invoice.customer.billingAddress || invoice.customer.address) {
          doc.text(invoice.customer.billingAddress || invoice.customer.address, 50, custY);
          custY += 14;
        }
        if (invoice.customer.email) {
          doc.text(invoice.customer.email, 50, custY);
          custY += 14;
        }
        if (invoice.customer.phone) {
          doc.text(invoice.customer.phone, 50, custY);
        }
      }

      // ============================================
      // LINE ITEMS TABLE
      // ============================================

      let tableY = 235;

      doc.rect(50, tableY, contentWidth, 25)
        .fillColor(COLORS.secondary)
        .fill();

      doc.fontSize(9)
        .fillColor('#ffffff')
        .font('Helvetica-Bold');

      doc.text('DESCRIPTION', 55, tableY + 8, { width: 250 });
      doc.text('QTY', 310, tableY + 8, { width: 50, align: 'center' });
      doc.text('UNIT PRICE', 365, tableY + 8, { width: 80, align: 'right' });
      doc.text('AMOUNT', 450, tableY + 8, { width: 90, align: 'right' });

      tableY += 25;

      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');

      let alternateRow = false;
      const items = invoice.items || [];

      for (const item of items) {
        // Truncate name to first line only - full details go in description
        let itemName = item.name || 'Item';
        const firstLineBreak = itemName.indexOf('\n');
        if (firstLineBreak > 0) {
          itemName = itemName.substring(0, firstLineBreak).trim();
        }
        // Also cap name length
        if (itemName.length > 80) {
          itemName = itemName.substring(0, 77) + '...';
        }

        // Clean up description - remove duplicate name if description starts with it
        let cleanDescription = item.description || '';
        if (cleanDescription && item.name) {
          const nameLower = item.name.toLowerCase().trim();
          const descLower = cleanDescription.toLowerCase().trim();
          if (descLower.startsWith(nameLower)) {
            cleanDescription = cleanDescription.substring(item.name.length).trim();
            cleanDescription = cleanDescription.replace(/^[\n\r\-\s]+/, '').trim();
          }
        }

        // Check if we need a new page for at least the item name row
        if (tableY > 700) {
          doc.addPage();
          tableY = 50;
        }

        // Draw a light separator line between items
        if (alternateRow) {
          doc.strokeColor('#eeeeee')
            .lineWidth(0.5)
            .moveTo(50, tableY)
            .lineTo(545, tableY)
            .stroke();
        }

        const rowStartY = tableY;

        // Item name - allow wrapping within width
        doc.fillColor(COLORS.text)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(itemName, 55, tableY + 4, { width: 235 });

        // Quantity, Price, Amount - aligned with item name
        doc.fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(String(item.quantity || 1), 310, tableY + 4, { width: 50, align: 'center', lineBreak: false });

        doc.text(formatCurrency(item.unitPrice), 365, tableY + 4, { width: 80, align: 'right', lineBreak: false });

        const amount = item.amount || (item.quantity || 1) * (item.unitPrice || 0);
        doc.font('Helvetica-Bold')
          .text(formatCurrency(amount), 450, tableY + 4, { width: 90, align: 'right', lineBreak: false });

        // Move down past the name
        doc.font('Helvetica-Bold').fontSize(9);
        const nameHeight = doc.heightOfString(itemName, { width: 235 });
        tableY += nameHeight + 6;

        // Description - allow it to flow across pages naturally
        if (cleanDescription) {
          doc.font('Helvetica')
            .fontSize(8)
            .fillColor('#6b7280')
            .text(cleanDescription, 55, tableY, { width: 235 });

          // Get current Y position after text was rendered (handles page breaks)
          tableY = doc.y + 4;
        }

        // Add spacing between items
        tableY += 8;
        alternateRow = !alternateRow;
      }

      // After items, DON'T sync with doc.y - just use our tracked position
      // The doc.y can be misleading after text with lineBreak:false

      // Check if we need a new page for totals section (need ~150px for invoice totals)
      if (tableY > 650) {
        doc.addPage();
        tableY = 50;
      }

      // Bottom border
      drawLine(doc, tableY);

      // ============================================
      // TOTALS SECTION
      // ============================================

      tableY += 15;
      const totalsX = 365;

      // Subtotal - use lineBreak: false for explicit positioning
      doc.fontSize(9)
        .fillColor(COLORS.text)
        .font('Helvetica');
      doc.text('Subtotal:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
      doc.text(formatCurrency(invoice.subtotal), 450, tableY, { width: 90, align: 'right', lineBreak: false });
      tableY += 16;

      if (invoice.discountAmount > 0) {
        const discountLabel = invoice.discountType === 'PERCENTAGE'
          ? `Discount (${invoice.discountValue}%):`
          : 'Discount:';
        doc.fillColor(COLORS.text);
        doc.text(discountLabel, totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.fillColor('#22c55e')
          .text(`-${formatCurrency(invoice.discountAmount)}`, 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      if (invoice.taxAmount > 0) {
        doc.fillColor(COLORS.text);
        doc.text(`Tax (${invoice.taxRate}%):`, totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.text(formatCurrency(invoice.taxAmount), 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      if (invoice.shippingAmount > 0) {
        doc.fillColor(COLORS.text);
        doc.text('Shipping:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.text(formatCurrency(invoice.shippingAmount), 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      tableY += 5;
      drawLine(doc, tableY, totalsX, 545);
      tableY += 10;

      doc.fontSize(12)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold');
      doc.text('TOTAL:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
      doc.text(formatCurrency(invoice.total), 450, tableY, { width: 90, align: 'right', lineBreak: false });
      tableY += 20;

      // Amount Paid
      if (invoice.amountPaid > 0) {
        doc.fontSize(10)
          .fillColor('#22c55e')
          .font('Helvetica');
        doc.text('Amount Paid:', totalsX, tableY, { width: 80, align: 'right', lineBreak: false });
        doc.text(`-${formatCurrency(invoice.amountPaid)}`, 450, tableY, { width: 90, align: 'right', lineBreak: false });
        tableY += 16;
      }

      // Balance Due
      drawLine(doc, tableY, totalsX, 545);
      tableY += 8;
      doc.fontSize(14)
        .fillColor(invoice.balanceDue > 0 ? COLORS.primary : '#22c55e')
        .font('Helvetica-Bold');
      doc.text('BALANCE DUE:', totalsX - 20, tableY, { width: 100, align: 'right', lineBreak: false });
      doc.text(formatCurrency(invoice.balanceDue), 450, tableY, { width: 90, align: 'right', lineBreak: false });

      // ============================================
      // PAYMENT SCHEDULE (if exists)
      // ============================================

      const paymentSchedule = invoice.paymentSchedule || [];
      if (paymentSchedule.length > 0) {
        tableY += 40;

        if (tableY > 620) {
          doc.addPage();
          tableY = 50;
        }

        doc.fontSize(11)
          .fillColor(COLORS.secondary)
          .font('Helvetica-Bold')
          .text('PAYMENT SCHEDULE', 50, tableY);

        tableY += 20;

        doc.fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica');

        for (const scheduleItem of paymentSchedule) {
          const isPaid = scheduleItem.status === 'PAID';
          doc.fillColor(isPaid ? '#22c55e' : COLORS.text);

          doc.text(scheduleItem.description, 50, tableY, { width: 200, lineBreak: false });
          doc.text(formatCurrency(scheduleItem.amount), 260, tableY, { width: 80, align: 'right', lineBreak: false });

          if (scheduleItem.dueDate) {
            doc.text(`Due: ${formatDate(scheduleItem.dueDate)}`, 350, tableY, { width: 100, lineBreak: false });
          }

          doc.font('Helvetica-Bold')
            .text(isPaid ? 'PAID' : 'PENDING', 470, tableY, { width: 70, align: 'right', lineBreak: false });

          doc.font('Helvetica');
          tableY += 18;
        }
      }

      // ============================================
      // PAYMENT HISTORY (if has payments)
      // ============================================

      const payments = invoice.payments || [];
      if (payments.length > 0) {
        tableY += 20;

        if (tableY > 620) {
          doc.addPage();
          tableY = 50;
        }

        doc.fontSize(11)
          .fillColor(COLORS.secondary)
          .font('Helvetica-Bold')
          .text('PAYMENT HISTORY', 50, tableY);

        tableY += 20;

        doc.fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica');

        for (const payment of payments) {
          doc.text(formatDate(payment.paymentDate), 50, tableY, { width: 100, lineBreak: false });
          doc.text(payment.paymentMethod, 160, tableY, { width: 100, lineBreak: false });
          if (payment.referenceNumber || payment.checkNumber) {
            doc.text(`Ref: ${payment.referenceNumber || payment.checkNumber}`, 270, tableY, { width: 120, lineBreak: false });
          }
          doc.font('Helvetica-Bold')
            .fillColor('#22c55e')
            .text(formatCurrency(payment.amount), 450, tableY, { width: 90, align: 'right', lineBreak: false });

          doc.font('Helvetica').fillColor(COLORS.text);
          tableY += 16;
        }
      }

      // ============================================
      // NOTES SECTION
      // ============================================

      if (invoice.notes) {
        tableY += 20;

        if (tableY > 620) {
          doc.addPage();
          tableY = 50;
        }

        doc.fontSize(10)
          .fillColor(COLORS.secondary)
          .font('Helvetica-Bold')
          .text('NOTES', 50, tableY);

        tableY += 15;
        doc.fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(invoice.notes, 50, tableY, { width: contentWidth });

        // Sync with actual position after text rendering
        tableY = doc.y + 10;
      }

      // ============================================
      // TERMS & CONDITIONS
      // ============================================

      const terms = invoice.termsConditions || companySettings?.defaultInvoiceTerms;
      if (terms) {
        if (tableY > 580) {
          doc.addPage();
          tableY = 50;
        }

        doc.fontSize(10)
          .fillColor(COLORS.secondary)
          .font('Helvetica-Bold')
          .text('TERMS & CONDITIONS', 50, tableY);

        tableY += 15;
        doc.fontSize(8)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(terms, 50, tableY, { width: contentWidth });

        // No need to track tableY after this - it's the last section
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Upload PDF to S3 or local storage (development fallback)
 */
export async function uploadPDFToS3(pdfBuffer, key) {
  // Use local storage in development or when S3 isn't configured
  if (USE_LOCAL_STORAGE) {
    // Ensure directory exists
    if (!fs.existsSync(LOCAL_PDF_DIR)) {
      fs.mkdirSync(LOCAL_PDF_DIR, { recursive: true });
    }

    // Save locally with the key as filename (replace slashes with underscores)
    const localFilename = key.replace(/\//g, '_');
    const localPath = path.join(LOCAL_PDF_DIR, localFilename);
    fs.writeFileSync(localPath, pdfBuffer);

    console.log(`[PDF] Saved locally: ${localPath}`);

    return {
      s3Key: key,
      s3Url: `/api/pdfs/${localFilename}`,
      localPath: localPath,
      isLocal: true
    };
  }

  // Production: Upload to S3
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf'
  });

  await s3Client.send(command);

  return {
    s3Key: key,
    s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
  };
}

/**
 * Get signed URL for PDF download (or local path in development)
 */
export async function getPDFSignedUrl(s3Key, filename) {
  // Use local path in development
  if (USE_LOCAL_STORAGE) {
    const localFilename = s3Key.replace(/\//g, '_');
    return `/api/pdfs/${localFilename}`;
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ResponseContentDisposition: `inline; filename="${filename}"`
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

/**
 * Get PDF buffer from S3 or local storage
 */
export async function getPDFFromS3(s3Key) {
  // Use local storage in development
  if (USE_LOCAL_STORAGE) {
    const localFilename = s3Key.replace(/\//g, '_');
    const localPath = path.join(LOCAL_PDF_DIR, localFilename);

    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    throw new Error(`Local PDF not found: ${localPath}`);
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key
  });

  const response = await s3Client.send(command);
  const chunks = [];

  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export default {
  generateEstimatePDF,
  generateInvoicePDF,
  uploadPDFToS3,
  getPDFSignedUrl,
  getPDFFromS3
};
