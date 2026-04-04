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
 * Security model:
 *   - Raw card/ACH data NEVER passes through this server
 *   - The frontend uses the NexNP Tokenizer iframe (PCI SAQ-A compliant)
 *   - This service only receives short-lived tokens and charges against them
 *   - chargeCard() and chargeACH() are retained for internal/employee use only
 *     and should eventually also be migrated to token-based flow
 *
 * Response envelope (all endpoints):
 *   { status: 'success'|'failed', msg: string, data: { ...transaction } }
 *
 * Approval codes:
 *   100-199 = Approved/Partial
 *   200-299 = Processor decline
 *   300-399 = Gateway decline
 *   400-499 = Processor error
 */

import crypto from 'crypto';

const NEXTNP_BASE_URL          = process.env.NEXTNP_BASE_URL           || 'https://sandbox.nextnpgateway.com';
const NEXTNP_API_KEY           = process.env.NEXTNP_API_KEY;
const NEXTNP_CARD_PROCESSOR_ID = process.env.NEXTNP_CARD_PROCESSOR_ID  || 'd49nrd70i4719b5gtq4g';
const NEXTNP_ACH_PROCESSOR_ID  = process.env.NEXTNP_ACH_PROCESSOR_ID   || 'd72k1gf0i47c3lpoeua0';
const NEXTNP_WEBHOOK_SECRET    = process.env.NEXTNP_WEBHOOK_SECRET;

function getHeaders() {
  if (!NEXTNP_API_KEY) throw new Error('NEXTNP_API_KEY is not configured');
  return { 'Authorization': NEXTNP_API_KEY, 'Content-Type': 'application/json' };
}

/**
 * Generate a UUID v4 idempotency key.
 * Always pass this with every charge to prevent double-billing on retries.
 */
export function generateIdempotencyKey() {
  return crypto.randomUUID();
}

/**
 * Verify a NexNP webhook signature.
 * The Signature header is HMAC-SHA256 of the raw request body, Base64 URL encoded.
 *
 * @param {Buffer|string} rawBody   - Raw request body (Buffer preferred)
 * @param {string}        signature - Value of the Signature header
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!NEXTNP_WEBHOOK_SECRET) {
    console.warn('[NexNP] NEXTNP_WEBHOOK_SECRET not set — skipping signature verification');
    return true; // fail open during initial setup; set secret before going live
  }
  if (!signature) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const computed = crypto
    .createHmac('sha256', NEXTNP_WEBHOOK_SECRET)
    .update(body)
    .digest();

  // NexNP uses Base64 URL encoding (no padding)
  const computedB64 = computed.toString('base64url');
  return crypto.timingSafeEqual(
    Buffer.from(computedB64),
    Buffer.from(signature)
  );
}

/**
 * Validate the NexNP response envelope and return the inner data object.
 * Throws a descriptive error on any failure so callers get a clean message.
 */
function assertSuccess(envelope, label) {
  if (envelope.status !== 'success') {
    throw new Error(envelope.msg || `${label} failed`);
  }

  const txn = envelope.data;
  if (!txn) throw new Error(`${label}: empty response data`);

  // response_code 100-199 = approved/partial
  // Anything >= 200 is a decline or error
  if (txn.response_code !== undefined && txn.response_code >= 200) {
    const rb = txn.response_body;
    const detail =
      rb?.card?.processor_response_text ||
      rb?.ach?.processor_response_text ||
      rb?.card?.response ||
      rb?.ach?.response ||
      txn.status ||
      'declined';
    throw new Error(`${label} declined: ${detail} (code ${txn.response_code})`);
  }

  return txn;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN-BASED CHARGE (preferred — PCI SAQ-A compliant)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge using a Tokenizer token.
 * The token is obtained client-side from the NexNP Tokenizer iframe.
 * Raw card/ACH data never passes through our server.
 *
 * @param {object} opts
 * @param {string}  opts.token            - Short-lived token from Tokenizer (2 min TTL)
 * @param {number}  opts.amount           - Dollars (e.g. 1250.00)
 * @param {string}  opts.invoiceNumber
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]          - Send receipt to customer
 * @param {string}  [opts.idempotencyKey] - UUID; generate with generateIdempotencyKey()
 * @param {object}  [opts.billingAddress] - { firstName, lastName, address, city, state, zip }
 * @returns {{ transactionId, status, amountCents, paymentMethod, authCode, last4, cardType, raw }}
 */
