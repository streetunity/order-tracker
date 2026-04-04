import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';
import { generateEstimatePDF, uploadPDFToS3, getPDFSignedUrl } from '../services/pdfService.js';
import { sendEstimate } from '../services/invoiceEmailService.js';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_DOCUMENTS_BUCKET;

/**
 * Download a single S3 object into a Buffer.
 * Returns null on any error so we never block the email send.
 */
async function downloadFromS3(key) {
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const chunk of resp.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err) {
    console.error(`[ESTIMATE SEND] S3 download failed for ${key}:`, err.message);
    return null;
  }
}

export function createEstimatePdfRouter(prisma) {
  const router = express.Router();

  // POST /estimates/:id/generate-pdf
  router.post('/:id/generate-pdf', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          items: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
      if (req.user.role === 'AGENT' && estimate.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      const companySettings = await prisma.invoicingSettings.findFirst();
      const pdfBuffer = await generateEstimatePDF(estimate, companySettings);
      const s3Key = `estimates/${estimate.id}/${estimate.estimateNumber}.pdf`;
      await uploadPDFToS3(pdfBuffer, s3Key);

      const updated = await prisma.estimate.update({
        where: { id: estimate.id },
        data: { pdfS3Key: s3Key, pdfGeneratedAt: new Date() },
        include: { customer: true, items: { orderBy: { sortOrder: 'asc' } } }
      });

      const downloadUrl = await getPDFSignedUrl(s3Key, `${estimate.estimateNumber}.pdf`);
      res.json({ estimate: updated, pdfUrl: downloadUrl, message: 'PDF generated successfully' });
    } catch (error) {
      console.error('POST /estimates/:id/generate-pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id/pdf
  router.get('/:id/pdf', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id } });
      if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
      if (req.user.role === 'AGENT' && estimate.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });
      if (!estimate.pdfS3Key)
        return res.status(404).json({ error: 'PDF not generated yet. Call generate-pdf first.' });

      const downloadUrl = await getPDFSignedUrl(estimate.pdfS3Key, `${estimate.estimateNumber}.pdf`);
      res.json({ pdfUrl: downloadUrl });
    } catch (error) {
      console.error('GET /estimates/:id/pdf error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /estimates/:id/send
  router.post('/:id/send', requireInvoicingPermission('EDIT_ESTIMATE'), async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
          createdBy: { select: { id: true, name: true, email: true } }
        }
      });

      if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
      if (req.user.role === 'AGENT' && estimate.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      const { toEmail, ccEmails = [], customMessage = '', regeneratePDF = false } = req.body;

      const recipientEmail = toEmail || estimate.customer?.email;
      if (!recipientEmail)
        return res.status(400).json({ error: 'Recipient email is required. The customer may not have an email address on file.' });

      // ── 1. Generate a fresh PDF ───────────────────────────────────────────────
      let pdfBuffer = null;
      try {
        const companySettings = await prisma.invoicingSettings.findFirst();
        const fullEstimate = await prisma.estimate.findUnique({
          where: { id: estimate.id },
          include: {
            customer: true,
            items: { orderBy: { sortOrder: 'asc' } },
            createdBy: { select: { id: true, name: true, email: true } }
          }
        });
        pdfBuffer = await generateEstimatePDF(fullEstimate, companySettings);
        const s3Key = `estimates/${estimate.id}/${estimate.estimateNumber}.pdf`;
        await uploadPDFToS3(pdfBuffer, s3Key);
        await prisma.estimate.update({
          where: { id: estimate.id },
          data: { pdfS3Key: s3Key, pdfGeneratedAt: new Date() }
        });
        console.log(`[ESTIMATE SEND] PDF generated for ${estimate.estimateNumber}`);
      } catch (pdfError) {
        console.error('[ESTIMATE SEND] PDF generation failed (email will send without it):', pdfError.message);
        pdfBuffer = null;
      }

      // ── 2. Collect product attachments flagged for estimates ──────────────────
      //
      // Walk every item on the estimate, collect its productId, then fetch all
      // ProductAttachment rows with includeInEstimate = true for those products.
      // Download each file from S3 and bundle them alongside the PDF.
      //
      // Failures are logged but never block the send — the customer always gets
      // the email even if an individual attachment can't be retrieved.
      const extraAttachments = [];

      try {
        const estimateWithItems = await prisma.estimate.findUnique({
          where: { id: estimate.id },
          select: { items: { select: { productId: true, name: true } } }
        });

        const productIds = [
          ...new Set(
            (estimateWithItems?.items || [])
              .map(i => i.productId)
              .filter(Boolean)
          )
        ];

        if (productIds.length > 0) {
          const attachmentRecords = await prisma.productAttachment.findMany({
            where: {
              productId: { in: productIds },
              includeInEstimate: true
            },
            orderBy: { sortOrder: 'asc' }
          });

          console.log(`[ESTIMATE SEND] ${attachmentRecords.length} product attachment(s) flagged for inclusion`);

          for (const att of attachmentRecords) {
            const buffer = await downloadFromS3(att.s3Key);
            if (buffer) {
              extraAttachments.push({
                filename:    att.filename,
                content:     buffer,
                contentType: att.mimeType
              });
              console.log(`[ESTIMATE SEND]   + ${att.filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
            }
          }
        }
      } catch (attachErr) {
        console.error('[ESTIMATE SEND] Product attachment collection failed (email will send without them):', attachErr.message);
      }

      // ── 3. Send the email ─────────────────────────────────────────────────────
      const result = await sendEstimate(prisma, {
        estimateId:       estimate.id,
        userId:           req.user.id,
        toEmail:          recipientEmail,
        ccEmails,
        customMessage,
        pdfBuffer,
        extraAttachments,   // product files
      });

      if (!result.success) {
        console.error(`[ESTIMATE SEND] SES rejected email for ${estimate.estimateNumber}:`, result.error);
        return res.status(500).json({
          error: `Email could not be sent: ${result.error || 'Unknown SES error'}. Check server logs for details.`
        });
      }

      const updatedEstimate = await prisma.estimate.findUnique({
        where: { id: estimate.id },
        include: { customer: true, items: { orderBy: { sortOrder: 'asc' } } }
      });

      const totalAttachments = (pdfBuffer ? 1 : 0) + extraAttachments.length;
      res.json({
        estimate:    updatedEstimate,
        emailResult: result,
        message:     `Estimate sent to ${recipientEmail} with ${totalAttachments} attachment(s)`
      });
    } catch (error) {
      console.error('POST /estimates/:id/send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimates/:id/email-history
  router.get('/:id/email-history', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id } });
      if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
      if (req.user.role === 'AGENT' && estimate.createdById !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });

      const emailLogs = await prisma.emailLog.findMany({
        where: { estimateId: estimate.id },
        include: { sentBy: { select: { id: true, name: true, email: true } } },
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
