/**
 * Unified Email Service
 * Handles all email sending for Order Tracker via AWS SES
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import * as sesModule from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";

const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const transporter = nodemailer.createTransport({
  SES: { ses: sesClient, aws: sesModule },
});

const isProduction = process.env.NODE_ENV === 'production';
const testEmailOverride = process.env.TEST_EMAIL_OVERRIDE;

export async function sendEmail({ to, from, fromName, replyTo, subject, html, text }) {
  const actualTo = isProduction ? to : (testEmailOverride || to);
  const actualSubject = isProduction ? subject : `[TEST] ${subject}`;

  const params = {
    Destination: { ToAddresses: Array.isArray(actualTo) ? actualTo : [actualTo] },
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
    console.error(`[EMAIL] SES error sending to ${actualTo}:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function sendEmailWithAttachment({ to, from, fromName, replyTo, subject, html, text, attachments }) {
  const actualTo = isProduction ? to : (testEmailOverride || to);
  const actualSubject = isProduction ? subject : `[TEST] ${subject}`;

  const mailOptions = {
    from: fromName ? `${fromName} <${from}>` : from,
    to: actualTo,
    replyTo: replyTo || from,
    subject: actualSubject,
    html,
    text: text || stripHtml(html),
    attachments,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Sent with attachment to ${actualTo}: ${actualSubject}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`[EMAIL] SES attachment error to ${actualTo}:`, error.message);
    return { success: false, error: error.message };
  }
}

export function processTemplate(template, variables) {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    processed = processed.replace(regex, value ?? "");
  }
  return processed;
}

export function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function getSalesRepEmailSettings(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { UserEmailSettings: true },
  });
  if (!user) return null;
  return {
    email:            user.email,
    name:             user.name,
    fromName:         user.UserEmailSettings?.fromName    || user.name,
    signature:        user.UserEmailSettings?.emailSignature || "",
    phoneNumber:      user.UserEmailSettings?.phoneNumber || "",
    invoiceEmailBody: user.UserEmailSettings?.invoiceEmailBody || "",
    estimateEmailBody:user.UserEmailSettings?.estimateEmailBody || "",
  };
}

export async function getCompanySettings(prisma) {
  // 1. Try InvoicingSettings (populated via /invoicing/settings)
  try {
    const inv = await prisma.invoicingSettings.findFirst();
    if (inv) {
      return {
        companyName: inv.companyName || 'Stealth Machine Tools',
        logoUrl:     inv.logoUrl     || null,
        address:     inv.address     || '',
        phone:       inv.phone       || '',
        email:       inv.email       || '',
        website:     inv.website     || '',
      };
    }
  } catch (_) {}

  // 2. Fall back to legacy CompanySettings
  try {
    const legacy = await prisma.companySettings.findFirst();
    if (legacy) return { ...legacy, logoUrl: null };
  } catch (_) {}

  // 3. Hard-coded defaults
  return { companyName: 'Stealth Machine Tools', logoUrl: null, address: '', phone: '', email: '', website: '' };
}

export async function trackEmailOpen(prisma, estimateId) {
  try {
    const emailLog = await prisma.emailLog.findFirst({ where: { estimateId }, orderBy: { sentAt: 'desc' } });
    if (emailLog) {
      await prisma.emailLog.update({ where: { id: emailLog.id }, data: { openedAt: emailLog.openedAt || new Date(), openCount: { increment: 1 } } });
    }
    await prisma.estimate.update({ where: { id: estimateId }, data: { lastViewedAt: new Date(), viewCount: { increment: 1 } } });
  } catch (error) {
    console.error(`[EMAIL] Track estimate open error for ${estimateId}:`, error);
  }
}

export async function trackInvoiceEmailOpen(prisma, invoiceId) {
  try {
    const emailLog = await prisma.emailLog.findFirst({ where: { invoiceId }, orderBy: { sentAt: 'desc' } });
    if (emailLog) {
      await prisma.emailLog.update({ where: { id: emailLog.id }, data: { openedAt: emailLog.openedAt || new Date(), openCount: { increment: 1 } } });
    }
    await prisma.invoice.update({ where: { id: invoiceId }, data: { lastViewedAt: new Date(), viewCount: { increment: 1 } } });
  } catch (error) {
    console.error(`[EMAIL] Track invoice open error for ${invoiceId}:`, error);
  }
}

export default {
  sendEmail, sendEmailWithAttachment, processTemplate, stripHtml,
  getSalesRepEmailSettings, getCompanySettings, trackEmailOpen, trackInvoiceEmailOpen,
};
