// api/scripts/findLegacyTwoStageOrders.mjs
// READ-ONLY. Finds orders created under the OLD 50/50 (two-stage) commission
// setup — i.e. items that have NO FOLLOW_UP payout — and flags which are still
// open (have unpaid payouts). These are the candidates that COULD be converted
// to 50/40/10 if you want the 10% held until the follow-up stage. Writes nothing.
//   Run from /var/www/order-tracker/api:  node scripts/findLegacyTwoStageOrders.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EPS = 0.01;
function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }

async function main() {
  const stages = await prisma.commissionStageSetting.findMany({ where:{isActive:true}, orderBy:{sortOrder:'asc'} });
  console.log('Active stages now:', stages.map(s=>`${s.stage} ${s.percentage}%`).join(' / '), '\n');

  const commissions = await prisma.commission.findMany({
    include: {
      reps: true,
      order: { select: { poNumber:true, currentStage:true, account:{ select:{ name:true } } } },
      itemCommissions: { include: { payouts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  let totalLegacy = 0, incompleteLegacy = 0;
  const printable = [];

  for (const c of commissions) {
    const items = c.itemCommissions.filter(ic => (ic.payouts||[]).length > 0);
    if (items.length === 0) continue;

    // "Legacy two-stage" = at least one item has payouts but NONE on FOLLOW_UP.
    const legacyItems = items.filter(ic => !(ic.payouts||[]).some(p => p.stage === 'FOLLOW_UP'));
    if (legacyItems.length === 0) continue;   // already has follow-up everywhere = new config

    const allPayouts = c.itemCommissions.flatMap(ic => ic.payouts || []);
    const complete = allPayouts.every(p => p.status === 'PAID');
    totalLegacy++;
    if (!complete) incompleteLegacy++;
    printable.push({ c, complete, items });
  }

  printable.sort((a,b)=> (a.complete - b.complete) || 0);

  console.log(`Legacy 50/50 (no follow-up) orders: ${totalLegacy} total  |  ${incompleteLegacy} still OPEN  |  ${totalLegacy-incompleteLegacy} already fully paid`);
  console.log('(Fully-paid ones are done — converting them would change nothing. Only OPEN ones are candidates.)\n');
  console.log('='.repeat(100));

  for (const r of printable) {
    const o = r.c.order;
    console.log(`\n${o?.poNumber ? '#'+o.poNumber : '(no PO)'}  —  ${o?.account?.name || '?'}   [${r.complete ? 'COMPLETE (paid)' : '‼ OPEN'}]   order stage: ${o?.currentStage||'?'}`);
    console.log(`   reps: ${r.c.reps.map(rp=>`${rp.salesPersonName} ${rp.sharePercentage}%${rp.isActive?'':' (inactive)'}`).join(', ') || '—'}`);
    for (const ic of r.c.itemCommissions) {
      const ps = (ic.payouts||[]).slice().sort((a,b)=> (a.stage>b.stage?1:-1));
      const sum = ps.reduce((a,p)=>a+(p.percentage||0),0);
      const tag = ps.some(p=>p.stage==='FOLLOW_UP') ? '' : '  <- no follow-up';
      for (const p of ps) {
        console.log(`      ${String(ic.productCode).slice(0,28).padEnd(28)} ${String(p.stage).padEnd(14)} ${String(p.percentage).padStart(4)}%  ${money(p.amount).padStart(11)}  ${String(p.status).padEnd(8)} ${p.salesPersonName||'(unstamped)'}`);
      }
      if (Math.abs(sum-100)>EPS) console.log(`         (item sums to ${sum}%)`);
      else if (tag) console.log(`         ${ic.productCode.slice(0,28)}${tag}`);
    }
  }
  console.log('\n' + '='.repeat(100));
  console.log('If you want OPEN legacy orders to defer 10% to follow-up (single-rep total is unchanged),');
  console.log('that can be done in bulk with a dry-run-first script — no hand calculation.');
}

main().catch(e=>{console.error('ERR',e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
