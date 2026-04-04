// api/src/routes/zapierWebhook.js
import express from 'express';
import crypto from 'crypto';
import { authGuard } from '../middleware/auth.js';
import { requireInvoicingPermission } from '../middleware/invoicingAuth.js';

export function createZapierWebhookRouter(prisma) {
  const router = express.Router();

  /**
   * Validate webhook signature if configured
   */
  function validateSignature(payload, signature, secret) {
    if (!secret) return true;
    if (!signature) return false;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Map Go High Level fields to Lead model
   */
  function mapGHLFieldsToLead(data, fieldMapping = null) {
    const defaultMapping = {
      first_name: 'firstName',
      firstName: 'firstName',
      last_name: 'lastName',
      lastName: 'lastName',
      email: 'email',
      phone: 'phone',
      company: 'company',
      company_name: 'company',
      companyName: 'company',
      address: 'address',
      address1: 'address',
      city: 'city',
      state: 'state',
      postal_code: 'zipCode',
      postalCode: 'zipCode',
      zip: 'zipCode',
      zipCode: 'zipCode',
      country: 'country',
      source: 'sourceDetails',
      notes: 'notes',
      message: 'notes'
    };

    let mapping;
    if (fieldMapping) {
      try {
        const parsed = JSON.parse(fieldMapping);
        mapping = Object.keys(parsed).length > 0 ? parsed : defaultMapping;
      } catch {
        mapping = defaultMapping;
      }
    } else {
      mapping = defaultMapping;
    }

    const lead = {};
    for (const [sourceField, targetField] of Object.entries(mapping)) {
      if (data[sourceField] !== undefined && data[sourceField] !== null && data[sourceField] !== '') {
        lead[targetField] = Array.isArray(data[sourceField])
          ? data[sourceField].join(', ')
          : data[sourceField];
      }
    }
    return lead;
  }

  // ─── PUBLIC: Receive lead from Zapier ────────────────────────────────────────
  // This endpoint is intentionally public — protected by webhookKey in the URL
  router.post('/lead/:webhookKey', express.raw({ type: '*/*' }), async (req, res) => {
    try {
      const { webhookKey } = req.params;

      const webhook = await prisma.zapierWebhook.findUnique({ where: { webhookKey } });
      if (!webhook) {
        console.log(`Zapier webhook not found: ${webhookKey}`);
        return res.status(404).json({ error: 'Webhook not found' });
      }
      if (!webhook.isActive) {
        console.log(`Zapier webhook inactive: ${webhookKey}`);
        return res.status(403).json({ error: 'Webhook is inactive' });
      }

      // Parse body
      let body;
      if (Buffer.isBuffer(req.body)) body = JSON.parse(req.body.toString());
      else if (typeof req.body === 'string') body = JSON.parse(req.body);
      else body = req.body;

      // Validate signature if configured
      if (webhook.webhookSecret) {
        const signature = req.headers['x-webhook-signature'] || req.headers['x-zapier-signature'];
        const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
        if (!validateSignature(rawBody, signature, webhook.webhookSecret)) {
          console.log(`Invalid signature for webhook: ${webhookKey}`);
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      // IP allowlist check
      if (webhook.allowedIPs) {
        const allowedList = webhook.allowedIPs.split(',').map(ip => ip.trim());
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        if (!allowedList.includes(clientIP) && !allowedList.includes('*')) {
          console.log(`IP not allowed for webhook ${webhookKey}: ${clientIP}`);
          return res.status(403).json({ error: 'IP not allowed' });
        }
      }

      const mappedData = mapGHLFieldsToLead(body, webhook.fieldMapping);

      if (!mappedData.firstName || !mappedData.lastName || !mappedData.email) {
        console.log('Missing required fields in webhook data:', mappedData);
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['firstName (first_name)', 'lastName (last_name)', 'email'],
          received: mappedData
        });
      }

      // Upsert on email — update existing lead rather than creating duplicate
      const existingLead = await prisma.lead.findFirst({
        where: { email: mappedData.email, isDeleted: false }
      });

      if (existingLead) {
        const updatedLead = await prisma.lead.update({
          where: { id: existingLead.id },
          data: { ...mappedData, lastContactAt: new Date() }
        });
        await prisma.zapierWebhook.update({
          where: { id: webhook.id },
          data: { totalReceived: webhook.totalReceived + 1, lastReceivedAt: new Date() }
        });
        console.log(`Updated existing lead from webhook ${webhookKey}: ${updatedLead.id}`);
        return res.status(200).json({ success: true, action: 'updated', leadId: updatedLead.id, message: 'Existing lead updated' });
      }

      const lead = await prisma.lead.create({
        data: {
          ...mappedData,
          source: 'zapier',
          sourceDetails: webhook.source || body.source || 'Go High Level',
          zapierWebhookId: webhook.id,
          assignedToId: webhook.defaultAssignTo || null,
          status: 'NEW',
          country: mappedData.country || 'USA'
        }
      });

      await prisma.zapierWebhook.update({
        where: { id: webhook.id },
        data: { totalReceived: webhook.totalReceived + 1, lastReceivedAt: new Date() }
      });

      console.log(`Created new lead from webhook ${webhookKey}: ${lead.id}`);
      res.status(201).json({ success: true, action: 'created', leadId: lead.id, message: 'Lead created successfully' });
    } catch (error) {
      console.error('POST /zapier/lead error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── PROTECTED: Webhook management (SUPER_ADMIN / ADMIN only) ────────────────

  // POST /zapier/test/:webhookKey - Test endpoint (public, key-protected)
  router.post('/test/:webhookKey', async (req, res) => {
    try {
      const webhook = await prisma.zapierWebhook.findUnique({ where: { webhookKey: req.params.webhookKey } });
      if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
      res.json({
        success: true,
        message: 'Webhook test successful',
        webhookName: webhook.name,
        isActive: webhook.isActive,
        receivedData: req.body
      });
    } catch (error) {
      console.error('POST /zapier/test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // All management routes require auth + permission
  router.use('/webhooks', authGuard, requireInvoicingPermission('MANAGE_ZAPIER_WEBHOOKS'));

  // GET /zapier/webhooks - List all webhooks
  router.get('/webhooks', async (req, res) => {
    try {
      const webhooks = await prisma.zapierWebhook.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, webhookKey: true, source: true,
          isActive: true, totalReceived: true, lastReceivedAt: true,
          defaultAssignTo: true, createdAt: true, updatedAt: true
        }
      });
      res.json(webhooks);
    } catch (error) {
      console.error('GET /zapier/webhooks error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /zapier/webhooks - Create new webhook configuration
  router.post('/webhooks', async (req, res) => {
    try {
      const { name, source, fieldMapping, defaultAssignTo, allowedIPs, webhookSecret } = req.body;
      if (!name || !source) {
        return res.status(400).json({ error: 'Missing required fields: name, source' });
      }
      const webhookKey = crypto.randomBytes(16).toString('hex');
      const webhook = await prisma.zapierWebhook.create({
        data: {
          name,
          webhookKey,
          webhookSecret,
          source,
          // Never store null — default to empty mapping (uses backend defaults)
          fieldMapping: fieldMapping ? JSON.stringify(fieldMapping) : '{}',
          defaultAssignTo,
          allowedIPs,
          isActive: true
        }
      });
      res.status(201).json({ ...webhook, webhookUrl: `/api/zapier/lead/${webhookKey}` });
    } catch (error) {
      console.error('POST /zapier/webhooks error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /zapier/webhooks/:id - Update webhook configuration
  router.patch('/webhooks/:id', async (req, res) => {
    try {
      const existing = await prisma.zapierWebhook.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Webhook not found' });

      const { name, source, fieldMapping, defaultAssignTo, allowedIPs, webhookSecret, isActive } = req.body;
      const updated = await prisma.zapierWebhook.update({
        where: { id: req.params.id },
        data: {
          name,
          source,
          fieldMapping: fieldMapping !== undefined ? JSON.stringify(fieldMapping) : undefined,
          defaultAssignTo,
          allowedIPs,
          webhookSecret,
          isActive
        }
      });
      res.json(updated);
    } catch (error) {
      console.error('PATCH /zapier/webhooks/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /zapier/webhooks/:id - Delete webhook
  router.delete('/webhooks/:id', async (req, res) => {
    try {
      const existing = await prisma.zapierWebhook.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Webhook not found' });
      await prisma.zapierWebhook.delete({ where: { id: req.params.id } });
      res.json({ message: 'Webhook deleted successfully' });
    } catch (error) {
      console.error('DELETE /zapier/webhooks/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
