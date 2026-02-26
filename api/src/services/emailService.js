/**
 * Unified Email Service
 * Handles all email sending for Order Tracker
 * - Invoice/Estimate emails with PDF attachments
 * - Order stage notifications
 * - Internal notifications (commissions, alerts)
 */

const { SESClient, SendEmailCommand, SendRawEmailCommand } = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.sesClient = new SESClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    
    // Nodemailer transport for emails with attachments
    this.transporter = nodemailer.createTransport({
      SES: { ses: this.sesClient, aws: require("@aws-sdk/client-ses") },
    });
    
    this.isProduction = process.env.NODE_ENV === 'production';
    this.testEmailOverride = process.env.TEST_EMAIL_OVERRIDE;
  }

  /**
   * Send a simple email (no attachments)
   * Used for: Order stage notifications, internal alerts
   */
  async sendEmail({ to, from, fromName, replyTo, subject, html, text }) {
    // In non-production, override recipient for testing
    const actualTo = this.isProduction ? to : (this.testEmailOverride || to);
    const actualSubject = this.isProduction ? subject : `[TEST] ${subject}`;
    
    if (!this.isProduction) {
      console.log(`[EMAIL] TEST MODE - Would send to ${to}, actually sending to ${actualTo}`);
    }

    const params = {
      Destination: {
        ToAddresses: Array.isArray(actualTo) ? actualTo : [actualTo],
      },
      Message: {
        Body: {
          Html: { Charset: "UTF-8", Data: html },
          Text: { Charset: "UTF-8", Data: text || this.stripHtml(html) },
        },
        Subject: { Charset: "UTF-8", Data: actualSubject },
      },
      Source: fromName ? `${fromName} <${from}>` : from,
      ReplyToAddresses: replyTo ? [replyTo] : [from],
    };

    try {
      const command = new SendEmailCommand(params);
      const result = await this.sesClient.send(command);
      console.log(`[EMAIL] Sent to ${actualTo}: ${actualSubject}`);
      return { success: true, messageId: result.MessageId };
    } catch (error) {
      console.error(`[EMAIL] Failed to send to ${actualTo}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email with PDF attachment
   * Used for: Invoices, Estimates, Receipts
   */
  async sendEmailWithAttachment({ to, from, fromName, replyTo, subject, html, text, attachments }) {
    const actualTo = this.isProduction ? to : (this.testEmailOverride || to);
    const actualSubject = this.isProduction ? subject : `[TEST] ${subject}`;

    const mailOptions = {
      from: fromName ? `${fromName} <${from}>` : from,
      to: actualTo,
      replyTo: replyTo || from,
      subject: actualSubject,
      html: html,
      text: text || this.stripHtml(html),
      attachments: attachments, // [{ filename: 'Invoice-001.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL] Sent with attachment to ${actualTo}: ${actualSubject}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`[EMAIL] Failed to send with attachment to ${actualTo}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process template variables
   * Replaces {{variableName}} with actual values
   */
  processTemplate(template, variables) {
    let processed = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      processed = processed.replace(regex, value ?? "");
    }
    return processed;
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }

  /**
   * Get sales rep email settings
   */
  async getSalesRepEmailSettings(prisma, userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { UserEmailSettings: true },
    });

    if (!user) return null;

    return {
      email: user.email,
      name: user.name,
      fromName: user.UserEmailSettings?.fromName || user.name,
      signature: user.UserEmailSettings?.emailSignature || "",
      phoneNumber: user.UserEmailSettings?.phoneNumber || "",
      invoiceEmailBody: user.UserEmailSettings?.invoiceEmailBody || "",
      estimateEmailBody: user.UserEmailSettings?.estimateEmailBody || "",
    };
  }

  /**
   * Get company settings for email footer
   */
  async getCompanySettings(prisma) {
    const settings = await prisma.companySettings.findFirst();
    return settings || {
      companyName: "Stealth Machine Tools",
      address: "",
      phone: "",
      email: "",
      website: "",
    };
  }
}

module.exports = new EmailService();
