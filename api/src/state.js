// api/src/state.js
import crypto from 'crypto';

// Ordered pipeline; UI and advancement logic depend on this order.
// NOTE: Keep labels UPPER_SNAKE; use stageToLabel() for display.
export const STAGES = [
  'MANUFACTURING',
  'TESTING',
  'SHIPPING',
  'AT_SEA',
  'SMT',
  'QC',
  'DELIVERED',
  'ONSITE',
  'COMPLETED'
];

// Precompute indices & a Set for quick lookups
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s, i]));
export const STAGE_SET = new Set(STAGES);

/** Normalize user/input strings to canonical stage tokens. */
export function normalizeStage(stage) {
  if (!stage) return null;
  const s = String(stage).trim().toUpperCase().replace(/\s+/g, '_');
  return STAGE_SET.has(s) ? s : null;
}

/** Pretty label for UI. */
export function stageToLabel(stage) {
  return String(stage || '')
    .toUpperCase()
    .replace(/_/g, ' ');
}

/** Validate stage membership. */
export function isValidStage(stage) {
  return STAGE_SET.has(stage);
}

/** Is this a terminal/closed state? */
export function isTerminalStage(stage) {
  return stage === 'COMPLETED';
}

/** Get next stage in the linear pipeline (or null if at end/invalid). */
export function nextStageOf(stage) {
  const s = normalizeStage(stage);
  if (!s) return null;
  const i = STAGE_INDEX[s];
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/**
 * Core advancement rule:
 * - Same stage: allowed (idempotent writes from UI won’t error).
 * - Normal: only allow moving exactly one step forward.
 * - Fast-forward: allow jumping ahead but never backward.
 * - Unknown current or invalid next: reject.
 */
export function canAdvance(current, next, allowFastForward = false) {
  const cur = normalizeStage(current);
  const nxt = normalizeStage(next);
  if (!nxt) return false;         // invalid target
  if (!cur) return false;         // unknown current; reject to avoid surprises

  const ci = STAGE_INDEX[cur];
  const ni = STAGE_INDEX[nxt];

  if (ni === ci) return true;     // idempotent
  if (allowFastForward) return ni > ci;
  return ni === ci + 1;
}

/** Compute a Set of reached stages from status events (order- or item-level). */
export function computeReached(statusEvents = []) {
  const reached = new Set();
  for (const ev of statusEvents) {
    const s = normalizeStage(ev?.stage);
    if (s) reached.add(s);
  }
  return reached;
}

/** Stable, URL-safe token for public tracking links. */
export function newTrackingToken() {
  // 24 bytes -> 32 chars base64url (approx). URL safe by replacing +/ and trimming =
  return crypto
    .randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/,'');
}
