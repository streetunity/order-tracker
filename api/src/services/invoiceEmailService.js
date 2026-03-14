/**
 * Invoice Email Service
 * Handles sending invoices and estimates with PDF attachments via AWS SES
 *
 * Sender strategy
 * ───────────────
 * FROM  : SES_FROM_EMAIL env var (the verified SES identity, e.g. orders@stealthlaser.com)
 * REPLY-TO: sales rep's email address (so customer replies go to the right person)
 *
 * Using the rep's email as FROM only works if that exact address is individually
 * verified in SES.  Using the shared verified sender + reply-to is simpler and
 * always works, while still routing replies to the correct person.
 */

import emailService from "./emailService.js";
import { getInvoiceEmailTemplate, getEstimateEmailTemplate } from "./emailTemplates.js";

// The verified SES sender.  Pulled from env so it's easy to change per environment.
const VERIFIED_SENDER = process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";

/**
 * Send invoice email
 */
export async function sendInvoice(prisma, { invoiceId, userId, toEmail, ccEmails, customMessage, pdfBuffer }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      items: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invoice) throw new Error("Invoice not found");

  const recipientEmail = toEmail || invoice.customer?.email;
  if (!recipientEmail) throw new Error("Customer has no email address");

  const salesRep = await emailService.getSalesRepEmailSettings(prisma, invoice.createdById);
  const company  = await emailService.getCompanySettings(prisma);

  const templateVariables = {
    customerFirstName: invoice.customer.firstName || invoice.customer.contactName || "Customer",
    customerLastName:  invoice.customer.lastName  || "",
    invoiceNumber:     invoice.invoiceNumber,
    invoiceDate:       new Date(invoice.invoiceDate).toLocaleDateString(),
    dueDate:           invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A",
    subtotal:          (invoice.subtotal  || 0).toFixed(2),
    tax:               (invoice.taxAmount || 0).toFixed(2),
    total:             (invoice.total     || 0).toFixed(2),
    balanceDue:        (invoice.balanceDue || 0).toFixed(2),
    salesRepName:      salesRep?.name       || "Sales Team",
    salesRepPhone:     salesRep?.phoneNumber || "",
    signature:         salesRep?.signature   || "",
    companyName:       company.companyName   || "Stealth Machine Tools",
    payNowUrl:         `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/pay/${invoice.id}`,
    viewInvoiceUrl:    `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/invoices/${invoice.id}/view`,
  };

  const html    = emailService.processTemplate(getInvoiceEmailTemplate(), templateVariables);
  const subject = `Invoice ${invoice.invoiceNumber} from ${company.companyName || "Stealth Machine Tools"}`;

  // FROM = verified SES sender; REPLY-TO = sales rep so replies go to them
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[INVOICE EMAIL] Sending ${invoice.invoiceNumber} to ${recipientEmail} from ${fromEmail} (reply-to: ${replyTo})`);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename:    `Invoice-${invoice.invoiceNumber}.pdf`,
      content:     pdfBuffer,
      contentType: "application/pdf",
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[INVOICE EMAIL] Result for ${invoice.invoiceNumber}:`, result.success ? 'SUCCESS' : `FAILED - ${result.error}`);

  // Log the email attempt regardless of success/failure
  await prisma.emailLog.create({
    data: {
      invoiceId:    invoiceId,
      fromEmail:    fromEmail,
      toEmail:      recipientEmail,
      replyTo:      replyTo,
      subject:      subject,
      status:       result.success ? "SENT" : "FAILED",
      sesMessageId: result.messageId || null,
      sentById:     userId,
    },
  });

  if (result.success) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status:     invoice.status === "DRAFT" ? "SENT" : invoice.status,
        lastSentAt: new Date(),
        sentCount:  { increment: 1 },
      },
    });
  }

  return result;
}

/**
 * Send estimate email
 */
export async function sendEstimate(prisma, { estimateId, userId, toEmail, ccEmails, customMessage, pdfBuffer }) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      customer: true,
      items: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!estimate) throw new Error("Estimate not found");

  const recipientEmail = toEmail || estimate.customer?.email;
  if (!recipientEmail) throw new Error("Customer has no email address");

  const salesRep = await emailService.getSalesRepEmailSettings(prisma, estimate.createdById);
  const company  = await emailService.getCompanySettings(prisma);

  const templateVariables = {
    customerFirstName: estimate.customer.firstName || estimate.customer.contactName || "Customer",
    customerLastName:  estimate.customer.lastName  || "",
    estimateNumber:    estimate.estimateNumber,
    estimateDate:      new Date(estimate.estimateDate).toLocaleDateString(),
    expiryDate:        estimate.expiryDate ? new Date(estimate.expiryDate).toLocaleDateString() : "N/A",
    subtotal:          (estimate.subtotal  || 0).toFixed(2),
    tax:               (estimate.taxAmount || 0).toFixed(2),
    total:             (estimate.total     || 0).toFixed(2),
    salesRepName:      salesRep?.name       || "Sales Team",
    salesRepPhone:     salesRep?.phoneNumber || "",
    signature:         salesRep?.signature   || "",
    companyName:       company.companyName   || "Stealth Machine Tools",
    viewEstimateUrl:   `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/estimates/${estimate.id}/view`,
  };

  const html    = emailService.processTemplate(getEstimateEmailTemplate(), templateVariables);
  const subject = `Estimate ${estimate.estimateNumber} from ${company.companyName || "Stealth Machine Tools"}`;

  // FROM = verified SES sender; REPLY-TO = sales rep so replies go to them
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[ESTIMATE EMAIL] Sending ${estimate.estimateNumber} to ${recipientEmail} from ${fromEmail} (reply-to: ${replyTo})`);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename:    `Estimate-${estimate.estimateNumber}.pdf`,
      content:     pdfBuffer,
      contentType: "application/pdf",
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[ESTIMATE EMAIL] Result for ${estimate.estimateNumber}:`, result.success ? 'SUCCESS' : `FAILED - ${result.error}`);

  // Log the email attempt regardless of success/failure
  await prisma.emailLog.create({
    data: {
      estimateId:   estimateId,
      fromEmail:    fromEmail,
      toEmail:      recipientEmail,
      replyTo:      replyTo,
      subject:      subject,
      status:       result.success ? "SENT" : "FAILED",
      sesMessageId: result.messageId || null,
      sentById:     userId,
    },
  });

  if (result.success) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        status:     estimate.status === "DRAFT" ? "SENT" : estimate.status,
        lastSentAt: new Date(),
        sentCount:  { increment: 1 },
      },
    });
  }

  return result;
}
