/**
 * Order Stage Email Service
 * Sends automated notifications to customers when orders progress through stages
 */

const emailService = require("./emailService");
const { getOrderStageEmailTemplate } = require("./emailTemplates");

// Stage configuration - ALL stages trigger customer notifications
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
    subject: "Your order is being tested",
    message: "Your item ({{productCode}}) is currently undergoing quality testing to ensure it meets our standards.",
  },
  QC: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order passed quality control",
    message: "Great news! Your item ({{productCode}}) has passed our quality control inspection and is being prepared for shipping.",
  },
  SHIPPING: {
    notify: true,
    priority: "HIGH",
    subject: "Your order has shipped!",
    message: "Great news! Your item ({{productCode}}) is on its way.",
  },
  AT_SEA: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order is in transit",
    message: "Your item ({{productCode}}) is currently in transit to our facility.",
  },
  CUSTOMS: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order is in customs processing",
    message: "Your item ({{productCode}}) has arrived and is currently being processed through customs clearance.",
  },
  SMT: {
    notify: true,
    priority: "NORMAL",
    subject: "Your order has arrived at our facility",
    message: "Your item ({{productCode}}) has arrived at our facility and is being prepared for final delivery.",
  },
  DELIVERED: {
    notify: true,
    priority: "HIGH",
    subject: "Your order has been delivered!",
    message: "Your item ({{productCode}}) has been delivered. We hope you enjoy it!",
  },
};

class OrderStageEmailService {
  /**
   * Check if a stage should trigger customer notification
   */
  shouldNotifyForStage(stage) {
    return STAGE_CONFIG[stage]?.notify || false;
  }

  /**
   * Send order stage update email to customer
   */
  async sendStageNotification(prisma, {
    orderId,
    itemId,
    oldStage,
    newStage,
    triggeredByUserId,
  }) {
    // Check if stage triggers notification
    if (!this.shouldNotifyForStage(newStage)) {
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
      notifyOnStages = JSON.parse(order.account.notifyOnStages || '["MANUFACTURING","TESTING","QC","SHIPPING","AT_SEA","CUSTOMS","SMT","DELIVERED"]');
    } catch {
      notifyOnStages = ["MANUFACTURING","TESTING","QC","SHIPPING","AT_SEA","CUSTOMS","SMT","DELIVERED"];
    }
    if (!notifyOnStages.includes(newStage)) {
      console.log(`[EMAIL] Account ${order.account.id} does not want ${newStage} notifications`);
      return { skipped: true, reason: "Stage not in preferences" };
    }

    // Get company settings
    const company = await emailService.getCompanySettings(prisma);

    // Get sales rep details (from order.sku which stores sales person name)
    // Email will be sent FROM the sales rep, not the company
    let salesRep = null;
    if (order.sku) {
      salesRep = await prisma.user.findFirst({
        where: { name: order.sku, isActive: true },
        include: { UserEmailSettings: true },
      });
    }

    // Determine from email - sales rep if available, otherwise fall back to company
    const fromEmail = salesRep?.email || company.email || process.env.SES_FROM_EMAIL;
    const fromName = salesRep?.UserEmailSettings?.fromName || salesRep?.name || company.companyName;

    // Build template variables
    const stageConfig = STAGE_CONFIG[newStage];
    const trackingUrl = `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/track/${order.trackingToken || order.id}`;
    
    const templateVariables = {
      customerName: order.account.contactName || order.account.name,
      orderNumber: order.id.slice(-8).toUpperCase(), // Last 8 chars of order ID as reference
      productCode: item.productCode,
      previousStage: oldStage,
      newStage: newStage,
      stageDisplayName: newStage.replace(/_/g, " "),
      message: emailService.processTemplate(stageConfig.message, {
        productCode: item.productCode,
      }),
      trackingUrl: trackingUrl,
      unsubscribeUrl: `${trackingUrl}/unsubscribe`,
      companyName: company.companyName,
      companyPhone: company.phone || "",
      companyEmail: company.email || "",
      salesRepName: salesRep?.name || company.companyName,
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

    // Log the email
    if (result.success) {
      console.log(`[EMAIL] Stage notification sent: ${newStage} for order ${order.id} to ${order.account.email} from ${fromEmail}`);
    } else {
      console.error(`[EMAIL] Stage notification failed: ${result.error}`);
    }

    return result;
  }
}

module.exports = new OrderStageEmailService();
