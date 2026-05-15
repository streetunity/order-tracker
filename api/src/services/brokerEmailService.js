/**
 * brokerEmailService.js
 *
 * Digest-aware email notifications for broker users.
 *
 * Instead of sending an email on every document upload, notifications are
 * queued per broker for up to DIGEST_DELAY_MS (5 minutes). If more uploads
 * arrive within that window they are appended to the same queue entry.
 * The timer starts on the FIRST upload and does NOT reset on subsequent ones,
 * so brokers get exactly one email per burst, approximately 5 minutes after
 * the first upload in that burst.
 *
 * Trade-off: if PM2 restarts during a pending window, queued items are lost
 * (no email sent for that batch). This is acceptable for the use case.
 */

import { sendEmail } from './emailService.js';
import { logAlertEmail } from './alertEmailLogger.js';
import { DOCUMENT_TYPE_LABELS } from './documentService.js';

const FROM_EMAIL      = process.env.FROM_EMAIL || 'orders@stealthlaser.com';
const FROM_NAME       = 'Stealth Machine Tools';
const PORTAL_BASE_URL = process.env.FRONTEND_URL || 'https://smt-orders.com';
const PORTAL_URL      = `${PORTAL_BASE_URL}/broker`;
const DIGEST_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory digest queue.
 * Map<brokerId, { broker: {id, name, email}, prisma, items: Array, timer: TimeoutId }>
 */
const digestQueue = new Map();

/**
 * Queue a document upload notification for all active brokers.
 * The actual email is sent after DIGEST_DELAY_MS, batching any additional
 * uploads that arrive within the same window.
 */
export async function queueBrokerDocumentNotification(prisma, {
  item,
  document,
  uploadedBy,
  documentType,
  isShipmentDoc = false
}) {
  try {
    const brokers = await prisma.user.findMany({
      where: { role: 'BROKER', isActive: true },
      select: { id: true, name: true, email: true }
    });

    if (!brokers.length) {
      console.log('[BROKER EMAIL] No active brokers \u2014 skipping queue');
      return;
    }

    const payload = { item, document, uploadedBy, documentType, isShipmentDoc };

    for (const broker of brokers) {
      const existing = digestQueue.get(broker.id);
      if (existing) {
        existing.items.push(payload);
        console.log(`[BROKER EMAIL] Queued doc for ${broker.name} (${existing.items.length} pending in digest)`);
      } else {
        const entry = { broker, prisma, items: [payload], timer: null };
        entry.timer = setTimeout(() => flushBrokerQueue(broker.id), DIGEST_DELAY_MS);
        digestQueue.set(broker.id, entry);
        console.log(`[BROKER EMAIL] Started 5-min digest timer for ${broker.name}`);
      }
    }
  } catch (error) {
    console.error('[BROKER EMAIL] Queue error:', error.message);
  }
}

/**
 * Flush the queue for a specific broker and send the digest email.
 */
async function flushBrokerQueue(brokerId) {
  const entry = digestQueue.get(brokerId);
  if (!entry) return;
  digestQueue.delete(brokerId);

  const { broker, prisma, items } = entry;
  console.log(`[BROKER EMAIL] Flushing digest for ${broker.name}: ${items.length} document(s)`);
  await sendBrokerDigestEmail(prisma, broker, items);
}

/**
 * Build and send the consolidated digest email to a single broker.
 */
