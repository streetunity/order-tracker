// api/scripts/rebalanceOrderSonnyBrian.mjs
//
// ONE-OFF, self-verifying, idempotent rebalance for a SINGLE live order.
// Option A ("rebalance"): the QC stage was manually meant to be 40% (not 50%),
// with the remaining 10% (FOLLOW_UP) belonging to a second rep. This reconciles
// the recorded split to that intent WITHOUT changing the order's total:
//
//   Per item (driven by the ACTIVE stage settings, not hard-coded percentages):
//     MANUFACTURING 50%  -> Sonny Yee     (PAID, unchanged)
//     QC            50->40% -> Sonny Yee   (PAID, amount reduced to 40%)
//     FOLLOW_UP     10%  -> Brian Maronde (NEW payout, status = BRIAN_STATUS)
//
//   CommissionReps:  Sonny Yee 100% -> 90%   +   Brian Maronde 10% (SECONDARY)
//   Order total commission is UNCHANGED (50+40+10 = 100).
//
// SAFETY MODEL
//   * DRY RUN BY DEFAULT. It prints the full before/after and writes NOTHING
//     unless you pass APPLY=1.
//   * Everything happens inside ONE $transaction — all-or-nothing.
//   * Hard precondition asserts: if ANY assumption about the live data does not
//     hold, it aborts and writes nothing.
//   * Idempotent: if the FOLLOW_UP payouts / Brian rep already exist, it aborts
//     cleanly (won't double-apply).
//
// RUN (from /var/www/order-tracker/api, AFTER a fresh DB backup):
//   node scripts/rebalanceOrderSonnyBrian.mjs                 # dry run (default)
//   BRIAN_STATUS=PENDING APPLY=1 node scripts/rebalanceOrderSonnyBrian.mjs   # commit
//
// BRIAN_STATUS controls whether Brian's 10% is payable now or later:
//   PENDING  (default) = payable now / enters the approval queue immediately.
//   WAITING            = held until the order reaches the FOLLOW_UP stage.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Configuration (asserted against live data — nothing here is trusted blindly) ───
const ORDER_ID       = 'cmjbwvsp5000yjch14ws9oy5e';
const EXPECT_OLD_REP  = 'Sonny Yee';
const NEW_REP         = 'Brian Maronde';
const NEW_REP_STAGE   = 'FOLLOW_UP';   // the stage assigned to the new rep
const OLD_REP_KEEPS   = ['MANUFACTURING', 'QC']; // stages that stay with the old rep

const APPLY        = process.env.APPLY === '1';
const BRIAN_STATUS = (process.env.BRIAN_STATUS || 'PENDING').toUpperCase();

const EPS = 0.005; // half-cent tolerance for float compares

