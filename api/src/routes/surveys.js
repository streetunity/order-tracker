/**
 * surveys.js
 *
 * Admin-facing customer satisfaction survey reporting. Mounted under /surveys
 * behind authGuard + nonManufacturerGuard.
 *
 *   GET /surveys            list + summary aggregates (filterable)
 *   GET /surveys/export.csv CSV of the filtered surveys
 *   GET /surveys/:id        single survey detail with answers + question text
 *
 * Agents see only surveys attributed to them (salesAgent === their name);
 * admins, super-admins, and accountants see everything.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { getSurveyDefinition, questionMap } from '../config/surveyQuestions.js';

const PHASE_LABELS = {
  MANUFACTURING: 'Manufacturing',
  CONTAINER_AT_SEA: 'Container At Sea',
  COMPLETION: 'Completion',
};

export function createSurveysRouter(prismaClient) {
  const prisma = prismaClient || new PrismaClient();
  const router = express.Router();

  // Build the Prisma where-clause from query filters + agent scoping.
  function buildWhere(req) {
    const { phase, agent, model, flagged, status, from, to } = req.query;
    const where = {};
    if (phase) where.phase = phase;
    if (model) where.machineModel = model;
    if (status) where.status = status;
    if (flagged === 'true') where.flagged = true;

    // Agent scoping: agents only see their own; others may filter by agent.
    if (req.user?.role === 'AGENT') {
      where.salesAgent = req.user.name;
    } else if (agent) {
      where.salesAgent = agent;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    return where;
  }

  function serialize(s) {
    return {
      id: s.id,
      token: s.token,
      phase: s.phase,
      phaseLabel: PHASE_LABELS[s.phase] || s.phase,
      status: s.status,
      salesAgent: s.salesAgent,
      machineModel: s.machineModel,
      overallScore: s.overallScore,
      flagged: s.flagged,
      contactRequested: s.contactRequested,
      testimonialWillingness: s.testimonialWillingness,
      sentAt: s.sentAt,
      completedAt: s.completedAt,
      createdAt: s.createdAt,
      orderId: s.orderId,
      orderRef: s.order?.poNumber || (s.orderId ? s.orderId.slice(-8).toUpperCase() : ''),
      customerName: s.order?.account?.name || null,
    };
  }

  function summarize(surveys) {
    const completed = surveys.filter((s) => s.status === 'COMPLETED');
    const scored = completed.filter((s) => s.overallScore != null);

    const avgBy = (keyFn) => {
      const m = new Map();
      for (const s of scored) {
        const k = keyFn(s) || 'Unassigned';
        const e = m.get(k) || { sum: 0, count: 0 };
        e.sum += s.overallScore;
        e.count += 1;
        m.set(k, e);
      }
      return [...m.entries()]
        .map(([key, v]) => ({ key, avg: v.count ? v.sum / v.count : null, count: v.count }))
        .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    };

    const avgOverall = scored.length
      ? scored.reduce((a, s) => a + s.overallScore, 0) / scored.length
      : null;

    return {
      totalSurveys: surveys.length,
      completed: completed.length,
      pending: surveys.filter((s) => s.status !== 'COMPLETED').length,
      avgOverall,
      flagged: completed.filter((s) => s.flagged).length,
      contactRequests: completed.filter((s) => s.contactRequested).length,
      testimonialsYes: completed.filter((s) => s.testimonialWillingness === 'YES').length,
      testimonialsMaybe: completed.filter((s) => s.testimonialWillingness === 'MAYBE').length,
      avgByAgent: avgBy((s) => s.salesAgent),
      avgByModel: avgBy((s) => s.machineModel),
      avgByPhase: avgBy((s) => PHASE_LABELS[s.phase] || s.phase),
    };
  }

  // List + aggregates
  router.get('/', async (req, res) => {
    try {
      const where = buildWhere(req);
      const surveys = await prisma.survey.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { poNumber: true, account: { select: { name: true } } } },
        },
      });
      res.json({ surveys: surveys.map(serialize), summary: summarize(surveys) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CSV export (filtered). Must be declared before '/:id'.
  router.get('/export.csv', async (req, res) => {
    try {
      const where = buildWhere(req);
      const surveys = await prisma.survey.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { poNumber: true, account: { select: { name: true } } } },
        },
      });

      const esc = (v) => {
        const str = v == null ? '' : String(v);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const header = [
        'Date', 'Customer', 'Order', 'Phase', 'Sales Agent', 'Machine',
        'Status', 'Overall Score', 'Flagged', 'Contact Requested', 'Testimonial',
      ];
      const lines = [header.join(',')];
      for (const s of surveys) {
        const r = serialize(s);
        lines.push([
          r.completedAt || r.createdAt ? new Date(r.completedAt || r.createdAt).toISOString().slice(0, 10) : '',
          r.customerName,
          r.orderRef,
          r.phaseLabel,
          r.salesAgent,
          r.machineModel,
          r.status,
          r.overallScore != null ? r.overallScore.toFixed(2) : '',
          r.flagged ? 'YES' : '',
          r.contactRequested ? 'YES' : '',
          r.testimonialWillingness || '',
        ].map(esc).join(','));
      }
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="survey-results.csv"');
      res.send(csv);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Single survey detail with answers + resolved question text
  router.get('/:id', async (req, res) => {
    try {
      const survey = await prisma.survey.findUnique({
        where: { id: req.params.id },
        include: {
          answers: true,
          order: { select: { poNumber: true, account: { select: { name: true, contactName: true } } } },
        },
      });
      if (!survey) return res.status(404).json({ error: 'Survey not found' });

      // Agent scoping on detail view.
      if (req.user?.role === 'AGENT' && survey.salesAgent !== req.user.name) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const def = getSurveyDefinition(survey.phase);
      const qmap = questionMap(survey.phase);
      const answers = [...survey.answers]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((a) => {
          const q = qmap.get(a.questionKey);
          let choiceLabel = null;
          if (a.choice && q?.options) {
            choiceLabel = q.options.find((o) => o.value === a.choice)?.label || a.choice;
          }
          return {
            questionKey: a.questionKey,
            questionText: q?.text || a.questionKey,
            type: q?.type || null,
            rating: a.rating,
            choice: a.choice,
            choiceLabel,
            comment: a.comment,
          };
        });

      res.json({
        ...serialize(survey),
        title: def?.title || survey.phase,
        contactName: survey.order?.account?.contactName || null,
        answers,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createSurveysRouter;
