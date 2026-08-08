// api/scripts/rebalanceOrderSonnyBrian.mjs
//
// ONE-OFF, self-verifying, idempotent SWITCH (+ rebalance) for a SINGLE live order.
//
// The account is being MOVED from Sonny Yee to Brian Maronde. This is a SWITCH,
// not a split: Sonny keeps only what he already EARNED AND WAS PAID; the account
// itself and everything going forward becomes Brian's. On this order there is
// nothing unpaid to move (all payouts are PAID), plus a confirmed correction:
// the 2nd paid stage (SMT) should have been 40% (not 50%), freeing the final 10%
// for the new rep. So the operation is:
//
//   Per item (the two existing PAID stages on this order are MANUFACTURING + SMT):
//     MANUFACTURING 50%  -> Sonny Yee     (PAID, unchanged — earned before switch)
//     SMT           50->40% -> Sonny Yee   (PAID, amount reduced to 40% — earned)
//     FOLLOW_UP     10%  -> Brian Maronde (NEW payout, status = BRIAN_STATUS)
//
//   Rep pointer:   order.sku + commission.salesPersonName  ->  Brian Maronde
//   CommissionReps: Sonny Yee CLOSED (isActive=false, effectiveTo=now, share 90 kept
//                   as his earned history); Brian Maronde ACTIVE PRIMARY @ 100%
//                   (sole rep going forward).
//   Sonny's already-PAID payouts stay stamped to Sonny (NOT reassigned) — that is
//   the whole point of stamped ownership; paid history is never dragged to the new rep.
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
const REDUCE_STAGE    = 'SMT';         // the old rep's 2nd paid stage, reduced 50->40%
const REDUCE_TARGET_PCT = 40;          // SMT's intended percentage after the correction
const OLD_REP_KEEPS   = ['MANUFACTURING', 'SMT']; // stages that stay with the old rep (both PAID)

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

  // The new rep's stage (FOLLOW_UP) must be an active, configured stage.
  // The old rep's kept stages (MANUFACTURING + SMT) are historical/paid — they
  // are validated directly against the live payouts below, not against settings.
  if (stagePct.get(NEW_REP_STAGE) == null) fail(`Active stage "${NEW_REP_STAGE}" not configured`);
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

    const qcPayout = byStage.get(REDUCE_STAGE);
    const qcOldAmt = qcPayout.amount;
    const qcNewAmt = ic.commissionAmount * (REDUCE_TARGET_PCT / 100);      // 40%
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
    console.log(`      SMT            50→40%  ${money(qcOldAmt)} → ${money(qcNewAmt)}  Sonny  (PAID, reduced by ${money(qcOldAmt - qcNewAmt)})`);
    console.log(`      FOLLOW_UP      10%  ${money(brianAmt).padStart(12)}  Brian  (NEW, ${BRIAN_STATUS})`);
  }
  console.log('─'.repeat(94));
  const totalAfter = sonnyAfter + brianAfter;
  console.log(`  BEFORE:  Sonny ${money(sonnyBefore)}   Brian ${money(0)}   Total ${money(totalBefore)}`);
  console.log(`  AFTER:   Sonny ${money(sonnyAfter)}   Brian ${money(brianAfter)}   Total ${money(totalAfter)}`);
  console.log(`  Moved from Sonny to Brian: ${money(sonnyBefore - sonnyAfter)}  (his 10% FOLLOW_UP share)`);
  console.log('─'.repeat(94));
  console.log(`  REP POINTER: order.sku + commission.salesPersonName  "${EXPECT_OLD_REP}" -> "${NEW_REP}"`);
  console.log(`  REPS: ${EXPECT_OLD_REP} CLOSED (share 90, inactive) ; ${NEW_REP} ACTIVE PRIMARY 100% (account owner going forward)`);
  console.log(`  Sonny's PAID payouts stay stamped to Sonny (earned history, never reassigned).`);
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
    // 1. SWITCH: Brian becomes the sole active PRIMARY rep (account owner going
    //    forward); Sonny's rep is closed but kept as history at his earned 90%.
    const brianRep = await tx.commissionRep.create({
      data: {
        commissionId: commission.id,
        salesPersonName: NEW_REP,
        userId: brianUser.id,
        sharePercentage: 100,
        role: 'PRIMARY',
        isActive: true,
      },
    });
    await tx.commissionRep.update({
      where: { id: sonnyRep.id },
      data: { sharePercentage: 90, isActive: false, effectiveTo: stamp, role: 'PRIMARY' },
    });

    // Move the account pointer to Brian (order header + commission display rep).
    // Sonny's already-PAID payouts are NOT touched here — they stay stamped to
    // Sonny (the stamped-ownership design is exactly what prevents the legacy
    // "rename drags paid history to the new rep" bug).
    await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: NEW_REP } });
    await tx.order.update({ where: { id: ORDER_ID }, data: { sku: NEW_REP } });

    // 2. Per item: reduce Sonny's SMT payout to 40%, create Brian's FOLLOW_UP 10%.
    for (const { ic, qcPayout, qcOldAmt, qcNewAmt, brianAmt } of plan) {
      await tx.commissionPayout.update({
        where: { id: qcPayout.id },
        data: {
          percentage: REDUCE_TARGET_PCT,
          amount: qcNewAmt,
          notes: ((qcPayout.notes ? qcPayout.notes + ' | ' : '') +
            `[REBALANCE ${stamp.toISOString().slice(0,10)}] SMT 50→40%, ${money(qcOldAmt)}→${money(qcNewAmt)}; 10% (${money(brianAmt)}) reassigned to ${NEW_REP} (FOLLOW_UP).`),
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

    // 3. Audit log — this is a rep SWITCH (account moved), with a paid-share correction.
    await tx.auditLog.create({
      data: {
        entityType: 'Commission',
        entityId: commission.id,
        parentEntityId: ORDER_ID,
        action: 'SALES_REP_SWITCHED',
        metadata: JSON.stringify({
          orderId: ORDER_ID,
          method: 'Switch (account moved) + Option A rebalance; order total unchanged',
          from: EXPECT_OLD_REP, to: NEW_REP,
          newRepIsAccountOwner: true,
          paidPayoutsKeptWithOldRep: true,
          movedAmount: Number((sonnyBefore - sonnyAfter).toFixed(3)),
          sonnyEarned: Number(sonnyAfter.toFixed(3)),
          brianAssigned: Number(brianAfter.toFixed(3)),
          brianStatus: BRIAN_STATUS,
          finalShares: { [EXPECT_OLD_REP]: '90 (paid history, closed)', [NEW_REP]: '100 (active, going forward)' },
        }),
        performedByName: 'Rep-Switch Script (Option A)',
      },
    });

    // 4. Notify both reps (plain inserts; the account changed hands).
    if (brianUser.isActive) {
      await tx.notification.create({
        data: {
          userId: brianUser.id,
          type: 'COMMISSION',
          category: 'INFO',
          title: 'Order assigned to you',
          message: `You are now the sales rep on an order. A ${money(brianAfter)} FOLLOW_UP commission (status ${BRIAN_STATUS}) has been assigned to you; the earlier stages were paid to the previous rep.`,
          relatedOrderId: ORDER_ID,
          metadata: JSON.stringify({ orderId: ORDER_ID, from: EXPECT_OLD_REP, amount: Number(brianAfter.toFixed(3)), status: BRIAN_STATUS }),
          priority: 'NORMAL',
        },
      });
    }
    const sonnyUser = await tx.user.findFirst({ where: { name: EXPECT_OLD_REP, isActive: true }, select: { id: true } });
    if (sonnyUser && sonnyUser.id !== brianUser.id) {
      await tx.notification.create({
        data: {
          userId: sonnyUser.id,
          type: 'COMMISSION',
          category: 'INFO',
          title: 'Order reassigned',
          message: `An order was reassigned to ${NEW_REP}. Your paid commissions are unchanged (${money(sonnyAfter)} kept); the final 10% (${money(brianAfter)}) moved to ${NEW_REP}.`,
          relatedOrderId: ORDER_ID,
          metadata: JSON.stringify({ orderId: ORDER_ID, to: NEW_REP, kept: Number(sonnyAfter.toFixed(3)), moved: Number(brianAfter.toFixed(3)) }),
          priority: 'NORMAL',
        },
      });
    }
  });

  console.log(`\n✅ APPLIED. Account switched to ${NEW_REP} (now the rep). Sonny keeps ${money(sonnyAfter)} paid history; Brian assigned ${money(brianAfter)}. Order total unchanged.`);
  console.log('   Verify in the admin UI or re-run this script (it will report ALREADY APPLIED).');
}

// The two "kept" stages (MANUFACTURING + SMT) were both 50% at order-creation
// time; that is the pre-rebalance state we assert against.
function stagePctExpectedBefore(stage) {
  return 50;
}

main()
  .catch((e) => { console.error('\n❌', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
