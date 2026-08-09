// api/scripts/convertLegacyTo50_40_10.mjs
// Bulk-converts the CLEAN bucket of open legacy 50/50 orders to 50/40/10 so the
// accountant no longer hand-adjusts each one. Per ITEM (single rep; total never changes):
//   - MANUFACTURING 50%           -> unchanged
//   - 2nd stage (SMT) 50% -> 40%  -> ONLY if that payout is still unpaid
//                                     (WAITING or PENDING). Amount = commission x 0.40.
//   - NEW FOLLOW_UP 10%           -> created for the SAME rep, WAITING. Amount = commission x 0.10.
//
// SCOPE / SAFETY
//   * SKIPS the owner's orders (EXCLUDE_REPS, default "Ryan Westcott") — the owner
//     doesn't take commissions, so there's nothing to convert.
//   * SKIPS any item whose board stage is at or past FOLLOW_UP (leave finished items alone).
//   * NEVER touches PAID payouts. Items whose 2nd stage is already PAID are reported as
//     "needs manual review" and left unchanged (editing recorded payments could overpay a
//     rep who already received the full 50% — do those by hand after verifying).
//   * DRY RUN by default. Prints the full plan; writes nothing unless APPLY=1.
//   * Per-commission transaction. Idempotent (items that already have a FOLLOW_UP are skipped).
//   * Same rep throughout — NOT a rep switch.
//
// RUN (from /var/www/order-tracker/api, AFTER a fresh DB backup):
//   node scripts/convertLegacyTo50_40_10.mjs            # dry run
//   APPLY=1 node scripts/convertLegacyTo50_40_10.mjs    # commit
//   EXCLUDE_REPS="Ryan Westcott|Jane Doe" node ...      # customize who to skip
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const EPS = 0.01;
const SECOND_STAGE = 'SMT';
const FOLLOWUP_STAGE = 'FOLLOW_UP';
const STAGES = ['PENDING_FUNDING','MANUFACTURING','TESTING','SHIPPING','AT_SEA','SMT','QC','DELIVERED','ONSITE','COMPLETED','FOLLOW_UP'];
const IDX = Object.fromEntries(STAGES.map((s,i)=>[s,i]));
const FU = IDX['FOLLOW_UP'];
const EXCLUDE_REPS = (process.env.EXCLUDE_REPS || 'Ryan Westcott').split('|').map(s=>s.trim()).filter(Boolean);
function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }

