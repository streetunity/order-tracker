/**
 * brokerEmailService.js
 *
 * Sends email notifications to all active BROKER users when a document
 * is uploaded to the broker portal by a non-broker (admin, agent, manufacturer, SUPER_ADMIN).
 */

import { sendEmail } from './emailService.js';
import { DOCUMENT_TYPE_LABELS } from './documentService.js';

const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@stealthlaser.com';
const FROM_NAME = 'Stealth Machine Tools';

/**
 * Notify all active brokers that a new document has been uploaded.
 *
 * @param {object} prisma - Prisma client instance
 * @param {object} params
 * @param {object} params.item          - The orderItem record (must include order.poNumber, order.account.name, productCode)
 * @param {object} params.document      - The created document record (fileName, fileSize, documentType)
 * @param {string} params.uploadedBy    - Display name of the uploader
 * @param {string} params.documentType  - Raw documentType key (e.g. 'BILL_OF_LADING')
 * @param {boolean} [params.isShipmentDoc=false] - Whether this doc was uploaded to a shared shipment
 */
export async function notifyBrokersOfDocumentUpload(prisma, {
  item,
  document,
  uploadedBy,
  documentType,
  isShipmentDoc = false
}) {
  try {
    // Find all active brokers with email addresses
    const brokers = await prisma.user.findMany({
      where: { role: 'BROKER', isActive: true },
      select: { id: true, name: true, email: true }
    });

    if (!brokers.length) {
      console.log('[BROKER EMAIL] No active brokers found, skipping notification');
      return;
    }

    const docTypeLabel = DOCUMENT_TYPE_LABELS[documentType] || documentType;
    const poNumber = item.order?.poNumber || item.orderId || 'N/A';
    const customerName = item.order?.account?.name || '';
    const productCode = item.productCode || item.id;

    const subject = `New Document Available: ${docTypeLabel} \u2014 ${poNumber}`;

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a;padding:20px 28px;border-bottom:3px solid #dc2626;">
              <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">New Document Available</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px;">
              <p style="color:#333333;font-size:15px;margin:0 0 20px 0;">
                A new document has been uploaded to the broker portal and is ready for your review.
              </p>

              <!-- Details table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 14px;background:#f7f7f7;border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;width:38%;">Document Type</td>
                  <td style="padding:10px 14px;background:#f7f7f7;border:1px solid #e0e0e0;color:#111;font-size:13px;">${docTypeLabel}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#ffffff;border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;">File Name</td>
                  <td style="padding:10px 14px;background:#ffffff;border:1px solid #e0e0e0;color:#111;font-size:13px;">${document.fileName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#f7f7f7;border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;">Order / PO</td>
                  <td style="padding:10px 14px;background:#f7f7f7;border:1px solid #e0e0e0;color:#111;font-size:13px;">${poNumber}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#ffffff;border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;">Item</td>
                  <td style="padding:10px 14px;background:#ffffff;border:1px solid #e0e0e0;color:#111;font-size:13px;">${productCode}</td>
                </tr>
                ${customerName ? `
                <tr>
                  <td style="padding:10px 14px;background:#f7f7f7;border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;">Customer</td>
                  <td style="padding:10px 14px;background:#f7f7f7;border:1px solid #e0e0e0;color:#111;font-size:13px;">${customerName}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:10px 14px;background:${customerName ? '#ffffff' : '#f7f7f7'};border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;">Uploaded By</td>
                  <td style="padding:10px 14px;background:${customerName ? '#ffffff' : '#f7f7f7'};border:1px solid #e0e0e0;color:#111;font-size:13px;">${uploadedBy}</td>
                </tr>
                ${isShipmentDoc ? `
                <tr>
                  <td style="padding:10px 14px;background:#fffbea;border:1px solid #e0e0e0;font-weight:bold;color:#555;font-size:13px;">Note</td>
                  <td style="padding:10px 14px;background:#fffbea;border:1px solid #e0e0e0;color:#111;font-size:13px;">This document is shared across all items in the shipment.</td>
                </tr>` : ''}
              </table>

              <p style="color:#666666;font-size:13px;margin:20px 0 0 0;">
                Log in to the broker portal to view and download this document.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1a1a1a;padding:14px 28px;text-align:center;">
              <span style="color:#999999;font-size:11px;">Stealth Machine Tools &mdash; Order Tracker</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = [
      'New document available in the broker portal.',
      '',
      `Document Type: ${docTypeLabel}`,
      `File Name:     ${document.fileName}`,
      `Order / PO:    ${poNumber}`,
      `Item:          ${productCode}`,
      customerName ? `Customer:      ${customerName}` : null,
      `Uploaded By:   ${uploadedBy}`,
      isShipmentDoc ? 'Note: This document is shared across all items in the shipment.' : null,
      '',
      'Log in to the broker portal to view and download this document.'
    ].filter(Boolean).join('\n');

    const results = await Promise.allSettled(
      brokers.map(broker =>
        sendEmail({
          to: broker.email,
          from: FROM_EMAIL,
          fromName: FROM_NAME,
          subject,
          html,
          text
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = brokers.length - sent;

    console.log(`[BROKER EMAIL] Document notification: ${sent}/${brokers.length} sent` +
      (failed ? `, ${failed} failed` : '') +
      ` | ${docTypeLabel} | Order: ${poNumber}`);

  } catch (error) {
    // Never let email failure break the upload response
    console.error('[BROKER EMAIL] Failed to send document notification:', error.message);
  }
}
