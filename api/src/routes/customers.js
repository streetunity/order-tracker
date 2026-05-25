import express from 'express';
import crypto from 'crypto';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateCustomerNumber } from '../utils/numberGenerators.js';
import { sendEmail } from '../services/emailService.js';
import { scheduleTypeToLegacyTerms } from '../utils/paymentSchedule.js';

export function createCustomersRouter(prisma) {
  const router = express.Router();

  // ─────────────────────────────────────────────────────────────────────────────
  // Account sync helper
  //
  // Whenever a Customer is updated in the invoicing system, push the relevant
  // contact fields to the linked Account in the order tracker so both sides
  // stay current.
  //
  // Rules:
  //   - Only runs if customer.accountId is set (i.e. an order already exists).
  //     Leads and pre-sale customers have no Account and are never touched here.
  //   - Fire-and-forget: syncs after the response is sent; failures are logged
  //     but never bubble up to the caller.
  //   - Shipping address is preferred; billing address used as fallback.
  // ─────────────────────────────────────────────────────────────────────────────
  async function syncCustomerToAccount(customer) {
    if (!customer.accountId) return;
    try {
      const streetLine = customer.shippingAddress || customer.billingAddress || null;
      const city       = customer.shippingCity    || customer.billingCity    || null;
      const state      = customer.shippingState   || customer.billingState   || null;
      const zip        = customer.shippingZipCode || customer.billingZipCode || null;

      const cityStateZip = [city, state, zip].filter(Boolean).join(', ');
      const fullAddress  = streetLine
        ? (cityStateZip ? `${streetLine}, ${cityStateZip}` : streetLine)
        : null;

      await prisma.account.update({
        where: { id: customer.accountId },
        data: {
          name:        customer.companyName || customer.company || `${customer.firstName} ${customer.lastName}`,
          contactName: `${customer.firstName} ${customer.lastName}`.trim(),
          email:       customer.email   ?? undefined,
          phone:       customer.phone   ?? undefined,
          address:     fullAddress      ?? undefined,
        },
      });
      console.log(`[CUSTOMER_SYNC] Customer ${customer.customerNumber} → Account ${customer.accountId} synced`);
    } catch (err) {
      // Never block the response — just log so we can investigate if needed
      console.error('[CUSTOMER_SYNC] Failed to sync to Account:', err.message);
    }
  }

  // GET /customers/search/autocomplete
  router.get('/search/autocomplete', async (req, res) => {
    try {
      const { q, limit = 10 } = req.query;
      if (!q || q.length < 2) return res.json([]);
      let where = { isDeleted: false };
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);
      where.OR = [
        { customerNumber: { contains: q , mode: 'insensitive'} }, { firstName: { contains: q , mode: 'insensitive'} },
        { lastName: { contains: q , mode: 'insensitive'} }, { email: { contains: q , mode: 'insensitive'} },
        { company: { contains: q , mode: 'insensitive'} }, { companyName: { contains: q , mode: 'insensitive'} }
      ];
      const customers = await prisma.customer.findMany({
        where,
        select: { id: true, customerNumber: true, firstName: true, lastName: true, email: true, company: true, companyName: true },
        take: parseInt(limit), orderBy: { customerNumber: 'desc' }
      });
      res.json(customers.map(c => ({
        id: c.id, customerNumber: c.customerNumber,
        name: `${c.firstName} ${c.lastName}`, company: c.company || c.companyName || null,
        email: c.email, label: `${c.customerNumber} - ${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ''}`
      })));
    } catch (error) {
      console.error('GET /customers/search/autocomplete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /customers
  router.get('/', async (req, res) => {
    try {
      const { status, assignedToId, search, tags } = req.query;
      let where = { isDeleted: false };
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);
      if (status) where.status = status;
      if (assignedToId) where.assignedToId = assignedToId;
      if (search) {
        where.OR = [
          { customerNumber: { contains: search , mode: 'insensitive'} }, { firstName: { contains: search , mode: 'insensitive'} },
          { lastName: { contains: search , mode: 'insensitive'} }, { email: { contains: search , mode: 'insensitive'} },
          { company: { contains: search , mode: 'insensitive'} }, { companyName: { contains: search , mode: 'insensitive'} }, { phone: { contains: search , mode: 'insensitive'} }
        ];
      }
      if (tags) where.tags = { contains: tags , mode: 'insensitive'};
      const customers = await prisma.customer.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          account: { select: { id: true, name: true } },
          contacts: { where: { isPrimary: true }, take: 1 },
          _count: { select: { estimates: true, invoices: true, contacts: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(customers);
    } catch (error) {
      console.error('GET /customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /customers/:id
  router.get('/:id', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          account: true, lead: true,
          contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          estimates: { where: { isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, estimateNumber: true, status: true, total: true, createdAt: true } },
          invoices:  { where: { isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, status: true, total: true, balanceDue: true, createdAt: true } },
          activities: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { estimates: true, invoices: true, payments: true, contacts: true } }
        }
      });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && customer.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      customer.parsedTags = customer.tags ? (() => { try { return JSON.parse(customer.tags); } catch { return []; } })() : [];
      res.json(customer);
    } catch (error) {
      console.error('GET /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /customers
  router.post('/', requireInvoicingPermission('CREATE_CUSTOMER'), async (req, res) => {
    try {
      const { firstName, lastName, email, phone, company, companyName, billingAddress, billingCity, billingState, billingZipCode, billingCountry, shippingAddress, shippingCity, shippingState, shippingZipCode, shippingCountry, sameAsBilling, taxExempt, taxExemptId, creditLimit, paymentTerms, defaultPaymentScheduleType, assignedToId, status, notes, internalNotes, tags, leadId } = req.body;
      if (!firstName || !lastName || !email) return res.status(400).json({ error: 'Missing required fields: firstName, lastName, email' });
      const customerNumber = await generateCustomerNumber(prisma);
      const portalToken = crypto.randomBytes(32).toString('hex');

      // paymentScheduleType is the canonical answer to "how does this customer
      // get billed?". paymentTerms is mirrored from it for legacy back-compat.
      // Explicit paymentTerms in the body wins (legacy API callers).
      const effectiveScheduleType = defaultPaymentScheduleType || '50_40_10';
      const mirroredTerms = paymentTerms || scheduleTypeToLegacyTerms(effectiveScheduleType);

      const customer = await prisma.customer.create({
        data: {
          customerNumber, firstName, lastName, email, phone,
          company: company || companyName, companyName: companyName || company,
          billingAddress, billingCity, billingState, billingZipCode, billingCountry: billingCountry || 'USA',
          shippingAddress: sameAsBilling ? billingAddress : shippingAddress,
          shippingCity:    sameAsBilling ? billingCity    : shippingCity,
          shippingState:   sameAsBilling ? billingState   : shippingState,
          shippingZipCode: sameAsBilling ? billingZipCode : shippingZipCode,
          shippingCountry: sameAsBilling ? (billingCountry || 'USA') : shippingCountry,
          sameAsBilling: sameAsBilling ?? true, shippingSameAsBilling: sameAsBilling ?? true,
          taxExempt: taxExempt ?? false, taxExemptId,
          creditLimit: creditLimit ? parseFloat(creditLimit) : null,
          defaultPaymentTerms: mirroredTerms, paymentTerms: mirroredTerms,
          defaultPaymentScheduleType: effectiveScheduleType,
          assignedToId: assignedToId || null, status: status || 'ACTIVE',
          notes, internalNotes, tags: tags ? JSON.stringify(tags) : null,
          portalToken, portalEnabled: true, leadId
        },
        include: { assignedTo: { select: { id: true, name: true, email: true } }, contacts: true }
      });
      if (leadId) {
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'CONVERTED', convertedToCustomerId: customer.id, convertedAt: new Date() } });
      }
      // No Account sync on creation — the Account is only created later when
      // a deposit triggers order auto-creation. New customers don't flood the
      // order tracker until they actually place an order.
      res.status(201).json(customer);
    } catch (error) {
      console.error('POST /customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /customers/:id — full update
  router.put('/:id', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && existing.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

      const {
        firstName, lastName, email, phone, company, companyName,
        billingAddress, billingCity, billingState, billingZipCode, billingCountry,
        shippingAddress, shippingCity, shippingState, shippingZipCode, shippingCountry,
        sameAsBilling, taxExempt, taxExemptId, creditLimit, paymentTerms, defaultPaymentScheduleType,
        assignedToId, status, notes, internalNotes, tags
      } = req.body;

      // Mirror paymentTerms from scheduleType when it changes.
      // Explicit paymentTerms in the body wins (legacy callers).
      let mirroredTerms;
      if (paymentTerms !== undefined) {
        mirroredTerms = paymentTerms;
      } else if (defaultPaymentScheduleType !== undefined) {
        mirroredTerms = scheduleTypeToLegacyTerms(defaultPaymentScheduleType);
      } else {
        mirroredTerms = undefined; // leave existing value alone
      }

      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          firstName, lastName, email, phone,
          company: company || companyName, companyName: companyName || company,
          billingAddress, billingCity, billingState, billingZipCode, billingCountry,
          shippingAddress: sameAsBilling ? billingAddress : shippingAddress,
          shippingCity:    sameAsBilling ? billingCity    : shippingCity,
          shippingState:   sameAsBilling ? billingState   : shippingState,
          shippingZipCode: sameAsBilling ? billingZipCode : shippingZipCode,
          shippingCountry: sameAsBilling ? billingCountry : shippingCountry,
          sameAsBilling, shippingSameAsBilling: sameAsBilling,
          taxExempt, taxExemptId,
          creditLimit: creditLimit !== undefined ? (creditLimit ? parseFloat(creditLimit) : null) : undefined,
          defaultPaymentTerms: mirroredTerms, paymentTerms: mirroredTerms,
          defaultPaymentScheduleType: defaultPaymentScheduleType !== undefined ? defaultPaymentScheduleType : undefined,
          assignedToId, status, notes, internalNotes,
          tags: tags !== undefined ? (tags ? JSON.stringify(tags) : null) : undefined
        },
        include: { assignedTo: { select: { id: true, name: true, email: true } }, account: true, contacts: true }
      });

      // Sync to the order tracker Account silently in the background
      setImmediate(() => syncCustomerToAccount(updated));

      res.json(updated);
    } catch (error) {
      console.error('PUT /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /customers/:id — partial update
  router.patch('/:id', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && existing.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

      const allowedFields = [
        'firstName','lastName','email','phone','company','companyName',
        'billingAddress','billingCity','billingState','billingZipCode','billingCountry',
        'shippingAddress','shippingCity','shippingState','shippingZipCode','shippingCountry',
        'sameAsBilling','shippingSameAsBilling','taxExempt','taxExemptId','creditLimit',
        'paymentTerms','defaultPaymentTerms','defaultPaymentScheduleType','status','notes','internalNotes','tags',
        'assignedToId','portalEnabled'
      ];
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updateData[field] = req.body[field];
      }
      if (updateData.creditLimit !== undefined) updateData.creditLimit = updateData.creditLimit ? parseFloat(updateData.creditLimit) : null;
      if (updateData.tags !== undefined) updateData.tags = updateData.tags ? JSON.stringify(updateData.tags) : null;
      if (updateData.sameAsBilling !== undefined) updateData.shippingSameAsBilling = updateData.sameAsBilling;
      if (updateData.company !== undefined && !updateData.companyName) updateData.companyName = updateData.company;

      // Mirror paymentTerms from scheduleType when scheduleType changes,
      // unless the caller explicitly sent paymentTerms (legacy override wins).
      if (updateData.defaultPaymentScheduleType !== undefined && updateData.paymentTerms === undefined) {
        updateData.paymentTerms = scheduleTypeToLegacyTerms(updateData.defaultPaymentScheduleType);
      }
      // Keep defaultPaymentTerms aligned with paymentTerms
      if (updateData.paymentTerms !== undefined) updateData.defaultPaymentTerms = updateData.paymentTerms;

      const updated = await prisma.customer.update({
        where: { id: req.params.id }, data: updateData,
        include: { assignedTo: { select: { id: true, name: true, email: true } }, contacts: true }
      });

      // Sync to the order tracker Account silently in the background.
      // PATCH doesn't include the full address/name in the response object,
      // so we merge the update onto the existing record for the sync.
      setImmediate(() => syncCustomerToAccount({ ...existing, ...updated }));

      res.json(updated);
    } catch (error) {
      console.error('PATCH /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /customers/:id
  router.delete('/:id', requireInvoicingPermission('DELETE_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      const deleted = await prisma.customer.update({
        where: { id: req.params.id },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: req.user.id }
      });
      res.json({ message: 'Customer deleted successfully', customer: deleted });
    } catch (error) {
      console.error('DELETE /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CONTACTS
  // ============================================

  router.post('/:id/contacts', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && customer.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const { firstName, lastName, email, phone, title, role, isPrimary, notes } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: 'Missing required fields: firstName, lastName' });
      if (isPrimary) await prisma.customerContact.updateMany({ where: { customerId: req.params.id, isPrimary: true }, data: { isPrimary: false } });
      const contact = await prisma.customerContact.create({ data: { customerId: req.params.id, firstName, lastName, email, phone, title, role: role || 'general', isPrimary: isPrimary ?? false, notes } });
      if (isPrimary) await prisma.customer.update({ where: { id: req.params.id }, data: { primaryContactId: contact.id } });
      res.status(201).json(contact);
    } catch (error) {
      console.error('POST /customers/:id/contacts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id/contacts', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && customer.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const contacts = await prisma.customerContact.findMany({ where: { customerId: req.params.id }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
      res.json(contacts);
    } catch (error) {
      console.error('GET /customers/:id/contacts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/:id/contacts/:contactId', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && customer.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const contact = await prisma.customerContact.findUnique({ where: { id: req.params.contactId } });
      if (!contact || contact.customerId !== req.params.id) return res.status(404).json({ error: 'Contact not found' });
      const { isPrimary } = req.body;
      if (isPrimary && !contact.isPrimary) await prisma.customerContact.updateMany({ where: { customerId: req.params.id, isPrimary: true }, data: { isPrimary: false } });
      const updated = await prisma.customerContact.update({ where: { id: req.params.contactId }, data: req.body });
      if (isPrimary) await prisma.customer.update({ where: { id: req.params.id }, data: { primaryContactId: updated.id } });
      res.json(updated);
    } catch (error) {
      console.error('PATCH /customers/:id/contacts/:contactId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id/contacts/:contactId', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (req.user.role === 'AGENT' && customer.assignedToId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const contact = await prisma.customerContact.findUnique({ where: { id: req.params.contactId } });
      if (!contact || contact.customerId !== req.params.id) return res.status(404).json({ error: 'Contact not found' });
      await prisma.customerContact.delete({ where: { id: req.params.contactId } });
      if (customer.primaryContactId === req.params.contactId) await prisma.customer.update({ where: { id: req.params.id }, data: { primaryContactId: null } });
      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('DELETE /customers/:id/contacts/:contactId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PORTAL TOKEN MANAGEMENT
  // ============================================

  router.post('/:id/regenerate-portal-token', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      const newToken = crypto.randomBytes(32).toString('hex');
      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: { portalToken: newToken, portalTokenExpiry: null },
        select: { id: true, portalToken: true, portalEnabled: true }
      });
      res.json({ message: 'Portal token regenerated', portalToken: updated.portalToken, portalUrl: `/portal/${updated.portalToken}` });
    } catch (error) {
      console.error('POST /customers/:id/regenerate-portal-token error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /customers/:id/send-portal-link
  router.post('/:id/send-portal-link', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        select: { id: true, firstName: true, lastName: true, email: true, companyName: true, portalToken: true, isDeleted: true }
      });

      if (!customer || customer.isDeleted) return res.status(404).json({ error: 'Customer not found' });
      if (!customer.portalToken) return res.status(400).json({ error: 'No portal token generated for this customer' });
      if (!customer.email) return res.status(400).json({ error: 'Customer has no email address' });

      const settings = await prisma.invoicingSettings.findFirst({
        select: { companyName: true, logoUrl: true, phone: true, email: true, website: true }
      });

      const companyName  = settings?.companyName || 'Stealth Machine Tools';
      const baseUrl      = process.env.NEXT_PUBLIC_BASE_URL || 'https://smt-orders.com';
      const portalUrl    = `${baseUrl}/portal/${customer.portalToken}`;
      const customerName = customer.companyName || `${customer.firstName} ${customer.lastName}`;

      const sender = req.user;
      const senderSettings = await prisma.userEmailSettings.findUnique({ where: { userId: sender.id } }).catch(() => null);
      const fromName  = senderSettings?.fromName || sender.name || companyName;
      const fromEmail = sender.email || `sales@stealthlaser.com`;

      const logoHtml = settings?.logoUrl
        ? `<img src="${settings.logoUrl}" alt="${companyName}" style="height:52px;width:auto;display:block;" />`
        : `<span style="color:#ffffff;font-size:20px;font-weight:700;">${companyName}</span>`;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">
  <div style="background:${settings?.logoUrl ? '#000' : '#dc2626'};padding:24px 28px;">${logoHtml}</div>
  <div style="padding:32px 28px;">
    <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 16px;">Your Customer Portal</h1>
    <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 24px;">Hi ${customerName}, you now have access to your customer portal where you can view your estimates, invoices, and submit payments online.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 36px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;">Access Your Portal</a>
    </div>
    <p style="font-size:12px;color:#888;margin:0 0 8px;">Or copy this link:</p>
    <p style="font-size:12px;color:#dc2626;word-break:break-all;margin:0 0 32px;">${portalUrl}</p>
    <p style="font-size:13px;color:#666;margin:0;">Questions? Contact us at ${settings?.email || 'Sales@StealthLaser.com'}${settings?.phone ? ` or ${settings.phone}` : ''}.</p>
  </div>
  <div style="background:#f0f0f0;padding:16px 28px;text-align:center;font-size:12px;color:#888;border-top:1px solid #ddd;">
    ${companyName}${settings?.phone ? ` &bull; ${settings.phone}` : ''}
  </div>
</div>
</body></html>`;

      const result = await sendEmail({
        to: customer.email,
        from: fromEmail,
        fromName,
        replyTo: fromEmail,
        subject: `Your ${companyName} Customer Portal`,
        html,
        text: `Hi ${customerName},\n\nAccess your portal: ${portalUrl}\n\n${companyName}`,
      });

      if (!result.success) throw new Error(result.error || 'Failed to send email');

      try {
        await prisma.customerActivityLog.create({
          data: {
            customerId: customer.id,
            type: 'sent',
            description: `Portal access link emailed to ${customer.email}`,
            actorId: sender.id,
            actorName: sender.name,
          }
        });
      } catch (_) {}

      res.json({ success: true, message: `Portal link sent to ${customer.email}` });
    } catch (error) {
      console.error('POST /customers/:id/send-portal-link error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CUSTOMER ACTIVITY TIMELINE
  // ============================================

  router.get('/:id/activity', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer || customer.isDeleted) return res.status(404).json({ error: 'Customer not found' });
      const activities = await prisma.customerActivityLog.findMany({
        where: { customerId: id },
        include: {
          lead:     { select: { id: true, firstName: true, lastName: true, company: true } },
          estimate: { select: { id: true, estimateNumber: true } },
          invoice:  { select: { id: true, invoiceNumber: true } },
          payment:  { select: { id: true, paymentNumber: true, amount: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit), skip: parseInt(offset)
      });
      const total = await prisma.customerActivityLog.count({ where: { customerId: id } });
      const formattedActivities = activities.map(a => ({
        ...a,
        metadata: a.metadata ? JSON.parse(a.metadata) : null,
        performedBy: a.actorId ? { id: a.actorId, name: a.actorName } : null
      }));
      res.json({ activities: formattedActivities, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) {
      console.error('GET /customers/:id/activity error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
