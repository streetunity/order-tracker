// api/scripts/splitOrder.mjs
// Split a single order's commission EQUALLY across 2+ reps. Only UNPAID payouts
// are divided; already-PAID payouts stay with whoever earned them. Total per
// item/stage is unchanged — each unpaid payout is split N ways.
//
//   Equal shares only: rate ÷ N (e.g. two reps -> 50% share each of the order rate).
//   Requires the order to currently have exactly ONE active rep (adds reps to it).
//
// SAFETY: DRY RUN by default (writes nothing). One transaction on APPLY. Reconciles
// every dollar. Idempotency guard (won't run if already split).
//
//   REPS="Sonny Yee|Brian Maronde" ORDER_ID=<id> node scripts/splitOrder.mjs           # dry run
//   REPS="Sonny Yee|Brian Maronde" ORDER_ID=<id> APPLY=1 node scripts/splitOrder.mjs    # commit
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const EPS = 0.005;
const ORDER_ID = process.env.ORDER_ID || '';
const REPS = (process.env.REPS || '').split('|').map(s => s.trim()).filter(Boolean);
const UNPAID = ['WAITING', 'PENDING', 'APPROVED'];
function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }
function fail(m){ throw new Error(m); }

async function main() {
  console.log(APPLY ? 'MODE: APPLY (committing)\n' : 'MODE: DRY RUN (no writes; pass APPLY=1 to commit)\n');
  if (!ORDER_ID) fail('Set ORDER_ID=<order id>');
  if (REPS.length < 2) fail('Set REPS="Name A|Name B" (2+ distinct reps)');
  if (new Set(REPS).size !== REPS.length) fail('REPS has duplicates');
  const N = REPS.length;
  const share = 100 / N;

  const commission = await prisma.commission.findFirst({
    where: { orderId: ORDER_ID },
    include: { reps: true, order: { select: { poNumber: true, account: { select: { name: true } } } }, itemCommissions: { include: { payouts: true } } },
  });
  if (!commission) fail('No commission for order ' + ORDER_ID);

  const activeReps = commission.reps.filter(r => r.isActive);
  if (activeReps.length !== 1) fail(`Order must have exactly 1 active rep to split (found ${activeReps.length}). Re-splitting isn't supported yet.`);
  const currentRep = activeReps[0].salesPersonName;

  const users = await prisma.user.findMany({ where: { name: { in: REPS } }, select: { id: true, name: true } });
  const userIdByName = Object.fromEntries(users.map(u => [u.name, u.id]));
  const missing = REPS.filter(n => !(n in userIdByName));
  if (missing.length) console.log('⚠ note: no user record for: ' + missing.join(', ') + ' (payouts still stamped by name)\n');

  const allPayouts = commission.itemCommissions.flatMap(ic => ic.payouts || []);
  const unpaid = allPayouts.filter(p => UNPAID.includes(p.status));
  const paid = allPayouts.filter(p => p.status === 'PAID');

  console.log(`Order ${commission.order?.poNumber ? '#'+commission.order.poNumber : ''} — ${commission.order?.account?.name || '?'}`);
  console.log(`Current rep: ${currentRep}  ->  split ${N} ways (${share.toFixed(2)}% each): ${REPS.join(', ')}\n`);
  console.log(`Unpaid payouts to divide: ${unpaid.length}   |   Paid payouts kept as-is: ${paid.length}\n`);
  console.log('─'.repeat(96));

  // Build plan
  const plan = [];
  let totalBefore = 0, totalAfter = 0;
  for (const p of unpaid) {
    const eachOther = Math.round((p.amount / N) * 1000) / 1000;
    const primaryAmt = Number((p.amount - eachOther * (N - 1)).toFixed(3));
    const eachPct = p.percentage / N;
    const parts = REPS.map((name, i) => ({ name, amount: i === 0 ? primaryAmt : eachOther, pct: eachPct }));
    const sum = parts.reduce((a, x) => a + x.amount, 0);
    if (Math.abs(sum - p.amount) > EPS) fail(`Reconcile fail on payout ${p.id}: ${money(sum)} != ${money(p.amount)}`);
    totalBefore += p.amount; totalAfter += sum;
    plan.push({ p, parts });
    console.log(`  ${String(p.stage).padEnd(14)} ${String(p.status).padEnd(9)} ${money(p.amount)}  ->  ` + parts.map(x => `${x.name.split(' ')[0]} ${money(x.amount)}`).join('  |  '));
  }
  console.log('─'.repeat(96));
  console.log(`Reconcile: before ${money(totalBefore)}  after ${money(totalAfter)}  (must match)`);
  if (Math.abs(totalBefore - totalAfter) > EPS) fail('Totals do not reconcile');
  if (paid.length) console.log(`Paid (untouched, stays with ${currentRep}): ${money(paid.reduce((a,p)=>a+p.amount,0))}`);
  console.log('─'.repeat(96));

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with APPLY=1 to commit.'); return; }

  const stamp = new Date();
  await prisma.$transaction(async (tx) => {
    // Close current active rep(s); create the new equal-share rep set.
    for (const r of activeReps) await tx.commissionRep.update({ where: { id: r.id }, data: { isActive: false, effectiveTo: stamp } });
    const repRows = [];
    for (let i = 0; i < REPS.length; i++) {
      repRows.push(await tx.commissionRep.create({ data: {
        commissionId: commission.id, salesPersonName: REPS[i], userId: userIdByName[REPS[i]] || null,
        sharePercentage: share, role: i === 0 ? 'PRIMARY' : 'SECONDARY', isActive: true,
      } }));
    }
    // Divide each unpaid payout: keep the original for rep[0], create the rest.
    for (const { p, parts } of plan) {
      const resetApproved = p.status === 'APPROVED'
        ? { status: 'PENDING', approvedAt: null, approvedByUserId: null, approvedByName: null, approvalNotes: null }
        : {};
      await tx.commissionPayout.update({ where: { id: p.id }, data: {
        percentage: parts[0].pct, amount: parts[0].amount,
        salesPersonName: repRows[0].salesPersonName, userId: repRows[0].userId, commissionRepId: repRows[0].id,
        notes: ((p.notes ? p.notes + ' | ' : '') + `[SPLIT ${stamp.toISOString().slice(0,10)}] ${N}-way equal split.`),
        ...resetApproved,
      } });
      for (let i = 1; i < REPS.length; i++) {
        await tx.commissionPayout.create({ data: {
          itemCommissionId: p.itemCommissionId, commissionId: commission.id, stage: p.stage,
          percentage: parts[i].pct, amount: parts[i].amount,
          status: p.status === 'APPROVED' ? 'PENDING' : p.status, triggeredAt: p.triggeredAt,
          salesPersonName: repRows[i].salesPersonName, userId: repRows[i].userId, commissionRepId: repRows[i].id,
          notes: `[SPLIT ${stamp.toISOString().slice(0,10)}] ${N}-way equal split share.`,
        } });
      }
    }
    await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: repRows[0].salesPersonName } });
    await tx.order.update({ where: { id: ORDER_ID }, data: { sku: repRows[0].salesPersonName } });
    await tx.auditLog.create({ data: {
      entityType: 'Commission', entityId: commission.id, parentEntityId: ORDER_ID, action: 'COMMISSION_SPLIT',
      metadata: JSON.stringify({ orderId: ORDER_ID, from: currentRep, reps: REPS, sharePercentEach: share, dividedPayouts: unpaid.length }),
      performedByName: 'Split Script (equal)',
    } });
    // notify each rep with a user record
    for (const r of repRows) {
      if (!r.userId) continue;
      await tx.notification.create({ data: {
        userId: r.userId, type: 'COMMISSION', category: 'INFO', title: 'Shared commission assigned',
        message: `You are now one of ${N} reps sharing an order (${share.toFixed(0)}% each). Unpaid stages were split evenly.`,
        relatedOrderId: ORDER_ID, metadata: JSON.stringify({ orderId: ORDER_ID, reps: REPS }), priority: 'NORMAL',
      } });
    }
  });

  console.log(`\n✅ APPLIED. Order split ${N} ways among ${REPS.join(', ')} (${share.toFixed(2)}% each). Paid stages untouched.`);
}

main().catch(e => { console.error('\n❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
