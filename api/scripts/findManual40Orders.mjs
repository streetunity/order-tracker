// api/scripts/findManual40Orders.mjs
// READ-ONLY. Finds orders that look like they got a MANUAL commission fix like
// PDI (the 2nd stage hand-reduced to 40%), and/or whose per-item stage
// percentages don't reconcile to 100% — and flags which ones are NOT yet
// complete (still have unpaid payouts). Writes nothing.
//   Run from /var/www/order-tracker/api:  node scripts/findManual40Orders.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EPS = 0.01;
function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }

async function main() {
  // Active stage settings, for reference (what the percentages "should" be now).
  const stages = await prisma.commissionStageSetting.findMany({ where:{isActive:true}, orderBy:{sortOrder:'asc'} });
  console.log('Active stages:', stages.map(s=>`${s.stage} ${s.percentage}%`).join(' / '), '\n');

  const commissions = await prisma.commission.findMany({
    include: {
      reps: true,
      order: { select: { id:true, poNumber:true, currentStage:true, account:{ select:{ name:true } } } },
      itemCommissions: { include: { payouts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = [];
  for (const c of commissions) {
    const allPayouts = c.itemCommissions.flatMap(ic => ic.payouts || []);
    if (allPayouts.length === 0) continue;

    const complete = allPayouts.every(p => p.status === 'PAID');
    const owners = [...new Set(allPayouts.map(p => p.salesPersonName || '(unstamped)'))];

    // Signature A: a payout on the (now-inactive) SMT stage reduced to 40%.
    const smt40 = allPayouts.some(p => p.stage === 'SMT' && Math.abs(p.percentage - 40) < EPS);

    // Signature B: any item whose payout percentages don't sum to ~100.
    let sumOff = false, sumDetail = [];
    for (const ic of c.itemCommissions) {
      const sum = (ic.payouts || []).reduce((a,p)=>a + (p.percentage||0), 0);
      if ((ic.payouts||[]).length && Math.abs(sum - 100) > EPS) { sumOff = true; sumDetail.push(`${ic.productCode} sums to ${sum}%`); }
    }

    // Signature C: more than one distinct owner across the payouts (a de-facto split).
    const multiOwner = owners.length > 1;

    if (!(smt40 || sumOff || multiOwner)) continue;   // only surface anomalies

    rows.push({ c, complete, owners, smt40, sumOff, sumDetail, multiOwner, allPayouts });
  }

  // Sort: incomplete first, then by flag richness.
  rows.sort((a,b) => (a.complete - b.complete) || 0);

  const incomplete = rows.filter(r => !r.complete);
  console.log(`Found ${rows.length} order(s) with a manual/anomalous commission structure`);
  console.log(`  -> ${incomplete.length} of them are NOT yet complete (have unpaid payouts)\n`);
  console.log('='.repeat(100));

  for (const r of rows) {
    const o = r.c.order;
    const flags = [
      r.smt40 ? 'SMT@40 (manual)' : null,
      r.sumOff ? 'PCT≠100' : null,
      r.multiOwner ? 'MULTI-REP' : null,
      r.complete ? 'COMPLETE' : '‼ INCOMPLETE',
    ].filter(Boolean).join('  |  ');

    console.log(`\n${o ? (o.poNumber ? '#'+o.poNumber : '(no PO)') : '(no order)'}  —  ${o?.account?.name || '?'}   [${flags}]`);
    console.log(`   order stage: ${o?.currentStage || '?'}   reps: ${r.c.reps.map(rp=>`${rp.salesPersonName} ${rp.sharePercentage}%${rp.isActive?'':' (inactive)'}`).join(', ') || '—'}`);
    if (r.sumDetail.length) console.log(`   ⚠ ${r.sumDetail.join('; ')}`);
    for (const ic of r.c.itemCommissions) {
      const ps = (ic.payouts||[]).slice().sort((a,b)=> (a.stage>b.stage?1:-1));
      for (const p of ps) {
        console.log(`      ${String(ic.productCode).padEnd(16)} ${String(p.stage).padEnd(14)} ${String(p.percentage).padStart(4)}%  ${money(p.amount).padStart(11)}  ${String(p.status).padEnd(8)} ${p.salesPersonName||'(unstamped)'}`);
      }
    }
  }
  console.log('\n' + '='.repeat(100));
  console.log('Legend: SMT@40 = 2nd stage hand-reduced to 40% (the PDI-style manual fix);');
  console.log('        PCT≠100 = an item\'s stage percentages don\'t add to 100 (missing/extra share);');
  console.log('        MULTI-REP = payouts owned by more than one rep (a de-facto split).');
}

main().catch(e=>{console.error('ERR',e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
