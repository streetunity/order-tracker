/**
 * Invoice Email Service
 * Handles sending invoices and estimates with PDF attachments via AWS SES.
 *
 * Templates are rendered directly via JavaScript — no runtime {{}} substitution
 * is used for estimate/invoice emails, which eliminates conditional-block regex
 * bugs and ensures customMessage, URLs, and all data always render correctly.
 *
 * Sender strategy
 * ───────────────
 * FROM     : SES_FROM_EMAIL env var (the verified SES identity)
 * REPLY-TO : sales rep email address (customer replies go to the right inbox)
 */

import emailService from './emailService.js';
import { getInvoiceEmailTemplate, getEstimateEmailTemplate } from './emailTemplates.js';

const VERIFIED_SENDER = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';
const FRONTEND_URL    = process.env.FRONTEND_URL   || 'https://smt-orders.com';

// ── Send Invoice ──────────────────────────────────────────────────────────────

export async function sendInvoice(prisma, { invoiceId, userId, toEmail, ccEmails, customMessage, pdfBuffer }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      items:    true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invoice) throw new Error('Invoice not found');

  const recipientEmail = toEmail || invoice.customer?.email;
  if (!recipientEmail) throw new Error('Customer has no email address');

  const salesRep = await emailService.getSalesRepEmailSettings(prisma, invoice.createdById);
  const company  = await emailService.getCompanySettings(prisma);

  const viewInvoiceUrl = `${FRONTEND_URL}/invoicing/invoices/${invoice.id}`;
  const payNowUrl      = `${FRONTEND_URL}/invoicing/invoices/${invoice.id}/pay`;

  console.log(`[INVOICE EMAIL] URLs: view=${viewInvoiceUrl}`);

  // Render HTML directly — no {{}} substitution needed
  const html = getInvoiceEmailTemplate({
    customerFirstName: invoice.customer.firstName || invoice.customer.contactName || 'Customer',
    invoiceNumber:     invoice.invoiceNumber,
    invoiceDate:       new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString(),
    dueDate:           invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A',
    balanceDue:        (invoice.balanceDue || invoice.total || 0).toFixed(2),
    salesRepName:      salesRep?.name        || 'Sales Team',
    salesRepPhone:     salesRep?.phoneNumber || '',
    signature:         salesRep?.signature   || '',
    companyName:       company.companyName   || 'Stealth Machine Tools',
    customMessage:     customMessage         || '',
    viewInvoiceUrl,
    payNowUrl,
  });

  const subject   = `Invoice ${invoice.invoiceNumber} from ${company.companyName || 'Stealth Machine Tools'}`;
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[INVOICE EMAIL] Sending ${invoice.invoiceNumber} to ${recipientEmail} | reply-to: ${replyTo} | PDF: ${pdfBuffer ? `yes (${pdfBuffer.length} bytes)` : 'no'}`);

  const attachments = [];
  if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
    attachments.push({
      filename:    `Invoice-${invoice.invoiceNumber}.pdf`,
      content:     Buffer.from(pdfBuffer), // fresh copy ensures buffer is not consumed
      contentType: 'application/pdf',
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[INVOICE EMAIL] ${invoice.invoiceNumber}: ${result.success ? 'SUCCESS' : `FAILED — ${result.error}`}`);

  await prisma.emailLog.create({
    data: {
      invoiceId:    invoiceId,
      fromEmail:    fromEmail,
      toEmail:      recipientEmail,
      replyTo:      replyTo,
      subject:      subject,
      status:       result.success ? 'SENT' : 'FAILED',
      sesMessageId: result.messageId || null,
      sentById:     userId,
    },
  });

  if (result.success) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status:     invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
        lastSentAt: new Date(),
        sentCount:  { increment: 1 },
      },
    });
  }

  return result;
}

// ── Send Estimate ─────────────────────────────────────────────────────────────

export async function sendEstimate(prisma, { estimateId, userId, toEmail, ccEmails, customMessage, pdfBuffer }) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      customer: true,
      items:    true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!estimate) throw new Error('Estimate not found');

  const recipientEmail = toEmail || estimate.customer?.email;
  if (!recipientEmail) throw new Error('Customer has no email address');

  const salesRep = await emailService.getSalesRepEmailSettings(prisma, estimate.createdById);
  const company  = await emailService.getCompanySettings(prisma);

  const viewEstimateUrl = `${FRONTEND_URL}/invoicing/estimates/${estimate.id}`;

  console.log(`[ESTIMATE EMAIL] URLs: view=${viewEstimateUrl}`);
  console.log(`[ESTIMATE EMAIL] customMessage: "${customMessage || '(none)'}"`);

  // Render HTML directly — no {{}} substitution needed
  const html = getEstimateEmailTemplate({
    customerFirstName: estimate.customer.firstName || estimate.customer.contactName || 'Customer',
    estimateNumber:    estimate.estimateNumber,
    estimateDate:      new Date(estimate.estimateDate || estimate.createdAt).toLocaleDateString(),
    expiryDate:        estimate.expiryDate ? new Date(estimate.expiryDate).toLocaleDateString() : 'N/A',
    total:             (estimate.total || 0).toFixed(2),
    salesRepName:      salesRep?.name        || 'Sales Team',
    salesRepPhone:     salesRep?.phoneNumber || '',
    signature:         salesRep?.signature   || '',
    companyName:       company.companyName   || 'Stealth Machine Tools',
    customMessage:     customMessage         || '',
    viewEstimateUrl,
  });

  const subject   = `Estimate ${estimate.estimateNumber} from ${company.companyName || 'Stealth Machine Tools'}`;
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[ESTIMATE EMAIL] Sending ${estimate.estimateNumber} to ${recipientEmail} | reply-to: ${replyTo} | PDF: ${pdfBuffer ? `yes (${pdfBuffer.length} bytes)` : 'no'}`);

  const attachments = [];
  if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
    attachments.push({
      filename:    `Estimate-${estimate.estimateNumber}.pdf`,
      content:     Buffer.from(pdfBuffer), // fresh copy ensures buffer is not consumed
      contentType: 'application/pdf',
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[ESTIMATE EMAIL] ${estimate.estimateNumber}: ${result.success ? 'SUCCESS' : `FAILED — ${result.error}`}`);

  await prisma.emailLog.create({
    data: {
      estimateId:   estimateId,
      fromEmail:    fromEmail,
      toEmail:      recipientEmail,
      replyTo:      replyTo,
      subject:      subject,
      status:       result.success ? 'SENT' : 'FAILED',
      sesMessageId: result.messageId || null,
      sentById:     userId,
    },
  });

  if (result.success) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        status:     estimate.status === 'DRAFT' ? 'SENT' : estimate.status,
        lastSentAt: new Date(),
        sentCount:  { increment: 1 },
      },
    });
  }

  return result;
}
