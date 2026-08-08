// api/scripts/backfillCommissionReps.js
//
// One-time, idempotent backfill for the CommissionRep + stamped-payout rollout.
//   1. Ensures every Commission has a PRIMARY CommissionRep (share 100).
//   2. Stamps every CommissionPayout that has no owner yet with that primary
//      rep's name / userId / commissionRepId.
//
// Safe to run multiple times: it only creates reps that don't exist and only
// stamps payouts whose salesPersonName is still NULL. Never touches amounts,
// statuses, approvals, or payments.
//
// Run from the api/ dir AFTER `prisma db push` + `prisma generate`:
//   node scripts/backfillCommissionReps.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const commissions = await prisma.commission.findMany({
    select: { id: true, salesPersonName: true },
  });
  console.log(`[BACKFILL] ${commissions.length} commissions found`);

  // Cache user id lookups by name
  const userIdByName = new Map();
  async function resolveUserId(name) {
    if (!name) return null;
    if (userIdByName.has(name)) return userIdByName.get(name);
    const u = await prisma.user.findFirst({ where: { name }, select: { id: true } });
    const id = u?.id ?? null;
    userIdByName.set(name, id);
    return id;
  }

  let repsCreated = 0;
  let payoutsStamped = 0;

  for (const c of commissions) {
    // 1. Ensure a primary rep exists
    let rep = await prisma.commissionRep.findFirst({
      where: { commissionId: c.id },
      orderBy: { createdAt: 'asc' },
    });

    if (!rep) {
      const userId = await resolveUserId(c.salesPersonName);
      rep = await prisma.commissionRep.create({
        data: {
          commissionId: c.id,
          salesPersonName: c.salesPersonName ?? '',
          userId,
          sharePercentage: 100,
          role: 'PRIMARY',
          isActive: true,
        },
      });
      repsCreated++;
    }

    // 2. Stamp any unstamped payouts for this commission
    const res = await prisma.commissionPayout.updateMany({
      where: { commissionId: c.id, salesPersonName: null },
      data: {
        salesPersonName: rep.salesPersonName,
        userId: rep.userId,
        commissionRepId: rep.id,
      },
    });
    payoutsStamped += res.count;
  }

  console.log(`[BACKFILL] Done. Reps created: ${repsCreated}, payouts stamped: ${payoutsStamped}`);
}

main()
  .catch((e) => { console.error('[BACKFILL] Failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
