// api/scripts/simulateMyCommissions.mjs
// READ-ONLY. Shows what the (fixed) My Commissions endpoints return for a rep,
// so you can verify a rep's view WITHOUT logging in as them. Mirrors the new
// owner-scoped, payout-dated query used by /my (list) and /my/summary.
//   Run from /var/www/order-tracker/api:
//     REP="Brian Maronde" YEAR=2026 node scripts/simulateMyCommissions.mjs
//     REP="Sonny Yee"     YEAR=2025 node scripts/simulateMyCommissions.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REP  = process.env.REP  || 'Brian Maronde';
const YEAR = parseInt(process.env.YEAR || String(new Date().getFullYear()));

function money(n){ return '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}); }

async function main() {
  const gte = new Date(`${YEAR}-01-01`);
  const lt  = new Date(`${YEAR + 1}-01-01`);
  console.log(`\nMy Commissions preview — rep="${REP}"  year=${YEAR}`);
  console.log('(the rep\'s own stamped payouts, dated by payout createdAt)\n');

  const payouts = await prisma.commissionPayout.findMany({
    where: { salesPersonName: REP, createdAt: { gte, lt } },
    include: {
      itemCommission: {
        include: {
          commission: { include: { order: { select: { poNumber: true, sku: true, account: { select: { name: true } } } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (payouts.length === 0) {
    console.log('  (no payouts owned by this rep in this year)');
  } else {
    console.log('  ' + 'STAGE'.padEnd(15) + 'PCT'.padStart(5) + '  ' + 'AMOUNT'.padStart(12) + '  ' + 'STATUS'.padEnd(9) + '  ORDER / CUSTOMER');
    for (const p of payouts) {
      const o = p.itemCommission?.commission?.order;
      const label = (o?.poNumber ? `#${o.poNumber}` : '(no PO)') + ' — ' + (o?.account?.name || '?') + `  [rep on order: ${o?.sku || '?'}]`;
      console.log('  ' + String(p.stage).padEnd(15) + String(p.percentage).padStart(5) + '  ' + money(p.amount).padStart(12) + '  ' + String(p.status).padEnd(9) + '  ' + label);
    }
  }

  // Summary tiles (same basis as /my/summary)
  const t = { WAITING:0, PENDING:0, APPROVED:0, PAID:0 };
  for (const p of payouts) if (t[p.status] !== undefined) t[p.status] += (p.amount || 0);
  console.log('\n  Summary tiles for ' + YEAR + ':');
  console.log('    Projected (WAITING): ' + money(t.WAITING));
  console.log('    Pending            : ' + money(t.PENDING));
  console.log('    Approved           : ' + money(t.APPROVED));
  console.log('    Paid               : ' + money(t.PAID));
  console.log('    Total              : ' + money(t.WAITING + t.PENDING + t.APPROVED + t.PAID) + '\n');
}

main().catch(e => { console.error('ERR', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
