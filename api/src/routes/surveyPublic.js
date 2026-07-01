/**
 * surveyPublic.js
 *
 * Unauthenticated, token-based customer survey endpoints. Mounted at /public
 * (public URL /api/public/survey/:token; Nginx strips the /api prefix).
 *
 *   GET  /survey/:token  -> survey definition + questions, or a completed marker
 *   POST /survey/:token  -> submit answers (submit-once, race-safe)
 *
 * The question catalog (surveyQuestions.js) is the single source of truth;
 * the frontend renders whatever questions this endpoint returns. Submission
 * derives overallScore (avg of rating answers), flagged (any rating <= 3),
 * contactRequested, and testimonialWillingness, then locks the survey.
 *
 * Outbound side-effects (management notification, follow-up, digest) are added
 * in the next step; this endpoint only persists the submission.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { rateLimit } from '../rateLimit.js';
import {
  getSurveyDefinition,
  questionMap,
  isValidRating,
  RATING_SCALE,
} from '../config/surveyQuestions.js';
import { dispatchSubmissionEffects } from '../services/surveyService.js';

export function createSurveyPublicRouter(prismaClient) {
  const prisma = prismaClient || new PrismaClient();
  const router = express.Router();

  router.use(rateLimit);

  // Public survey read. Returns the question set unless already completed.
  router.get('/survey/:token', async (req, res) => {
    try {
      const survey = await prisma.survey.findUnique({
        where: { token: req.params.token },
        include: {
          order: { select: { account: { select: { contactName: true, name: true } } } },
        },
      });

      if (!survey) return res.status(404).json({ error: 'Survey not found' });

      const def = getSurveyDefinition(survey.phase);
      if (!def) return res.status(404).json({ error: 'Survey definition not found' });

      const contactName =
        survey.order?.account?.contactName || survey.order?.account?.name || null;

      if (survey.status === 'COMPLETED') {
        return res.json({
          token: survey.token,
          phase: survey.phase,
          title: def.title,
          completed: true,
          completedAt: survey.completedAt,
          contactName,
        });
      }

      // Strip internal-only flags from options before sending to the client.
      const questions = def.questions.map((q) => ({
        key: q.key,
        type: q.type,
        text: q.text,
        commentEnabled: !!q.commentEnabled,
        options: Array.isArray(q.options)
          ? q.options.map((o) => ({ value: o.value, label: o.label }))
          : undefined,
      }));

      return res.json({
        token: survey.token,
        phase: survey.phase,
        title: def.title,
        completed: false,
        contactName,
        ratingScale: { min: RATING_SCALE.min, max: RATING_SCALE.max, labels: RATING_SCALE.labels },
        questions,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Public survey submit. Submit-once, validated against the catalog.
  router.post('/survey/:token', async (req, res) => {
    try {
      const survey = await prisma.survey.findUnique({
        where: { token: req.params.token },
        select: { id: true, phase: true, status: true },
      });

      if (!survey) return res.status(404).json({ error: 'Survey not found' });
      if (survey.status === 'COMPLETED') {
        return res.status(409).json({ error: 'This survey has already been submitted.' });
      }

      const def = getSurveyDefinition(survey.phase);
      if (!def) return res.status(400).json({ error: 'Unknown survey phase' });

      const qmap = questionMap(survey.phase);
      const incoming = Array.isArray(req.body?.answers) ? req.body.answers : [];
      const byKey = new Map();
      for (const a of incoming) {
        if (a && typeof a.questionKey === 'string') byKey.set(a.questionKey, a);
      }

      // Validate every catalog question and build answer rows in catalog order.
      const rows = [];
      const ratings = [];
      let flagged = false;
      let contactRequested = false;
      let testimonialWillingness = null;

      for (let i = 0; i < def.questions.length; i++) {
        const q = def.questions[i];
        const a = byKey.get(q.key) || {};
        const comment =
          typeof a.comment === 'string' && a.comment.trim() ? a.comment.trim() : null;

        if (q.type === 'rating') {
          const rating = Number(a.rating);
          if (!isValidRating(rating)) {
            return res.status(400).json({ error: `Please rate: "${q.text}"` });
          }
          ratings.push(rating);
          if (rating <= RATING_SCALE.flagThreshold) flagged = true;
          rows.push({ questionKey: q.key, rating, choice: null, comment, sortOrder: i });
        } else if (q.type === 'choice') {
          const opt = (q.options || []).find((o) => o.value === a.choice);
          if (!opt) {
            return res.status(400).json({ error: `Please answer: "${q.text}"` });
          }
          if (q.role === 'contact' && opt.triggersContact) contactRequested = true;
          if (q.role === 'testimonial' && opt.testimonialValue) {
            testimonialWillingness = opt.testimonialValue;
          }
          rows.push({ questionKey: q.key, rating: null, choice: opt.value, comment, sortOrder: i });
        } else {
          // text: the free-text answer lives in comment
          const text =
            typeof a.comment === 'string' && a.comment.trim()
              ? a.comment.trim()
              : typeof a.text === 'string' && a.text.trim()
              ? a.text.trim()
              : null;
          rows.push({ questionKey: q.key, rating: null, choice: null, comment: text, sortOrder: i });
        }
      }

      const overallScore = ratings.length
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length
        : null;

      // Race-safe submit-once: claim the survey by flipping status only if it
      // is not already COMPLETED. If another request won the race, count is 0.
      try {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.survey.updateMany({
            where: { id: survey.id, status: { not: 'COMPLETED' } },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              overallScore,
              flagged,
              contactRequested,
              testimonialWillingness,
            },
          });
          if (claim.count === 0) {
            const err = new Error('ALREADY_COMPLETED');
            err.code = 'ALREADY_COMPLETED';
            throw err;
          }
          await tx.surveyAnswer.createMany({
            data: rows.map((r) => ({ ...r, surveyId: survey.id })),
          });
        });
      } catch (err) {
        if (err.code === 'ALREADY_COMPLETED') {
          return res.status(409).json({ error: 'This survey has already been submitted.' });
        }
        throw err;
      }

      console.log(
        `[SURVEY] Submission recorded for survey ${survey.id} (${survey.phase}); score=${overallScore}, flagged=${flagged}, contact=${contactRequested}`
      );

      // Fire-and-forget: management notification + actionable email. Must never
      // block or fail the customer's submission response.
      dispatchSubmissionEffects(prisma, survey.id).catch((e) =>
        console.error('[SURVEY] dispatchSubmissionEffects threw:', e.message)
      );

      return res.json({ ok: true, overallScore, flagged });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createSurveyPublicRouter;
