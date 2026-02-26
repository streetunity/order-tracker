/**
 * Unified Email Service
 * Handles all email sending for Order Tracker via AWS SES
 * - Invoice/Estimate emails with PDF attachments
 * - Order stage notifications
 * - Internal notifications (commissions, alerts)
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import * as sesModule from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// Nodemailer transport for emails with attachments
const transporter = nodemailer.createTransport({
  SES: { ses: sesClient, aws: sesModule },
});

const isProduction = process.env.NODE_ENV === 'production';
const testEmailOverride = process.env.TEST_EMAIL_OVERRIDE;

/**
 * Send a simple email (no attachments)
 * Used for: Order stage notifications, internal alerts
 */
export async function sendEmail({ to, from, fromName, replyTo, subject, html, text }) {
  const actualTo = isProduction ? to : (testEmailOverride || to);
  const actualSubject = isProduction ? subject : `[TEST] ${subject}`;
  
  if (!isProduction) {
    console.log(`[EMAIL] TEST MODE - Would send to ${to}, actually sending to ${actualTo}`);
  }

  const params = {
    Destination: {
      ToAddresses: Array.isArray(actualTo) ? actualTo : [actualTo],
    },
    Message: {
      Body: {
        Html: { Charset: "UTF-8", Data: html },
        Text: { Charset: "UTF-8", Data: text || stripHtml(html) },
      },
      Subject: { Charset: "UTF-8", Data: actualSubject },
    },
    Source: fromName ? `${fromName} <${from}>` : from,
    ReplyToAddresses: replyTo ? [replyTo] : [from],
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);
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
export async function sendEmailWithAttachment({ to, from, fromName, replyTo, subject, html, text, attachments }) {
  const actualTo = isProduction ? to : (testEmailOverride || to);
  const actualSubject = isProduction ? subject : `[TEST] ${subject}`;

  const mailOptions = {
    from: fromName ? `${fromName} <${from}>` : from,
    to: actualTo,
    replyTo: replyTo || from,
    subject: actualSubject,
    html: html,
    text: text || stripHtml(html),
    attachments: attachments, // [{ filename: 'Invoice-001.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
  };

  try {
    const result = await transporter.sendMail(mailOptions);
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
export function processTemplate(template, variables) {
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
export function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Get sales rep email settings
 */
export async function getSalesRepEmailSettings(prisma, userId) {
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
export async function getCompanySettings(prisma) {
  const settings = await prisma.companySettings.findFirst();
  return settings || {
    companyName: "Stealth Machine Tools",
    address: "",
    phone: "",
    email: "",
    website: "",
  };
}

// Default export for backward compatibility
export default {
  sendEmail,
  sendEmailWithAttachment,
  processTemplate,
  stripHtml,
  getSalesRepEmailSettings,
  getCompanySettings,
};
