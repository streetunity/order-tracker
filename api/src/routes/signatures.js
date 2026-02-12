/**
 * Signature Routes
 * E-signature capture and retrieval for estimates
 */

import express from 'express';

export function createSignaturesRouter(prisma) {
  const router = express.Router();

  // ============================================
  // PUBLIC SIGNATURE CAPTURE
  // ============================================

  // POST /capture - Capture signature for an estimate (public route)
  router.post('/capture', async (req, res) => {
    try {
      const {
        estimateId,
        signerName,
        signerTitle,
        signerEmail,
        signatureData,
        signatureType, // "DRAW" or "TYPE"
        typedSignature
      } = req.body;

      // Validation
      if (!estimateId) {
        return res.status(400).json({ error: 'estimateId is required' });
      }

      if (!signerName) {
        return res.status(400).json({ error: 'signerName is required' });
      }

      if (!signatureData) {
        return res.status(400).json({ error: 'signatureData is required' });
      }

      if (!signatureType || !['DRAW', 'TYPE'].includes(signatureType)) {
        return res.status(400).json({ error: 'signatureType must be DRAW or TYPE' });
      }

      // Get the estimate
      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      if (estimate.isDeleted) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check if already signed
      if (estimate.signatureId) {
        return res.status(400).json({ error: 'Estimate has already been signed' });
      }

      // Check if estimate is in a signable status
      const signableStatuses = ['SENT', 'VIEWED', 'PENDING_APPROVAL'];
      if (!signableStatuses.includes(estimate.status)) {
        return res.status(400).json({
          error: `Estimate cannot be signed in ${estimate.status} status`
        });
      }

      // Check if expired
      if (estimate.expiryDate && new Date(estimate.expiryDate) < new Date()) {
        return res.status(400).json({ error: 'Estimate has expired' });
      }

      // Get IP address and user agent
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                       req.headers['x-real-ip'] ||
                       req.socket?.remoteAddress ||
                       'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      // Create signature
      const signature = await prisma.signature.create({
        data: {
          signerName,
          signerTitle: signerTitle || null,
          signerEmail: signerEmail || estimate.customer?.email || null,
          signatureData,
          signatureType,
          typedSignature: signatureType === 'TYPE' ? typedSignature : null,
          ipAddress,
          userAgent,
          signedAt: new Date()
        }
      });

      // Update estimate to link signature and change status to ACCEPTED
      await prisma.estimate.update({
        where: { id: estimateId },
        data: {
          signatureId: signature.id,
          status: 'ACCEPTED'
        }
      });

      // Log activity
      await prisma.customerActivityLog.create({
        data: {
          estimateId,
          customerId: estimate.customerId,
          type: 'signed',
          description: `Estimate signed by ${signerName}`,
          metadata: JSON.stringify({
            signatureId: signature.id,
            signatureType,
            ipAddress
          })
        }
      });

      res.status(201).json({
        success: true,
        message: 'Estimate signed successfully',
        signature: {
          id: signature.id,
          signerName: signature.signerName,
          signatureType: signature.signatureType,
          signedAt: signature.signedAt
        }
      });
    } catch (error) {
      console.error('POST /signatures/capture error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /decline - Decline an estimate (public route)
  router.post('/decline', async (req, res) => {
    try {
      const { estimateId, declineReason } = req.body;

      if (!estimateId) {
        return res.status(400).json({ error: 'estimateId is required' });
      }

      // Get the estimate
      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      if (estimate.isDeleted) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      // Check if already signed or declined
      if (estimate.signatureId) {
        return res.status(400).json({ error: 'Estimate has already been signed' });
      }

      if (estimate.status === 'DECLINED') {
        return res.status(400).json({ error: 'Estimate has already been declined' });
      }

      // Update estimate status to DECLINED
      await prisma.estimate.update({
        where: { id: estimateId },
        data: {
          status: 'DECLINED',
          outcome: 'LOST',
          outcomeReason: declineReason || 'Customer declined',
          outcomeDate: new Date()
        }
      });

      // Get IP for logging
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                       req.headers['x-real-ip'] ||
                       req.socket?.remoteAddress ||
                       'unknown';

      // Log activity
      await prisma.customerActivityLog.create({
        data: {
          estimateId,
          customerId: estimate.customerId,
          type: 'status_change',
          description: `Estimate declined${declineReason ? `: ${declineReason}` : ''}`,
          metadata: JSON.stringify({ ipAddress, declineReason })
        }
      });

      res.json({
        success: true,
        message: 'Estimate declined'
      });
    } catch (error) {
      console.error('POST /signatures/decline error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /estimate/:estimateId - Get signature for an estimate
  router.get('/estimate/:estimateId', async (req, res) => {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: req.params.estimateId },
        select: {
          id: true,
          signatureId: true,
          status: true,
          signature: {
            select: {
              id: true,
              signerName: true,
              signerTitle: true,
              signerEmail: true,
              signatureData: true,
              signatureType: true,
              typedSignature: true,
              signedAt: true,
              ipAddress: true
            }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      if (!estimate.signature) {
        return res.status(404).json({ error: 'No signature found for this estimate' });
      }

      res.json(estimate.signature);
    } catch (error) {
      console.error('GET /signatures/estimate/:estimateId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /:id - Get signature by ID
  router.get('/:id', async (req, res) => {
    try {
      const signature = await prisma.signature.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          signerName: true,
          signerTitle: true,
          signerEmail: true,
          signatureData: true,
          signatureType: true,
          typedSignature: true,
          signedAt: true,
          ipAddress: true
        }
      });

      if (!signature) {
        return res.status(404).json({ error: 'Signature not found' });
      }

      res.json(signature);
    } catch (error) {
      console.error('GET /signatures/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createSignaturesRouter;