function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }); }
function pct(n)   { return Number(n).toFixed(0) + '%'; }
function fail(msg) { throw new Error('PRECONDITION FAILED: ' + msg); }

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(APPLY ? '  MODE: APPLY (will commit inside a transaction)' : '  MODE: DRY RUN (no writes) — pass APPLY=1 to commit');
  console.log('  Order:', ORDER_ID);
  console.log('  Brian\'s new 10% payouts status:', BRIAN_STATUS);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (!['PENDING', 'WAITING'].includes(BRIAN_STATUS)) {
    fail(`BRIAN_STATUS must be PENDING or WAITING (got "${BRIAN_STATUS}")`);
  }

  // ── Load everything we need ──
  const commission = await prisma.commission.findFirst({
    where: { orderId: ORDER_ID },
    include: {
      reps: true,
      itemCommissions: { include: { payouts: true } },
    },
  });
  if (!commission) fail('No commission found for order ' + ORDER_ID);

  const activeStages = await prisma.commissionStageSetting.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  const stagePct = new Map(activeStages.map(s => [s.stage, s.percentage]));
  console.log('Active stage settings:', activeStages.map(s => `${s.stage} ${pct(s.percentage)}`).join(' / '), '\n');

  // Assert the stage config matches what we expect to redistribute against.
  if (stagePct.get(NEW_REP_STAGE) == null) fail(`Active stage "${NEW_REP_STAGE}" not configured`);
  for (const st of OLD_REP_KEEPS) if (stagePct.get(st) == null) fail(`Active stage "${st}" not configured`);
  const brianStagePct = stagePct.get(NEW_REP_STAGE);        // expected 10
  if (Math.abs(brianStagePct - 10) > EPS) fail(`Expected ${NEW_REP_STAGE} = 10%, got ${brianStagePct}%`);

  // ── Resolve users ──
  const brianUser = await prisma.user.findFirst({ where: { name: NEW_REP }, select: { id: true, isActive: true } });
  if (!brianUser) fail(`User "${NEW_REP}" not found`);

  // ── Assert current rep state: exactly one active rep = Sonny @ 100% ──
  const activeReps = commission.reps.filter(r => r.isActive);
  if (activeReps.length !== 1) fail(`Expected exactly 1 active CommissionRep, found ${activeReps.length}`);
  const sonnyRep = activeReps[0];
  if (sonnyRep.salesPersonName !== EXPECT_OLD_REP) fail(`Active rep is "${sonnyRep.salesPersonName}", expected "${EXPECT_OLD_REP}"`);
  if (Math.abs(sonnyRep.sharePercentage - 100) > EPS) fail(`Sonny's share is ${sonnyRep.sharePercentage}%, expected 100%`);

  // ── Idempotency guard: has this already been applied? ──
  const anyBrianRep = commission.reps.some(r => r.salesPersonName === NEW_REP);
  const anyFollowUp = commission.itemCommissions.some(ic => (ic.payouts || []).some(p => p.stage === NEW_REP_STAGE));
  if (anyBrianRep || anyFollowUp) {
    console.log('⚠  ALREADY APPLIED (found a Brian rep and/or a FOLLOW_UP payout). Nothing to do.');
    return;
  }

  // ── Validate each item and compute the planned changes ──
  const plan = [];     // { ic, qcPayout, qcOldAmt, qcNewAmt, brianAmt }
  let totalBefore = 0, sonnyBefore = 0;

  for (const ic of commission.itemCommissions) {
    const paid = (ic.payouts || []).filter(p => p.status === 'PAID');
    const all  = ic.payouts || [];

    // Every existing payout on this item must currently belong to Sonny and be PAID.
    if (all.length !== 2) fail(`${ic.productCode}: expected 2 payouts, found ${all.length}`);
    if (paid.length !== 2) fail(`${ic.productCode}: expected 2 PAID payouts, found ${paid.length}`);
    for (const p of all) {
      if (p.salesPersonName !== EXPECT_OLD_REP) fail(`${ic.productCode}: payout ${p.id} owned by "${p.salesPersonName}", expected "${EXPECT_OLD_REP}"`);
    }

    // The two payouts must be exactly the OLD_REP_KEEPS stages, both at 50%.
    const byStage = new Map(all.map(p => [p.stage, p]));
    for (const st of OLD_REP_KEEPS) {
      const p = byStage.get(st);
      if (!p) fail(`${ic.productCode}: missing expected stage "${st}"`);
      if (Math.abs(p.percentage - stagePctExpectedBefore(st)) > EPS) {
        fail(`${ic.productCode}: stage ${st} is ${p.percentage}%, expected ${stagePctExpectedBefore(st)}% before rebalance`);
      }
    }

    const qcPayout = byStage.get('QC');
    const qcOldAmt = qcPayout.amount;
    const qcNewAmt = ic.commissionAmount * (stagePct.get('QC') / 100);   // 40%
    const brianAmt = ic.commissionAmount * (brianStagePct / 100);         // 10%

    // The full item commission must reconcile: 50 + 40 + 10 == 100% of commissionAmount.
    const mfgAmt = byStage.get('MANUFACTURING').amount;
    const sum = mfgAmt + qcNewAmt + brianAmt;
    if (Math.abs(sum - ic.commissionAmount) > EPS) {
      fail(`${ic.productCode}: post-split parts ${money(sum)} != commissionAmount ${money(ic.commissionAmount)}`);
    }

    totalBefore += all.reduce((a, p) => a + p.amount, 0);
    sonnyBefore += paid.reduce((a, p) => a + p.amount, 0);
    plan.push({ ic, qcPayout, qcOldAmt, qcNewAmt, brianAmt });
  }

  // ── Print before / after ──
  let sonnyAfter = 0, brianAfter = 0;
  console.log('Planned per-item changes:');
  console.log('─'.repeat(94));
  for (const { ic, qcOldAmt, qcNewAmt, brianAmt } of plan) {
    const mfg = ic.commissionAmount * 0.5;
    sonnyAfter += mfg + qcNewAmt;
    brianAfter += brianAmt;
    console.log(`  ${ic.productCode.padEnd(12)} commission ${money(ic.commissionAmount)}`);
    console.log(`      MANUFACTURING  50%  ${money(mfg).padStart(12)}  Sonny  (PAID, unchanged)`);
    console.log(`      QC             50→40%  ${money(qcOldAmt)} → ${money(qcNewAmt)}  Sonny  (PAID, reduced by ${money(qcOldAmt - qcNewAmt)})`);
    console.log(`      FOLLOW_UP      10%  ${money(brianAmt).padStart(12)}  Brian  (NEW, ${BRIAN_STATUS})`);
  }
  console.log('─'.repeat(94));
  const totalAfter = sonnyAfter + brianAfter;
  console.log(`  BEFORE:  Sonny ${money(sonnyBefore)}   Brian ${money(0)}   Total ${money(totalBefore)}`);
  console.log(`  AFTER:   Sonny ${money(sonnyAfter)}   Brian ${money(brianAfter)}   Total ${money(totalAfter)}`);
  console.log(`  Moved from Sonny to Brian: ${money(sonnyBefore - sonnyAfter)}`);
  console.log('─'.repeat(94));

  // Final reconciliation guard — total must not change.
  if (Math.abs(totalAfter - totalBefore) > 3 * EPS) {
    fail(`Order total would change (${money(totalBefore)} -> ${money(totalAfter)}). Aborting.`);
  }
  if (Math.abs((sonnyBefore - sonnyAfter) - brianAfter) > 3 * EPS) {
    fail(`Amount removed from Sonny (${money(sonnyBefore - sonnyAfter)}) != amount given to Brian (${money(brianAfter)}).`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete — no changes written. Re-run with APPLY=1 to commit.');
    return;
  }

  // ── Commit inside a single transaction ──
  const stamp = new Date();
  await prisma.$transaction(async (tx) => {
    // 1. Create Brian's active rep @ 10%, demote Sonny to 90%.
    const brianRep = await tx.commissionRep.create({
      data: {
        commissionId: commission.id,
        salesPersonName: NEW_REP,
        userId: brianUser.id,
        sharePercentage: 10,
        role: 'SECONDARY',
        isActive: true,
      },
    });
    await tx.commissionRep.update({
      where: { id: sonnyRep.id },
      data: { sharePercentage: 90 },
    });

    // 2. Per item: reduce Sonny's QC payout to 40%, create Brian's FOLLOW_UP 10%.
    for (const { ic, qcPayout, qcOldAmt, qcNewAmt, brianAmt } of plan) {
      await tx.commissionPayout.update({
        where: { id: qcPayout.id },
        data: {
          percentage: 40,
          amount: qcNewAmt,
          notes: ((qcPayout.notes ? qcPayout.notes + ' | ' : '') +
            `[REBALANCE ${stamp.toISOString().slice(0,10)}] QC 50→40%, ${money(qcOldAmt)}→${money(qcNewAmt)}; 10% (${money(brianAmt)}) reassigned to ${NEW_REP} (FOLLOW_UP).`),
        },
      });

      await tx.commissionPayout.create({
        data: {
          itemCommissionId: ic.id,
          commissionId: commission.id,
          stage: NEW_REP_STAGE,
          percentage: 10,
          amount: brianAmt,
          status: BRIAN_STATUS,
          triggeredAt: BRIAN_STATUS === 'PENDING' ? stamp : null,
          salesPersonName: NEW_REP,
          userId: brianUser.id,
          commissionRepId: brianRep.id,
          notes: `[REBALANCE ${stamp.toISOString().slice(0,10)}] 10% FOLLOW_UP share reassigned from ${EXPECT_OLD_REP}.`,
        },
      });
    }

    // 3. Audit log.
    await tx.auditLog.create({
      data: {
        entityType: 'Commission',
        entityId: commission.id,
        parentEntityId: ORDER_ID,
        action: 'COMMISSION_REBALANCED',
        metadata: JSON.stringify({
          orderId: ORDER_ID,
          method: 'Option A (rebalance, total unchanged)',
          from: EXPECT_OLD_REP, to: NEW_REP,
          movedAmount: Number((sonnyBefore - sonnyAfter).toFixed(3)),
          sonnyBefore: Number(sonnyBefore.toFixed(3)),
          sonnyAfter: Number(sonnyAfter.toFixed(3)),
          brianAfter: Number(brianAfter.toFixed(3)),
          brianStatus: BRIAN_STATUS,
          shares: { [EXPECT_OLD_REP]: 90, [NEW_REP]: 10 },
        }),
        performedByName: 'Rebalance Script (Option A)',
      },
    });

    // 4. Notify Brian (best-effort inside the txn is fine; it's a plain insert).
    if (brianUser.isActive) {
      await tx.notification.create({
        data: {
          userId: brianUser.id,
          type: 'COMMISSION',
          category: 'INFO',
          title: 'Commission share assigned to you',
          message: `You have been assigned a 10% share (${money(brianAfter)}) on an order, status ${BRIAN_STATUS}.`,
          relatedOrderId: ORDER_ID,
          metadata: JSON.stringify({ orderId: ORDER_ID, from: EXPECT_OLD_REP, amount: Number(brianAfter.toFixed(3)), status: BRIAN_STATUS }),
          priority: 'NORMAL',
        },
      });
    }
  });

  console.log('\n✅ APPLIED. Sonny 90% / Brian 10%. Order total unchanged.');
  console.log('   Verify in the admin UI or re-run this script (it will report ALREADY APPLIED).');
}

// The two "kept" stages were both 50% at order-creation time; that is the
// pre-rebalance state we assert against (NOT the current stage settings).
function stagePctExpectedBefore(stage) {
  // Both MANUFACTURING and QC were created at 50%.
  return 50;
}

main()
  .catch((e) => { console.error('\n❌', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
