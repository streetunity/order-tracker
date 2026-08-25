/**
 * Order Stage Email Service
 * Sends automated notifications to customers when orders progress through stages.
 *
 * Single source of truth: this service reads stage configs and the
 * order_stage template from the same data the /admin/email UI writes to.
 *  - Stage subjects/messages: prisma.emailStageConfig (DB) -> DEFAULT_STAGE_CONFIGS
 *  - Email body/closing/footer: prisma.emailTemplate('order_stage') -> DEFAULT_TEMPLATES.order_stage
 * If a stage has notify=false in the DB, no email is sent for that stage.
 *
 * Stage progression:
 *   1. MANUFACTURING   -> Manufacturing
 *   2. TESTING         -> Debugging & Testing
 *   3. SHIPPING        -> Preparing Shipment
 *   4. AT_SEA          -> Container At Sea
 *   5. SMT             -> Arrived at SMT
 *   6. QC              -> Quality Control
 *   7. DELIVERED       -> Delivered
 */

import emailService from "./emailService.js";
import { logAlertEmail } from "./alertEmailLogger.js";
import { wrapInBaseTemplate, buildHeader } from "./emailTemplates.js";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_STAGE_CONFIGS,
  STAGE_DISPLAY_NAMES,
} from "../routes/emailTemplateSettings.js";

// Resolve the effective stage config: DB customization wins over DEFAULT_STAGE_CONFIGS.
// Returns null if the stage is unknown.
async function resolveStageConfig(prisma, stage) {
  const def = DEFAULT_STAGE_CONFIGS[stage];
  if (!def) return null;
  let dbConfig = null;
  try {
    dbConfig = await prisma.emailStageConfig.findUnique({ where: { stage } });
  } catch (e) {
    // If the table is missing or the query fails, fall back to defaults silently.
    dbConfig = null;
  }
  // For notify, only use the DB value when explicitly set (true/false). null/missing
  // falls through to the default so a partially-populated row won't accidentally
  // disable notifications.
  const dbNotify = dbConfig && dbConfig.notify != null ? dbConfig.notify : null;
  return {
    notify: dbNotify != null ? dbNotify : def.notify,
    subject: (dbConfig && dbConfig.subject) || def.subject,
    message: (dbConfig && dbConfig.message) || def.message,
  };
}

// Resolve the effective order_stage template: DB customization wins over
// DEFAULT_TEMPLATES.order_stage.
async function resolveOrderStageTemplate(prisma) {
  const def = DEFAULT_TEMPLATES.order_stage;
  let dbTpl = null;
  try {
    dbTpl = await prisma.emailTemplate.findUnique({ where: { templateKey: 'order_stage' } });
  } catch (e) {
    dbTpl = null;
  }
  return {
    subject:        (dbTpl && dbTpl.subject)        || def.subject,
    bodyContent:    (dbTpl && dbTpl.bodyContent)    || def.bodyContent,
    closingContent: (dbTpl && dbTpl.closingContent != null) ? dbTpl.closingContent : (def.closingContent || ''),
    footerContent:  (dbTpl && dbTpl.footerContent  != null) ? dbTpl.footerContent  : (def.footerContent  || ''),
  };
}

// Convert the user-friendly class names ("info-box", "btn", "btn-secondary")
// used in the default order_stage template body into inline styles. Email
// clients like Gmail strip <style> blocks, so without this transform the
// info-box card and the Track Your Order button would render unstyled in
// strict clients. Mirrors the rules used in the test-send modal CSS so the
// real email matches what the user sees in Preview / Test Send.
function inlineKnownClasses(html) {
  if (!html) return html;
  let out = html;
  // Order matters: handle the more-specific "btn btn-secondary" before "btn"
  // to avoid the second replace clobbering the first.
  out = out.replace(
    /class="btn btn-secondary"/g,
    'style="display:inline-block;background:#333333;color:#ffffff !important;padding:12px 30px;text-decoration:none;border-radius:5px;margin:10px 5px;font-weight:bold;"'
  );
  out = out.replace(
    /class="info-box"/g,
    'style="background:#f9f9f9;border:1px solid #dddddd;padding:20px;margin:20px 0;border-radius:4px;"'
  );
  out = out.replace(
    /class="btn"/g,
    'style="display:inline-block;background:#dc2626;color:#ffffff !important;padding:12px 30px;text-decoration:none;border-radius:5px;margin:10px 5px;font-weight:bold;"'
  );
  return out;
}

/**
 * Synchronous compatibility check used by callers who want to short-circuit
 * before invoking sendStageNotification. Returns true for any known stage;
 * the actual DB-aware notify gate is enforced inside sendStageNotification.
 * Kept as a sync function to avoid breaking existing callers that pre-check.
 */
export function shouldNotifyForStage(stage) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_STAGE_CONFIGS, stage);
}

/**
 * Send order stage update email to customer.
 */
