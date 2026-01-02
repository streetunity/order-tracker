import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';

export function createLeadsRouter(prisma) {
  const router = express.Router();

  // GET /leads - List all leads (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, source, assignedToId } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (source) where.source = source;
      if (assignedToId) where.assignedToId = assignedToId;

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
        assignedToId,
        status
      } = req.body;

      // Validation
      if (!firstName || !lastName || !email || !source) {
        return res.status(400).json({
          error: 'Missing required fields: firstName, lastName, email, source'
        });
      }

      const lead = await prisma.lead.create({
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
          country: country || 'USA',
          interestedIn,
          notes,
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

  // PUT /leads/:id - Update lead
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
        if (existing.assignedToId !== req.user.id && existing.createdById !== req.user.id) {
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
        assignedToId,
        status
      } = req.body;

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

  return router;
}
