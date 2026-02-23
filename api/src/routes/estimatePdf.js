import express from 'express';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';
import { generateEstimatePDF, uploadPDFToS3, getPDFSignedUrl } from '../services/pdfService.js';
import { sendEstimateEmail } from '../services/emailService.js';

export function createEstimatePdfRouter(prisma) {
  const router = express.Router();

  // POST /estimates/:id/generate-pdf - Generate PDF for estimate
  router.post('/:id/generate-pdf', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (estimate.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Get company settings
      const companySettings = await prisma.invoicingSettings.findFirst();

      // Generate PDF
      const pdfBuffer = await generateEstimatePDF(estimate, companySettings);

      // Upload to S3
      const s3Key = `estimates/${estimate.id}/${estimate.estimateNumber}.pdf`;
      await uploadPDFToS3(pdfBuffer, s3Key);

      // Update estimate with PDF reference
      const updated = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          pdfS3Key: s3Key,
          pdfGeneratedAt: new Date()
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      // Return signed URL for download
      const downloadUrl = await getPDFSignedUrl(s3Key, `${estimate.estimateNumber}.pdf`);

      res.json({
        estimate: updated,
        pdfUrl: downloadUrl,
        message: 'PDF generated successfully'
      });
    } catch (error) {
      console.error('POST /estimates/:id/generate-pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id/pdf - Download PDF
  router.get('/:id/pdf', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (estimate.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      if (!estimate.pdfS3Key) {
        return res.status(404).json({ error: 'PDF not generated yet. Call generate-pdf first.' });
      }

      // Get signed download URL
      const downloadUrl = await getPDFSignedUrl(estimate.pdfS3Key, `${estimate.estimateNumber}.pdf`);

      res.json({ pdfUrl: downloadUrl });
    } catch (error) {
      console.error('GET /estimates/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/send - Send estimate via email
  router.post('/:id/send', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (estimate.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        toEmail,
        ccEmails = [],
        customMessage = '',
        attachProductPDFs = true,
        regeneratePDF = false
      } = req.body;

      // Use customer email if toEmail not specified
      const recipientEmail = toEmail || estimate.customer?.email;
      if (!recipientEmail) {
        return res.status(400).json({ error: 'Recipient email is required' });
      }

      // Get company settings
      const companySettings = await prisma.invoicingSettings.findFirst();

      // Generate PDF if not exists or if regenerate requested
      if (!estimate.pdfS3Key || regeneratePDF) {
        const pdfBuffer = await generateEstimatePDF(estimate, companySettings);
        const s3Key = `estimates/${estimate.id}/${estimate.estimateNumber}.pdf`;
        await uploadPDFToS3(pdfBuffer, s3Key);

        await prisma.estimate.update({
          where: { id: estimate.id },
          data: {
            pdfS3Key: s3Key,
            pdfGeneratedAt: new Date()
          }
        });

        // Reload estimate with updated pdfS3Key
        estimate.pdfS3Key = s3Key;
      }

      // Get user email settings
      const userEmailSettings = await prisma.userEmailSettings.findUnique({
        where: { userId: req.user.id }
      });

      // Send email
      const emailResult = await sendEstimateEmail(estimate, {
        toEmail: recipientEmail,
        ccEmails,
        customMessage,
        senderName: userEmailSettings?.fromName || req.user.name || 'Sales Team',
        senderEmail: req.user.email,
        replyTo: req.user.email,
        companySettings,
        attachProductPDFs,
        prisma
      });

      // Log email
      await prisma.emailLog.create({
        data: {
          estimateId: estimate.id,
          fromEmail: req.user.email,
          toEmail: recipientEmail,
          replyTo: req.user.email,
          subject: `Estimate ${estimate.estimateNumber} from ${companySettings?.companyName || 'Stealth Machine Tools'}`,
          sesMessageId: emailResult.messageId,
          status: 'SENT',
          sentById: req.user.id
        }
      });

      // Update estimate status and counts
      const updatedEstimate = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          status: estimate.status === 'DRAFT' ? 'SENT' : estimate.status,
          lastSentAt: new Date(),
          sentCount: { increment: 1 }
        },
        include: {
          customer: true,
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.json({
        estimate: updatedEstimate,
        emailResult: {
          messageId: emailResult.messageId,
          sentTo: recipientEmail,
          ccEmails
        },
        message: 'Estimate sent successfully'
      });
    } catch (error) {
      console.error('POST /estimates/:id/send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id/email-history - Get email history for estimate
  router.get('/:id/email-history', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (estimate.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const emailLogs = await prisma.emailLog.findMany({
        where: { estimateId: estimate.id },
        include: {
          sentBy: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { sentAt: 'desc' }
      });

      res.json(emailLogs);
    } catch (error) {
      console.error('GET /estimates/:id/email-history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createEstimatePdfRouter;
