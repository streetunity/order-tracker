/**
 * NexNP Gateway Service
 *
 * Sandbox:    https://sandbox.nextnpgateway.com
 * Production: https://app.nextnpgateway.com
 *
 * Processors:
 *   Card: d49nrd70i4719b5gtq4g (Iron and Press)
 *   ACH:  d72k1gf0i47c3lpoeua0 (Iron and Press Check SVC)
 *
 * Security model (PCI SAQ-A):
 *   Raw card/ACH data NEVER passes through this server.
 *   The customer-facing pay page uses the NexNP Tokenizer iframe hosted
 *   on NexNP's servers. This service receives only short-lived tokens
 *   and charges against them.
 *
 * Response envelope (all endpoints):
 *   { status: 'success'|'failed', msg: string, data: { ...transaction } }
 *
 * Approval codes:
 *   100-199 = Approved / Partial approval
 *   200-299 = Processor decline
 *   300-399 = Gateway decline
 *   400-499 = Processor error
 */

import crypto from 'crypto';

const NEXTNP_BASE_URL       = process.env.NEXTNP_BASE_URL    || 'https://sandbox.nextnpgateway.com';
const NEXTNP_API_KEY        = process.env.NEXTNP_API_KEY;
const NEXTNP_WEBHOOK_SECRET = process.env.NEXTNP_WEBHOOK_SECRET;