export async function chargeWithToken(opts) {
  const { token, amount, invoiceNumber, description, email, idempotencyKey, billingAddress } = opts;

  if (!token) throw new Error('Token is required for chargeWithToken');

  const body = {
    type: 'sale',
    amount: Math.round(amount * 100),
    order_id: invoiceNumber,
    description: description || `Payment for Invoice ${invoiceNumber}`,
    payment_method: { token },
  };

  if (idempotencyKey) {
    body.idempotency_key = idempotencyKey;
    body.idempotency_time = 300; // 5 minutes
  }

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
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000), // 3 min per NexNP docs
  });

  const envelope = await response.json();
  console.log('[NexNP chargeWithToken] response:', JSON.stringify({ status: envelope.status, msg: envelope.msg, txnId: envelope.data?.id, code: envelope.data?.response_code }));

  const txn = assertSuccess(envelope, 'Token charge');

  const rb = txn.response_body;
  return {
    transactionId: txn.id,
    status:        txn.status,       // 'pending_settlement' for card, 'pending' for ACH
    amountCents:   txn.amount,
    paymentMethod: txn.payment_method, // 'card' or 'ach'
    authCode:      rb?.card?.auth_code,
    last4:         rb?.card?.last_four || rb?.ach?.last_four,
    cardType:      rb?.card?.card_type,
    raw:           txn,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT CHARGE (internal/employee use — still PCI-scoped but acceptable for
// internal tools where staff enter card info on behalf of customer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge a credit card directly.
 * NOTE: For customer-facing flows, always use chargeWithToken() instead.
 *
 * @param {object} opts
 * @param {number}  opts.amount
 * @param {string}  opts.cardNumber
 * @param {string}  opts.expirationDate  - MM/YY
 * @param {string}  opts.cvc
 * @param {string}  opts.invoiceNumber
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]
 * @param {string}  [opts.idempotencyKey]
 * @param {object}  [opts.billingAddress]
 */
export async function chargeCard(opts) {
  const { amount, cardNumber, expirationDate, cvc, invoiceNumber, description, email, idempotencyKey, billingAddress } = opts;

  const body = {
    type: 'sale',
    amount: Math.round(amount * 100),
    processor_id: NEXTNP_CARD_PROCESSOR_ID,
    order_id: invoiceNumber,
    description: description || `Payment for Invoice ${invoiceNumber}`,
    payment_method: {
      card: {
        number: cardNumber.replace(/\s/g, ''),
        expiration_date: expirationDate,
        cvc,
      }
    },
  };

  if (idempotencyKey) { body.idempotency_key = idempotencyKey; body.idempotency_time = 300; }
  if (email) { body.email_receipt = true; body.email_address = email; }
  if (billingAddress) {
    body.billing_address = {
      first_name:     billingAddress.firstName || '',
      last_name:      billingAddress.lastName  || '',
      address_line_1: billingAddress.address   || '',
      city:           billingAddress.city      || '',
      state:          billingAddress.state     || '',
      postal_code:    billingAddress.zip       || '',
      country: 'US',
      ...(email ? { email } : {}),
    };
  }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });

  const envelope = await response.json();
  console.log('[NexNP chargeCard] response:', JSON.stringify({ status: envelope.status, msg: envelope.msg, txnId: envelope.data?.id, code: envelope.data?.response_code }));

  const txn = assertSuccess(envelope, 'Card charge');
  const rb = txn.response_body;
  return {
    transactionId: txn.id,
    status:        txn.status,
    amountCents:   txn.amount,
    paymentMethod: 'card',
    authCode:      rb?.card?.auth_code,
    last4:         rb?.card?.last_four,
    cardType:      rb?.card?.card_type,
    raw:           txn,
  };
}

