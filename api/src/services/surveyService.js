/**
 * surveyService.js
 *
 * Customer satisfaction survey generation + invitation.
 *
 * A survey is created ONCE per order per phase, fired when the FIRST item of
 * an order reaches a trigger stage (MANUFACTURING -> manufacturing survey,
 * AT_SEA -> at-sea survey, COMPLETED -> completion survey). The first item to
 * reach the stage creates the survey; later items find it already present and
 * no-op (app-level dedup on order+phase).
 *
 * On creation the survey snapshots the sales agent (order.sku), machine model
 * (triggering item's productCode), and recipient email (account.email) so
 * later reassignments or edits never rewrite historical attribution. An email
 * invite is sent immediately and recorded in AlertEmailLog. The same link is
 * always reachable from the customer portal regardless of email success.
 *
 * Design principle: a survey failure must NEVER break the stage-move flow that
 * triggered it. Every public entry point is wrapped so the caller can treat
 * this as fire-and-forget.
 */

import { newTrackingToken } from "../state.js";
import {
  STAGE_TO_PHASE,
  SURVEY_PHASES,
  getSurveyDefinition,
} from "../config/surveyQuestions.js";
import emailService from "./emailService.js";
import { logAlertEmail } from "./alertEmailLogger.js";

const ALERT_CATEGORY = "SURVEY_INVITE";

// Phase-specific customer-facing email copy. Kept here (not in the catalog)
// because it is invitation framing, not survey content.
const PHASE_EMAIL = {
  [SURVEY_PHASES.MANUFACTURING]: {
    subject: "Your Stealth Machine Tools order - a quick check-in",
    heading: "Your machine is in manufacturing",
    intro:
      "Your machine has entered manufacturing. We would love a quick read on how your experience has been so far. It takes about a minute.",
  },
  [SURVEY_PHASES.CONTAINER_AT_SEA]: {
    subject: "Your machine is on its way - a quick check-in",
    heading: "Your machine has shipped",
    intro:
      "Your machine has left the factory and is on its way to you. We would love a quick read on your experience so far. It takes about a minute.",
  },
  [SURVEY_PHASES.COMPLETION]: {
    subject: "How did we do? Your Stealth Machine Tools experience",
    heading: "How did we do?",
    intro:
      "Now that your machine is installed and running, we would love your feedback on the full experience from purchase through installation.",
  },
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function surveyUrl(token) {
  const base = process.env.FRONTEND_URL || "https://smt-orders.com";
  return `${base}/survey/${token}`;
}

function buildInviteEmail({ survey, phaseCopy, contactName }) {
  const url = surveyUrl(survey.token);
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hello,";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; color: #333;">
      <h2 style="color: #dc2626; margin-bottom: 16px;">${escapeHtml(phaseCopy.heading)}</h2>
      <p>${greeting}</p>
      <p>${escapeHtml(phaseCopy.intro)}</p>
      <p style="margin-top: 24px;">
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Share your feedback</a>
      </p>
      <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">
        Or paste this link into your browser:<br>
        <a href="${url}" style="color: #dc2626;">${url}</a>
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
        You are receiving this because you have an active order with Stealth Machine Tools.
      </p>
    </div>
  `;

  const text = [
    greeting,
    "",
    phaseCopy.intro,
    "",
    `Share your feedback: ${url}`,
    "",
    "You are receiving this because you have an active order with Stealth Machine Tools.",
  ].join("\n");

  return { subject: phaseCopy.subject, html, text };
}

/**
 * Send the invitation email for an already-created survey and mark it SENT.
 * Leaves the survey PENDING (re-sendable) if there is no recipient email or
 * the send fails. Never throws.
 *
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendSurveyInvite(prisma, survey, { contactName } = {}) {
  try {
    const phaseCopy = PHASE_EMAIL[survey.phase];
    if (!phaseCopy) {
      return { sent: false, reason: `Unknown phase ${survey.phase}` };
    }

    const to = survey.recipientEmail;
    if (!to) {
      console.log(
        `[SURVEY] Survey ${survey.id} has no recipient email; left PENDING (portal link still valid)`
      );
      return { sent: false, reason: "No recipient email" };
    }

    const company = await emailService.getCompanySettings(prisma);
    const fromEmail =
      company.email || process.env.SES_FROM_EMAIL || "orders@stealthlaser.com";
    const fromName = company.companyName || "Stealth Machine Tools";

    const { subject, html, text } = buildInviteEmail({
      survey,
      phaseCopy,
      contactName,
    });

    const result = await emailService.sendEmail({
      to,
      from: fromEmail,
      fromName,
      subject,
      html,
      text,
    });

    if (result.success) {
      await prisma.survey.update({
        where: { id: survey.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    }

    logAlertEmail({
      category: ALERT_CATEGORY,
      fromEmail,
      fromName,
      toEmail: to,
      subject,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.success ? null : result.error,
      sesMessageId: result.messageId || null,
      orderId: survey.orderId,
      metadata: {
        surveyId: survey.id,
        phase: survey.phase,
        triggerStage: survey.triggerStage,
        salesAgent: survey.salesAgent,
        machineModel: survey.machineModel,
      },
    });

    if (!result.success) {
      console.error(
        `[SURVEY] Invite email failed for survey ${survey.id}: ${result.error}`
      );
      return { sent: false, reason: result.error };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[SURVEY] sendSurveyInvite error for ${survey?.id}:`, e.message);
    return { sent: false, reason: e.message };
  }
}

