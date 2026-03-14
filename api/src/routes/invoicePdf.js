import express from 'express';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';
import { generateInvoicePDF, uploadPDFToS3, getPDFSignedUrl } from '../services/pdfService.js';
import { sendInvoice } from '../services/invoiceEmailService.js';

export function createInvoicePdfRouter(prisma) {
  const router = express.Router();

  // POST /invoices/:id/generate-pdf
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

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      // Use InvoicingSettings for consistent company info
      const companySettings = await prisma.invoicingSettings.findFirst() || { companyName: 'Stealth Machine Tools' };

      const pdfBuffer = await generateInvoicePDF(invoice, companySettings);
      const s3Key = `invoices/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      const { s3Url } = await uploadPDFToS3(pdfBuffer, s3Key);

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfS3Key: s3Key, pdfUrl: s3Url, pdfGeneratedAt: new Date() },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      const pdfUrl = await getPDFSignedUrl(s3Key, `${invoice.invoiceNumber}.pdf`);
      res.json({ invoice: updatedInvoice, pdfUrl });
    } catch (error) {
      console.error('POST /invoices/:id/generate-pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id/pdf
  router.get('/:id/pdf', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (!invoice.pdfS3Key) return res.status(404).json({ error: 'PDF not generated yet' });
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      const pdfUrl = await getPDFSignedUrl(invoice.pdfS3Key, `${invoice.invoiceNumber}.pdf`);
      res.json({ pdfUrl });
    } catch (error) {
      console.error('GET /invoices/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /invoices/:id/send  ──────────────────────────────────────────────────
  // Send invoice via email (AWS SES).  Returns 500 if SES actually fails so
  // the frontend can surface the real error instead of silently doing nothing.
  router.post('/:id/send', requireInvoicingPermission('SEND_INVOICE'), async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      const { toEmail, ccEmails, customMessage, regeneratePDF } = req.body;

      const recipientEmail = toEmail || invoice.customer?.email;
      if (!recipientEmail)
        return res.status(400).json({ error: 'No recipient email provided. The customer may not have an email address on file.' });

      // Generate/regenerate PDF if needed
      if (!invoice.pdfS3Key || regeneratePDF) {
        try {
          const companySettings = await prisma.invoicingSettings.findFirst() || { companyName: 'Stealth Machine Tools' };
          const fullInvoice = await prisma.invoice.findUnique({
            where: { id: invoice.id },
            include: {
              customer: true,
              items: { orderBy: { sortOrder: 'asc' } },
              payments: { orderBy: { createdAt: 'desc' } },
              paymentSchedule: { orderBy: { sortOrder: 'asc' } },
              createdBy: { select: { id: true, name: true, email: true } }
            }
          });
          const pdfBuffer = await generateInvoicePDF(fullInvoice, companySettings);
          const s3Key = `invoices/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
          await uploadPDFToS3(pdfBuffer, s3Key);
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { pdfS3Key: s3Key, pdfGeneratedAt: new Date() }
          });
        } catch (pdfError) {
          console.error('[INVOICE SEND] PDF generation error (continuing without PDF):', pdfError.message);
        }
      }

      // Send the email
      const result = await sendInvoice(prisma, {
        invoiceId:     invoice.id,
        userId:        req.user.id,
        toEmail:       recipientEmail,
        ccEmails:      ccEmails || [],
        customMessage
      });

      // ── CRITICAL FIX: actually check whether SES accepted the email ────────
      if (!result.success) {
        console.error(`[INVOICE SEND] SES rejected email for ${invoice.invoiceNumber}:`, result.error);
        return res.status(500).json({
          error: `Email could not be sent: ${result.error || 'Unknown SES error'}. Check server logs for details.`
        });
      }

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          paymentSchedule: { orderBy: { sortOrder: 'asc' } }
        }
      });

      res.json({
        message:     `Invoice sent to ${recipientEmail}`,
        invoice:     updatedInvoice,
        emailResult: result
      });
    } catch (error) {
      console.error('POST /invoices/:id/send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /invoices/:id/email-history
  router.get('/:id/email-history', async (req, res) => {
    try {
      const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (req.user.role === 'AGENT' && invoice.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      const emailLogs = await prisma.emailLog.findMany({
        where: { invoiceId: req.params.id },
        include: { sentBy: { select: { id: true, name: true } } },
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
