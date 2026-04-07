/**
 * Calendar routes
 * GET    /calendar/events              - fetch events by date range
 * GET    /calendar/orders/search       - search orders for INSTALL dropdown
 * POST   /calendar/events              - create event
 * PUT    /calendar/events/:id          - update event
 * DELETE /calendar/events/:id          - delete event
 */

import express from 'express';
import { authGuard } from '../middleware/auth.js';
import { sendInstallEmail } from '../services/calendarEmailService.js';

// Which roles can create each event type
const CREATE_PERMISSIONS = {
  INSTALL:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  TIME_OFF: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  BLOCKED:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
};

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];

export function createCalendarRouter(prisma) {
  const router = express.Router();

  // ── GET /calendar/events?start=&end= ────────────────────────────────────────
  router.get('/events', authGuard, async (req, res) => {
    try {
      const { start, end } = req.query;
      const user = req.user;

      const where = {};
      if (start || end) {
        where.OR = [
          {
            startDate: {
              ...(start ? { gte: new Date(start) } : {}),
              ...(end   ? { lte: new Date(end)   } : {}),
            },
          },
          {
            endDate: {
              ...(start ? { gte: new Date(start) } : {}),
              ...(end   ? { lte: new Date(end)   } : {}),
            },
          },
        ];
      }

      const events = await prisma.calendarEvent.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              poNumber: true,
              account: { select: { name: true } },
            },
          },
          user:      { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'asc' },
      });

      // Agents see other users' TIME_OFF anonymised (date visible, no name/notes)
      const sanitized = events.map(e => {
        if (e.type === 'TIME_OFF' && user.role === 'AGENT' && e.userId !== user.id) {
          return { ...e, title: 'Time Off', user: null, notes: null };
        }
        return e;
      });

      res.json(sanitized);
    } catch (err) {
      console.error('[CALENDAR] GET /events error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /calendar/orders/search?q= ─────────────────────────────────────────
  router.get('/orders/search', authGuard, async (req, res) => {
    try {
      const { q = '' } = req.query;
      const user = req.user;

      if (q.length < 1) return res.json([]);

      const where = {
        isArchived: false,
        OR: [
          { poNumber: { contains: q } },
          { account: { name: { contains: q } } },
          { id: { contains: q } },
        ],
      };

      // Agents only see their own orders
      if (user.role === 'AGENT') {
        where.sku = user.name;
      }

      const orders = await prisma.order.findMany({
        where,
        include: { account: { select: { name: true } } },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      res.json(orders.map(o => ({
        id:          o.id,
        poNumber:    o.poNumber,
        accountName: o.account?.name,
        label:       `${o.account?.name || 'Unknown'} \u2014 ${o.poNumber || o.id.slice(-8).toUpperCase()}`,
      })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /calendar/events ───────────────────────────────────────────────────
  router.post('/events', authGuard, async (req, res) => {
    try {
      const { type, title, startDate, endDate, allDay, orderId, userId, notes } = req.body;
      const user = req.user;

      const allowedRoles = CREATE_PERMISSIONS[type];
      if (!allowedRoles) return res.status(400).json({ error: 'Invalid event type' });
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
      if (!startDate) return res.status(400).json({ error: 'startDate is required' });

      // Agents can only create TIME_OFF for themselves
      let targetUserId = userId;
      if (type === 'TIME_OFF' && user.role === 'AGENT') {
        targetUserId = user.id;
      }

      const event = await prisma.calendarEvent.create({
        data: {
          type,
          title: title || buildTitle(type, null, user.name),
          startDate:        new Date(startDate),
          endDate:          new Date(endDate || startDate),
          allDay:           allDay !== false,
          orderId:          type === 'INSTALL'  ? (orderId  || null) : null,
          userId:           type === 'TIME_OFF' ? (targetUserId || null) : null,
          createdById:      user.id,
          notes:            notes || null,
          customerNotified: false,
        },
        include: {
          order: { select: { id: true, poNumber: true, account: { select: { name: true } } } },
          user:      { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Sync onsiteInstallationDate on the Order
      if (type === 'INSTALL' && orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data:  { onsiteInstallationDate: new Date(startDate) },
        }).catch(e => console.error('[CALENDAR] Failed to sync onsiteInstallationDate:', e));

        // Send customer email
        try {
          const emailResult = await sendInstallEmail(prisma, { calendarEvent: event, isReschedule: false });
          if (emailResult.success) {
            await prisma.calendarEvent.update({
              where: { id: event.id },
              data:  { customerNotified: true },
            });
            event.customerNotified = true;
          }
        } catch (emailErr) {
          console.error('[CALENDAR] Email error on create:', emailErr);
        }
      }

      res.status(201).json(event);
    } catch (err) {
      console.error('[CALENDAR] POST /events error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PUT /calendar/events/:id ────────────────────────────────────────────────
  router.put('/events/:id', authGuard, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, startDate, endDate, notes, resendEmail } = req.body;
      const user = req.user;

      const existing = await prisma.calendarEvent.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Event not found' });

      const canEdit = ADMIN_ROLES.includes(user.role) || existing.createdById === user.id;
      if (!canEdit) return res.status(403).json({ error: 'Insufficient permissions' });

      const dateChanged = startDate &&
        new Date(startDate).toDateString() !== new Date(existing.startDate).toDateString();

      const updated = await prisma.calendarEvent.update({
        where: { id },
        data: {
          ...(title     !== undefined && { title }),
          ...(startDate !== undefined && { startDate: new Date(startDate) }),
          ...(endDate   !== undefined && { endDate:   new Date(endDate) }),
          ...(notes     !== undefined && { notes }),
        },
        include: {
          order: { select: { id: true, poNumber: true, account: { select: { name: true } } } },
          user:      { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Keep onsiteInstallationDate in sync
      if (existing.type === 'INSTALL' && existing.orderId && startDate) {
        await prisma.order.update({
          where: { id: existing.orderId },
          data:  { onsiteInstallationDate: new Date(startDate) },
        }).catch(e => console.error('[CALENDAR] Failed to sync onsiteInstallationDate on update:', e));
      }

      // Resend email if date changed or explicitly requested
      if (existing.type === 'INSTALL' && (dateChanged || resendEmail)) {
        try {
          const emailResult = await sendInstallEmail(prisma, { calendarEvent: updated, isReschedule: true });
          if (emailResult.success) {
            await prisma.calendarEvent.update({
              where: { id },
              data:  { customerNotified: true },
            });
            updated.customerNotified = true;
          }
        } catch (emailErr) {
          console.error('[CALENDAR] Email error on update:', emailErr);
        }
      }

      res.json(updated);
    } catch (err) {
      console.error('[CALENDAR] PUT /events/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /calendar/events/:id ─────────────────────────────────────────────
  router.delete('/events/:id', authGuard, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const existing = await prisma.calendarEvent.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Event not found' });

      const canDelete = ADMIN_ROLES.includes(user.role) || existing.createdById === user.id;
      if (!canDelete) return res.status(403).json({ error: 'Insufficient permissions' });

      await prisma.calendarEvent.delete({ where: { id } });

      // Clear onsiteInstallationDate
      if (existing.type === 'INSTALL' && existing.orderId) {
        await prisma.order.update({
          where: { id: existing.orderId },
          data:  { onsiteInstallationDate: null },
        }).catch(() => {}); // Ignore if order already deleted
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[CALENDAR] DELETE /events/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTitle(type, order, userName) {
  if (type === 'INSTALL'  && order) return `Install \u2014 ${order.account?.name || order.id}`;
  if (type === 'TIME_OFF')          return `${userName || 'Team Member'} \u2014 Time Off`;
  if (type === 'BLOCKED')           return 'Blocked';
  return type;
}
