// api/src/routes/zapierWebhook.js
import express from 'express';
import crypto from 'crypto';

export function createZapierWebhookRouter(prisma) {
  const router = express.Router();

  /**
   * Validate webhook signature if configured
   * @param {string} payload - Raw request body
   * @param {string} signature - Signature from header
   * @param {string} secret - Webhook secret
   * @returns {boolean}
   */
  function validateSignature(payload, signature, secret) {
    if (!secret) return true; // No secret configured, skip validation
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
   * GHL uses snake_case, we use camelCase
   */
  function mapGHLFieldsToLead(data, fieldMapping = null) {
    // Default GHL field mapping
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
      tags: 'interestedIn',
      notes: 'notes',
      message: 'notes'
    };

    // Use custom mapping if provided, otherwise use default
    const mapping = fieldMapping ? JSON.parse(fieldMapping) : defaultMapping;

    const lead = {};
    for (const [sourceField, targetField] of Object.entries(mapping)) {
      if (data[sourceField] !== undefined && data[sourceField] !== null && data[sourceField] !== '') {
        // Handle arrays (like tags)
        if (Array.isArray(data[sourceField])) {
          lead[targetField] = data[sourceField].join(', ');
        } else {
          lead[targetField] = data[sourceField];
        }
      }
    }

    return lead;
  }

  // POST /zapier/lead/:webhookKey - Receive lead from Go High Level via Zapier
  router.post('/lead/:webhookKey', express.raw({ type: '*/*' }), async (req, res) => {
    try {
      const { webhookKey } = req.params;

      // Find the webhook configuration
      const webhook = await prisma.zapierWebhook.findUnique({
        where: { webhookKey }
      });

      if (!webhook) {
        console.log(`Zapier webhook not found: ${webhookKey}`);
        return res.status(404).json({ error: 'Webhook not found' });
      }

      if (!webhook.isActive) {
        console.log(`Zapier webhook inactive: ${webhookKey}`);
        return res.status(403).json({ error: 'Webhook is inactive' });
      }

      // Parse the raw body
      let body;
      if (Buffer.isBuffer(req.body)) {
        body = JSON.parse(req.body.toString());
      } else if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }

      // Validate signature if secret is configured
      const signature = req.headers['x-webhook-signature'] || req.headers['x-zapier-signature'];
      if (webhook.webhookSecret) {
        const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
        if (!validateSignature(rawBody, signature, webhook.webhookSecret)) {
          console.log(`Invalid signature for webhook: ${webhookKey}`);
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      // Check allowed IPs if configured
      if (webhook.allowedIPs) {
        const allowedList = webhook.allowedIPs.split(',').map(ip => ip.trim());
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        if (!allowedList.includes(clientIP) && !allowedList.includes('*')) {
          console.log(`IP not allowed for webhook ${webhookKey}: ${clientIP}`);
          return res.status(403).json({ error: 'IP not allowed' });
        }
      }

      // Map the incoming data to lead fields
      const mappedData = mapGHLFieldsToLead(body, webhook.fieldMapping);

      // Validate required fields
      if (!mappedData.firstName || !mappedData.lastName || !mappedData.email) {
        console.log('Missing required fields in webhook data:', mappedData);
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['firstName (first_name)', 'lastName (last_name)', 'email'],
          received: mappedData
        });
      }

      // Check for duplicate by email (optional - can be made configurable)
      const existingLead = await prisma.lead.findFirst({
        where: {
          email: mappedData.email,
          isDeleted: false
        }
      });

      if (existingLead) {
        // Update existing lead with new data instead of creating duplicate
        const updatedLead = await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            ...mappedData,
            lastContactAt: new Date()
          }
        });

        // Update webhook stats
        await prisma.zapierWebhook.update({
          where: { id: webhook.id },
          data: {
            totalReceived: webhook.totalReceived + 1,
            lastReceivedAt: new Date()
          }
        });

        console.log(`Updated existing lead from webhook ${webhookKey}: ${updatedLead.id}`);
        return res.status(200).json({
          success: true,
          action: 'updated',
          leadId: updatedLead.id,
          message: 'Existing lead updated'
        });
      }

      // Create new lead
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

      // Update webhook stats
      await prisma.zapierWebhook.update({
        where: { id: webhook.id },
        data: {
          totalReceived: webhook.totalReceived + 1,
          lastReceivedAt: new Date()
        }
      });

      console.log(`Created new lead from webhook ${webhookKey}: ${lead.id}`);
      res.status(201).json({
        success: true,
        action: 'created',
        leadId: lead.id,
        message: 'Lead created successfully'
      });
    } catch (error) {
      console.error('POST /zapier/lead error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /zapier/test/:webhookKey - Test webhook endpoint
  router.post('/test/:webhookKey', async (req, res) => {
    try {
      const { webhookKey } = req.params;

      const webhook = await prisma.zapierWebhook.findUnique({
        where: { webhookKey }
      });

      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      res.json({
        success: true,
        message: 'Webhook test successful',
        webhookName: webhook.name,
        isActive: webhook.isActive,
        fieldMapping: webhook.fieldMapping ? JSON.parse(webhook.fieldMapping) : 'default',
        receivedData: req.body
      });
    } catch (error) {
      console.error('POST /zapier/test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /zapier/webhooks - List all webhooks (admin only)
  router.get('/webhooks', async (req, res) => {
    try {
      const webhooks = await prisma.zapierWebhook.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          webhookKey: true,
          source: true,
          isActive: true,
          totalReceived: true,
          lastReceivedAt: true,
          defaultAssignTo: true,
          createdAt: true,
          updatedAt: true
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
      const {
        name,
        source,
        fieldMapping,
        defaultAssignTo,
        allowedIPs,
        webhookSecret
      } = req.body;

      if (!name || !source) {
        return res.status(400).json({
          error: 'Missing required fields: name, source'
        });
      }

      // Generate unique webhook key
      const webhookKey = crypto.randomBytes(16).toString('hex');

      const webhook = await prisma.zapierWebhook.create({
        data: {
          name,
          webhookKey,
          webhookSecret,
          source,
          fieldMapping: fieldMapping ? JSON.stringify(fieldMapping) : null,
          defaultAssignTo,
          allowedIPs,
          isActive: true
        }
      });

      res.status(201).json({
        ...webhook,
        webhookUrl: `/api/zapier/lead/${webhookKey}`
      });
    } catch (error) {
      console.error('POST /zapier/webhooks error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /zapier/webhooks/:id - Update webhook configuration
  router.patch('/webhooks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        source,
        fieldMapping,
        defaultAssignTo,
        allowedIPs,
        webhookSecret,
        isActive
      } = req.body;

      const existing = await prisma.zapierWebhook.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      const updated = await prisma.zapierWebhook.update({
        where: { id },
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
      const { id } = req.params;

      const existing = await prisma.zapierWebhook.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      await prisma.zapierWebhook.delete({
        where: { id }
      });

      res.json({ message: 'Webhook deleted successfully' });
    } catch (error) {
      console.error('DELETE /zapier/webhooks/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
