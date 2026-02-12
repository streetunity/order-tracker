/**
 * Reminders Routes
 * Follow-up reminders for leads, estimates, and invoices
 */

import express from 'express';
import { authGuard } from '../middleware/auth.js';
import { invoicingAuth } from '../middleware/invoicingAuth.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createRemindersRouter() {
  const router = express.Router();

  // ============================================
  // LIST REMINDERS
  // ============================================

  router.get('/', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { status, type, limit = 50, offset = 0 } = req.query;
      const userId = req.user.id;

      const where = {
        assignedToId: userId
      };

      // Filter by status
      if (status) {
        where.status = status;
      } else {
        // Default: show pending reminders
        where.status = 'PENDING';
      }

      // Filter by type
      if (type) {
        where.type = type;
      }

      const reminders = await prisma.reminder.findMany({
        where,
        include: {
          estimate: {
            select: { id: true, estimateNumber: true, customer: { select: { companyName: true, firstName: true, lastName: true } } }
          },
          invoice: {
            select: { id: true, invoiceNumber: true, customer: { select: { companyName: true, firstName: true, lastName: true } } }
          },
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true }
          },
          createdBy: {
            select: { id: true, name: true }
          },
          assignedTo: {
            select: { id: true, name: true }
          }
        },
        orderBy: { dueDate: 'asc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      });

      // Get total count
      const total = await prisma.reminder.count({ where });

      res.json({
        reminders,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('List reminders error:', error);
      res.status(500).json({ error: 'Failed to list reminders' });
    }
  });

  // ============================================
  // GET DUE REMINDERS (for notification triggering)
  // ============================================

  router.get('/due', authGuard, invoicingAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const now = new Date();

      const dueReminders = await prisma.reminder.findMany({
        where: {
          assignedToId: userId,
          status: 'PENDING',
          dueDate: { lte: now }
        },
        include: {
          estimate: {
            select: { id: true, estimateNumber: true }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          },
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true }
          }
        },
        orderBy: { dueDate: 'asc' }
      });

      res.json(dueReminders);
    } catch (error) {
      console.error('Get due reminders error:', error);
      res.status(500).json({ error: 'Failed to get due reminders' });
    }
  });

  // ============================================
  // GET UPCOMING REMINDERS
  // ============================================

  router.get('/upcoming', authGuard, invoicingAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { days = 7 } = req.query;

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + parseInt(days));

      const upcomingReminders = await prisma.reminder.findMany({
        where: {
          assignedToId: userId,
          status: 'PENDING',
          dueDate: {
            gte: now,
            lte: futureDate
          }
        },
        include: {
          estimate: {
            select: { id: true, estimateNumber: true, customer: { select: { companyName: true } } }
          },
          invoice: {
            select: { id: true, invoiceNumber: true, customer: { select: { companyName: true } } }
          },
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true }
          }
        },
        orderBy: { dueDate: 'asc' },
        take: 10
      });

      res.json(upcomingReminders);
    } catch (error) {
      console.error('Get upcoming reminders error:', error);
      res.status(500).json({ error: 'Failed to get upcoming reminders' });
    }
  });

  // ============================================
  // CREATE REMINDER
  // ============================================

  router.post('/', authGuard, invoicingAuth, async (req, res) => {
    try {
      const {
        title,
        description,
        type = 'FOLLOW_UP',
        dueDate,
        estimateId,
        invoiceId,
        leadId,
        assignedToId
      } = req.body;

      if (!title || !dueDate) {
        return res.status(400).json({ error: 'Title and due date are required' });
      }

      // Validate at least one entity is attached
      if (!estimateId && !invoiceId && !leadId) {
        return res.status(400).json({ error: 'Reminder must be attached to a lead, estimate, or invoice' });
      }

      // Use assigned user or default to creator
      const targetUserId = assignedToId || req.user.id;

      const reminder = await prisma.reminder.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          type,
          dueDate: new Date(dueDate),
          status: 'PENDING',
          estimateId: estimateId || null,
          invoiceId: invoiceId || null,
          leadId: leadId || null,
          assignedToId: targetUserId,
          createdById: req.user.id
        },
        include: {
          estimate: {
            select: { id: true, estimateNumber: true }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          },
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true }
          },
          assignedTo: {
            select: { id: true, name: true }
          }
        }
      });

      // If assigning to someone else, create notification
      if (assignedToId && assignedToId !== req.user.id) {
        await prisma.notification.create({
          data: {
            userId: assignedToId,
            type: 'REMINDER_ASSIGNED',
            category: 'INFO',
            title: 'New reminder assigned',
            message: `${req.user.name} assigned you a reminder: ${title}`,
            metadata: JSON.stringify({
              reminderId: reminder.id,
              dueDate: reminder.dueDate,
              type: reminder.type
            })
          }
        });
      }

      // Log activity
      const activityData = {
        type: 'reminder_created',
        description: `${req.user.name} created a reminder: ${title}`,
        performedById: req.user.id,
        metadata: JSON.stringify({
          reminderId: reminder.id,
          dueDate: reminder.dueDate,
          type: reminder.type
        })
      };

      if (leadId) activityData.leadId = leadId;
      if (estimateId) activityData.estimateId = estimateId;
      if (invoiceId) activityData.invoiceId = invoiceId;

      // Get customer ID for activity log
      if (estimateId) {
        const estimate = await prisma.estimate.findUnique({
          where: { id: estimateId },
          select: { customerId: true }
        });
        if (estimate?.customerId) activityData.customerId = estimate.customerId;
      } else if (invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { customerId: true }
        });
        if (invoice?.customerId) activityData.customerId = invoice.customerId;
      }

      await prisma.customerActivityLog.create({ data: activityData });

      res.status(201).json(reminder);
    } catch (error) {
      console.error('Create reminder error:', error);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  });

  // ============================================
  // UPDATE/SNOOZE REMINDER
  // ============================================

  router.patch('/:id', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, dueDate, status, snoozeMinutes } = req.body;

      const existing = await prisma.reminder.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      // Check permission - only assigned user, creator, or admin can update
      if (existing.assignedToId !== req.user.id &&
          existing.createdById !== req.user.id &&
          req.user.role !== 'SUPER_ADMIN' &&
          req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to update this reminder' });
      }

      const updateData = {};

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'COMPLETED') {
          updateData.completedAt = new Date();
        }
      }

      // Handle snooze - add minutes to current time
      if (snoozeMinutes) {
        const newDueDate = new Date();
        newDueDate.setMinutes(newDueDate.getMinutes() + parseInt(snoozeMinutes));
        updateData.dueDate = newDueDate;
      } else if (dueDate) {
        updateData.dueDate = new Date(dueDate);
      }

      const reminder = await prisma.reminder.update({
        where: { id },
        data: updateData,
        include: {
          estimate: {
            select: { id: true, estimateNumber: true }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          },
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true }
          },
          assignedTo: {
            select: { id: true, name: true }
          }
        }
      });

      res.json(reminder);
    } catch (error) {
      console.error('Update reminder error:', error);
      res.status(500).json({ error: 'Failed to update reminder' });
    }
  });

  // ============================================
  // COMPLETE REMINDER
  // ============================================

  router.post('/:id/complete', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.reminder.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      if (existing.assignedToId !== req.user.id &&
          req.user.role !== 'SUPER_ADMIN' &&
          req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to complete this reminder' });
      }

      const reminder = await prisma.reminder.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      res.json(reminder);
    } catch (error) {
      console.error('Complete reminder error:', error);
      res.status(500).json({ error: 'Failed to complete reminder' });
    }
  });

  // ============================================
  // DISMISS REMINDER
  // ============================================

  router.post('/:id/dismiss', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.reminder.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      if (existing.assignedToId !== req.user.id &&
          req.user.role !== 'SUPER_ADMIN' &&
          req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to dismiss this reminder' });
      }

      const reminder = await prisma.reminder.update({
        where: { id },
        data: {
          status: 'DISMISSED'
        }
      });

      res.json(reminder);
    } catch (error) {
      console.error('Dismiss reminder error:', error);
      res.status(500).json({ error: 'Failed to dismiss reminder' });
    }
  });

  // ============================================
  // DELETE REMINDER
  // ============================================

  router.delete('/:id', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.reminder.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      // Only creator or admin can delete
      if (existing.createdById !== req.user.id &&
          req.user.role !== 'SUPER_ADMIN' &&
          req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to delete this reminder' });
      }

      await prisma.reminder.delete({ where: { id } });

      res.json({ success: true, message: 'Reminder deleted' });
    } catch (error) {
      console.error('Delete reminder error:', error);
      res.status(500).json({ error: 'Failed to delete reminder' });
    }
  });

  return router;
}

export default createRemindersRouter;
