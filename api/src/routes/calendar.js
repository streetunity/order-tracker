/**
 * Calendar routes
 * GET    /calendar/events              - fetch events by date range
 * GET    /calendar/orders/search       - search orders for INSTALL dropdown
 * POST   /calendar/events              - create event (never auto-sends email)
 * PUT    /calendar/events/:id          - update event; sends email only when resendEmail=true
 * DELETE /calendar/events/:id          - delete event
 */

import express from 'express';
import { authGuard } from '../middleware/auth.js';
import { sendInstallEmail } from '../services/calendarEmailService.js';

const CREATE_PERMISSIONS = {
  INSTALL:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  TIME_OFF: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  BLOCKED:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  OTHER:    ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
};

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];

function parseAssigneeIds(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function parseEventDate(dateStr, isAllDay) {
  if (isAllDay !== false) {
    const part = String(dateStr).substring(0, 10);
    return new Date(`${part}T12:00:00.000Z`);
  }
  return new Date(dateStr);
}

function toUTCDayStart(dateInput) {
  return new Date(new Date(dateInput).toISOString().substring(0, 10) + 'T00:00:00.000Z');
}
function toUTCDayEnd(dateInput) {
  return new Date(new Date(dateInput).toISOString().substring(0, 10) + 'T23:59:59.999Z');
}

export function createCalendarRouter(prisma) {
  const router = express.Router();

  // ── GET /calendar/events?start=&end= ────────────────────────────────────────
  router.get('/events', authGuard, async (req, res) => {
    try {
      const { start, end } = req.query;
      const user = req.user;

      const where = {};
      if (start && end) {
        where.AND = [
          { startDate: { lte: toUTCDayEnd(end) } },
          { endDate:   { gte: toUTCDayStart(start) } },
        ];
      } else if (start) {
        where.startDate = { gte: toUTCDayStart(start) };
      } else if (end) {
        where.endDate = { lte: toUTCDayEnd(end) };
      }

      const events = await prisma.calendarEvent.findMany({
        where,
        include: {
          order:     { select: { id: true, account: { select: { name: true, contactName: true } } } },
          user:      { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'asc' },
      });

      const allAssigneeIds = [...new Set(events.flatMap(e => parseAssigneeIds(e.assigneeIds)))];
      let assigneeMap = {};
      if (allAssigneeIds.length > 0) {
        const assigneeUsers = await prisma.user.findMany({
          where: { id: { in: allAssigneeIds } },
          select: { id: true, name: true },
        });
        assigneeMap = Object.fromEntries(assigneeUsers.map(u => [u.id, u.name]));
      }

      const sanitized = events.map(e => {
        const assigneeIds = parseAssigneeIds(e.assigneeIds);
        const assignees   = assigneeIds.map(id => ({ id, name: assigneeMap[id] || id }));
        if (e.type === 'TIME_OFF' && user.role === 'AGENT' && e.userId !== user.id) {
          return { ...e, assigneeIds, assignees, title: 'Out of Office', user: null, notes: null };
        }
        return { ...e, assigneeIds, assignees };
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
          { account: { name:        { contains: q , mode: 'insensitive'} } },
          { account: { contactName: { contains: q , mode: 'insensitive'} } },
        ],
      };
      if (user.role === 'AGENT') where.sku = user.name;

      const orders = await prisma.order.findMany({
        where,
        include: { account: { select: { name: true, contactName: true } } },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      res.json(orders.map(o => {
        const name    = o.account?.name || 'Unknown';
        const contact = o.account?.contactName;
        return {
          id:          o.id,
          accountName: name,
          contactName: contact,
          label:       contact ? `${name} \u2014 ${contact}` : name,
        };
      }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /calendar/events ───────────────────────────────────────────────────
  router.post('/events', authGuard, async (req, res) => {
    try {
      const { type, title, startDate, endDate, allDay, orderId, userId, notes, assigneeIds } = req.body;
      const user = req.user;

      const allowedRoles = CREATE_PERMISSIONS[type];
      if (!allowedRoles)                     return res.status(400).json({ error: 'Invalid event type' });
      if (!allowedRoles.includes(user.role))  return res.status(403).json({ error: 'Insufficient permissions' });
      if (!startDate)                         return res.status(400).json({ error: 'startDate is required' });

      let targetUserId = userId;
      if (type === 'TIME_OFF' && user.role === 'AGENT') targetUserId = user.id;

      const isAllDay  = allDay !== false;
      const startUTC  = parseEventDate(startDate, isAllDay);
      const endUTC    = parseEventDate(endDate || startDate, isAllDay);

      const event = await prisma.calendarEvent.create({
        data: {
          type,
          title:            title || buildTitle(type, null, user.name),
          startDate:        startUTC,
          endDate:          endUTC,
          allDay:           isAllDay,
          orderId:          type === 'INSTALL'  ? (orderId || null)      : null,
          userId:           type === 'TIME_OFF' ? (targetUserId || null) : null,
          assigneeIds:      type === 'INSTALL'  ? JSON.stringify(Array.isArray(assigneeIds) ? assigneeIds : []) : '[]',
          createdById:      user.id,
          notes:            notes || null,
          customerNotified: false,
        },
        include: {
          order:     { select: { id: true, account: { select: { name: true, contactName: true } } } },
          user:      { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      if (type === 'INSTALL' && orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data:  { onsiteInstallationDate: startUTC },
        }).catch(e => console.error('[CALENDAR] Failed to sync onsiteInstallationDate:', e));
      }

      const ids = parseAssigneeIds(event.assigneeIds);
      res.status(201).json({ ...event, assigneeIds: ids, assignees: ids.map(id => ({ id })) });
    } catch (err) {
      console.error('[CALENDAR] POST /events error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PUT /calendar/events/:id ────────────────────────────────────────────────
  router.put('/events/:id', authGuard, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, startDate, endDate, notes, resendEmail, assigneeIds } = req.body;
      const user = req.user;

      const existing = await prisma.calendarEvent.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Event not found' });

      const canEdit = ADMIN_ROLES.includes(user.role) || existing.createdById === user.id;
      if (!canEdit) return res.status(403).json({ error: 'Insufficient permissions' });

      const startUTC = startDate ? parseEventDate(startDate, existing.allDay) : undefined;
      const endUTC   = endDate   ? parseEventDate(endDate,   existing.allDay) : undefined;

      const updated = await prisma.calendarEvent.update({
        where: { id },
        data: {
          ...(title       !== undefined && { title }),
          ...(startUTC    !== undefined && { startDate: startUTC }),
          ...(endUTC      !== undefined && { endDate:   endUTC }),
          ...(notes       !== undefined && { notes }),
          ...(assigneeIds !== undefined && existing.type === 'INSTALL' && {
            assigneeIds: JSON.stringify(Array.isArray(assigneeIds) ? assigneeIds : []),
          }),
        },
        include: {
          order:     { select: { id: true, account: { select: { name: true, contactName: true } } } },
          user:      { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      if (existing.type === 'INSTALL' && existing.orderId && startUTC) {
        await prisma.order.update({
          where: { id: existing.orderId },
          data:  { onsiteInstallationDate: startUTC },
        }).catch(e => console.error('[CALENDAR] Failed to sync onsiteInstallationDate on update:', e));
      }

      if (existing.type === 'INSTALL' && resendEmail) {
        try {
          const isReschedule = existing.customerNotified;
          const emailResult  = await sendInstallEmail(prisma, { calendarEvent: updated, isReschedule });
          if (emailResult.success) {
            await prisma.calendarEvent.update({ where: { id }, data: { customerNotified: true } });
            updated.customerNotified = true;
          }
        } catch (emailErr) {
          console.error('[CALENDAR] Email error on manual send:', emailErr);
        }
      }

      const ids = parseAssigneeIds(updated.assigneeIds);
      res.json({ ...updated, assigneeIds: ids, assignees: ids.map(id => ({ id })) });
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

      if (existing.type === 'INSTALL' && existing.orderId) {
        await prisma.order.update({
          where: { id: existing.orderId },
          data:  { onsiteInstallationDate: null },
        }).catch(() => {});
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[CALENDAR] DELETE /events/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function buildTitle(type, order, userName) {
  if (type === 'INSTALL'  && order) return `Install \u2014 ${order.account?.name || order.id}`;
  if (type === 'TIME_OFF')          return `${userName || 'Team Member'} \u2014 Out of Office`;
  if (type === 'BLOCKED')           return 'Blocked';
  if (type === 'OTHER')             return 'Other';
  return type;
}
