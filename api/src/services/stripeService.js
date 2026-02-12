/**
 * Stripe Payment Service
 * Handles credit card and ACH payments via Stripe
 */

import Stripe from 'stripe';

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://smt-orders.com';

/**
 * Create or retrieve a Stripe customer
 */
export async function getOrCreateStripeCustomer(customer) {
  // If customer already has a Stripe ID, retrieve it
  if (customer.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
      if (!stripeCustomer.deleted) {
        return stripeCustomer;
      }
    } catch (err) {
      console.error('Error retrieving Stripe customer:', err);
    }
  }

  // Create new Stripe customer
  const stripeCustomer = await stripe.customers.create({
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`.trim(),
    metadata: {
      customerId: customer.id,
      customerNumber: customer.customerNumber,
      company: customer.company || customer.companyName || ''
    }
  });

  return stripeCustomer;
}

/**
 * Create a PaymentIntent for credit card payments
 */
export async function createPaymentIntent({
  amount,
  currency = 'usd',
  customerId,
  customerEmail,
  invoiceId,
  invoiceNumber,
  scheduleItemId,
  description,
  metadata = {}
}) {
  const amountInCents = Math.round(amount * 100);

  const paymentIntentData = {
    amount: amountInCents,
    currency,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never'
    },
    metadata: {
      invoiceId,
      invoiceNumber,
      scheduleItemId: scheduleItemId || '',
      customerId: customerId || '',
      ...metadata
    },
    description: description || `Payment for Invoice ${invoiceNumber}`,
    receipt_email: customerEmail
  };

  // Link to Stripe customer if available
  if (metadata.stripeCustomerId) {
    paymentIntentData.customer = metadata.stripeCustomerId;
  }

  const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: amountInCents,
    currency
  };
}

/**
 * Create an ACH Direct Debit payment using Stripe
 * This creates a PaymentIntent for ACH
 */
export async function createACHPaymentIntent({
  amount,
  currency = 'usd',
  customerId,
  customerEmail,
  customerName,
  invoiceId,
  invoiceNumber,
  scheduleItemId,
  metadata = {}
}) {
  const amountInCents = Math.round(amount * 100);

  // For ACH, we need to create a PaymentIntent with us_bank_account payment method
  const paymentIntentData = {
    amount: amountInCents,
    currency,
    payment_method_types: ['us_bank_account'],
    payment_method_options: {
      us_bank_account: {
        financial_connections: {
          permissions: ['payment_method', 'balances']
        }
      }
    },
    metadata: {
      invoiceId,
      invoiceNumber,
      scheduleItemId: scheduleItemId || '',
      customerId: customerId || '',
      paymentType: 'ach',
      ...metadata
    },
    description: `ACH Payment for Invoice ${invoiceNumber}`,
    receipt_email: customerEmail
  };

  // Link to Stripe customer if available
  if (metadata.stripeCustomerId) {
    paymentIntentData.customer = metadata.stripeCustomerId;
  }

  const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: amountInCents,
    currency
  };
}

/**
 * Retrieve a PaymentIntent
 */
export async function getPaymentIntent(paymentIntentId) {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Confirm a PaymentIntent (server-side if needed)
 */
export async function confirmPaymentIntent(paymentIntentId, paymentMethodId) {
  return await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId
  });
}

/**
 * Process a refund
 */
export async function processRefund({
  paymentIntentId,
  chargeId,
  amount,
  reason = 'requested_by_customer',
  metadata = {}
}) {
  const refundData = {
    reason,
    metadata
  };

  // Prefer charge ID if available, otherwise use payment intent
  if (chargeId) {
    refundData.charge = chargeId;
  } else if (paymentIntentId) {
    refundData.payment_intent = paymentIntentId;
  } else {
    throw new Error('Either chargeId or paymentIntentId is required');
  }

  // If amount provided, do partial refund; otherwise full refund
  if (amount) {
    refundData.amount = Math.round(amount * 100);
  }

  const refund = await stripe.refunds.create(refundData);

  return {
    refundId: refund.id,
    amount: refund.amount / 100,
    status: refund.status,
    reason: refund.reason
  };
}

/**
 * Verify webhook signature and parse event
 */
export function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('Stripe webhook secret not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(event, prisma) {
  const { type, data } = event;
  const paymentIntent = data.object;

  console.log(`Processing Stripe webhook: ${type}`);

  switch (type) {
    case 'payment_intent.succeeded': {
      return await handlePaymentSucceeded(paymentIntent, prisma);
    }

    case 'payment_intent.payment_failed': {
      return await handlePaymentFailed(paymentIntent, prisma);
    }

    case 'payment_intent.processing': {
      return await handlePaymentProcessing(paymentIntent, prisma);
    }

    case 'charge.refunded': {
      return await handleChargeRefunded(data.object, prisma);
    }

    case 'charge.dispute.created': {
      console.log('Dispute created for charge:', data.object.id);
      // Log dispute but don't auto-process
      return { handled: true, action: 'dispute_logged' };
    }

    default:
      console.log(`Unhandled webhook event type: ${type}`);
      return { handled: false, type };
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(paymentIntent, prisma) {
  const { id, amount, metadata, charges } = paymentIntent;
  const { invoiceId, scheduleItemId, customerId } = metadata;

  if (!invoiceId) {
    console.log('No invoiceId in payment metadata, skipping');
    return { handled: true, action: 'skipped_no_invoice' };
  }

  // Check if payment already recorded
  const existingPayment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: id }
  });

  if (existingPayment) {
    // Update status if needed
    if (existingPayment.status !== 'COMPLETED') {
      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: { status: 'COMPLETED' }
      });
    }
    return { handled: true, action: 'payment_already_exists', paymentId: existingPayment.id };
  }

  // Get charge details
  const charge = charges?.data?.[0];
  const paymentMethod = charge?.payment_method_details;

  // Determine payment method type and details
  let methodType = 'CREDIT_CARD';
  let last4 = null;
  let cardBrand = null;
  let bankName = null;

  if (paymentMethod?.type === 'card') {
    methodType = 'CREDIT_CARD';
    last4 = paymentMethod.card?.last4;
    cardBrand = paymentMethod.card?.brand;
  } else if (paymentMethod?.type === 'us_bank_account') {
    methodType = 'ACH';
    last4 = paymentMethod.us_bank_account?.last4;
    bankName = paymentMethod.us_bank_account?.bank_name;
  }

  // Get invoice
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    console.error('Invoice not found for payment:', invoiceId);
    return { handled: false, error: 'invoice_not_found' };
  }

  // Generate payment number
  const { generatePaymentNumber } = await import('../utils/numberGenerators.js');
  const paymentNumber = await generatePaymentNumber(prisma);

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      paymentNumber,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      scheduleItemId: scheduleItemId || null,
      amount: amount / 100, // Convert from cents
      paymentMethod: methodType,
      stripePaymentIntentId: id,
      stripeChargeId: charge?.id,
      last4,
      cardBrand,
      bankName,
      status: 'COMPLETED',
      paymentDate: new Date()
    }
  });

  // Update invoice
  const newAmountPaid = invoice.amountPaid + payment.amount;
  const newBalanceDue = invoice.total - newAmountPaid;

  let newStatus = invoice.status;
  if (newBalanceDue <= 0) {
    newStatus = 'PAID';
  } else if (newAmountPaid > 0) {
    newStatus = 'PARTIAL';
  }

  let depositPaid = invoice.depositPaid;
  if (invoice.depositRequired && newAmountPaid >= invoice.depositRequired) {
    depositPaid = true;
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaid: newAmountPaid,
      balanceDue: newBalanceDue,
      status: newStatus,
      depositPaid
    }
  });

  // Update payment schedule item if specified
  if (scheduleItemId) {
    await prisma.invoicePaymentSchedule.update({
      where: { id: scheduleItemId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentId: payment.id
      }
    });
  }

  // Auto-create order if deposit paid and not already converted
  let orderCreated = null;
  if (depositPaid && !invoice.convertedToOrder) {
    try {
      const { createOrderFromInvoice, shouldCreateOrder } = await import('./orderCreationService.js');

      // Get fresh invoice with updated depositPaid
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id }
      });

      if (shouldCreateOrder(updatedInvoice)) {
        const result = await createOrderFromInvoice(prisma, {
          invoiceId: invoice.id,
          paymentId: payment.id
        });
        orderCreated = result.order?.id || result.orderId;
        console.log(`[STRIPE] Auto-created order ${orderCreated} from invoice ${invoice.id}`);
      }
    } catch (orderError) {
      console.error('[STRIPE] Auto order creation error:', orderError);
      // Don't fail payment processing if order creation fails
    }
  }

  return {
    handled: true,
    action: 'payment_recorded',
    paymentId: payment.id,
    orderCreated
  };
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent, prisma) {
  const { id, last_payment_error } = paymentIntent;

  // Find existing payment record if any
  const existingPayment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: id }
  });

  if (existingPayment) {
    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: {
        status: 'FAILED',
        notes: last_payment_error?.message || 'Payment failed'
      }
    });
  }

  return { handled: true, action: 'payment_failed' };
}

/**
 * Handle payment processing (ACH can take time)
 */
async function handlePaymentProcessing(paymentIntent, prisma) {
  const { id, metadata } = paymentIntent;
  const { invoiceId } = metadata;

  if (!invoiceId) {
    return { handled: true, action: 'skipped_no_invoice' };
  }

  // Check if payment already exists
  const existingPayment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: id }
  });

  if (existingPayment) {
    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: { status: 'PROCESSING' }
    });
    return { handled: true, action: 'payment_processing', paymentId: existingPayment.id };
  }

  // For ACH, we might create a pending payment record
  return { handled: true, action: 'processing_noted' };
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(charge, prisma) {
  const { id, payment_intent, amount_refunded, refunds } = charge;

  // Find payment by charge ID or payment intent
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { stripeChargeId: id },
        { stripePaymentIntentId: payment_intent }
      ]
    },
    include: { invoice: true }
  });

  if (!payment) {
    console.log('No payment found for refunded charge:', id);
    return { handled: true, action: 'no_payment_found' };
  }

  const refundAmount = amount_refunded / 100;
  const latestRefund = refunds?.data?.[0];

  // Update payment record
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'REFUNDED',
      refundedAmount: refundAmount,
      refundedAt: new Date(),
      refundReason: latestRefund?.reason || 'refunded'
    }
  });

  // Update invoice balance
  if (payment.invoice) {
    const newAmountPaid = payment.invoice.amountPaid - refundAmount;
    const newBalanceDue = payment.invoice.total - newAmountPaid;

    let newStatus = payment.invoice.status;
    if (newBalanceDue > 0 && newAmountPaid > 0) {
      newStatus = 'PARTIAL';
    } else if (newBalanceDue > 0 && newAmountPaid <= 0) {
      newStatus = 'SENT'; // Revert to sent if no payments remain
    }

    await prisma.invoice.update({
      where: { id: payment.invoice.id },
      data: {
        amountPaid: Math.max(0, newAmountPaid),
        balanceDue: newBalanceDue,
        status: newStatus
      }
    });
  }

  return { handled: true, action: 'refund_processed', paymentId: payment.id };
}

/**
 * Create a payment link for an invoice
 */
export async function createPaymentLink({
  invoice,
  amount,
  scheduleItemId,
  successUrl,
  cancelUrl
}) {
  const amountInCents = Math.round(amount * 100);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoiceNumber}`,
            description: scheduleItemId ? 'Scheduled Payment' : 'Invoice Payment'
          },
          unit_amount: amountInCents
        },
        quantity: 1
      }
    ],
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      scheduleItemId: scheduleItemId || '',
      customerId: invoice.customerId
    },
    success_url: successUrl || `${FRONTEND_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${FRONTEND_URL}/pay/cancelled`,
    customer_email: invoice.customer?.email
  });

  return {
    sessionId: session.id,
    url: session.url
  };
}

export default {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  createACHPaymentIntent,
  getPaymentIntent,
  confirmPaymentIntent,
  processRefund,
  verifyWebhookSignature,
  handleWebhookEvent,
  createPaymentLink
};
