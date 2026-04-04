/**
 * NexNP Gateway Service
 * Handles credit card and ACH transactions via NexNP API
 *
 * Sandbox: https://sandbox.nextnpgateway.com
 * Production: https://app.nextnpgateway.com
 *
 * Processors:
 *   Card: d49nrd70i4719b5gtq4g (Iron and Press)
 *   ACH:  d72k1gf0i47c3lpoeua0 (Iron and Press Check SVC)
 */

const NEXTNP_BASE_URL = process.env.NEXTNP_BASE_URL || 'https://sandbox.nextnpgateway.com';
const NEXTNP_API_KEY = process.env.NEXTNP_API_KEY;
const NEXTNP_CARD_PROCESSOR_ID = process.env.NEXTNP_CARD_PROCESSOR_ID || 'd49nrd70i4719b5gtq4g';
const NEXTNP_ACH_PROCESSOR_ID = process.env.NEXTNP_ACH_PROCESSOR_ID || 'd72k1gf0i47c3lpoeua0';

function getHeaders() {
  if (!NEXTNP_API_KEY) {
    throw new Error('NEXTNP_API_KEY is not configured');
  }
  return {
    'Authorization': NEXTNP_API_KEY,
    'Content-Type': 'application/json'
  };
}

/**
 * Charge a credit card
 * @param {object} opts
 * @param {number}  opts.amount           - Amount in dollars (e.g. 125.00)
 * @param {string}  opts.cardNumber
 * @param {string}  opts.expirationDate   - MM/YY
 * @param {string}  opts.cvc
 * @param {string}  opts.invoiceNumber
 * @param {string}  opts.invoiceId
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]          - Customer email for receipt
 * @param {object}  [opts.billingAddress]
 * @returns {object} NexNP transaction response
 */
export async function chargeCard(opts) {
  const {
    amount,
    cardNumber,
    expirationDate,
    cvc,
    invoiceNumber,
    invoiceId,
    description,
    email,
    billingAddress
  } = opts;

  const body = {
    type: 'sale',
    amount: Math.round(amount * 100), // convert to cents
    processor_id: NEXTNP_CARD_PROCESSOR_ID,
    order_id: invoiceNumber,
    description: description || `Payment for Invoice ${invoiceNumber}`,
    payment_method: {
      card: {
        number: cardNumber.replace(/\s/g, ''),
        expiration_date: expirationDate,
        cvc
      }
    }
  };

  if (email) {
    body.email_receipt = true;
    body.email_address = email;
  }

  if (billingAddress) {
    body.billing_address = {
      first_name: billingAddress.firstName || '',
      last_name: billingAddress.lastName || '',
      address_line_1: billingAddress.address || '',
      city: billingAddress.city || '',
      state: billingAddress.state || '',
      postal_code: billingAddress.zip || '',
      country: 'US',
      email: email || ''
    };
  }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000) // 3 min timeout per NexNP docs
  });

  const data = await response.json();

  if (!response.ok || data.status === 'failed' || data.status === 'declined') {
    throw new Error(data.msg || data.message || `NexNP charge failed: ${response.status}`);
  }

  return {
    transactionId: data.id,
    status: data.status,
    amount: data.amount / 100,
    processor: 'card',
    raw: data
  };
}

/**
 * Charge via ACH (bank account)
 * @param {object} opts
 * @param {number}  opts.amount
 * @param {string}  opts.routingNumber
 * @param {string}  opts.accountNumber
 * @param {string}  opts.accountType      - 'checking' | 'savings'
 * @param {string}  opts.secCode          - 'web' | 'ccd' | 'ppd' | 'tel' (default: 'web')
 * @param {string}  opts.invoiceNumber
 * @param {string}  opts.invoiceId
 * @param {string}  [opts.description]
 * @param {string}  [opts.email]
 * @returns {object} NexNP transaction response
 */
export async function chargeACH(opts) {
  const {
    amount,
    routingNumber,
    accountNumber,
    accountType,
    secCode,
    invoiceNumber,
    invoiceId,
    description,
    email
  } = opts;

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
        sec_code: secCode || 'web',
        account_type: accountType || 'checking'
      }
    }
  };

  if (email) {
    body.email_receipt = true;
    body.email_address = email;
  }

  const response = await fetch(`${NEXTNP_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000)
  });

  const data = await response.json();

  if (!response.ok || data.status === 'failed' || data.status === 'declined') {
    throw new Error(data.msg || data.message || `NexNP ACH charge failed: ${response.status}`);
  }

  return {
    transactionId: data.id,
    status: data.status,
    amount: data.amount / 100,
    processor: 'ach',
    raw: data
  };
}

/**
 * Refund a transaction
 * @param {string} transactionId  - NexNP transaction ID
 * @param {number} [amount]       - Partial refund amount in dollars; omit for full refund
 * @returns {object} NexNP refund response
 */
export async function refundTransaction(transactionId, amount) {
  const body = {};
  if (amount !== undefined) {
    body.amount = Math.round(amount * 100);
  }

  const response = await fetch(
    `${NEXTNP_BASE_URL}/api/transaction/${transactionId}/refund`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    }
  );

  const data = await response.json();

  if (!response.ok || data.status === 'failed') {
    throw new Error(data.msg || data.message || `NexNP refund failed: ${response.status}`);
  }

  return {
    transactionId: data.id,
    status: data.status,
    amount: data.amount / 100,
    raw: data
  };
}

/**
 * Get a transaction by ID
 * @param {string} transactionId
 * @returns {object} NexNP transaction
 */
export async function getTransaction(transactionId) {
  const response = await fetch(
    `${NEXTNP_BASE_URL}/api/transaction/${transactionId}`,
    {
      method: 'GET',
      headers: getHeaders()
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.msg || `Failed to get transaction: ${response.status}`);
  }

  return data;
}