async function main() {
  console.log(APPLY ? 'MODE: APPLY (committing)\n' : 'MODE: DRY RUN (no writes; pass APPLY=1 to commit)\n');
  console.log('Excluding rep(s):', EXCLUDE_REPS.join(', ') || '(none)', '\n');

  const commissions = await prisma.commission.findMany({
    include: {
      reps: true,
      order: { select: { id:true, poNumber:true, account:{ select:{ name:true } } } },
      itemCommissions: { include: { payouts: true, item: { select: { currentStage: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let ordersTouched = 0, itemsConverted = 0, totalDeferred = 0;
  let skippedFollowUp = 0, skippedOwner = 0;
  const grandfathered = [];   // items whose SMT already PAID (needs manual review; NOT changed)
  const needsReview = [];     // items with APPROVED/REJECTED 2nd stage
  const byRep = {};
  const stamp = new Date();

  for (const c of commissions) {
    const plan = [];
    for (const ic of c.itemCommissions) {
      const payouts = ic.payouts || [];
      if (payouts.length === 0) continue;
      if (payouts.some(p => p.stage === FOLLOWUP_STAGE)) continue;      // already 3-stage

      const mfg = payouts.find(p => p.stage === 'MANUFACTURING');
      const smt = payouts.find(p => p.stage === SECOND_STAGE);
      if (!mfg || !smt) continue;
      if (Math.abs(mfg.percentage - 50) > EPS || Math.abs(smt.percentage - 50) > EPS) continue;

      // Skip the owner's orders (doesn't take commissions).
      if (EXCLUDE_REPS.includes(smt.salesPersonName)) { skippedOwner++; continue; }

      // Skip anything already at (or past) the follow-up stage — leave finished items alone.
      const itemStage = ic.item?.currentStage || 'MANUFACTURING';
      if ((IDX[itemStage] ?? 1) >= FU) { skippedFollowUp++; continue; }

      if (smt.status === 'PAID') { grandfathered.push({ order:c.order, code:ic.productCode, amt:smt.amount, stage:itemStage }); continue; }
      if (smt.status === 'APPROVED' || smt.status === 'REJECTED') { needsReview.push({ order:c.order, code:ic.productCode, status:smt.status }); continue; }
      // CLEAN: SMT is WAITING or PENDING, not the owner, not at follow-up.
      const newSmt = ic.commissionAmount * 0.40;
      const followAmt = ic.commissionAmount * 0.10;
      plan.push({ ic, smt, newSmt, followAmt });
    }
    if (plan.length === 0) continue;

    ordersTouched++;
    console.log(`\n${c.order?.poNumber ? '#'+c.order.poNumber : '(no PO)'} — ${c.order?.account?.name || '?'}   [${c.reps.filter(r=>r.isActive).map(r=>r.salesPersonName).join(', ')}]`);
    for (const p of plan) {
      const rep = p.smt.salesPersonName || '(unstamped)';
      byRep[rep] = (byRep[rep] || 0) + p.followAmt;
      itemsConverted++;
      totalDeferred += p.followAmt;
      console.log(`   ${String(p.ic.productCode).slice(0,32).padEnd(32)} SMT ${money(p.smt.amount)}→${money(p.newSmt)} (50→40%, ${p.smt.status})  + FOLLOW_UP ${money(p.followAmt)} (10%, WAITING)  [${rep}]`);
    }

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        for (const p of plan) {
          await tx.commissionPayout.update({
            where: { id: p.smt.id },
            data: {
              percentage: 40,
              amount: p.newSmt,
              notes: ((p.smt.notes ? p.smt.notes + ' | ' : '') + `[LEGACY→50/40/10 ${stamp.toISOString().slice(0,10)}] SMT 50→40%; 10% deferred to FOLLOW_UP.`),
            },
          });
          await tx.commissionPayout.create({
            data: {
              itemCommissionId: p.ic.id,
              commissionId: c.id,
              stage: FOLLOWUP_STAGE,
              percentage: 10,
              amount: p.followAmt,
              status: 'WAITING',
              salesPersonName: p.smt.salesPersonName,
              userId: p.smt.userId,
              commissionRepId: p.smt.commissionRepId,
              notes: `[LEGACY→50/40/10 ${stamp.toISOString().slice(0,10)}] 10% follow-up added from SMT split.`,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            entityType: 'Commission', entityId: c.id, parentEntityId: c.order?.id || null,
            action: 'COMMISSION_STAGE_CONVERTED',
            metadata: JSON.stringify({
              from: '50/50', to: '50/40/10', itemsConverted: plan.length,
              deferredToFollowUp: Number(plan.reduce((a,p)=>a+p.followAmt,0).toFixed(3)),
              note: 'CLEAN bucket only: reduced unpaid 2nd stage 50->40% and added 10% follow-up (same rep, total unchanged).',
            }),
            performedByName: 'Legacy 50/40/10 Converter',
          },
        });
      });
    }
  }

  console.log('\n' + '='.repeat(92));
  console.log(`CLEAN convert: ${itemsConverted} item(s) across ${ordersTouched} order(s)`);
  console.log(`Total 10% deferred to follow-up: ${money(totalDeferred)}  (per-item totals unchanged)`);
  console.log('Per rep:'); for (const [r,v] of Object.entries(byRep)) console.log(`   ${r.padEnd(18)} ${money(v)}`);
  console.log(`\nSkipped — owner (${EXCLUDE_REPS.join(', ')}): ${skippedOwner} item(s)`);
  console.log(`Skipped — item already at/past FOLLOW_UP: ${skippedFollowUp} item(s)`);
  if (grandfathered.length) {
    console.log(`\n⚠ NOT changed — 2nd stage already PAID at 50% (verify per item before any manual fix): ${grandfathered.length}`);
    for (const g of grandfathered) console.log(`   ${(g.order?.account?.name||'?').slice(0,26).padEnd(26)} ${g.code}  (recorded ${money(g.amt)}, item@${g.stage})`);
  }
  if (needsReview.length) {
    console.log(`\n⚠ Needs manual review (2nd stage APPROVED/REJECTED): ${needsReview.length}`);
    for (const n of needsReview) console.log(`   ${n.order?.account?.name || '?'} — ${n.code} (${n.status})`);
  }
  console.log('='.repeat(92));
  if (!APPLY) console.log('\nDRY RUN — nothing written. Re-run with APPLY=1 to commit the CLEAN bucket.');
  else console.log('\n✅ APPLIED. CLEAN legacy items converted; the system now pays 40% + 10% automatically on them.');
}

main().catch(e=>{console.error('\n❌',e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
