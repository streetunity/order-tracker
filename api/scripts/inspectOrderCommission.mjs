// api/scripts/inspectOrderCommission.mjs
// READ-ONLY. Dumps the full commission picture for one order so we can see the
// exact stage names / percentages / owners before running any write script.
//   Run from /var/www/order-tracker/api:  node scripts/inspectOrderCommission.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORDER_ID = process.env.ORDER_ID || 'cmjbwvsp5000yjch14ws9oy5e';

function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }); }

async function main() {
  const order = await prisma.order.findUnique({ where: { id: ORDER_ID }, select: { id: true, sku: true } });
  console.log('ORDER', ORDER_ID, '  sku(rep):', order ? order.sku : '(order not found)');

  const stages = await prisma.commissionStageSetting.findMany({ orderBy: { sortOrder: 'asc' } });
  console.log('\nALL stage settings (active flag shown):');
  for (const s of stages) console.log(`  ${String(s.sortOrder).padStart(2)}  ${s.stage.padEnd(16)} ${String(s.percentage).padStart(5)}%  ${s.isActive ? 'ACTIVE' : 'inactive'}`);

  const commission = await prisma.commission.findFirst({
    where: { orderId: ORDER_ID },
    include: { reps: true, itemCommissions: { include: { payouts: true } } },
  });
  if (!commission) { console.log('\nNo commission for this order.'); return; }

  console.log('\nCOMMISSION', commission.id, '  salesPersonName:', commission.salesPersonName, '  rate:', commission.commissionRate);
  console.log('\nREPS:');
  for (const r of commission.reps) {
    console.log(`  ${r.salesPersonName.padEnd(16)} share ${String(r.sharePercentage).padStart(5)}%  role ${r.role}  ${r.isActive ? 'ACTIVE' : 'inactive'}  effTo ${r.effectiveTo ? r.effectiveTo.toISOString().slice(0,10) : '-'}`);
  }

  let grand = 0;
  for (const ic of commission.itemCommissions) {
    console.log(`\nITEM ${ic.productCode}  (icId ${ic.id})`);
    console.log(`  commissionAmount ${money(ic.commissionAmount)}  rate ${ic.commissionRate}  net ${money(ic.netAmount)}`);
    const payouts = (ic.payouts || []).slice().sort((a, b) => (a.stage > b.stage ? 1 : -1));
    for (const p of payouts) {
      grand += p.amount;
      console.log(`    stage ${String(p.stage).padEnd(16)} ${String(p.percentage).padStart(5)}%  ${money(p.amount).padStart(12)}  ${p.status.padEnd(9)} owner=${p.salesPersonName || '(null)'}  id=${p.id}`);
    }
  }
  console.log('\nSUM of all payout amounts:', money(grand));
}

main().catch(e => { console.error('ERR', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