/**
 * Create (once) the survey for an order+phase and send its invite.
 * Idempotent on (orderId, phase): if one already exists, no-op.
 *
 * @param {PrismaClient} prisma
 * @param {object} args
 * @param {string} args.orderId
 * @param {string} args.phase           SURVEY_PHASES value
 * @param {string} args.triggerStage    canonical stage that fired it (audit)
 * @param {object} [args.triggeringItem] the item that reached the stage
 * @returns {Promise<{created: boolean, skipped?: boolean, reason?: string, survey?: object}>}
 */
export async function generateSurveyForPhase(prisma, {
  orderId,
  phase,
  triggerStage,
  triggeringItem,
}) {
  try {
    const def = getSurveyDefinition(phase);
    if (!def) {
      return { created: false, skipped: true, reason: `Unknown phase ${phase}` };
    }

    // Dedup: one survey per order per phase (first item to arrive wins).
    const existing = await prisma.survey.findFirst({
      where: { orderId, phase },
      select: { id: true },
    });
    if (existing) {
      return { created: false, skipped: true, reason: "Already exists" };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sku: true,
        account: { select: { email: true, name: true, contactName: true } },
      },
    });
    if (!order) {
      return { created: false, skipped: true, reason: "Order not found" };
    }

    const survey = await prisma.survey.create({
      data: {
        token: newTrackingToken(),
        orderId,
        phase,
        triggerStage,
        salesAgent: order.sku || null,
        machineModel: triggeringItem?.productCode || null,
        recipientEmail: order.account?.email || null,
        status: "PENDING",
      },
    });

    await sendSurveyInvite(prisma, survey, {
      contactName: order.account?.contactName || null,
    });

    console.log(
      `[SURVEY] Created ${phase} survey ${survey.id} for order ${orderId} (trigger ${triggerStage})`
    );

    return { created: true, survey };
  } catch (e) {
    console.error(
      `[SURVEY] generateSurveyForPhase error (order ${orderId}, phase ${phase}):`,
      e.message
    );
    return { created: false, skipped: true, reason: e.message };
  }
}

/**
 * Stage-move entry point. Called from the item stage-move route for EVERY
 * move (any actor). If the stage maps to a survey phase, generate+send.
 * Never throws; safe to call fire-and-forget.
 *
 * @param {PrismaClient} prisma
 * @param {object} args
 * @param {string} args.orderId
 * @param {string} args.stage   the NEW canonical stage the item reached
 * @param {object} [args.item]  the item that moved (for machineModel snapshot)
 */
export async function maybeGenerateSurveyOnStage(prisma, { orderId, stage, item }) {
  const phase = STAGE_TO_PHASE[stage];
  if (!phase) return { skipped: true, reason: "Stage does not trigger a survey" };

  return generateSurveyForPhase(prisma, {
    orderId,
    phase,
    triggerStage: stage,
    triggeringItem: item,
  });
}

export default {
  generateSurveyForPhase,
  sendSurveyInvite,
  maybeGenerateSurveyOnStage,
};
