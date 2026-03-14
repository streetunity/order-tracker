/**
 * Invoice Email Service
 * Handles sending invoices and estimates with PDF attachments via AWS SES
 *
 * Sender strategy
 * ───────────────
 * FROM     : SES_FROM_EMAIL env var (the verified SES identity)
 * REPLY-TO : sales rep's email address (customer replies land in the right inbox)
 *
 * Template variable notes
 * ───────────────────────
 * {{#if foo}}...{{/if}} blocks are processed by processTemplateConditionals() before
 * the standard {{foo}} replacement so conditional sections render correctly.
 */

import emailService from './emailService.js';
import { getInvoiceEmailTemplate, getEstimateEmailTemplate } from './emailTemplates.js';

const VERIFIED_SENDER = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';

/**
 * Process {{#if variable}}...{{/if}} blocks in a template.
 * Removes the block if the variable is falsy; renders the inner content if truthy.
 */
function processTemplateConditionals(template, variables) {
  return template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
    return variables[key] ? inner : '';
  });
}

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

  if (!invoice) throw new Error('Invoice not found');

  const recipientEmail = toEmail || invoice.customer?.email;
  if (!recipientEmail) throw new Error('Customer has no email address');

  const salesRep = await emailService.getSalesRepEmailSettings(prisma, invoice.createdById);
  const company  = await emailService.getCompanySettings(prisma);

  const templateVariables = {
    customerFirstName: invoice.customer.firstName || invoice.customer.contactName || 'Customer',
    customerLastName:  invoice.customer.lastName  || '',
    invoiceNumber:     invoice.invoiceNumber,
    invoiceDate:       new Date(invoice.invoiceDate).toLocaleDateString(),
    dueDate:           invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A',
    subtotal:          (invoice.subtotal  || 0).toFixed(2),
    tax:               (invoice.taxAmount || 0).toFixed(2),
    total:             (invoice.total     || 0).toFixed(2),
    balanceDue:        (invoice.balanceDue || 0).toFixed(2),
    salesRepName:      salesRep?.name       || 'Sales Team',
    salesRepPhone:     salesRep?.phoneNumber || '',
    signature:         salesRep?.signature   || '',
    companyName:       company.companyName   || 'Stealth Machine Tools',
    customMessage:     customMessage         || '',
    // Correct frontend URLs — include /invoicing/ prefix
    payNowUrl:      `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/invoicing/invoices/${invoice.id}/pay`,
    viewInvoiceUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/invoicing/invoices/${invoice.id}`,
  };

  const rawTemplate = getInvoiceEmailTemplate();
  const withConditionals = processTemplateConditionals(rawTemplate, templateVariables);
  const html = emailService.processTemplate(withConditionals, templateVariables);

  const subject   = `Invoice ${invoice.invoiceNumber} from ${company.companyName || 'Stealth Machine Tools'}`;
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[INVOICE EMAIL] Sending ${invoice.invoiceNumber} to ${recipientEmail} (reply-to: ${replyTo})`);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename:    `Invoice-${invoice.invoiceNumber}.pdf`,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[INVOICE EMAIL] Result for ${invoice.invoiceNumber}:`, result.success ? 'SUCCESS' : `FAILED — ${result.error}`);

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

  if (!estimate) throw new Error('Estimate not found');

  const recipientEmail = toEmail || estimate.customer?.email;
  if (!recipientEmail) throw new Error('Customer has no email address');

  const salesRep = await emailService.getSalesRepEmailSettings(prisma, estimate.createdById);
  const company  = await emailService.getCompanySettings(prisma);

  const templateVariables = {
    customerFirstName: estimate.customer.firstName || estimate.customer.contactName || 'Customer',
    customerLastName:  estimate.customer.lastName  || '',
    estimateNumber:    estimate.estimateNumber,
    estimateDate:      new Date(estimate.estimateDate).toLocaleDateString(),
    expiryDate:        estimate.expiryDate ? new Date(estimate.expiryDate).toLocaleDateString() : 'N/A',
    subtotal:          (estimate.subtotal  || 0).toFixed(2),
    tax:               (estimate.taxAmount || 0).toFixed(2),
    total:             (estimate.total     || 0).toFixed(2),
    salesRepName:      salesRep?.name       || 'Sales Team',
    salesRepPhone:     salesRep?.phoneNumber || '',
    signature:         salesRep?.signature   || '',
    companyName:       company.companyName   || 'Stealth Machine Tools',
    customMessage:     customMessage         || '',
    // Correct frontend URL — /invoicing/estimates/:id (no /view suffix, no missing /invoicing/ prefix)
    viewEstimateUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/invoicing/estimates/${estimate.id}`,
  };

  const rawTemplate = getEstimateEmailTemplate();
  const withConditionals = processTemplateConditionals(rawTemplate, templateVariables);
  const html = emailService.processTemplate(withConditionals, templateVariables);

  const subject   = `Estimate ${estimate.estimateNumber} from ${company.companyName || 'Stealth Machine Tools'}`;
  const fromEmail = VERIFIED_SENDER;
  const fromName  = salesRep?.fromName || salesRep?.name || company.companyName;
  const replyTo   = salesRep?.email || VERIFIED_SENDER;

  console.log(`[ESTIMATE EMAIL] Sending ${estimate.estimateNumber} to ${recipientEmail} (reply-to: ${replyTo})`);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename:    `Estimate-${estimate.estimateNumber}.pdf`,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const result = attachments.length > 0
    ? await emailService.sendEmailWithAttachment({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html, attachments })
    : await emailService.sendEmail({ to: recipientEmail, from: fromEmail, fromName, replyTo, subject, html });

  console.log(`[ESTIMATE EMAIL] Result for ${estimate.estimateNumber}:`, result.success ? 'SUCCESS' : `FAILED — ${result.error}`);

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
