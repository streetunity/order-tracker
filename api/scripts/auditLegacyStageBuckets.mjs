// api/scripts/auditLegacyStageBuckets.mjs
// READ-ONLY. For every OPEN legacy 50/50 item (MANUFACTURING 50 + SMT 50, no
// FOLLOW_UP), buckets it by the ITEM's own board stage and its 2nd-stage payout
// status, so we can see exactly what a 50/40/10 conversion would touch. Writes nothing.
//   Run from /var/www/order-tracker/api:  node scripts/auditLegacyStageBuckets.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EPS = 0.01;
const STAGES = ['PENDING_FUNDING','MANUFACTURING','TESTING','SHIPPING','AT_SEA','SMT','QC','DELIVERED','ONSITE','COMPLETED','FOLLOW_UP'];
const IDX = Object.fromEntries(STAGES.map((s,i)=>[s,i]));
const FU = IDX['FOLLOW_UP'];
function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }

async function main() {
  const commissions = await prisma.commission.findMany({
    include: {
      order: { select: { poNumber:true, account:{ select:{ name:true } } } },
      itemCommissions: { include: { payouts: true, item: { select: { currentStage: true } } } },
    },
  });

  const buckets = { IGNORE_FOLLOWUP: [], CLEAN_CONVERT: [], PAID_ADJUST: [], REVIEW: [] };

  for (const c of commissions) {
    for (const ic of c.itemCommissions) {
      const payouts = ic.payouts || [];
      if (payouts.length === 0) continue;
      if (payouts.some(p => p.stage === 'FOLLOW_UP')) continue;                 // already 3-stage
      const mfg = payouts.find(p => p.stage === 'MANUFACTURING');
      const smt = payouts.find(p => p.stage === 'SMT');
      if (!mfg || !smt) continue;
      if (Math.abs(mfg.percentage-50)>EPS || Math.abs(smt.percentage-50)>EPS) continue;
      // Skip fully-complete items (both paid) that are past everything — still show if not at follow-up.
      const itemStage = ic.item?.currentStage || 'MANUFACTURING';
      const rec = {
        cust: c.order?.account?.name || '?', code: ic.productCode, itemStage,
        smtStatus: smt.status, mfgStatus: mfg.status,
        half: smt.amount, forty: ic.commissionAmount*0.40, ten: ic.commissionAmount*0.10,
        rep: smt.salesPersonName || '(unstamped)',
      };
      if ((IDX[itemStage] ?? 1) >= FU) buckets.IGNORE_FOLLOWUP.push(rec);
      else if (smt.status === 'PAID') buckets.PAID_ADJUST.push(rec);
      else if (smt.status === 'WAITING' || smt.status === 'PENDING') buckets.CLEAN_CONVERT.push(rec);
      else buckets.REVIEW.push(rec);
    }
  }

  const sum = arr => arr.reduce((a,r)=>a+r.ten,0);
  console.log('OPEN legacy 50/50 items, bucketed by the ITEM\'s board stage + 2nd-stage payout:\n');
  console.log(`  IGNORE (item already at FOLLOW_UP)          : ${buckets.IGNORE_FOLLOWUP.length} item(s)`);
  console.log(`  CLEAN CONVERT (2nd stage still unpaid)      : ${buckets.CLEAN_CONVERT.length} item(s)   -> ${money(sum(buckets.CLEAN_CONVERT))} would defer to 10% follow-up`);
  console.log(`  PAID ADJUST (2nd stage already PAID @50%)   : ${buckets.PAID_ADJUST.length} item(s)   -> ${money(sum(buckets.PAID_ADJUST))} is the sensitive 10% in question`);
  console.log(`  REVIEW (2nd stage APPROVED/REJECTED)        : ${buckets.REVIEW.length} item(s)`);
  console.log('\n' + '='.repeat(100));

  for (const [name, arr] of Object.entries(buckets)) {
    if (arr.length === 0) continue;
    console.log(`\n### ${name} (${arr.length})`);
    for (const r of arr) {
      const extra = name==='PAID_ADJUST'
        ? `  recorded PAID ${money(r.half)} (50%) -> should be ${money(r.forty)} (40%) + ${money(r.ten)} follow-up`
        : name==='CLEAN_CONVERT'
          ? `  SMT ${r.smtStatus} -> 40% ${money(r.forty)}  + follow-up ${money(r.ten)}`
          : '';
      console.log(`   ${r.cust.slice(0,24).padEnd(24)} ${String(r.code).slice(0,26).padEnd(26)} item@${String(r.itemStage).padEnd(13)} SMT:${String(r.smtStatus).padEnd(8)} ${r.rep.padEnd(16)}${extra}`);
    }
  }
  console.log('\n' + '='.repeat(100));
  console.log('CLEAN CONVERT is safe to automate. PAID ADJUST edits recorded payments — only do it if every');
  console.log('one of those was truly paid at 40%. IGNORE stays untouched.');
}

main().catch(e=>{console.error('ERR',e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
