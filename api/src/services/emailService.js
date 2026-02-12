/**
 * Email Service for Estimates and Invoices
 * Uses nodemailer with AWS SES
 */

import nodemailer from 'nodemailer';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { getPDFFromS3, getPDFSignedUrl } from './pdfService.js';
import { getSignedDownloadUrl } from './fileUploadService.js';

// AWS SES configuration
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Create nodemailer transporter with SES
const transporter = nodemailer.createTransport({
  SES: { ses: sesClient, aws: { SendRawEmailCommand } }
});

// Default from email
const DEFAULT_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@smt-orders.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://smt-orders.com';

/**
 * Generate HTML email template for estimates
 */
function generateEstimateEmailHTML(estimate, options = {}) {
  const {
    customMessage = '',
    senderName = 'Sales Team',
    senderEmail = '',
    companySettings = {}
  } = options;

  const companyName = companySettings?.companyName || 'Stealth Machine Tools';
  const viewUrl = `${FRONTEND_URL}/view-estimate/${estimate.id}`;
  const expiryDate = new Date(estimate.expiryDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);

  // Line items HTML
  const itemsHTML = (estimate.items || []).map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${item.name}</strong>
        ${item.description ? `<br><span style="color: #6b7280; font-size: 12px;">${item.description}</span>` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${formatCurrency((item.quantity || 1) * (item.unitPrice || 0))}</strong></td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estimate ${estimate.estimateNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #dc2626; padding: 30px 40px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${companyName}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Greeting -->
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${estimate.customer?.firstName || 'Valued Customer'},
              </p>

              ${customMessage ? `
              <p style="margin: 0 0 20px; color: #374151; font-size: 14px; line-height: 1.6;">
                ${customMessage.replace(/\n/g, '<br>')}
              </p>
              ` : `
              <p style="margin: 0 0 20px; color: #374151; font-size: 14px; line-height: 1.6;">
                Thank you for your interest. Please find attached your estimate for the requested products/services.
              </p>
              `}

              <!-- Estimate Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 50%;">
                          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Estimate Number</p>
                          <p style="margin: 0; color: #dc2626; font-size: 18px; font-weight: bold;">${estimate.estimateNumber}</p>
                        </td>
                        <td style="width: 50%; text-align: right;">
                          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Valid Until</p>
                          <p style="margin: 0; color: #374151; font-size: 16px; font-weight: bold;">${expiryDate}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Line Items Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #1f2937;">
                  <th style="padding: 12px; color: #ffffff; text-align: left; font-size: 12px;">ITEM</th>
                  <th style="padding: 12px; color: #ffffff; text-align: center; font-size: 12px;">QTY</th>
                  <th style="padding: 12px; color: #ffffff; text-align: right; font-size: 12px;">PRICE</th>
                  <th style="padding: 12px; color: #ffffff; text-align: right; font-size: 12px;">AMOUNT</th>
                </tr>
                ${itemsHTML}
              </table>

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="60%"></td>
                  <td width="40%">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Subtotal:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151;">${formatCurrency(estimate.subtotal)}</td>
                      </tr>
                      ${estimate.discountAmount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Discount:</td>
                        <td style="padding: 8px 0; text-align: right; color: #22c55e;">-${formatCurrency(estimate.discountAmount)}</td>
                      </tr>
                      ` : ''}
                      ${estimate.taxAmount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Tax (${estimate.taxRate}%):</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151;">${formatCurrency(estimate.taxAmount)}</td>
                      </tr>
                      ` : ''}
                      ${estimate.shippingAmount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Shipping:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151;">${formatCurrency(estimate.shippingAmount)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; font-weight: bold; color: #374151; font-size: 16px;">Total:</td>
                        <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; text-align: right; font-weight: bold; color: #dc2626; font-size: 20px;">${formatCurrency(estimate.total)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${viewUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                      View Full Estimate
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; color: #6b7280; font-size: 12px; text-align: center;">
                A PDF copy of this estimate is attached for your records.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #374151; font-size: 14px;">
                Questions? Contact ${senderName}${senderEmail ? ` at <a href="mailto:${senderEmail}" style="color: #dc2626;">${senderEmail}</a>` : ''}.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${companyName}${companySettings?.phone ? ` | ${companySettings.phone}` : ''}${companySettings?.website ? ` | ${companySettings.website}` : ''}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

  <!-- Tracking pixel -->
  <img src="${FRONTEND_URL}/api/track/estimate/${estimate.id}/open" width="1" height="1" style="display:none;" alt="">
</body>
</html>
  `;
}

/**
 * Generate plain text email for estimates
 */
function generateEstimateEmailText(estimate, options = {}) {
  const {
    customMessage = '',
    senderName = 'Sales Team',
    companySettings = {}
  } = options;

  const companyName = companySettings?.companyName || 'Stealth Machine Tools';
  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);

  return `
${companyName}

Dear ${estimate.customer?.firstName || 'Valued Customer'},

${customMessage || 'Thank you for your interest. Please find attached your estimate for the requested products/services.'}

ESTIMATE DETAILS
================
Estimate Number: ${estimate.estimateNumber}
Valid Until: ${new Date(estimate.expiryDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

ITEMS
-----
${(estimate.items || []).map(item => `${item.name} (Qty: ${item.quantity}) - ${formatCurrency((item.quantity || 1) * (item.unitPrice || 0))}`).join('\n')}

TOTAL: ${formatCurrency(estimate.total)}

View your estimate online: ${FRONTEND_URL}/view-estimate/${estimate.id}

A PDF copy is attached for your records.

Questions? Contact ${senderName}.

Best regards,
${companyName}
  `.trim();
}

/**
 * Send estimate email with PDF attachment
 */
export async function sendEstimateEmail(estimate, options = {}) {
  const {
    toEmail,
    ccEmails = [],
    customMessage = '',
    senderName = 'Sales Team',
    senderEmail = '',
    replyTo = '',
    companySettings = {},
    attachProductPDFs = true,
    prisma
  } = options;

  if (!toEmail) {
    throw new Error('Recipient email is required');
  }

  const attachments = [];

  // Attach estimate PDF
  if (estimate.pdfS3Key) {
    try {
      const pdfBuffer = await getPDFFromS3(estimate.pdfS3Key);
      attachments.push({
        filename: `${estimate.estimateNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    } catch (err) {
      console.error('Failed to get estimate PDF from S3:', err);
    }
  }

  // Attach product PDFs if enabled
  if (attachProductPDFs && prisma) {
    try {
      // Get unique product IDs from estimate items
      const productIds = [...new Set(
        (estimate.items || [])
          .filter(item => item.productId)
          .map(item => item.productId)
      )];

      if (productIds.length > 0) {
        // Get product attachments marked for estimates
        const productAttachments = await prisma.productAttachment.findMany({
          where: {
            productId: { in: productIds },
            includeInEstimate: true,
            mimeType: 'application/pdf'
          },
          include: {
            product: {
              select: { name: true, sku: true }
            }
          }
        });

        // Download and attach each PDF
        for (const attachment of productAttachments) {
          try {
            const pdfBuffer = await getPDFFromS3(attachment.s3Key);
            const filename = attachment.product?.sku
              ? `${attachment.product.sku}-${attachment.filename}`
              : attachment.filename;
            attachments.push({
              filename,
              content: pdfBuffer,
              contentType: 'application/pdf'
            });
          } catch (err) {
            console.error(`Failed to attach product PDF ${attachment.filename}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to get product attachments:', err);
    }
  }

  const companyName = companySettings?.companyName || 'Stealth Machine Tools';
  const fromEmail = senderEmail || companySettings?.email || DEFAULT_FROM_EMAIL;
  const fromName = senderName || companyName;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
    replyTo: replyTo || senderEmail || fromEmail,
    subject: `Estimate ${estimate.estimateNumber} from ${companyName}`,
    text: generateEstimateEmailText(estimate, { customMessage, senderName, companySettings }),
    html: generateEstimateEmailHTML(estimate, { customMessage, senderName, senderEmail, companySettings }),
    attachments
  };

  const result = await transporter.sendMail(mailOptions);

  return {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected
  };
}

/**
 * Track email open (called when tracking pixel is loaded)
 */
export async function trackEmailOpen(prisma, estimateId) {
  try {
    // Find the most recent email log for this estimate
    const emailLog = await prisma.emailLog.findFirst({
      where: { estimateId },
      orderBy: { sentAt: 'desc' }
    });

    if (emailLog && !emailLog.openedAt) {
      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { openedAt: new Date() }
      });
    }

    // Update estimate status to VIEWED if currently SENT
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId }
    });

    if (estimate && estimate.status === 'SENT') {
      await prisma.estimate.update({
        where: { id: estimateId },
        data: {
          status: 'VIEWED',
          viewedAt: new Date(),
          viewedCount: { increment: 1 }
        }
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to track email open:', err);
    return false;
  }
}

/**
 * Generate HTML email template for invoices
 */
function generateInvoiceEmailHTML(invoice, options = {}) {
  const {
    customMessage = '',
    senderName = 'Accounts Team',
    senderEmail = '',
    companySettings = {}
  } = options;

  const companyName = companySettings?.companyName || 'Stealth Machine Tools';
  const viewUrl = `${FRONTEND_URL}/view-invoice/${invoice.id}`;
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);

  const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.balanceDue > 0;

  // Line items HTML
  const itemsHTML = (invoice.items || []).map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${item.name}</strong>
        ${item.description ? `<br><span style="color: #6b7280; font-size: 12px;">${item.description}</span>` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${formatCurrency(item.amount || (item.quantity || 1) * (item.unitPrice || 0))}</strong></td>
    </tr>
  `).join('');

  // Payment schedule HTML
  const scheduleHTML = (invoice.paymentSchedule || []).length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: #f9fafb;">
        <th colspan="3" style="padding: 12px; text-align: left; font-size: 14px; color: #374151;">Payment Schedule</th>
      </tr>
      ${(invoice.paymentSchedule || []).map(item => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.amount)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background-color: ${item.status === 'PAID' ? '#dcfce7' : '#fef3c7'}; color: ${item.status === 'PAID' ? '#166534' : '#92400e'};">
              ${item.status}
            </span>
          </td>
        </tr>
      `).join('')}
    </table>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #dc2626; padding: 30px 40px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${companyName}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Greeting -->
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${invoice.customer?.firstName || 'Valued Customer'},
              </p>

              ${customMessage ? `
              <p style="margin: 0 0 20px; color: #374151; font-size: 14px; line-height: 1.6;">
                ${customMessage.replace(/\n/g, '<br>')}
              </p>
              ` : `
              <p style="margin: 0 0 20px; color: #374151; font-size: 14px; line-height: 1.6;">
                ${isOverdue
                  ? 'This invoice is now past due. Please remit payment at your earliest convenience.'
                  : 'Please find attached your invoice. We appreciate your business!'}
              </p>
              `}

              <!-- Invoice Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${isOverdue ? '#fef2f2' : '#f9fafb'}; border-radius: 8px; margin: 20px 0; ${isOverdue ? 'border: 1px solid #fecaca;' : ''}">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 33%;">
                          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Invoice Number</p>
                          <p style="margin: 0; color: #dc2626; font-size: 18px; font-weight: bold;">${invoice.invoiceNumber}</p>
                        </td>
                        <td style="width: 33%; text-align: center;">
                          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Due Date</p>
                          <p style="margin: 0; color: ${isOverdue ? '#ef4444' : '#374151'}; font-size: 16px; font-weight: bold;">${dueDate}${isOverdue ? ' (OVERDUE)' : ''}</p>
                        </td>
                        <td style="width: 33%; text-align: right;">
                          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Balance Due</p>
                          <p style="margin: 0; color: ${invoice.balanceDue > 0 ? '#dc2626' : '#22c55e'}; font-size: 20px; font-weight: bold;">${formatCurrency(invoice.balanceDue)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Line Items Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #1f2937;">
                  <th style="padding: 12px; color: #ffffff; text-align: left; font-size: 12px;">ITEM</th>
                  <th style="padding: 12px; color: #ffffff; text-align: center; font-size: 12px;">QTY</th>
                  <th style="padding: 12px; color: #ffffff; text-align: right; font-size: 12px;">PRICE</th>
                  <th style="padding: 12px; color: #ffffff; text-align: right; font-size: 12px;">AMOUNT</th>
                </tr>
                ${itemsHTML}
              </table>

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%"></td>
                  <td width="50%">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Subtotal:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151;">${formatCurrency(invoice.subtotal)}</td>
                      </tr>
                      ${invoice.discountAmount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Discount:</td>
                        <td style="padding: 8px 0; text-align: right; color: #22c55e;">-${formatCurrency(invoice.discountAmount)}</td>
                      </tr>
                      ` : ''}
                      ${invoice.taxAmount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Tax (${invoice.taxRate}%):</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151;">${formatCurrency(invoice.taxAmount)}</td>
                      </tr>
                      ` : ''}
                      ${invoice.shippingAmount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Shipping:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151;">${formatCurrency(invoice.shippingAmount)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #374151; font-weight: bold;">Total:</td>
                        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; color: #374151; font-weight: bold;">${formatCurrency(invoice.total)}</td>
                      </tr>
                      ${invoice.amountPaid > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #22c55e;">Paid:</td>
                        <td style="padding: 8px 0; text-align: right; color: #22c55e;">-${formatCurrency(invoice.amountPaid)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; font-weight: bold; color: #374151; font-size: 16px;">Balance Due:</td>
                        <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; text-align: right; font-weight: bold; color: ${invoice.balanceDue > 0 ? '#dc2626' : '#22c55e'}; font-size: 20px;">${formatCurrency(invoice.balanceDue)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${scheduleHTML}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${viewUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                      ${invoice.balanceDue > 0 ? 'View Invoice & Pay Online' : 'View Invoice'}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; color: #6b7280; font-size: 12px; text-align: center;">
                A PDF copy of this invoice is attached for your records.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #374151; font-size: 14px;">
                Questions? Contact ${senderName}${senderEmail ? ` at <a href="mailto:${senderEmail}" style="color: #dc2626;">${senderEmail}</a>` : ''}.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${companyName}${companySettings?.phone ? ` | ${companySettings.phone}` : ''}${companySettings?.website ? ` | ${companySettings.website}` : ''}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

  <!-- Tracking pixel -->
  <img src="${FRONTEND_URL}/api/track/invoice/${invoice.id}/open" width="1" height="1" style="display:none;" alt="">
</body>
</html>
  `;
}

/**
 * Generate plain text email for invoices
 */
function generateInvoiceEmailText(invoice, options = {}) {
  const {
    customMessage = '',
    senderName = 'Accounts Team',
    companySettings = {}
  } = options;

  const companyName = companySettings?.companyName || 'Stealth Machine Tools';
  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);

  const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.balanceDue > 0;

  return `
${companyName}

Dear ${invoice.customer?.firstName || 'Valued Customer'},

${customMessage || (isOverdue
    ? 'This invoice is now past due. Please remit payment at your earliest convenience.'
    : 'Please find attached your invoice. We appreciate your business!')}

INVOICE DETAILS
===============
Invoice Number: ${invoice.invoiceNumber}
Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${isOverdue ? ' (OVERDUE)' : ''}
Payment Terms: ${invoice.paymentTerms || 'NET30'}

ITEMS
-----
${(invoice.items || []).map(item => `${item.name} (Qty: ${item.quantity}) - ${formatCurrency(item.amount || (item.quantity || 1) * (item.unitPrice || 0))}`).join('\n')}

TOTAL: ${formatCurrency(invoice.total)}
PAID: ${formatCurrency(invoice.amountPaid)}
BALANCE DUE: ${formatCurrency(invoice.balanceDue)}

View your invoice online: ${FRONTEND_URL}/view-invoice/${invoice.id}

A PDF copy is attached for your records.

Questions? Contact ${senderName}.

Best regards,
${companyName}
  `.trim();
}

/**
 * Send invoice email with PDF attachment
 */
export async function sendInvoiceEmail(invoice, options = {}) {
  const {
    toEmail,
    ccEmails = [],
    customMessage = '',
    senderName = 'Accounts Team',
    senderEmail = '',
    replyTo = '',
    companySettings = {},
    pdfS3Key,
    prisma
  } = options;

  if (!toEmail) {
    throw new Error('Recipient email is required');
  }

  const attachments = [];

  // Attach invoice PDF
  const s3Key = pdfS3Key || invoice.pdfS3Key;
  if (s3Key) {
    try {
      const pdfBuffer = await getPDFFromS3(s3Key);
      attachments.push({
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    } catch (err) {
      console.error('Failed to get invoice PDF from S3:', err);
    }
  }

  const companyName = companySettings?.companyName || 'Stealth Machine Tools';
  const fromEmail = senderEmail || companySettings?.email || DEFAULT_FROM_EMAIL;
  const fromName = senderName || companyName;

  const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.balanceDue > 0;
  const subjectPrefix = isOverdue ? '[OVERDUE] ' : '';

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
    replyTo: replyTo || senderEmail || fromEmail,
    subject: `${subjectPrefix}Invoice ${invoice.invoiceNumber} from ${companyName}`,
    text: generateInvoiceEmailText(invoice, { customMessage, senderName, companySettings }),
    html: generateInvoiceEmailHTML(invoice, { customMessage, senderName, senderEmail, companySettings }),
    attachments
  };

  const result = await transporter.sendMail(mailOptions);

  return {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected
  };
}

/**
 * Track invoice email open (called when tracking pixel is loaded)
 */
export async function trackInvoiceEmailOpen(prisma, invoiceId) {
  try {
    // Find the most recent email log for this invoice
    const emailLog = await prisma.emailLog.findFirst({
      where: { invoiceId },
      orderBy: { sentAt: 'desc' }
    });

    if (emailLog && !emailLog.openedAt) {
      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { openedAt: new Date() }
      });
    }

    // Update invoice status to VIEWED if currently SENT
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });

    if (invoice && invoice.status === 'SENT') {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'VIEWED',
          lastViewedAt: new Date(),
          viewCount: { increment: 1 }
        }
      });
    } else if (invoice) {
      // Just increment view count
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          viewCount: { increment: 1 }
        }
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to track invoice email open:', err);
    return false;
  }
}

export default {
  sendEstimateEmail,
  sendInvoiceEmail,
  trackEmailOpen,
  trackInvoiceEmailOpen,
  generateEstimateEmailHTML,
  generateEstimateEmailText,
  generateInvoiceEmailHTML,
  generateInvoiceEmailText
};