async function sendBrokerDigestEmail(prisma, broker, items) {
  try {
    const count     = items.length;
    const plural    = count === 1 ? '' : 's';
    const countVerb = count === 1 ? 'has' : 'have';

    // Build the HTML document table \u2014 columns: Type | Customer | Item | File Name | Uploaded By | View
    const tableRows = items.map(({ item, document, uploadedBy, documentType, isShipmentDoc }) => {
      const docLabel    = DOCUMENT_TYPE_LABELS[documentType] || documentType;
      const acct        = item.order?.account;
      const customerName = acct?.contactName
        ? `${acct.name} \u2014 ${acct.contactName}`
        : (acct?.name || '\u2014');
      const productCode = item.productCode || item.id;
      const itemUrl     = `${PORTAL_URL}/item/${item.id}`;
      const shipNote    = isShipmentDoc
        ? ' <span style="font-size:11px;color:#f59e0b;font-weight:600;">(shared)</span>'
        : '';

      return (
        '<tr>' +
        `<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${docLabel}${shipNote}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${customerName}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${productCode}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${document.fileName}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${uploadedBy}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;text-align:center;">` +
        `<a href="${itemUrl}" style="color:#dc2626;text-decoration:none;font-weight:600;font-size:13px;">View &rarr;</a>` +
        '</td>' +
        '</tr>'
      );
    }).join('');

    const documentListHtml =
      '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dddddd;border-radius:4px;overflow:hidden;margin-top:12px;">' +
      '<thead><tr style="background-color:#f5f5f5;">' +
      '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Type</th>' +
      '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Customer</th>' +
      '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Item</th>' +
      '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">File Name</th>' +
      '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Uploaded By</th>' +
      '<th style="padding:8px 12px;text-align:center;font-size:12px;color:#666666;font-weight:600;">View</th>' +
      '</tr></thead>' +
      `<tbody>${tableRows}</tbody>` +
      '</table>';

    // Get company settings
    let companyName  = 'Stealth Machine Tools';
    let companyPhone = '';
    let companyEmail = '';
    try {
      const settings = await prisma.invoicingSettings.findFirst();
      if (settings) {
        companyName  = settings.companyName || companyName;
        companyPhone = settings.phone || '';
        companyEmail = settings.email || '';
      }
    } catch (_) {}

    const vars = {
      brokerName:        broker.name || 'Broker',
      documentCount:     String(count),
      documentPlural:    plural,
      documentCountVerb: countVerb,
      documentList:      documentListHtml,
      portalUrl:         PORTAL_URL,
      companyName,
      companyPhone,
      companyEmail,
    };

    const processTemplate = (str) => {
      let out = str || '';
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
      return out;
    };

    // Check for admin-customised template in DB
    let dbTemplate = null;
    try {
      dbTemplate = await prisma.emailTemplate.findUnique({
        where: { templateKey: 'broker_document' }
      });
    } catch (_) {}

    let subject, html;

    if (dbTemplate) {
      const { wrapInBaseTemplate } = await import('./emailTemplates.js');

      subject       = processTemplate(dbTemplate.subject);
      const body    = processTemplate(dbTemplate.bodyContent || '');
      const closing = processTemplate(dbTemplate.closingContent || '');
      const footer  = processTemplate(dbTemplate.footerContent || `<p>${companyName} \u2014 Internal Notification</p>`);

      const content =
        `<tr bgcolor="#1a1a1a"><td bgcolor="#1a1a1a" style="background-color:#1a1a1a;padding:24px 30px;text-align:center;border-bottom:3px solid #dc2626;">` +
        `<h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">` +
        (count === 1 ? 'New Document Available' : `${count} New Documents Available`) +
        `</h1></td></tr>` +
        `<tr><td bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">` +
        body +
        (closing ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #dddddd;">${closing}</div>` : '') +
        `</td></tr>` +
        `<tr><td bgcolor="#f5f5f5" style="background-color:#f5f5f5;padding:20px 30px;text-align:center;font-size:12px;color:#666666;">` +
        footer +
        `</td></tr>`;

      html = wrapInBaseTemplate(content, subject);
    } else {
      // Hardcoded fallback
      subject = count === 1
        ? 'New Document Available \u2014 Broker Portal'
        : `${count} New Documents Available \u2014 Broker Portal`;

      html = [
        '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">',
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">',
        '<tr><td align="center">',
        '<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">',
        '<tr><td style="background:#1a1a1a;padding:20px 28px;border-bottom:3px solid #dc2626;">',
        `<span style="color:#ffffff;font-size:20px;font-weight:bold;">${count === 1 ? 'New Document Available' : `${count} New Documents Available`}</span>`,
        '</td></tr>',
        '<tr><td style="padding:28px;">',
        `<p style="color:#333333;font-size:15px;margin:0 0 20px 0;">`,
        `Hello ${broker.name}, ${count} new document${plural} ${countVerb} been uploaded to the broker portal and ${count === 1 ? 'is' : 'are'} ready for your review.`,
        '</p>',
        documentListHtml,
        '<p style="text-align:center;margin:28px 0 0 0;">',
        `<a href="${PORTAL_URL}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-weight:bold;font-size:14px;">Open Broker Portal</a>`,
        '</p>',
        '</td></tr>',
        `<tr><td style="background:#1a1a1a;padding:14px 28px;text-align:center;">`,
        `<span style="color:#999999;font-size:11px;">${companyName} &mdash; Order Tracker</span>`,
        '</td></tr>',
        '</table>',
        '</td></tr></table>',
        '</body></html>'
      ].join('');
    }

    const text = [
      `Hello ${broker.name},`,
      '',
      `${count} new document${plural} ${countVerb} been uploaded to the broker portal.`,
      '',
      ...items.map(({ item, document, documentType, uploadedBy }) => {
        const docLabel    = DOCUMENT_TYPE_LABELS[documentType] || documentType;
        const acct        = item.order?.account;
        const customerName = acct?.contactName ? `${acct.name} - ${acct.contactName}` : (acct?.name || 'N/A');
        const productCode = item.productCode || item.id;
        const itemUrl     = `${PORTAL_URL}/item/${item.id}`;
        return `  - ${docLabel}: ${document.fileName} | Customer: ${customerName} | Item: ${productCode} | ${itemUrl}`;
      }),
      '',
      `Broker Portal: ${PORTAL_URL}`
    ].join('\n');

    const result = await sendEmail({
      to: broker.email,
      from: FROM_EMAIL,
      fromName: FROM_NAME,
      subject,
      html,
      text
    });

    if (result.success) {
      console.log(`[BROKER EMAIL] Digest sent to ${broker.name} <${broker.email}>: ${count} document(s)`);
    } else {
      console.error(`[BROKER EMAIL] Failed to send to ${broker.email}: ${result.error}`);
    }

    // Log the digest send so it shows up on the audit-log Emails tab.
    // One row per broker; the metadata.documents array captures what was in the batch.
    const docSummaries = items.map(({ item, document, documentType, uploadedBy, isShipmentDoc }) => ({
      fileName: document.fileName,
      documentType,
      documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType] || documentType,
      itemId: item.id,
      productCode: item.productCode || null,
      orderId: item.orderId || null,
      orderRef: item.order?.poNumber || null,
      customerName: item.order?.account?.name || null,
      uploadedBy,
      isShipmentDoc: !!isShipmentDoc,
    }));

    // If every document in the digest is from the same order, link the row to that order.
    const uniqueOrderIds = Array.from(new Set(docSummaries.map(d => d.orderId).filter(Boolean)));
    const singleOrderId = uniqueOrderIds.length === 1 ? uniqueOrderIds[0] : null;

    logAlertEmail({
      category: 'BROKER_DIGEST',
      fromEmail: FROM_EMAIL,
      fromName: FROM_NAME,
      toEmail: broker.email,
      toName: broker.name,
      subject,
      status: result.success ? 'SENT' : 'FAILED',
      errorMessage: result.success ? null : result.error,
      sesMessageId: result.messageId || null,
      orderId: singleOrderId,
      recipientUserId: broker.id,
      metadata: {
        documentCount: count,
        documents: docSummaries,
      },
    });
  } catch (error) {
    console.error('[BROKER EMAIL] sendBrokerDigestEmail error:', error.message);
  }
}
