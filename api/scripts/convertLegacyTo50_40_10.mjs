// api/scripts/convertLegacyTo50_40_10.mjs
// Bulk-converts OPEN legacy 50/50 orders to 50/40/10 so the accountant no longer
// has to hand-adjust each one. Per ITEM (single rep; total never changes):
//   - MANUFACTURING 50%           -> unchanged
//   - 2nd stage (SMT) 50% -> 40%  -> ONLY if that payout is still unpaid
//                                     (WAITING or PENDING). Amount = commission x 0.40.
//   - NEW FOLLOW_UP 10%           -> created for the SAME rep, WAITING (auto-triggers
//                                     at the follow-up stage). Amount = commission x 0.10.
//
// SAFETY
//   * DRY RUN by default. Prints the full plan and writes nothing unless APPLY=1.
//   * Per-commission transaction (all-or-nothing per order).
//   * Idempotent: items that already have a FOLLOW_UP payout are skipped.
//   * Never touches PAID/APPROVED payouts. Items whose SMT is already PAID are
//     left as-is (grandfathered at the old 50/50); items with an APPROVED/REJECTED
//     2nd stage are reported for manual review, not auto-changed.
//   * Same rep throughout — this is NOT a rep switch.
//
// RUN (from /var/www/order-tracker/api, AFTER a fresh DB backup):
//   node scripts/convertLegacyTo50_40_10.mjs            # dry run
//   APPLY=1 node scripts/convertLegacyTo50_40_10.mjs    # commit
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const EPS = 0.01;
const SECOND_STAGE = 'SMT';        // the legacy 2nd stage to reduce
const FOLLOWUP_STAGE = 'FOLLOW_UP';
function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }

async function main() {
  console.log(APPLY ? 'MODE: APPLY (committing)\n' : 'MODE: DRY RUN (no writes; pass APPLY=1 to commit)\n');

  const commissions = await prisma.commission.findMany({
    include: {
      reps: true,
      order: { select: { id:true, poNumber:true, account:{ select:{ name:true } } } },
      itemCommissions: { include: { payouts: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let ordersTouched = 0, itemsConverted = 0, totalDeferred = 0;
  const grandfathered = [];   // items whose SMT already PAID (left alone)
  const needsReview = [];     // items with APPROVED/REJECTED 2nd stage
  const byRep = {};
  const stamp = new Date();

  for (const c of commissions) {
    // Build a per-item plan for this commission.
    const plan = [];
    for (const ic of c.itemCommissions) {
      const payouts = ic.payouts || [];
      if (payouts.length === 0) continue;
      if (payouts.some(p => p.stage === FOLLOWUP_STAGE)) continue;      // already converted / new-config

      const mfg = payouts.find(p => p.stage === 'MANUFACTURING');
      const smt = payouts.find(p => p.stage === SECOND_STAGE);
      if (!mfg || !smt) continue;                                       // not the legacy 2-stage shape
      if (Math.abs(mfg.percentage - 50) > EPS || Math.abs(smt.percentage - 50) > EPS) continue; // not 50/50

      if (smt.status === 'PAID') { grandfathered.push({ order:c.order, code:ic.productCode, amt:smt.amount }); continue; }
      if (smt.status === 'APPROVED' || smt.status === 'REJECTED') { needsReview.push({ order:c.order, code:ic.productCode, status:smt.status }); continue; }
      // Convertible: SMT is WAITING or PENDING.
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
      console.log(`   ${String(p.ic.productCode).slice(0,32).padEnd(32)} SMT ${money(p.smt.amount)}→${money(p.newSmt)} (50→40%)  + FOLLOW_UP ${money(p.followAmt)} (10%, WAITING)  [${rep}]`);
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
              note: 'Reduced unpaid 2nd stage 50->40% and added 10% follow-up (same rep, total unchanged).',
            }),
            performedByName: 'Legacy 50/40/10 Converter',
          },
        });
      });
    }
  }

  console.log('\n' + '='.repeat(90));
  console.log(`Convertible: ${itemsConverted} item(s) across ${ordersTouched} order(s)`);
  console.log(`Total 10% deferred to follow-up: ${money(totalDeferred)}  (per-item totals unchanged)`);
  console.log('Per rep:'); for (const [r,v] of Object.entries(byRep)) console.log(`   ${r.padEnd(18)} ${money(v)}`);
  if (grandfathered.length) {
    console.log(`\nLeft as-is (SMT already PAID at 50% — cannot convert, already 100%): ${grandfathered.length} item(s)`);
    for (const g of grandfathered.slice(0,50)) console.log(`   ${g.order?.account?.name || '?'} — ${g.code}`);
  }
  if (needsReview.length) {
    console.log(`\n⚠ Needs manual review (2nd stage APPROVED/REJECTED, not auto-changed): ${needsReview.length} item(s)`);
    for (const n of needsReview) console.log(`   ${n.order?.account?.name || '?'} — ${n.code} (${n.status})`);
  }
  console.log('='.repeat(90));
  if (!APPLY) console.log('\nDRY RUN — nothing written. Re-run with APPLY=1 to commit.');
  else console.log('\n✅ APPLIED. Legacy orders converted; the system now pays 40% + 10% automatically.');
}

main().catch(e=>{console.error('\n❌',e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