export async function sendStageNotification(prisma, {
  orderId,
  itemId,
  oldStage,
  newStage,
}) {
  // 1. Resolve stage config from DB (customization) or defaults.
  const stageConfig = await resolveStageConfig(prisma, newStage);
  if (!stageConfig) {
    console.log(`[EMAIL] Unknown stage ${newStage}; skipping notification`);
    return { skipped: true, reason: "Unknown stage" };
  }
  if (!stageConfig.notify) {
    console.log(`[EMAIL] Stage ${newStage} has notifications disabled in admin settings`);
    return { skipped: true, reason: "Stage notifications disabled" };
  }

  // 2. Load order, account, and item.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      account: true,
      items: { where: { id: itemId } },
    },
  });
  if (!order) {
    console.error(`[EMAIL] Order ${orderId} not found`);
    return { success: false, error: "Order not found" };
  }
  const item = order.items[0];
  if (!item) {
    console.error(`[EMAIL] Item ${itemId} not found in order ${orderId}`);
    return { success: false, error: "Item not found" };
  }

  // 3. Customer-side notification preferences.
  if (!order.account) {
    console.log(`[EMAIL] Order ${orderId} has no account linked`);
    return { skipped: true, reason: "No account linked" };
  }
  if (!order.account.email) {
    console.log(`[EMAIL] Account ${order.account.id} has no email address`);
    return { skipped: true, reason: "No customer email" };
  }
  if (order.account.emailNotifications === false) {
    console.log(`[EMAIL] Account ${order.account.id} has email notifications disabled`);
    return { skipped: true, reason: "Notifications disabled by customer" };
  }

  let notifyOnStages;
  try {
    notifyOnStages = order.account.notifyOnStages
      ? JSON.parse(order.account.notifyOnStages)
      : null; // null = all stages
  } catch {
    notifyOnStages = null;
  }
  if (notifyOnStages && !notifyOnStages.includes(newStage)) {
    console.log(`[EMAIL] Account ${order.account.id} does not want ${newStage} notifications`);
    return { skipped: true, reason: "Stage not in customer preferences" };
  }

  // 4. Resolve order_stage template (DB customization wins).
  const tpl = await resolveOrderStageTemplate(prisma);

  // 5. Resolve company info + sales rep (email is sent from the sales rep).
  const company = await emailService.getCompanySettings(prisma);

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

  const fromEmail = salesRep?.email || company.email || process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName || "Stealth Machine Tools";

  // 6. Build template variables.
  const customerName     = order.account.contactName || order.account.name || "Customer";
  const orderNumber      = order.id.slice(-8).toUpperCase();
  const productCode      = item.productCode || "N/A";
  const stageDisplayName = STAGE_DISPLAY_NAMES[newStage] || newStage.replace(/_/g, " ");
  const baseUrl          = process.env.FRONTEND_URL || 'https://smt-orders.com';
  const trackingUrl      = `${baseUrl}/t/${order.trackingToken || order.id}`;

  // First-pass substitution for stage subject + message variables.
  const stageSubstitutionVars = {
    productCode,
    stageDisplayName,
    orderNumber,
    customerName,
    companyName: company.companyName || "Stealth Machine Tools",
  };
  const renderedSubject = emailService.processTemplate(stageConfig.subject, stageSubstitutionVars);
  const renderedMessage = emailService.processTemplate(stageConfig.message, stageSubstitutionVars);

  // Variables exposed to the order_stage template body / closing / footer.
  const templateVariables = {
    customerName,
    orderNumber,
    productCode,
    previousStage: oldStage,
    newStage,
    stageDisplayName,
    message: renderedMessage,
    trackingUrl,
    unsubscribeUrl: `${trackingUrl}/unsubscribe`,
    companyName:   company.companyName || "Stealth Machine Tools",
    companyPhone:  company.phone || "",
    companyEmail:  company.email || "",
    salesRepName:  salesRep?.name || company.companyName || "Stealth Machine Tools",
    salesRepEmail: fromEmail,
  };

  // 7. Render the user-editable fragments and inline known class names so
  //    Gmail (which strips <style> blocks) renders the info-box and button.
  const bodyContent    = inlineKnownClasses(emailService.processTemplate(tpl.bodyContent,    templateVariables));
  const closingContent = inlineKnownClasses(emailService.processTemplate(tpl.closingContent, templateVariables));
  const footerContent  = inlineKnownClasses(emailService.processTemplate(tpl.footerContent,  templateVariables));

  // 8. Wrap in production email shell (mso-safe, dark-mode-aware).
  const html = wrapInBaseTemplate(`
    ${buildHeader(templateVariables.companyName, company.logoUrl || null)}
    <tr>
      <td class="email-body-td" bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
        ${bodyContent}
        ${closingContent ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #dddddd;font-size:14px;color:#555555;">${closingContent}</div>` : ''}
      </td>
    </tr>
    ${footerContent ? `
    <tr>
      <td class="footer-td" bgcolor="#f5f5f5" style="background-color:#f5f5f5;padding:20px 30px;text-align:center;font-size:12px;color:#666666;font-family:Arial,Helvetica,sans-serif;">
        ${footerContent}
      </td>
    </tr>` : ''}
  `, `${stageDisplayName} \u2014 Order #${orderNumber}`);

  // 9. Send the email FROM the sales rep.
  const result = await emailService.sendEmail({
    to: order.account.email,
    from: fromEmail,
    fromName,
    replyTo: fromEmail,
    subject: renderedSubject,
    html,
  });

  if (result.success) {
    console.log(`[EMAIL] Stage notification sent: ${newStage} for order ${order.id} to ${order.account.email} from ${fromEmail}`);
  } else {
    console.error(`[EMAIL] Stage notification failed: ${result.error}`);
  }

  // Record on the audit log's Emails tab. Fire-and-forget.
  logAlertEmail({
    category: 'STAGE_CUSTOMER',
    fromEmail,
    fromName,
    toEmail: order.account.email,
    toName: order.account.name,
    replyTo: fromEmail,
    subject: renderedSubject,
    status: result.success ? 'SENT' : 'FAILED',
    errorMessage: result.success ? null : result.error,
    sesMessageId: result.messageId || null,
    orderId: order.id,
    orderItemId: itemId,
    metadata: { oldStage, newStage, customerName: order.account?.name },
  });

  return result;
}
