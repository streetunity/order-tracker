/**
 * Calendar ICS feed
 *
 * GET /:token.ics
 *   Public endpoint. Token IS the auth -- looks up the owning user by
 *   their icsToken and returns all calendar events visible to that user
 *   serialized as RFC 5545 iCalendar text/calendar.
 *
 * Visibility mirrors the in-app calendar:
 *   - All roles see all four event types (INSTALL, TIME_OFF, BLOCKED, OTHER).
 *   - For AGENT viewing others' TIME_OFF events, details are sanitized to
 *     just "Out of Office" with no notes -- same as calendar.js GET /events.
 */

import express from 'express';

const AGENT_ROLE = 'AGENT';

function parseAssigneeIds(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// Escape special characters per RFC 5545 section 3.3.11.
function escapeIcs(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

// Fold lines longer than 75 octets per RFC 5545 section 3.1.
// Continuation lines start with a single space.
function foldLine(line) {
  if (line.length <= 75) return line;
  const out = [];
  out.push(line.substring(0, 75));
  let remaining = line.substring(75);
  while (remaining.length > 74) {
    out.push(' ' + remaining.substring(0, 74));
    remaining = remaining.substring(74);
  }
  if (remaining.length > 0) out.push(' ' + remaining);
  return out.join('\r\n');
}

// "20260512T170000Z" -- UTC datetime for timed events.
function fmtUtcDateTime(d) {
  const date = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

// "20260512" -- date-only for all-day events.
function fmtDate(d) {
  const date = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate())
  );
}

// All-day DTEND must be the day AFTER the last day (exclusive end per RFC).
function fmtDatePlusOne(d) {
  const date = new Date(d);
  date.setUTCDate(date.getUTCDate() + 1);
  return fmtDate(date);
}

function buildEventLines(evt, assigneeMap, viewerRole, viewerId) {
  const lines = [];

  const isAllDay    = evt.allDay !== false;
  const isSanitized = evt.type === 'TIME_OFF' && viewerRole === AGENT_ROLE && evt.userId !== viewerId;

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:evt-${evt.id}@smt-orders.com`);
  lines.push(`DTSTAMP:${fmtUtcDateTime(new Date())}`);
  lines.push(`CREATED:${fmtUtcDateTime(evt.createdAt)}`);
  lines.push(`LAST-MODIFIED:${fmtUtcDateTime(evt.updatedAt)}`);

  if (isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(evt.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDatePlusOne(evt.endDate)}`);
  } else {
    lines.push(`DTSTART:${fmtUtcDateTime(evt.startDate)}`);
    lines.push(`DTEND:${fmtUtcDateTime(evt.endDate)}`);
  }

  const title = isSanitized ? 'Out of Office' : (evt.title || 'Event');
  lines.push(`SUMMARY:${escapeIcs(title)}`);

  // Description: customer info, assignees, notes (skipped for sanitized).
  const descParts = [];
  if (evt.type === 'INSTALL') {
    if (evt.order?.account?.name)        descParts.push(`Customer: ${evt.order.account.name}`);
    if (evt.order?.account?.contactName) descParts.push(`Contact: ${evt.order.account.contactName}`);
    const ids = parseAssigneeIds(evt.assigneeIds);
    if (ids.length > 0) {
      const names = ids.map(id => assigneeMap[id] || id);
      descParts.push(`Assigned: ${names.join(', ')}`);
    }
  }
  if (evt.type === 'TIME_OFF' && !isSanitized && evt.user?.name) {
    descParts.push(`Team Member: ${evt.user.name}`);
  }
  if (evt.notes && !isSanitized) descParts.push(evt.notes);
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcs(descParts.join('\n'))}`);
  }

  lines.push(`CATEGORIES:${escapeIcs(evt.type)}`);
  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');
  lines.push('END:VEVENT');

  return lines.map(foldLine);
}

export function createCalendarFeedRouter(prisma) {
  const router = express.Router();

  router.get('/:token.ics', async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 32) {
        return res.status(404).type('text/plain').send('Not found');
      }

      const user = await prisma.user.findUnique({
        where:  { icsToken: token },
        select: { id: true, role: true, isActive: true, name: true },
      });
      if (!user || !user.isActive) {
        return res.status(404).type('text/plain').send('Not found');
      }

      const events = await prisma.calendarEvent.findMany({
        include: {
          order: { select: { id: true, account: { select: { name: true, contactName: true } } } },
          user:  { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'asc' },
      });

      // Resolve assignee names in one query.
      const allAssigneeIds = [...new Set(events.flatMap(e => parseAssigneeIds(e.assigneeIds)))];
      let assigneeMap = {};
      if (allAssigneeIds.length > 0) {
        const assigneeUsers = await prisma.user.findMany({
          where:  { id: { in: allAssigneeIds } },
          select: { id: true, name: true },
        });
        assigneeMap = Object.fromEntries(assigneeUsers.map(u => [u.id, u.name]));
      }

      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Stealth Machine Tools//Order Tracker//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        foldLine(`X-WR-CALNAME:${escapeIcs(`SMT Order Tracker -- ${user.name}`)}`),
        'X-WR-TIMEZONE:UTC',
      ];

      for (const evt of events) {
        lines.push(...buildEventLines(evt, assigneeMap, user.role, user.id));
      }

      lines.push('END:VCALENDAR');

      const body = lines.join('\r\n') + '\r\n';

      res.setHeader('Content-Type',        'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="smt-calendar.ics"');
      res.setHeader('Cache-Control',       'private, max-age=3600');
      res.send(body);
    } catch (err) {
      // Log only a token prefix to avoid leaking credentials in logs.
      const t = req.params.token || '';
      const safeId = t.length >= 12 ? `${t.substring(0, 8)}...${t.substring(t.length - 4)}` : '(short)';
      console.error(`[CALENDAR FEED] error for token ${safeId}:`, err);
      res.status(500).type('text/plain').send('Internal error');
    }
  });

  return router;
}

export default createCalendarFeedRouter;
