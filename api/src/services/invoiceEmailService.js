/**
 * Invoice Email Service
 * Handles sending invoices and estimates with PDF attachments via AWS SES.
 *
 * Templates are rendered directly via JavaScript — no runtime {{}} substitution
 * is used for estimate/invoice emails.
 *
 * FROM     : SES_FROM_EMAIL env var (the verified SES identity)
 * REPLY-TO : sales rep email address
 *
 * Customer-facing URLs (no login required):
 * Estimates : /estimates/view/:id
 * Invoices  : /invoices/view/:id
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

  const viewInvoiceUrl = `${FRONTEND_URL}/invoices/view/${invoice.id}`;
  const payNowUrl      = `${FRONTEND_URL}/invoices/view/${invoice.id}#pay`;

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
    logoUrl:           company.logoUrl       || null,
    customMessage:     customMessage         || '',
    viewInvoiceUrl,
    payNowUrl,
  });

  const subject   = `Invoice ${invoice.invoiceNumber} from ${company.companyName || 'Stealth Machine Tools'}`;
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[INVOICE EMAIL] ${invoice.invoiceNumber} → ${recipientEmail} | logo=${company.logoUrl || 'none'} | PDF=${pdfBuffer ? `${pdfBuffer.length}b` : 'none'}`);

  const attachments = [];
  if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
    attachments.push({ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: Buffer.from(pdfBuffer), contentType: 'application/pdf' });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[INVOICE EMAIL] ${invoice.invoiceNumber}: ${result.success ? 'SUCCESS' : `FAILED — ${result.error}`}`);

  await prisma.emailLog.create({
    data: { invoiceId, fromEmail, toEmail: recipientEmail, replyTo, subject, status: result.success ? 'SENT' : 'FAILED', sesMessageId: result.messageId || null, sentById: userId },
  });

  if (result.success) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status, lastSentAt: new Date(), sentCount: { increment: 1 } },
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

  const viewEstimateUrl = `${FRONTEND_URL}/estimates/view/${estimate.id}`;

  console.log(`[ESTIMATE EMAIL] ${estimate.estimateNumber} → ${recipientEmail}`);
  console.log(`[ESTIMATE EMAIL] url=${viewEstimateUrl} | logo=${company.logoUrl || 'none'} | msg="${customMessage || '(none)'}" | PDF=${pdfBuffer ? `${pdfBuffer.length}b` : 'none'}`);

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
    logoUrl:           company.logoUrl       || null,
    customMessage:     customMessage         || '',
    viewEstimateUrl,
  });

  const subject   = `Estimate ${estimate.estimateNumber} from ${company.companyName || 'Stealth Machine Tools'}`;
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  const attachments = [];
  if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
    attachments.push({ filename: `Estimate-${estimate.estimateNumber}.pdf`, content: Buffer.from(pdfBuffer), contentType: 'application/pdf' });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[ESTIMATE EMAIL] ${estimate.estimateNumber}: ${result.success ? 'SUCCESS' : `FAILED — ${result.error}`}`);

  await prisma.emailLog.create({
    data: { estimateId, fromEmail, toEmail: recipientEmail, replyTo, subject, status: result.success ? 'SENT' : 'FAILED', sesMessageId: result.messageId || null, sentById: userId },
  });

  if (result.success) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { status: estimate.status === 'DRAFT' ? 'SENT' : estimate.status, lastSentAt: new Date(), sentCount: { increment: 1 } },
    });
  }

  return result;
}