/**
 * Charge via ACH directly.
 * NOTE: For customer-facing flows, use chargeWithToken() with ACH enabled in Tokenizer.
 */
export async function chargeACH(opts) {
  const { amount, routingNumber, accountNumber, accountType, secCode, invoiceNumber, description, email, idempotencyKey } = opts;

  const body = {
    type: 'sale',
    amount: Math.round(amount * 100),
    processor_id: NEXTNP_ACH_PROCESSOR_ID,
    order_id: invoiceNumber,
    description: description || `ACH Payment for Invoice ${invoiceNumber}`,
    payment_method: {
      ach: {
        routing_number: routingNumber,
        account_number: accountNumber,
        sec_code:       secCode || 'web',
        account_type:   accountType || 'checking',
      }
    },
  };

  if (idempotencyKey) { body.idempotency_key = idempotencyKey; body.idempotency_time = 300; }
  if (email) { body.email_receipt = true; body.email_address = email; }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });

  const envelope = await response.json();
  console.log('[NexNP chargeACH] response:', JSON.stringify({ status: envelope.status, msg: envelope.msg, txnId: envelope.data?.id, code: envelope.data?.response_code }));

  const txn = assertSuccess(envelope, 'ACH charge');
  return {
    transactionId: txn.id,
    status:        txn.status,
    amountCents:   txn.amount,
    paymentMethod: 'ach',
    raw:           txn,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VOID & REFUND
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Void a transaction that is pending settlement.
 * Prefer this over refund — no settlement fee and immediate reversal.
 * Only works on transactions with status 'pending_settlement' or 'authorized'.
 *
 * @param {string} transactionId
 */
export async function voidTransaction(transactionId) {
  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction/${transactionId}/void`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(60000),
  });

  const envelope = await response.json();
  console.log('[NexNP void] response:', JSON.stringify(envelope));

  if (envelope.status !== 'success') {
    throw new Error(envelope.msg || 'Void failed');
  }
  return { success: true, raw: envelope };
}

/**
 * Refund a settled transaction (full or partial).
 * Only use after a transaction has settled — for pending transactions, use voidTransaction().
 *
 * @param {string} transactionId
 * @param {number} [amount]  - Dollars; omit for full refund
 */
export async function refundTransaction(transactionId, amount) {
  const body = amount !== undefined ? { amount: Math.round(amount * 100) } : {};

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction/${transactionId}/refund`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const envelope = await response.json();
  console.log('[NexNP refund] response:', JSON.stringify({ status: envelope.status, msg: envelope.msg, txnId: envelope.data?.id }));

  const txn = assertSuccess(envelope, 'Refund');
  return {
    transactionId: txn.id,
    status:        txn.status,
    amountCents:   txn.amount,
    raw:           txn,
  };
}

/**
 * Smart cancel: tries void first (cheaper/faster), falls back to refund.
 *
 * @param {string} transactionId
 * @param {string} currentStatus   - Transaction status from NexNP
 * @param {number} [amount]        - Dollars for partial refund
 */
export async function cancelTransaction(transactionId, currentStatus, amount) {
  const voidableStatuses = ['authorized', 'pending_settlement'];
  if (voidableStatuses.includes(currentStatus)) {
    try {
      return await voidTransaction(transactionId);
    } catch (e) {
      console.warn('[NexNP] Void failed, falling back to refund:', e.message);
    }
  }
  return refundTransaction(transactionId, amount);
}

/**
 * Fetch a single transaction by ID.
 */
export async function getTransaction(transactionId) {
  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction/${transactionId}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  const envelope = await response.json();
  if (envelope.status !== 'success') {
    throw new Error(envelope.msg || `Failed to get transaction: ${response.status}`);
  }
  return envelope.data;
}
