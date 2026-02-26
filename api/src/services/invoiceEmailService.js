/**
 * Invoice Email Service
 * Handles sending invoices and estimates with PDF attachments
 */

const emailService = require("./emailService");
const { getInvoiceEmailTemplate, getEstimateEmailTemplate } = require("./emailTemplates");

class InvoiceEmailService {
  /**
   * Send invoice email with PDF attachment
   */
  async sendInvoice(prisma, { invoiceId, userId, pdfBuffer }) {
    // Get invoice with all relations
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: true,
        createdBy: { include: { UserEmailSettings: true } },
      },
    });

    if (!invoice) throw new Error("Invoice not found");
    if (!invoice.customer?.email) throw new Error("Customer has no email address");

    // Get sales rep settings
    const salesRep = await emailService.getSalesRepEmailSettings(prisma, invoice.createdById);
    const company = await emailService.getCompanySettings(prisma);

    // Build email content
    const templateVariables = {
      customerFirstName: invoice.customer.firstName,
      customerLastName: invoice.customer.lastName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: new Date(invoice.invoiceDate).toLocaleDateString(),
      dueDate: new Date(invoice.dueDate).toLocaleDateString(),
      subtotal: invoice.subtotal.toFixed(2),
      tax: invoice.taxAmount.toFixed(2),
      total: invoice.total.toFixed(2),
      balanceDue: invoice.balanceDue.toFixed(2),
      salesRepName: salesRep.name,
      salesRepPhone: salesRep.phoneNumber,
      signature: salesRep.signature,
      companyName: company.companyName,
      payNowUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/pay/${invoice.id}`,
      viewInvoiceUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/invoices/${invoice.id}/view`,
    };

    const html = emailService.processTemplate(
      getInvoiceEmailTemplate(),
      templateVariables
    );

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
          to: invoice.customer.email,
          from: salesRep.email,
          fromName: salesRep.fromName,
          replyTo: salesRep.email,
          subject: `Invoice ${invoice.invoiceNumber} from ${company.companyName}`,
          html: html,
          attachments: attachments,
        })
      : await emailService.sendEmail({
          to: invoice.customer.email,
          from: salesRep.email,
          fromName: salesRep.fromName,
          replyTo: salesRep.email,
          subject: `Invoice ${invoice.invoiceNumber} from ${company.companyName}`,
          html: html,
        });

    // Log the email
    await prisma.emailLog.create({
      data: {
        invoiceId: invoiceId,
        fromEmail: salesRep.email,
        toEmail: invoice.customer.email,
        replyTo: salesRep.email,
        subject: `Invoice ${invoice.invoiceNumber} from ${company.companyName}`,
        status: result.success ? "SENT" : "FAILED",
        sesMessageId: result.messageId,
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
  async sendEstimate(prisma, { estimateId, userId, pdfBuffer }) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        customer: true,
        items: true,
        createdBy: { include: { UserEmailSettings: true } },
      },
    });

    if (!estimate) throw new Error("Estimate not found");
    if (!estimate.customer?.email) throw new Error("Customer has no email address");

    const salesRep = await emailService.getSalesRepEmailSettings(prisma, estimate.createdById);
    const company = await emailService.getCompanySettings(prisma);

    const templateVariables = {
      customerFirstName: estimate.customer.firstName,
      customerLastName: estimate.customer.lastName,
      estimateNumber: estimate.estimateNumber,
      estimateDate: new Date(estimate.estimateDate).toLocaleDateString(),
      expiryDate: new Date(estimate.expiryDate).toLocaleDateString(),
      subtotal: estimate.subtotal.toFixed(2),
      tax: estimate.taxAmount.toFixed(2),
      total: estimate.total.toFixed(2),
      salesRepName: salesRep.name,
      salesRepPhone: salesRep.phoneNumber,
      signature: salesRep.signature,
      companyName: company.companyName,
      viewEstimateUrl: `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/estimates/${estimate.id}/view`,
    };

    const html = emailService.processTemplate(
      getEstimateEmailTemplate(),
      templateVariables
    );

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
          to: estimate.customer.email,
          from: salesRep.email,
          fromName: salesRep.fromName,
          replyTo: salesRep.email,
          subject: `Estimate ${estimate.estimateNumber} from ${company.companyName}`,
          html: html,
          attachments: attachments,
        })
      : await emailService.sendEmail({
          to: estimate.customer.email,
          from: salesRep.email,
          fromName: salesRep.fromName,
          replyTo: salesRep.email,
          subject: `Estimate ${estimate.estimateNumber} from ${company.companyName}`,
          html: html,
        });

    await prisma.emailLog.create({
      data: {
        estimateId: estimateId,
        fromEmail: salesRep.email,
        toEmail: estimate.customer.email,
        replyTo: salesRep.email,
        subject: `Estimate ${estimate.estimateNumber} from ${company.companyName}`,
        status: result.success ? "SENT" : "FAILED",
        sesMessageId: result.messageId,
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
}

module.exports = new InvoiceEmailService();
