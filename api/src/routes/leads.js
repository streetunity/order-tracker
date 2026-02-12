import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateCustomerNumber } from '../utils/numberGenerators.js';

export function createLeadsRouter(prisma) {
  const router = express.Router();

  // GET /leads - List all leads (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, source, assignedToId, search } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (source) where.source = source;
      if (assignedToId) where.assignedToId = assignedToId;

      // Search filter
      if (search) {
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { company: { contains: search } },
          { phone: { contains: search } }
        ];
      }

      const leads = await prisma.lead.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          convertedToCustomer: {
            select: { id: true, customerNumber: true, company: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(leads);
    } catch (error) {
      console.error('GET /leads error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /leads/:id - Get single lead
  router.get('/:id', async (req, res) => {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: req.params.id },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          convertedToCustomer: {
            select: { id: true, customerNumber: true, company: true, firstName: true, lastName: true }
          },
          deletedBy: {
            select: { id: true, name: true }
          }
        }
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (lead.assignedToId !== req.user.id && lead.createdById !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      res.json(lead);
    } catch (error) {
      console.error('GET /leads/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /leads - Create new lead
  router.post('/', requireInvoicingPermission('CREATE_LEAD'), async (req, res) => {
    try {
      const {
        source,
        sourceDetails,
        firstName,
        lastName,
        email,
        phone,
        company,
        address,
        city,
        state,
        zipCode,
        country,
        interestedIn,
        notes,
        budget,
        timeline,
        followUpDate,
        followUpNotes,
        assignedToId,
        status
      } = req.body;

      // Validation
      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          error: 'Missing required fields: firstName, lastName, email'
        });
      }

      const lead = await prisma.lead.create({
        data: {
          source: source || 'manual',
          sourceDetails,
          firstName,
          lastName,
          email,
          phone,
          company,
          address,
          city,
          state,
          zipCode,
          country: country || 'USA',
          interestedIn,
          notes,
          budget: budget ? parseFloat(budget) : null,
          timeline,
          followUpDate: followUpDate ? new Date(followUpDate) : null,
          followUpNotes,
          assignedToId: assignedToId || req.user.id, // Default to current user
          status: status || 'NEW'
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      res.status(201).json(lead);
    } catch (error) {
      console.error('POST /leads error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /leads/:id - Update lead (full update)
  router.put('/:id', requireInvoicingPermission('EDIT_LEAD'), async (req, res) => {
    try {
      const existing = await prisma.lead.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (existing.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        source,
        sourceDetails,
        firstName,
        lastName,
        email,
        phone,
        company,
        address,
        city,
        state,
        zipCode,
        country,
        interestedIn,
        notes,
        budget,
        timeline,
        followUpDate,
        followUpNotes,
        lostReason,
        assignedToId,
        status
      } = req.body;

      // Track last contact when status changes to CONTACTED
      let lastContactAt = existing.lastContactAt;
      if (status === 'CONTACTED' && existing.status !== 'CONTACTED') {
        lastContactAt = new Date();
      }

      const updated = await prisma.lead.update({
        where: { id: req.params.id },
        data: {
          source,
          sourceDetails,
          firstName,
          lastName,
          email,
          phone,
          company,
          address,
          city,
          state,
          zipCode,
          country,
          interestedIn,
          notes,
          budget: budget !== undefined ? (budget ? parseFloat(budget) : null) : existing.budget,
          timeline,
          followUpDate: followUpDate ? new Date(followUpDate) : null,
          followUpNotes,
          lostReason,
          lastContactAt,
          assignedToId,
          status
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PUT /leads/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /leads/:id - Partial update lead
  router.patch('/:id', requireInvoicingPermission('EDIT_LEAD'), async (req, res) => {
    try {
      const existing = await prisma.lead.findUnique({
        where: { id: req.params.id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (existing.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Whitelist of allowed fields for lead updates
      const allowedFields = [
        'firstName', 'lastName', 'email', 'phone', 'company',
        'address', 'city', 'state', 'zipCode', 'country',
        'source', 'sourceDetails', 'interestedIn', 'notes',
        'budget', 'timeline', 'status', 'lostReason',
        'followUpDate', 'followUpNotes', 'assignedToId'
      ];

      // Filter to only allowed fields
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      // Handle special field transformations
      if (updateData.budget !== undefined) {
        updateData.budget = updateData.budget ? parseFloat(updateData.budget) : null;
      }
      if (updateData.followUpDate !== undefined) {
        updateData.followUpDate = updateData.followUpDate ? new Date(updateData.followUpDate) : null;
      }

      // Track last contact when status changes to CONTACTED
      if (updateData.status === 'CONTACTED' && existing.status !== 'CONTACTED') {
        updateData.lastContactAt = new Date();
      }

      const updated = await prisma.lead.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /leads/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /leads/:id - Soft delete lead
  router.delete('/:id', requireInvoicingPermission('DELETE_LEAD'), async (req, res) => {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: req.params.id }
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      const deleted = await prisma.lead.update({
        where: { id: req.params.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id
        }
      });

      res.json({ message: 'Lead deleted successfully', lead: deleted });
    } catch (error) {
      console.error('DELETE /leads/:id error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /leads/:id/convert - Convert lead to customer
  router.post('/:id/convert', requireInvoicingPermission('CONVERT_LEAD'), async (req, res) => {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: req.params.id }
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      if (lead.isDeleted) {
        return res.status(400).json({ error: 'Cannot convert deleted lead' });
      }

      if (lead.status === 'CONVERTED') {
        return res.status(400).json({ error: 'Lead already converted' });
      }

      // Check access for AGENT role
      if (req.user.role === 'AGENT') {
        if (lead.assignedToId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Optional overrides from request body
      const {
        companyName,
        billingAddress,
        billingCity,
        billingState,
        billingZipCode,
        billingCountry,
        paymentTerms,
        notes: customerNotes
      } = req.body;

      // Generate customer number
      const customerNumber = await generateCustomerNumber(prisma);

      // Create customer and update lead in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create customer from lead data
        const customer = await tx.customer.create({
          data: {
            customerNumber,
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
            company: companyName || lead.company,
            companyName: companyName || lead.company,
            billingAddress: billingAddress || lead.address,
            billingCity: billingCity || lead.city,
            billingState: billingState || lead.state,
            billingZipCode: billingZipCode || lead.zipCode,
            billingCountry: billingCountry || lead.country || 'USA',
            shippingAddress: billingAddress || lead.address,
            shippingCity: billingCity || lead.city,
            shippingState: billingState || lead.state,
            shippingZipCode: billingZipCode || lead.zipCode,
            shippingCountry: billingCountry || lead.country || 'USA',
            sameAsBilling: true,
            shippingSameAsBilling: true,
            defaultPaymentTerms: paymentTerms || 'NET30',
            paymentTerms: paymentTerms || 'NET30',
            assignedToId: lead.assignedToId,
            notes: customerNotes || lead.notes,
            internalNotes: lead.interestedIn ? `Interested in: ${lead.interestedIn}` : null,
            leadId: lead.id,
            status: 'ACTIVE'
          },
          include: {
            assignedTo: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        // Update lead to mark as converted
        const updatedLead = await tx.lead.update({
          where: { id: req.params.id },
          data: {
            status: 'CONVERTED',
            convertedToCustomerId: customer.id,
            convertedAt: new Date(),
            convertedById: req.user.id
          }
        });

        return { customer, lead: updatedLead };
      });

      res.status(201).json({
        message: 'Lead converted to customer successfully',
        customer: result.customer,
        lead: result.lead
      });
    } catch (error) {
      console.error('POST /leads/:id/convert error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /leads/:id/assign - Assign lead to a user
  router.patch('/:id/assign', requireInvoicingPermission('ASSIGN_LEAD'), async (req, res) => {
    try {
      const { assignedToId } = req.body;

      if (!assignedToId) {
        return res.status(400).json({ error: 'assignedToId is required' });
      }

      const lead = await prisma.lead.findUnique({
        where: { id: req.params.id }
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      const updated = await prisma.lead.update({
        where: { id: req.params.id },
        data: { assignedToId },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PATCH /leads/:id/assign error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
