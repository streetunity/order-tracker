import express from 'express';
import { requireInvoicingPermission, applyInvoicingDataFilter } from '../middleware/invoicingAuth.js';
import { generateCustomerNumber } from '../utils/numberGenerators.js';

export function createCustomersRouter(prisma) {
  const router = express.Router();

  // GET /customers - List all customers (with RBAC filtering)
  router.get('/', async (req, res) => {
    try {
      const { status, assignedToId } = req.query;

      let where = { isDeleted: false };

      // Apply RBAC data filtering
      where = applyInvoicingDataFilter(req.user.role, req.user.id, where);

      // Apply optional filters
      if (status) where.status = status;
      if (assignedToId) where.assignedToId = assignedToId;

      const customers = await prisma.customer.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          account: {
            select: { id: true, name: true }
          },
          _count: {
            select: {
              estimates: true,
              invoices: true
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

  // GET /customers/:id - Get single customer
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
          estimates: {
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          _count: {
            select: {
              estimates: true,
              invoices: true,
              payments: true
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

      const customer = await prisma.customer.create({
        data: {
          customerNumber,
          firstName,
          lastName,
          email,
          phone,
          company,
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
          sameAsBilling,
          taxExempt,
          taxExemptId,
          creditLimit,
          paymentTerms: paymentTerms || 'NET30',
          assignedToId: assignedToId || req.user.id,
          status: status || 'ACTIVE',
          notes,
          internalNotes,
          leadId
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
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

  // PUT /customers/:id - Update customer
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
        internalNotes
      } = req.body;

      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          firstName,
          lastName,
          email,
          phone,
          company,
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
          taxExempt,
          taxExemptId,
          creditLimit,
          paymentTerms,
          assignedToId,
          status,
          notes,
          internalNotes
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true }
          },
          account: true
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('PUT /customers/:id error:', error);
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

  return router;
}
