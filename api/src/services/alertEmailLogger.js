/**
 * alertEmailLogger.js
 *
 * Centralized writer for AlertEmailLog rows. Every system-triggered
 * notification email (stage moves, broker digests, etc.) should call
 * logAlertEmail() after invoking emailService.sendEmail() so the send shows
 * up on the central audit log's Emails tab.
 *
 * Design notes:
 *   - One row per actual SES send. An alert that fans out to N recipients
 *     produces N rows. That keeps "who was this addressed to" trivial to
 *     answer at read time.
 *   - All fields except category/from/to/subject are optional so callers
 *     can pass only what they have.
 *   - Errors here are swallowed and logged. A logging failure must never
 *     break the email-send path that called us.
 *   - Distinct from EmailLog (which tracks invoicing emails: invoices,
 *     estimates). Don't merge them; their lifecycles and FK shapes differ.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Record an alert email send.
 *
 * @param {object} args
 * @param {string} args.category           e.g. 'STAGE_INTERNAL' | 'BROKER_DIGEST'
 * @param {string} args.fromEmail
 * @param {string} [args.fromName]
 * @param {string} args.toEmail
 * @param {string} [args.toName]
 * @param {string} [args.replyTo]
 * @param {string} args.subject
 * @param {'SENT'|'FAILED'} [args.status='SENT']
 * @param {string} [args.errorMessage]     Populated when status === 'FAILED'.
 * @param {string} [args.sesMessageId]
 * @param {string} [args.orderId]
 * @param {string} [args.orderItemId]
 * @param {string} [args.recipientUserId]
 * @param {string} [args.triggeredByUserId]
 * @param {string} [args.triggeredByName]
 * @param {object} [args.metadata]         Free-form context; JSON-stringified.
 */
export async function logAlertEmail({
  category,
  fromEmail,
  fromName,
  toEmail,
  toName,
  replyTo,
  subject,
  status = 'SENT',
  errorMessage,
  sesMessageId,
  orderId,
  orderItemId,
  recipientUserId,
  triggeredByUserId,
  triggeredByName,
  metadata,
}) {
  try {
    await prisma.alertEmailLog.create({
      data: {
        category,
        fromEmail,
        fromName: fromName || null,
        toEmail,
        toName: toName || null,
        replyTo: replyTo || null,
        subject,
        status,
        errorMessage: errorMessage || null,
        sesMessageId: sesMessageId || null,
        orderId: orderId || null,
        orderItemId: orderItemId || null,
        recipientUserId: recipientUserId || null,
        triggeredByUserId: triggeredByUserId || null,
        triggeredByName: triggeredByName || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (e) {
    // Logging is best-effort. A failure here must never propagate.
    console.error('[ALERT-EMAIL-LOG] Failed to record alert email:', e.message);
  }
}

export default { logAlertEmail };
