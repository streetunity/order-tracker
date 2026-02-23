import express from 'express';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';
import { generateInvoicePDF, uploadPDFToS3, getPDFSignedUrl } from '../services/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';

export function createInvoicePdfRouter(prisma) {
  const router = express.Router();

  // ============================================
  // PDF GENERATION
  // ============================================

  // POST /invoices/:id/generate-pdf - Generate invoice PDF
  router.post('/:id/generate-pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get company settings
      const companySettings = await prisma.companySettings.findFirst() || {
        companyName: 'Stealth Machine Tools',
        companyEmail: 'sales@stealthmachinetools.com',
        companyPhone: '(555) 123-4567',
        companyAddress: '123 Industrial Way',
        companyCity: 'Manufacturing City',
        companyState: 'TX',
        companyZip: '75001'
      };

      // Generate PDF
      const pdfBuffer = await generateInvoicePDF(invoice, companySettings);

      // Upload to S3
      const s3Key = `invoices/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      const { s3Url } = await uploadPDFToS3(pdfBuffer, s3Key);

      // Update invoice with PDF info
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          pdfS3Key: s3Key,
          pdfUrl: s3Url,
          pdfGeneratedAt: new Date()
        },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      // Get signed URL for download
      const pdfUrl = await getPDFSignedUrl(s3Key, `${invoice.invoiceNumber}.pdf`);

      res.json({ invoice: updatedInvoice, pdfUrl });
    } catch (error) {
      console.error('POST /invoices/:id/generate-pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id/pdf - Get PDF download URL
  router.get('/:id/pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (!invoice.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not generated yet' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const pdfUrl = await getPDFSignedUrl(invoice.pdfS3Key, `${invoice.invoiceNumber}.pdf`);

      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /invoices/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // EMAIL SENDING
  // ============================================

  // POST /invoices/:id/send - Send invoice via email
  router.post('/:id/send', requireInvoicingPermission('SEND_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const { toEmail, ccEmails, customMessage, regeneratePDF } = req.body;

      const recipientEmail = toEmail || invoice.customer?.email;
      if (!recipientEmail) {
        return res.status(400).json({ error: 'No recipient email provided' });
      }

      // Get company settings
      const companySettings = await prisma.companySettings.findFirst() || {
        companyName: 'Stealth Machine Tools',
        companyEmail: 'sales@stealthmachinetools.com',
        companyPhone: '(555) 123-4567'
      };

      // Generate PDF if needed
      let pdfS3Key = invoice.pdfS3Key;
      if (!pdfS3Key || regeneratePDF) {
        const pdfBuffer = await generateInvoicePDF(invoice, companySettings);
        const s3Key = `invoices/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
        await uploadPDFToS3(pdfBuffer, s3Key);
        pdfS3Key = s3Key;

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            pdfS3Key: s3Key,
            pdfGeneratedAt: new Date()
          }
        });
      }

      // Get user's email settings
      const userEmailSettings = await prisma.userEmailSettings.findUnique({
        where: { userId: req.user.id }
      });

      // Send email
      await sendInvoiceEmail(invoice, {
        toEmail: recipientEmail,
        ccEmails: ccEmails || [],
        customMessage,
        senderName: userEmailSettings?.senderName || req.user.name || companySettings.companyName,
        senderEmail: userEmailSettings?.senderEmail || companySettings.companyEmail,
        replyTo: userEmailSettings?.replyTo || companySettings.companyEmail,
        companySettings,
        pdfS3Key,
        prisma
      });

      // Log the email
      await prisma.emailLog.create({
        data: {
          invoiceId: invoice.id,
          toEmail: recipientEmail,
          ccEmails: ccEmails || [],
          subject: `Invoice ${invoice.invoiceNumber} from ${companySettings.companyName}`,
          sentById: req.user.id,
          sentAt: new Date(),
          status: 'SENT'
        }
      });

      // Update invoice status and tracking
      const updateData = {
        lastSentAt: new Date(),
        sentCount: invoice.sentCount + 1
      };

      if (invoice.status === 'DRAFT') {
        updateData.status = 'SENT';
      }

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: updateData,
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json({ message: 'Invoice sent successfully', invoice: updatedInvoice });
    } catch (error) {
      console.error('POST /invoices/:id/send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id/email-history - Get email history for invoice
  router.get('/:id/email-history', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const emailLogs = await prisma.emailLog.findMany({
        where: { invoiceId: req.params.id },
        include: {
          sentBy: { select: { id: true, name: true } }
        },
        orderBy: { sentAt: 'desc' }
      });

      res.json(emailLogs);
    } catch (error) {
      console.error('GET /invoices/:id/email-history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createInvoicePdfRouter;