function getHeaders() {
  if (!NEXTNP_API_KEY) throw new Error('NEXTNP_API_KEY is not configured');
  return { 'Authorization': NEXTNP_API_KEY, 'Content-Type': 'application/json' };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 idempotency key.
 * Pass one with every charge to prevent double-billing on network retries.
 */
export function generateIdempotencyKey() {
  return crypto.randomUUID();
}

/**
 * Verify a NexNP webhook signature.
 * Signature header = HMAC-SHA256(rawBody, webhookSecret), Base64 URL encoded.
 *
 * crypto.timingSafeEqual() throws if buffers differ in length —
 * we do an explicit length check first and wrap in try/catch.
 *
 * @param {Buffer|string} rawBody
 * @param {string}        signature  — value of the Signature header
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!NEXTNP_WEBHOOK_SECRET) {
    console.warn('[NexNP] NEXTNP_WEBHOOK_SECRET not set — skipping signature verification');
    return true; // must be set before going live
  }
  if (!signature) return false;

  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const computed = crypto
      .createHmac('sha256', NEXTNP_WEBHOOK_SECRET)
      .update(body)
      .digest();

    const computedB64 = Buffer.from(computed.toString('base64url'));
    const providedB64 = Buffer.from(signature);

    if (computedB64.length !== providedB64.length) return false;
    return crypto.timingSafeEqual(computedB64, providedB64);
  } catch (err) {
    console.error('[NexNP] Webhook signature verification error:', err.message);
    return false;
  }
}

/**
 * Validate the NexNP response envelope and return the inner data object.
 * Throws a descriptive error on any failure.
 */
function assertSuccess(envelope, label) {
  if (envelope.status !== 'success') {
    throw new Error(envelope.msg || `${label} failed`);
  }
  const txn = envelope.data;
  if (!txn) throw new Error(`${label}: empty response data`);

  // 100-199 = approved/partial; >= 200 = decline or error
  if (txn.response_code !== undefined && txn.response_code >= 200) {
    const rb = txn.response_body;
    const detail =
      rb?.card?.processor_response_text ||
      rb?.ach?.processor_response_text  ||
      rb?.card?.response                ||
      rb?.ach?.response                 ||
      txn.status                        ||
      'declined';
    throw new Error(`${label} declined: ${detail} (code ${txn.response_code})`);
  }
  return txn;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN-BASED CHARGE  (PCI SAQ-A — the only charge path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge using a Tokenizer token obtained client-side from the NexNP iframe.
 * Raw card/ACH data never passes through our server.
 *
 * @param {object} opts
 * @param {string}  opts.token            Short-lived token (2-min TTL)
 * @param {number}  opts.amount           Dollars (e.g. 1250.00)
 * @param {string}  opts.invoiceNumber
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]          NexNP receipt email
 * @param {string}  [opts.idempotencyKey] UUID; prevents double-billing on retry
 * @param {object}  [opts.billingAddress] { firstName, lastName, address, city, state, zip }
 * @returns {{ transactionId, status, amountCents, paymentMethod, authCode, last4, cardType, raw }}
 */
export async function chargeWithToken(opts) {
  const { token, amount, invoiceNumber, description, email, idempotencyKey, billingAddress } = opts;

  if (!token) throw new Error('Token is required for chargeWithToken');

  const body = {
    type:        'sale',
    amount:      Math.round(amount * 100),
    order_id:    invoiceNumber,
    description: description || `Payment for Invoice ${invoiceNumber}`,
    payment_method: { token },
  };

  if (idempotencyKey) { body.idempotency_key = idempotencyKey; body.idempotency_time = 300; }
  if (email) { body.email_receipt = true; body.email_address = email; }
  if (billingAddress) {
    body.billing_address = {
      first_name:     billingAddress.firstName  || '',
      last_name:      billingAddress.lastName   || '',
      address_line_1: billingAddress.address    || '',
      city:           billingAddress.city       || '',
      state:          billingAddress.state      || '',
      postal_code:    billingAddress.zip        || '',
      country: 'US',
      ...(email ? { email } : {}),
    };
  }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method:  'POST',
    headers: getHeaders(),
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(180000), // 3 min per NexNP docs
  });

  const envelope = await response.json();
  console.log('[NexNP chargeWithToken]', JSON.stringify({
    status: envelope.status, msg: envelope.msg,
    txnId:  envelope.data?.id, code: envelope.data?.response_code,
  }));

  const txn = assertSuccess(envelope, 'Token charge');
  const rb  = txn.response_body;
  return {
    transactionId: txn.id,
    status:        txn.status,         // 'pending_settlement' (card) or 'pending' (ACH)
    amountCents:   txn.amount,
    paymentMethod: txn.payment_method, // 'card' or 'ach'
    authCode:      rb?.card?.auth_code,
    last4:         rb?.card?.last_four || rb?.ach?.last_four,
    cardType:      rb?.card?.card_type,
    raw:           txn,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VOID & REFUND
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Void a pending_settlement transaction.
 * Always try void before refund — no settlement fee, immediate reversal.
 */
export async function voidTransaction(transactionId) {
  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction/${transactionId}/void`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({}),
    signal: AbortSignal.timeout(60000),
  });
  const envelope = await response.json();
  console.log('[NexNP void]', JSON.stringify(envelope));
  if (envelope.status !== 'success') throw new Error(envelope.msg || 'Void failed');
  return { success: true, raw: envelope };
}

/**
 * Refund a settled transaction (full or partial).
 * Only use after settlement — for pending transactions, use voidTransaction().
 *
 * @param {string} transactionId
 * @param {number} [amount]  Dollars; omit for full refund
 */
export async function refundTransaction(transactionId, amount) {
  const body = amount !== undefined ? { amount: Math.round(amount * 100) } : {};
  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction/${transactionId}/refund`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const envelope = await response.json();
  console.log('[NexNP refund]', JSON.stringify({ status: envelope.status, msg: envelope.msg, txnId: envelope.data?.id }));
  const txn = assertSuccess(envelope, 'Refund');
  return { transactionId: txn.id, status: txn.status, amountCents: txn.amount, raw: txn };
}

/**
 * Smart cancel: void first (free/fast), fall back to refund.
 */
export async function cancelTransaction(transactionId, currentStatus, amount) {
  if (['authorized', 'pending_settlement'].includes(currentStatus)) {
    try { return await voidTransaction(transactionId); }
    catch (e) { console.warn('[NexNP] Void failed, falling back to refund:', e.message); }
  }
  return refundTransaction(transactionId, amount);
}

/**
 * Fetch a transaction by ID.
 */
export async function getTransaction(transactionId) {
  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction/${transactionId}`, {
    method: 'GET', headers: getHeaders(),
  });
  const envelope = await response.json();
  if (envelope.status !== 'success') throw new Error(envelope.msg || `Failed to get transaction: ${response.status}`);
  return envelope.data;
}
