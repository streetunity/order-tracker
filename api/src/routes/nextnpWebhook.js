/**
 * NexNP Webhook Handler
 *
 * CRITICAL: This must be mounted BEFORE express.json() in index.js so that
 * express.raw() can capture the raw body for HMAC-SHA256 signature verification.
 *
 * Mount in index.js:
 *   app.post('/public/nextnp-webhook', express.raw({ type: '*\/*' }), createNextnpWebhookHandler(prisma));
 *   // ...then app.use(express.json())
 *
 * Events handled:
 *   test               — 200 OK immediately, no action
 *   transaction_create — log only
 *   transaction_update — update payment status if changed
 *   transaction_settlement — confirm ACH payment, update invoice balance
 *   transaction_void   — mark payment voided
 *   settlement_batch   — log only
 */

import { verifyWebhookSignature } from '../services/nextnpService.js';

export function createNextnpWebhookHandler(prisma) {
  return async function nextnpWebhookHandler(req, res) {
    const signature = req.headers['signature'];
    const rawBody   = req.body; // Buffer — guaranteed because express.raw() runs first

    // 1. Verify HMAC-SHA256 signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[NexNP Webhook] Invalid signature — rejecting request');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. Parse body
    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      console.error('[NexNP Webhook] Failed to parse JSON body');
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // 3. Always respond 200 immediately — NexNP disables endpoints that time out
    res.json({ received: true });

    // 4. Process event asynchronously
    setImmediate(async () => {
      try {
        const { type, data } = event;
        console.log(`[NexNP Webhook] type=${type} txnId=${data?.id} status=${data?.status}`);

        // Test webhook — sent by NexNP during endpoint registration
        if (type === 'test') {
          console.log('[NexNP Webhook] Test event received — OK');
          return;
        }

        if (!data?.id) return;

        // Find the payment record in our DB by NexNP transaction ID
        const payment = await prisma.payment.findFirst({
          where: { nextnpTransactionId: data.id },
          include: { invoice: true }
        });

        if (!payment) {
          console.log(`[NexNP Webhook] No payment found for txnId=${data.id}`);
          return;
        }

        // ── transaction_settlement: ACH confirmed ────────────────────────────
        if (type === 'transaction_settlement' || data?.status === 'settled') {
          if (payment.status !== 'COMPLETED') {
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: 'COMPLETED',
                notes: `${payment.notes || ''} [Settled via webhook ${new Date().toISOString()}]`,
              }
            });

            if (payment.invoice) {
              const inv = payment.invoice;
              const newAmountPaid = inv.amountPaid + payment.amount;
              const newBalanceDue = Math.max(0, inv.total - newAmountPaid);
              const newStatus = newBalanceDue <= 0 ? 'PAID' : (newAmountPaid > 0 ? 'PARTIAL' : inv.status);
              let depositPaid = inv.depositPaid;
              if (inv.depositRequired && newAmountPaid >= inv.depositRequired) depositPaid = true;

              await prisma.invoice.update({
                where: { id: inv.id },
                data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus, depositPaid }
              });

              if (payment.scheduleItemId) {
                await prisma.invoicePaymentSchedule.update({
                  where: { id: payment.scheduleItemId },
                  data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id }
                }).catch(() => {});
              }

              // Auto-create order if deposit now satisfied
              if (depositPaid && !inv.convertedToOrder) {
                try {
                  const { createOrderFromInvoice, shouldCreateOrder } = await import('../services/orderCreationService.js');
                  const fresh = await prisma.invoice.findUnique({ where: { id: inv.id } });
                  if (shouldCreateOrder(fresh)) {
                    await createOrderFromInvoice(prisma, { invoiceId: inv.id, paymentId: payment.id });
                  }
                } catch (e) {
                  console.error('[NexNP Webhook] Order creation error:', e);
                }
              }

              console.log(`[NexNP Webhook] ACH settled — invoice ${inv.id} → ${newStatus}`);
            }
          }
        }

        // ── ACH return (bounced) ─────────────────────────────────────────────
        if (data?.status === 'returned' || data?.status === 'late_return') {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'REFUNDED',
              refundedAmount: payment.amount,
              refundedAt: new Date(),
              refundReason: `ACH ${data.status} — funds returned to customer`,
              notes: `${payment.notes || ''} [ACH ${data.status.toUpperCase()} ${new Date().toISOString()}]`,
            }
          });

          // Reverse invoice balance only if we already applied it (i.e. it had settled)
          if (payment.invoice && payment.invoice.amountPaid >= payment.amount) {
            const inv = payment.invoice;
            const newAmountPaid = Math.max(0, inv.amountPaid - payment.amount);
            const newBalanceDue = inv.total - newAmountPaid;
            const newStatus = newAmountPaid > 0 ? 'PARTIAL' : 'SENT';

            await prisma.invoice.update({
              where: { id: inv.id },
              data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus }
            });
            console.log(`[NexNP Webhook] ACH ${data.status} — invoice ${inv.id} balance reversed`);
          }
        }

        // ── transaction_void ─────────────────────────────────────────────────
        if (type === 'transaction_void' || data?.status === 'voided') {
          if (payment.status !== 'REFUNDED') {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: 'Voided via NexNP' }
            });
            console.log(`[NexNP Webhook] Payment ${payment.id} voided`);
          }
        }

      } catch (err) {
        console.error('[NexNP Webhook] Processing error:', err);
      }
    });
  };
}
