/**
 * Calendar Email Service
 * Sends install date confirmation / reschedule emails to customers
 * Follows the same pattern as orderStageEmailService.js
 */

import emailService from './emailService.js';
import { logAlertEmail } from './alertEmailLogger.js';

/**
 * Send install date notification to customer
 * @param {PrismaClient} prisma
 * @param {{ calendarEvent: object, isReschedule?: boolean }} options
 */
export async function sendInstallEmail(prisma, { calendarEvent, isReschedule = false }) {
  if (!calendarEvent.orderId) {
    console.log('[CALENDAR EMAIL] No orderId on event, skipping');
    return { skipped: true, reason: 'No order linked' };
  }

  const order = await prisma.order.findUnique({
    where: { id: calendarEvent.orderId },
    include: { account: true },
  });

  if (!order) {
    console.error('[CALENDAR EMAIL] Order not found:', calendarEvent.orderId);
    return { success: false, error: 'Order not found' };
  }

  if (!order.account?.email) {
    console.log('[CALENDAR EMAIL] No customer email for order:', calendarEvent.orderId);
    return { skipped: true, reason: 'No customer email' };
  }

  // Get company settings
  const company = await emailService.getCompanySettings(prisma);

  // Get sales rep details (stored in order.sku)
  let salesRep = null;
  if (order.sku) {
    const salesUser = await prisma.user.findFirst({
      where: { name: order.sku, isActive: true },
      include: { UserEmailSettings: true },
    });
    if (salesUser) {
      salesRep = {
        email: salesUser.email,
        name: salesUser.name,
        fromName: salesUser.UserEmailSettings?.fromName || salesUser.name,
      };
    }
  }

  const fromEmail = salesRep?.email || company.email || process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName || 'Stealth Machine Tools';
  const companyName  = company.companyName || 'Stealth Machine Tools';
  const companyPhone = company.phone || '';
  const companyEmail = company.email || fromEmail;

  const orderRef     = order.poNumber || order.id.slice(-8).toUpperCase();
  const customerName = order.account.contactName || order.account.name || 'Customer';

  const installDate = new Date(calendarEvent.startDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const subject = isReschedule
    ? `Updated: Your installation has been rescheduled \u2014 Ref #${orderRef}`
    : `Your installation has been scheduled \u2014 Ref #${orderRef}`;

  const notesBlock = calendarEvent.notes
    ? `<div style="background:#f9f9f9;border-left:4px solid #dc2626;padding:14px 18px;margin:20px 0;border-radius:0 6px 6px 0;"><p style="margin:0;font-size:14px;color:#444;line-height:1.6;">${calendarEvent.notes}</p></div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body{margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}
    .wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);}
    .header{background:#dc2626;padding:28px 32px;}
    .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;}
    .header p{color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;}
    .body{padding:32px;}
    .install-box{background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:20px 24px;margin:24px 0;text-align:center;}
    .install-box .label{font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;}
    .install-box .date{font-size:22px;font-weight:700;color:#111;}
    .contact{margin:24px 0 0;padding-top:20px;border-top:1px solid #eee;font-size:14px;color:#666;}
    .footer{background:#f4f4f4;padding:16px 32px;font-size:12px;color:#999;text-align:center;}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${companyName}</h1>
    <p>${isReschedule ? 'Installation Date Update' : 'Installation Confirmation'}</p>
  </div>
  <div class="body">
    <p style="font-size:16px;color:#111;margin:0 0 16px;">Hello ${customerName},</p>
    <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 8px;">
      ${isReschedule
        ? 'We are reaching out to let you know that your installation date has been updated. Please see the new date below.'
        : 'We are pleased to confirm that your installation has been scheduled. Please see the details below.'}
    </p>
    <div class="install-box">
      <div class="label">${isReschedule ? 'New Installation Date' : 'Installation Date'}</div>
      <div class="date">${installDate}</div>
    </div>
    ${notesBlock}
    <p style="font-size:14px;color:#555;line-height:1.6;">
      Reference: <strong>#${orderRef}</strong><br>
      If you have any questions or need to make changes, please do not hesitate to reach out.
    </p>
    <div class="contact">
      <strong>${fromName}</strong><br>
      ${companyEmail ? `<a href="mailto:${companyEmail}" style="color:#dc2626;">${companyEmail}</a><br>` : ''}
      ${companyPhone}
    </div>
  </div>
  <div class="footer">${companyName} &bull; This is an automated notification for your records.</div>
</div>
</body>
</html>`;

  const result = await emailService.sendEmail({
    to: order.account.email,
    from: fromEmail,
    fromName: fromName,
    replyTo: fromEmail,
    subject,
    html,
  });

  if (result.success) {
    console.log(`[CALENDAR EMAIL] Sent to ${order.account.email} for order ${order.id} (reschedule=${isReschedule})`);
  } else {
    console.error('[CALENDAR EMAIL] Failed:', result.error);
  }

  // Record on the audit log's Emails tab. Fire-and-forget.
  logAlertEmail({
    category: 'CALENDAR_INSTALL',
    fromEmail,
    fromName,
    toEmail: order.account.email,
    toName: order.account.name,
    replyTo: fromEmail,
    subject,
    status: result.success ? 'SENT' : 'FAILED',
    errorMessage: result.success ? null : result.error,
    sesMessageId: result.messageId || null,
    orderId: order.id,
    metadata: { isReschedule, customerName: order.account.name },
  });

  return result;
}
