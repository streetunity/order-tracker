// apply-phase2b.mjs — Phase 2 step 2b (run from repo root).
// Repoints the agent-facing reads in commissions.js to the stamped payout owner
// so they stay correct once a commission's payouts belong to more than one rep:
//   • /my/summary  -> sum the rep's OWN payouts
//   • /my (list)   -> show commissions where the rep is owner OR a participant
//   • /projected   -> non-admin filter by participation
// Identical output for single-rep data. Review `git diff`, then `node --check`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(process.cwd(), 'api/src/routes/commissions.js');
if (!existsSync(FILE)) { console.error(`Cannot find ${FILE}\nRun from repo root.`); process.exit(1); }
let s = readFileSync(FILE, 'utf8');

function replaceOnce(oldStr, newStr, label) {
  const n = s.split(oldStr).length - 1;
  if (n !== 1) { console.error(`ANCHOR FAIL [${label}]: matched ${n} (expected 1). No changes written.`); process.exit(1); }
  s = s.replace(oldStr, newStr);
  console.log(`ok  ${label}`);
}

// 1) /my/summary — replace the commission query with a payout-owner query.
replaceOnce(
`      const commissions = await prisma.commission.findMany({
        where: {
          salesPersonName: req.user.name,
          createdAt: {
            gte: ytdStart,
            lt: ytdEnd
          }
        },
        include: {
          itemCommissions: {
            include: {
              payouts: true
            }
          }
        }
      });`,
`      const payouts = await prisma.commissionPayout.findMany({
        where: {
          salesPersonName: req.user.name,
          itemCommission: { commission: { createdAt: { gte: ytdStart, lt: ytdEnd } } }
        },
        select: { amount: true, status: true }
      });`,
  '1a: /my/summary query');

// 2) /my/summary — replace the nested forEach with a flat sum over the rep's payouts.
//    Built with explicit \n so the blank-line whitespace matches exactly.
const OLD_LOOP =
  "      commissions.forEach(commission => {\n" +
  "        totalCalculated += commission.totalCommissionAmount || 0;\n" +
  "        \n" +
  "        commission.itemCommissions.forEach(itemComm => {\n" +
  "          itemComm.payouts.forEach(payout => {\n" +
  "            switch (payout.status) {\n" +
  "              case 'WAITING':\n" +
  "                totalProjected += payout.amount || 0;\n" +
  "                break;\n" +
  "              case 'PENDING':\n" +
  "                totalPending += payout.amount || 0;\n" +
  "                break;\n" +
  "              case 'APPROVED':\n" +
  "                totalApproved += payout.amount || 0;\n" +
  "                break;\n" +
  "              case 'PAID':\n" +
  "                totalPaid += payout.amount || 0;\n" +
  "                break;\n" +
  "            }\n" +
  "          });\n" +
  "        });\n" +
  "      });";
const NEW_LOOP =
  "      payouts.forEach(payout => {\n" +
  "        switch (payout.status) {\n" +
  "          case 'WAITING':\n" +
  "            totalProjected += payout.amount || 0;\n" +
  "            break;\n" +
  "          case 'PENDING':\n" +
  "            totalPending += payout.amount || 0;\n" +
  "            break;\n" +
  "          case 'APPROVED':\n" +
  "            totalApproved += payout.amount || 0;\n" +
  "            break;\n" +
  "          case 'PAID':\n" +
  "            totalPaid += payout.amount || 0;\n" +
  "            break;\n" +
  "        }\n" +
  "      });\n" +
  "      totalCalculated = totalProjected + totalPending + totalApproved + totalPaid;";
replaceOnce(OLD_LOOP, NEW_LOOP, '1b: /my/summary sum loop');

// 3) /my (list) — owner OR participant.
replaceOnce(
`      const whereClause = {
        salesPersonName: req.user.name,
        status: status || undefined
      };`,
`      const whereClause = {
        OR: [
          { salesPersonName: req.user.name },
          { reps: { some: { salesPersonName: req.user.name } } }
        ],
        status: status || undefined
      };`,
  '2: /my list filter');

// 4) /projected — non-admin filter by participation.
replaceOnce(
`      if (!canManageCommissions(req.user.role)) {
        whereClause.salesPersonName = req.user.name;
      }`,
`      if (!canManageCommissions(req.user.role)) {
        whereClause.reps = { some: { salesPersonName: req.user.name } };
      }`,
  '3: /projected filter');

writeFileSync(FILE, s);
console.log('\nApplied Phase 2 step 2b edits to api/src/routes/commissions.js');
console.log('Review: git --no-pager diff api/src/routes/commissions.js');
console.log('Verify: node --check api/src/routes/commissions.js');
