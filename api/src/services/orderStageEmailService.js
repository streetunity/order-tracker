/**
 * Order Stage Email Service
 * Sends automated notifications to customers when orders progress through stages
 *
 * Actual stage progression:
 *   1. MANUFACTURING   → Manufacturing
 *   2. TESTING         → Debugging and Testing
 *   3. SHIPPING        → Preparing Shipping Container
 *   4. AT_SEA          → Container At Sea
 *   5. SMT             → Arrived at SMT
 *   6. QC              → Quality Control
 *   7. DELIVERED        → Delivered to Customer
 */

import emailService from "./emailService.js";
import { getOrderStageEmailTemplate } from "./emailTemplates.js";

const STAGE_CONFIG = {
  MANUFACTURING: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order is now in manufacturing",
    message: "Your item ({{productCode}}) has entered the manufacturing phase. We'll keep you updated as it progresses.",
  },
  TESTING: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order is in debugging and testing",
    message: "Your item ({{productCode}}) has completed manufacturing and is now undergoing debugging and testing.",
  },
  SHIPPING: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order is being prepared for shipment",
    message: "Your item ({{productCode}}) has passed testing and is now being loaded into the shipping container.",
  },
  AT_SEA: {
    notify: true,
    priority: "HIGH",
    subject: "Your order has shipped!",
    message: "Great news! Your item ({{productCode}}) is on its way. The shipping container is now in transit.",
  },
  SMT: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order has arrived at our facility",
    message: "Your item ({{productCode}}) has arrived at our facility and will now go through quality control before delivery.",
  },
  QC: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order is in quality control",
    message: "Your item ({{productCode}}) is currently going through our final quality control inspection before delivery.",
  },
  DELIVERED: {
    notify: true,
    priority: "HIGH",
    subject: "Your order has been delivered!",
    message: "Your item ({{productCode}}) has been delivered. We hope you enjoy it!",
  },
};

/**
 * Check if a stage should trigger customer notification
 */
export function shouldNotifyForStage(stage) {
  return STAGE_CONFIG[stage]?.notify || false;
}

/**
 * Send order stage update email to customer
 */
export async function sendStageNotification(prisma, {
  orderId,
  itemId,
  oldStage,
  newStage,
}) {
  // Check if stage triggers notification
  if (!shouldNotifyForStage(newStage)) {
    console.log(`[EMAIL] Stage ${newStage} does not trigger customer notification`);
    return { skipped: true, reason: "Stage not configured for notification" };
  }

  // Get order with account details
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

  // Check account email preferences
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
    return { skipped: true, reason: "Notifications disabled" };
  }

  // Check if this stage is in the customer's notification preferences
  let notifyOnStages;
  try {
    notifyOnStages = order.account.notifyOnStages
      ? JSON.parse(order.account.notifyOnStages)
      : null; // null = all stages
  } catch {
    notifyOnStages = null; // Parse error = default to all stages
  }

  if (notifyOnStages && !notifyOnStages.includes(newStage)) {
    console.log(`[EMAIL] Account ${order.account.id} does not want ${newStage} notifications`);
    return { skipped: true, reason: "Stage not in preferences" };
  }

  // Get company settings
  const company = await emailService.getCompanySettings(prisma);

  // Get sales rep details (from order.sku which stores sales person name)
  // Email will be sent FROM the sales rep, not the company
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

  // Determine from email - sales rep if available, otherwise fall back to company
  const fromEmail = salesRep?.email || company.email || process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";
  const fromName = salesRep?.fromName || salesRep?.name || company.companyName || "Stealth Machine Tools";

  // Build template variables
  const stageConfig = STAGE_CONFIG[newStage];
  const baseUrl = process.env.FRONTEND_URL || 'https://smt-orders.com';
  const trackingUrl = `${baseUrl}/t/${order.trackingToken || order.id}`;
  
  const templateVariables = {
    customerName: order.account.contactName || order.account.name || "Customer",
    orderNumber: order.id.slice(-8).toUpperCase(), // Last 8 chars of order ID as reference
    productCode: item.productCode || "N/A",
    previousStage: oldStage,
    newStage: newStage,
    stageDisplayName: newStage.replace(/_/g, " "),
    message: emailService.processTemplate(stageConfig.message, {
      productCode: item.productCode || "your item",
    }),
    trackingUrl: trackingUrl,
    unsubscribeUrl: `${trackingUrl}/unsubscribe`,
    companyName: company.companyName || "Stealth Machine Tools",
    companyPhone: company.phone || "",
    companyEmail: company.email || "",
    salesRepName: salesRep?.name || company.companyName || "Stealth Machine Tools",
    salesRepEmail: fromEmail,
  };

  const subject = stageConfig.subject;

  const html = emailService.processTemplate(
    getOrderStageEmailTemplate(),
    templateVariables
  );

  // Send the email FROM the sales rep
  const result = await emailService.sendEmail({
    to: order.account.email,
    from: fromEmail,
    fromName: fromName,
    replyTo: fromEmail,
    subject: subject,
    html: html,
  });

  // Log the result
  if (result.success) {
    console.log(`[EMAIL] Stage notification sent: ${newStage} for order ${order.id} to ${order.account.email} from ${fromEmail}`);
  } else {
    console.error(`[EMAIL] Stage notification failed: ${result.error}`);
  }

  return result;
}
