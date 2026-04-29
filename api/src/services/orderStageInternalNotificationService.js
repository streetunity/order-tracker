/**
 * Internal Stage Notification Service
 *
 * Fires when a MANUFACTURER moves an item to a new stage. Notifies all active
 * admins (ADMIN, SUPER_ADMIN) plus the order's listed sales agent via in-app
 * notification AND email.
 *
 * Per project policy: internal users have no email opt-out — all active users
 * in the recipient roles always receive emails.
 *
 * Silently no-ops when the actor is not a manufacturer (admin-driven moves
 * don't ping admins; that would be noise).
 */

import emailService from "./emailService.js";

const STAGE_LABELS = {
  PENDING_FUNDING: "Pending Funding",
  MANUFACTURING: "Manufacturing",
  TESTING: "Debugging & Testing",
  SHIPPING: "Preparing Container",
  AT_SEA: "Container At Sea",
  SMT: "Arrived At SMT",
  QC: "Quality Control",
  DELIVERED: "Delivered To Customer",
  ONSITE: "On Site Setup & Training",
  COMPLETED: "Training Complete",
  FOLLOW_UP: "Follow Up",
};

function labelFor(stage) {
  return STAGE_LABELS[stage] || String(stage || "").replace(/_/g, " ");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send internal notification + email when a manufacturer moves an item.
 *
 * @param {PrismaClient} prisma
 * @param {object}  args
 * @param {string}  args.orderId
 * @param {string}  args.itemId
 * @param {string}  args.oldStage
 * @param {string}  args.newStage
 * @param {object}  args.actor   The req.user object of the user performing the move.
 */
export async function sendInternalStageNotification(prisma, {
  orderId,
  itemId,
  oldStage,
  newStage,
  actor,
}) {
  try {
    // Only fire for manufacturer-driven moves.
    if (!actor || actor.role !== "MANUFACTURER") {
      return { skipped: true, reason: "Actor is not a manufacturer" };
    }

    // Load order + item context.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        account: { select: { name: true, contactName: true } },
        items: {
          where: { id: itemId },
          include: { manufacturer: { select: { name: true } } },
        },
      },
    });

    if (!order) {
      console.error(`[INTERNAL-NOTIF] Order ${orderId} not found`);
      return { success: false, error: "Order not found" };
    }

    const item = order.items[0];
    if (!item) {
      console.error(`[INTERNAL-NOTIF] Item ${itemId} not found in order ${orderId}`);
      return { success: false, error: "Item not found" };
    }

    // Recipients: all active admins + the listed sales agent (deduped by id).
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
      },
      select: { id: true, name: true, email: true, role: true },
    });

    let salesAgent = null;
    if (order.sku) {
      salesAgent = await prisma.user.findFirst({
        where: { name: order.sku, isActive: true },
        select: { id: true, name: true, email: true, role: true },
      });
    }

    const recipientMap = new Map();
    for (const u of admins) recipientMap.set(u.id, u);
    if (salesAgent) recipientMap.set(salesAgent.id, salesAgent);
    const recipients = Array.from(recipientMap.values());

    if (recipients.length === 0) {
      console.log("[INTERNAL-NOTIF] No internal recipients found, skipping");
      return { skipped: true, reason: "No recipients" };
    }

    // Build context.
    const manufacturerName =
      item.manufacturer?.name ||
      actor.manufacturer?.name ||
      actor.name ||
      "A manufacturer";
    const productCode = item.productCode || "item";
    const customerName = order.account?.name || "Unknown customer";
    const orderRef = order.poNumber || order.id.slice(-8).toUpperCase();
    const oldLabel = labelFor(oldStage);
    const newLabel = labelFor(newStage);

    const baseUrl = process.env.FRONTEND_URL || "https://smt-orders.com";
    const orderUrl = `${baseUrl}/admin/orders/${orderId}`;

    const notifTitle = `${manufacturerName} moved ${productCode} \u2192 ${newLabel}`;
    const notifMessage = `${manufacturerName} moved ${productCode} (order ${orderRef}, ${customerName}) from ${oldLabel} to ${newLabel}.`;

    const emailSubject = `[SMT] ${manufacturerName} moved ${productCode} \u2192 ${newLabel}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; color: #333;">
        <h2 style="color: #dc2626; margin-bottom: 16px;">Item Stage Update</h2>
        <p>A manufacturer has updated an item's stage.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Customer:</td><td style="padding: 6px 0;"><strong>${escapeHtml(customerName)}</strong></td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Order:</td><td style="padding: 6px 0;">${escapeHtml(orderRef)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Item:</td><td style="padding: 6px 0;">${escapeHtml(productCode)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Manufacturer:</td><td style="padding: 6px 0;">${escapeHtml(manufacturerName)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Stage:</td><td style="padding: 6px 0;">${escapeHtml(oldLabel)} <span style="color: #9ca3af;">\u2192</span> <strong style="color: #dc2626;">${escapeHtml(newLabel)}</strong></td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="${orderUrl}" style="display: inline-block; padding: 10px 20px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">View Order</a>
        </p>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">This is an automated internal notification from the SMT Order Tracker.</p>
      </div>
    `;

    // Sender: company settings, falls back to env var, falls back to a default.
    const company = await emailService.getCompanySettings(prisma);
    const fromEmail =
      company.email || process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";
    const fromName = company.companyName || "SMT Order Tracker";

    let notifCount = 0;
    let emailSent = 0;
    let emailFailed = 0;

    for (const user of recipients) {
      // In-app notification
      try {
        await prisma.notification.create({
          data: {
            userId: String(user.id),
            type: "ITEM_STAGE_CHANGED_BY_MANUFACTURER",
            category: "OPERATIONAL",
            title: notifTitle,
            message: notifMessage,
            relatedOrderId: orderId,
            relatedItemId: itemId,
            priority: "NORMAL",
            metadata: JSON.stringify({
              manufacturerName,
              productCode,
              customerName,
              orderRef,
              oldStage,
              newStage,
              actorId: actor.id,
              actorName: actor.name,
            }),
          },
        });
        notifCount += 1;
      } catch (e) {
        console.error(
          `[INTERNAL-NOTIF] Failed to create notification for user ${user.id}:`,
          e.message
        );
      }

      // Email
      if (user.email) {
        try {
          const result = await emailService.sendEmail({
            to: user.email,
            from: fromEmail,
            fromName,
            subject: emailSubject,
            html: emailHtml,
          });
          if (result.success) {
            emailSent += 1;
          } else {
            emailFailed += 1;
            console.error(
              `[INTERNAL-NOTIF] Email send failed for ${user.email}: ${result.error}`
            );
          }
        } catch (e) {
          emailFailed += 1;
          console.error(
            `[INTERNAL-NOTIF] Email send error for ${user.email}:`,
            e.message
          );
        }
      }
    }

    console.log(
      `[INTERNAL-NOTIF] Item ${itemId} stage ${oldStage}\u2192${newStage} by manufacturer ${actor.name}: ${notifCount} notifications created, ${emailSent}/${recipients.length} emails sent (${emailFailed} failed)`
    );

    return {
      success: true,
      notifCount,
      emailSent,
      emailFailed,
      recipientCount: recipients.length,
    };
  } catch (error) {
    console.error("[INTERNAL-NOTIF] Unhandled error:", error);
    return { success: false, error: error.message };
  }
}

export default { sendInternalStageNotification };
