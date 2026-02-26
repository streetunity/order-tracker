/**
 * Invoice Email Service
 * Handles sending invoices and estimates with PDF attachments via AWS SES
 */

import emailService from "./emailService.js";
import { getInvoiceEmailTemplate, getEstimateEmailTemplate } from "./emailTemplates.js";

/**
 * Send invoice email with PDF attachment
 */
export async function sendInvoice(prisma, { invoiceId, userId, toEmail, ccEmails, customMessage, pdfBuffer }) {
  // Get invoice with all relations
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

  // Get sales rep settings
  const salesRep = await emailService.getSalesRepEmailSettings(prisma, invoice.createdById);
  const company = await emailService.getCompanySettings(prisma);

  // Build email content
  const templateVariables = {
    customerFirstName: invoice.customer.firstName || invoice.customer.contactName || "Customer",
    customerLastName: invoice.customer.lastName || "",
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: new Date(invoice.invoiceDate).toLocaleDateString(),
    dueDate: new Date(invoice.dueDate).toLocaleDateString(),
    subtotal: (invoice.subtotal || 0).toFixed(2),
    tax: (invoice.taxAmount || 0).toFixed(2),
    total: (invoice.total || 0).toFixed(2),
    balanceDue: (invoice.balanceDue || 0).toFixed(2),
    salesRepName: salesRep?.name || "Sales Team",
    salesRepPhone: salesRep?.phoneNumber || "",
    signature: salesRep?.signature || "",
    companyName: company.companyName || "Stealth Machine Tools",
    payNowUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/pay/${invoice.id}`,
    viewInvoiceUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/invoices/${invoice.id}/view`,
  };

  const html = emailService.processTemplate(
    getInvoiceEmailTemplate(),
    templateVariables
  );

  // Determine sender - use sales rep email if available
  const fromEmail = salesRep?.email || process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";
  const fromName = salesRep?.fromName || salesRep?.name || company.companyName;
  const subject = `Invoice ${invoice.invoiceNumber} from ${company.companyName || "Stealth Machine Tools"}`;

  // Build attachments array
  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `Invoice-${invoice.invoiceNumber}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    });
  }

  // Send email
  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({
        to: recipientEmail,
        from: fromEmail,
        fromName: fromName,
        replyTo: salesRep?.email || fromEmail,
        subject: subject,
        html: html,
        attachments: attachments,
      })
    : await emailService.sendEmail({
        to: recipientEmail,
        from: fromEmail,
        fromName: fromName,
        replyTo: salesRep?.email || fromEmail,
        subject: subject,
        html: html,
      });

  // Log the email
  await prisma.emailLog.create({
    data: {
      invoiceId: invoiceId,
      fromEmail: fromEmail,
      toEmail: recipientEmail,
      replyTo: salesRep?.email || fromEmail,
      subject: subject,
      status: result.success ? "SENT" : "FAILED",
      sesMessageId: result.messageId || null,
      sentById: userId,
    },
  });

  // Update invoice status
  if (result.success) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: invoice.status === "DRAFT" ? "SENT" : invoice.status,
        lastSentAt: new Date(),
        sentCount: { increment: 1 },
      },
    });
  }

  return result;
}

/**
 * Send estimate email with PDF attachment
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
  const company = await emailService.getCompanySettings(prisma);

  const templateVariables = {
    customerFirstName: estimate.customer.firstName || estimate.customer.contactName || "Customer",
    customerLastName: estimate.customer.lastName || "",
    estimateNumber: estimate.estimateNumber,
    estimateDate: new Date(estimate.estimateDate).toLocaleDateString(),
    expiryDate: estimate.expiryDate ? new Date(estimate.expiryDate).toLocaleDateString() : "N/A",
    subtotal: (estimate.subtotal || 0).toFixed(2),
    tax: (estimate.taxAmount || 0).toFixed(2),
    total: (estimate.total || 0).toFixed(2),
    salesRepName: salesRep?.name || "Sales Team",
    salesRepPhone: salesRep?.phoneNumber || "",
    signature: salesRep?.signature || "",
    companyName: company.companyName || "Stealth Machine Tools",
    viewEstimateUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/estimates/${estimate.id}/view`,
  };

  const html = emailService.processTemplate(
    getEstimateEmailTemplate(),
    templateVariables
  );

  const fromEmail = salesRep?.email || process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";
  const fromName = salesRep?.fromName || salesRep?.name || company.companyName;
  const subject = `Estimate ${estimate.estimateNumber} from ${company.companyName || "Stealth Machine Tools"}`;

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `Estimate-${estimate.estimateNumber}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({
        to: recipientEmail,
        from: fromEmail,
        fromName: fromName,
        replyTo: salesRep?.email || fromEmail,
        subject: subject,
        html: html,
        attachments: attachments,
      })
    : await emailService.sendEmail({
        to: recipientEmail,
        from: fromEmail,
        fromName: fromName,
        replyTo: salesRep?.email || fromEmail,
        subject: subject,
        html: html,
      });

  await prisma.emailLog.create({
    data: {
      estimateId: estimateId,
      fromEmail: fromEmail,
      toEmail: recipientEmail,
      replyTo: salesRep?.email || fromEmail,
      subject: subject,
      status: result.success ? "SENT" : "FAILED",
      sesMessageId: result.messageId || null,
      sentById: userId,
    },
  });

  if (result.success) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        status: estimate.status === "DRAFT" ? "SENT" : estimate.status,
        lastSentAt: new Date(),
        sentCount: { increment: 1 },
      },
    });
  }

  return result;
}
