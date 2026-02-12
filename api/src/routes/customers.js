import express from 'express';
import crypto from 'crypto';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateCustomerNumber } from '../utils/numberGenerators.js';

export function createCustomersRouter(prisma) {
  const router = express.Router();

  // GET /customers/search/autocomplete - Quick search for dropdowns
  router.get('/search/autocomplete', async (req, res) => {
    try {
      const { q, limit = 10 } = req.query;

      if (!q || q.length < 2) {
        return res.json([]);
      }

      let where = { isDeleted: false };
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Search in multiple fields
      where.OR = [
        { customerNumber: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
        { company: { contains: q } },
        { companyName: { contains: q } }
      ];

      const customers = await prisma.customer.findMany({
        where,
        select: {
          id: true,
          customerNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          company: true,
          companyName: true
        },
        take: parseInt(limit),
        orderBy: { customerNumber: 'desc' }
      });

      // Format for autocomplete
      const results = customers.map(c => ({
        id: c.id,
        customerNumber: c.customerNumber,
        name: `${c.firstName} ${c.lastName}`,
        company: c.company || c.companyName || null,
        email: c.email,
        label: `${c.customerNumber} - ${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ''}`
      }));

      res.json(results);
    } catch (error) {
      console.error('GET /customers/search/autocomplete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /customers - List all customers (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, assignedToId, search, tags } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (assignedToId) where.assignedToId = assignedToId;

      // Search filter
      if (search) {
        where.OR = [
          { customerNumber: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { company: { contains: search } },
          { companyName: { contains: search } },
          { phone: { contains: search } }
        ];
      }

      // Tags filter (JSON array stored as string)
      if (tags) {
        where.tags = { contains: tags };
      }

      const customers = await prisma.customer.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          account: {
            select: { id: true, name: true }
          },
          contacts: {
            where: { isPrimary: true },
            take: 1
          },
          _count: {
            select: {
              estimates: true,
              invoices: true,
              contacts: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(customers);
    } catch (error) {
      console.error('GET /customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /customers/:id - Get single customer with full details
  router.get('/:id', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          account: true,
          lead: true,
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
          },
          estimates: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              estimateNumber: true,
              status: true,
              total: true,
              createdAt: true
            }
          },
          invoices: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              total: true,
              balanceDue: true,
              createdAt: true
            }
          },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 20
          },
          _count: {
            select: {
              estimates: true,
              invoices: true,
              payments: true,
              contacts: true
            }
          }
        }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (customer.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Parse tags JSON
      if (customer.tags) {
        try {
          customer.parsedTags = JSON.parse(customer.tags);
        } catch {
          customer.parsedTags = [];
        }
      } else {
        customer.parsedTags = [];
      }

      res.json(customer);
    } catch (error) {
      console.error('GET /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /customers - Create new customer
  router.post('/', requireInvoicingPermission('CREATE_CUSTOMER'), async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        company,
        companyName,
        billingAddress,
        billingCity,
        billingState,
        billingZipCode,
        billingCountry,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingZipCode,
        shippingCountry,
        sameAsBilling,
        taxExempt,
        taxExemptId,
        creditLimit,
        paymentTerms,
        assignedToId,
        status,
        notes,
        internalNotes,
        tags,
        leadId
      } = req.body;

      // Validation
      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          error: 'Missing required fields: firstName, lastName, email'
        });
      }

      // Generate customer number
      const customerNumber = await generateCustomerNumber(prisma);

      // Generate portal token
      const portalToken = crypto.randomBytes(32).toString('hex');

      const customer = await prisma.customer.create({
        data: {
          customerNumber,
          firstName,
          lastName,
          email,
          phone,
          company: company || companyName,
          companyName: companyName || company,
          billingAddress,
          billingCity,
          billingState,
          billingZipCode,
          billingCountry: billingCountry || 'USA',
          shippingAddress: sameAsBilling ? billingAddress : shippingAddress,
          shippingCity: sameAsBilling ? billingCity : shippingCity,
          shippingState: sameAsBilling ? billingState : shippingState,
          shippingZipCode: sameAsBilling ? billingZipCode : shippingZipCode,
          shippingCountry: sameAsBilling ? (billingCountry || 'USA') : shippingCountry,
          sameAsBilling: sameAsBilling ?? true,
          shippingSameAsBilling: sameAsBilling ?? true,
          taxExempt: taxExempt ?? false,
          taxExemptId,
          creditLimit: creditLimit ? parseFloat(creditLimit) : null,
          defaultPaymentTerms: paymentTerms || 'NET30',
          paymentTerms: paymentTerms || 'NET30',
          assignedToId: assignedToId || null,
          status: status || 'ACTIVE',
          notes,
          internalNotes,
          tags: tags ? JSON.stringify(tags) : null,
          portalToken,
          portalEnabled: true,
          leadId
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          contacts: true
        }
      });

      // If created from a lead, mark lead as converted
      if (leadId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            status: 'CONVERTED',
            convertedToCustomerId: customer.id,
            convertedAt: new Date()
          }
        });
      }

      res.status(201).json(customer);
    } catch (error) {
      console.error('POST /customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /customers/:id - Full update customer
  router.put('/:id', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const existing = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (existing.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        company,
        companyName,
        billingAddress,
        billingCity,
        billingState,
        billingZipCode,
        billingCountry,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingZipCode,
        shippingCountry,
        sameAsBilling,
        taxExempt,
        taxExemptId,
        creditLimit,
        paymentTerms,
        assignedToId,
        status,
        notes,
        internalNotes,
        tags
      } = req.body;

      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          firstName,
          lastName,
          email,
          phone,
          company: company || companyName,
          companyName: companyName || company,
          billingAddress,
          billingCity,
          billingState,
          billingZipCode,
          billingCountry,
          shippingAddress: sameAsBilling ? billingAddress : shippingAddress,
          shippingCity: sameAsBilling ? billingCity : shippingCity,
          shippingState: sameAsBilling ? billingState : shippingState,
          shippingZipCode: sameAsBilling ? billingZipCode : shippingZipCode,
          shippingCountry: sameAsBilling ? billingCountry : shippingCountry,
          sameAsBilling,
          shippingSameAsBilling: sameAsBilling,
          taxExempt,
          taxExemptId,
          creditLimit: creditLimit !== undefined ? (creditLimit ? parseFloat(creditLimit) : null) : undefined,
          defaultPaymentTerms: paymentTerms,
          paymentTerms,
          assignedToId,
          status,
          notes,
          internalNotes,
          tags: tags !== undefined ? (tags ? JSON.stringify(tags) : null) : undefined
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          account: true,
          contacts: true
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PUT /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /customers/:id - Partial update customer
  router.patch('/:id', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const existing = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (existing.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Whitelist of allowed fields for customer updates
      const allowedFields = [
        'firstName', 'lastName', 'email', 'phone', 'company', 'companyName',
        'billingAddress', 'billingCity', 'billingState', 'billingZipCode', 'billingCountry',
        'shippingAddress', 'shippingCity', 'shippingState', 'shippingZipCode', 'shippingCountry',
        'sameAsBilling', 'shippingSameAsBilling',
        'taxExempt', 'taxExemptId', 'creditLimit',
        'paymentTerms', 'defaultPaymentTerms',
        'status', 'notes', 'internalNotes', 'tags',
        'assignedToId', 'portalEnabled'
      ];

      // Filter to only allowed fields
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      // Handle special transformations
      if (updateData.creditLimit !== undefined) {
        updateData.creditLimit = updateData.creditLimit ? parseFloat(updateData.creditLimit) : null;
      }
      if (updateData.tags !== undefined) {
        updateData.tags = updateData.tags ? JSON.stringify(updateData.tags) : null;
      }
      if (updateData.paymentTerms !== undefined) {
        updateData.defaultPaymentTerms = updateData.paymentTerms;
      }
      if (updateData.sameAsBilling !== undefined) {
        updateData.shippingSameAsBilling = updateData.sameAsBilling;
      }
      if (updateData.company !== undefined && !updateData.companyName) {
        updateData.companyName = updateData.company;
      }

      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          contacts: true
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /customers/:id - Soft delete customer
  router.delete('/:id', requireInvoicingPermission('DELETE_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const deleted = await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id
        }
      });

      res.json({ message: 'Customer deleted successfully', customer: deleted });
    } catch (error) {
      console.error('DELETE /customers/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CONTACTS ENDPOINTS
  // ============================================

  // POST /customers/:id/contacts - Add contact to customer
  router.post('/:id/contacts', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (customer.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        title,
        role,
        isPrimary,
        notes
      } = req.body;

      // Validation
      if (!firstName || !lastName) {
        return res.status(400).json({
          error: 'Missing required fields: firstName, lastName'
        });
      }

      // If setting as primary, unset other primary contacts
      if (isPrimary) {
        await prisma.customerContact.updateMany({
          where: { customerId: req.params.id, isPrimary: true },
          data: { isPrimary: false }
        });
      }

      const contact = await prisma.customerContact.create({
        data: {
          customerId: req.params.id,
          firstName,
          lastName,
          email,
          phone,
          title,
          role: role || 'general',
          isPrimary: isPrimary ?? false,
          notes
        }
      });

      // Update customer's primaryContactId if this is primary
      if (isPrimary) {
        await prisma.customer.update({
          where: { id: req.params.id },
          data: { primaryContactId: contact.id }
        });
      }

      res.status(201).json(contact);
    } catch (error) {
      console.error('POST /customers/:id/contacts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /customers/:id/contacts - List customer contacts
  router.get('/:id/contacts', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (customer.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const contacts = await prisma.customerContact.findMany({
        where: { customerId: req.params.id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
      });

      res.json(contacts);
    } catch (error) {
      console.error('GET /customers/:id/contacts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /customers/:id/contacts/:contactId - Update contact
  router.patch('/:id/contacts/:contactId', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (customer.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const contact = await prisma.customerContact.findUnique({
        where: { id: req.params.contactId }
      });

      if (!contact || contact.customerId !== req.params.id) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const { isPrimary } = req.body;

      // If setting as primary, unset other primary contacts
      if (isPrimary && !contact.isPrimary) {
        await prisma.customerContact.updateMany({
          where: { customerId: req.params.id, isPrimary: true },
          data: { isPrimary: false }
        });
      }

      const updated = await prisma.customerContact.update({
        where: { id: req.params.contactId },
        data: req.body
      });

      // Update customer's primaryContactId if this is now primary
      if (isPrimary) {
        await prisma.customer.update({
          where: { id: req.params.id },
          data: { primaryContactId: updated.id }
        });
      }

      res.json(updated);
    } catch (error) {
      console.error('PATCH /customers/:id/contacts/:contactId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /customers/:id/contacts/:contactId - Remove contact
  router.delete('/:id/contacts/:contactId', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (customer.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const contact = await prisma.customerContact.findUnique({
        where: { id: req.params.contactId }
      });

      if (!contact || contact.customerId !== req.params.id) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      await prisma.customerContact.delete({
        where: { id: req.params.contactId }
      });

      // If this was the primary contact, clear the reference
      if (customer.primaryContactId === req.params.contactId) {
        await prisma.customer.update({
          where: { id: req.params.id },
          data: { primaryContactId: null }
        });
      }

      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('DELETE /customers/:id/contacts/:contactId error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PORTAL TOKEN MANAGEMENT
  // ============================================

  // POST /customers/:id/regenerate-portal-token - Generate new portal token
  router.post('/:id/regenerate-portal-token', requireInvoicingPermission('EDIT_CUSTOMER'), async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const newToken = crypto.randomBytes(32).toString('hex');

      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          portalToken: newToken,
          portalTokenExpiry: null // Reset expiry
        },
        select: {
          id: true,
          portalToken: true,
          portalEnabled: true
        }
      });

      res.json({
        message: 'Portal token regenerated',
        portalToken: updated.portalToken,
        portalUrl: `/portal/${updated.portalToken}`
      });
    } catch (error) {
      console.error('POST /customers/:id/regenerate-portal-token error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // CUSTOMER ACTIVITY TIMELINE
  // ========================================

  // GET /customers/:id/activity - Get activity timeline for a customer
  router.get('/:id/activity', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      // Verify customer exists and user has access
      const customer = await prisma.customer.findUnique({
        where: { id }
      });

      if (!customer || customer.isDeleted) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Get activity logs for this customer
      // Note: CustomerActivityLog uses actorId/actorName fields, not a performedBy relation
      const activities = await prisma.customerActivityLog.findMany({
        where: { customerId: id },
        include: {
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true }
          },
          estimate: {
            select: { id: true, estimateNumber: true }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          },
          payment: {
            select: { id: true, paymentNumber: true, amount: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      });

      // Get total count
      const total = await prisma.customerActivityLog.count({
        where: { customerId: id }
      });

      // Parse metadata for each activity and format performedBy for frontend
      const formattedActivities = activities.map(a => ({
        ...a,
        metadata: a.metadata ? JSON.parse(a.metadata) : null,
        // Frontend expects performedBy object, but model uses actorId/actorName
        performedBy: a.actorId ? { id: a.actorId, name: a.actorName } : null
      }));

      res.json({
        activities: formattedActivities,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('GET /customers/:id/activity error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
