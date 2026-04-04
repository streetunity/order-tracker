/**
 * NexNP Gateway Service
 * Handles credit card and ACH transactions via NexNP API
 *
 * Sandbox:    https://sandbox.nextnpgateway.com
 * Production: https://app.nextnpgateway.com
 *
 * Processors:
 *   Card: d49nrd70i4719b5gtq4g (Iron and Press)
 *   ACH:  d72k1gf0i47c3lpoeua0 (Iron and Press Check SVC)
 *
 * Response structure (confirmed via live sandbox test):
 * {
 *   status: "success" | "failed",
 *   msg:    "success" | error message,
 *   data: {
 *     id:            string,   // transaction ID
 *     status:        "pending_settlement" | "settled" | "failed" | "voided",
 *     response_code: number,   // 100 = approved
 *     amount:        number,   // in cents
 *     response_body: {
 *       card: { response: "approved" | "declined", auth_code, ... }
 *       ach:  { response: "approved" | "declined", ... }
 *     }
 *   }
 * }
 */

const NEXTNP_BASE_URL         = process.env.NEXTNP_BASE_URL          || 'https://sandbox.nextnpgateway.com';
const NEXTNP_API_KEY          = process.env.NEXTNP_API_KEY;
const NEXTNP_CARD_PROCESSOR_ID = process.env.NEXTNP_CARD_PROCESSOR_ID || 'd49nrd70i4719b5gtq4g';
const NEXTNP_ACH_PROCESSOR_ID  = process.env.NEXTNP_ACH_PROCESSOR_ID  || 'd72k1gf0i47c3lpoeua0';

function getHeaders() {
  if (!NEXTNP_API_KEY) throw new Error('NEXTNP_API_KEY is not configured');
  return { 'Authorization': NEXTNP_API_KEY, 'Content-Type': 'application/json' };
}

/**
 * Validate a NexNP response and throw a descriptive error if the charge failed.
 * Returns the inner `data` object on success.
 */
function assertSuccess(envelope, label) {
  // Top-level failure (auth error, bad request, etc.)
  if (envelope.status !== 'success') {
    throw new Error(envelope.msg || `${label} failed`);
  }

  const txn = envelope.data;
  if (!txn) throw new Error(`${label}: empty response data`);

  // response_code 100 = approved across all NexNP processors
  if (txn.response_code !== undefined && txn.response_code !== 100) {
    // Try to pull a human-readable decline reason from response_body
    const rb = txn.response_body;
    const detail = rb?.card?.response || rb?.ach?.response || txn.status || 'declined';
    throw new Error(`${label} declined: ${detail} (code ${txn.response_code})`);
  }

  return txn;
}

/**
 * Charge a credit card.
 *
 * @param {object} opts
 * @param {number}  opts.amount            - Dollars (e.g. 125.00)
 * @param {string}  opts.cardNumber
 * @param {string}  opts.expirationDate    - MM/YY
 * @param {string}  opts.cvc
 * @param {string}  opts.invoiceNumber
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]
 * @param {object}  [opts.billingAddress]  - { zip, address, city, state, firstName, lastName }
 * @returns {{ transactionId, status, amountCents, processor, raw }}
 */
export async function chargeCard(opts) {
  const { amount, cardNumber, expirationDate, cvc, invoiceNumber, description, email, billingAddress } = opts;

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
    }
  };

  if (email) { body.email_receipt = true; body.email_address = email; }

  if (billingAddress) {
    body.billing_address = {
      first_name:    billingAddress.firstName  || '',
      last_name:     billingAddress.lastName   || '',
      address_line_1: billingAddress.address   || '',
      city:           billingAddress.city      || '',
      state:          billingAddress.state     || '',
      postal_code:    billingAddress.zip       || '',
      country: 'US',
      ...(email ? { email } : {})
    };
  }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000) // 3 min — per NexNP docs
  });

  const envelope = await response.json();
  console.log('[NexNP chargeCard] raw response:', JSON.stringify(envelope));

  const txn = assertSuccess(envelope, 'Card charge');

  return {
    transactionId: txn.id,
    status:        txn.status,          // e.g. "pending_settlement"
    amountCents:   txn.amount,          // cents
    authCode:      txn.response_body?.card?.auth_code,
    last4:         txn.response_body?.card?.last_four,
    cardType:      txn.response_body?.card?.card_type,
    processor:     'card',
    raw:           txn,
  };
}

/**
 * Charge via ACH (bank account).
 *
 * @param {object} opts
 * @param {number}  opts.amount
 * @param {string}  opts.routingNumber
 * @param {string}  opts.accountNumber
 * @param {string}  opts.accountType   - 'checking' | 'savings'
 * @param {string}  opts.secCode       - 'web' | 'ccd' | 'ppd' | 'tel'
 * @param {string}  opts.invoiceNumber
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]
 * @returns {{ transactionId, status, amountCents, processor, raw }}
 */
export async function chargeACH(opts) {
  const { amount, routingNumber, accountNumber, accountType, secCode, invoiceNumber, description, email } = opts;

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
    }
  };

  if (email) { body.email_receipt = true; body.email_address = email; }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000)
  });

  const envelope = await response.json();
  console.log('[NexNP chargeACH] raw response:', JSON.stringify(envelope));

  const txn = assertSuccess(envelope, 'ACH charge');

  return {
    transactionId: txn.id,
    status:        txn.status,
    amountCents:   txn.amount,
    processor:     'ach',
    raw:           txn,
  };
}

/**
 * Refund a transaction (full or partial).
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
    signal: AbortSignal.timeout(60000)
  });

  const envelope = await response.json();
  console.log('[NexNP refund] raw response:', JSON.stringify(envelope));

  const txn = assertSuccess(envelope, 'Refund');

  return {
    transactionId: txn.id,
    status:        txn.status,
    amountCents:   txn.amount,
    raw:           txn,
  };
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
