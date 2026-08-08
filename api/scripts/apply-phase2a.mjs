// apply-phase2a.mjs — Phase 2 step 1 (run from the repo root).
// Repoints the mechanical owner-reads to the stamped payout owner:
//   • commissionPayouts.js: notify/grouping + admin /paid filter
//   • commissions.js: /my/monthly + /my/paid payout queries
// No math/logic changes; identical output for single-rep data. Review `git diff`,
// then `node --check` both files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function load(rel) {
  const p = resolve(process.cwd(), rel);
  if (!existsSync(p)) { console.error(`Cannot find ${p}\nRun from repo root: cd /var/www/order-tracker && node api/scripts/apply-phase2a.mjs`); process.exit(1); }
  return { p, s: readFileSync(p, 'utf8') };
}
function replaceOnce(s, oldStr, newStr, label) {
  const n = s.split(oldStr).length - 1;
  if (n !== 1) { console.error(`ANCHOR FAIL [${label}]: matched ${n} (expected 1). No changes written.`); process.exit(1); }
  console.log(`ok  ${label}`);
  return s.replace(oldStr, newStr);
}
function replaceExactly(s, oldStr, newStr, count, label) {
  const n = s.split(oldStr).length - 1;
  if (n !== count) { console.error(`ANCHOR FAIL [${label}]: matched ${n} (expected ${count}). No changes written.`); process.exit(1); }
  console.log(`ok  ${label} (${count}x)`);
  return s.split(oldStr).join(newStr);
}

// ---- commissionPayouts.js ----
let cp = load('api/src/routes/commissionPayouts.js');
let s = cp.s;

// 1) All notify/grouping owner reads -> stamped payout owner (8 occurrences).
s = replaceExactly(
  s,
  '.itemCommission.commission.salesPersonName',
  '.salesPersonName',
  8,
  'payouts: notify/grouping owner reads');

// 2) Admin /paid filter -> stamped payout owner.
s = replaceOnce(
  s,
`      const payouts = await prisma.commissionPayout.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: startDateTime, lte: endDateTime },
          itemCommission: { commission: { salesPersonName: salesPerson } },
        },`,
`      const payouts = await prisma.commissionPayout.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: startDateTime, lte: endDateTime },
          salesPersonName: salesPerson,
        },`,
  'payouts: admin /paid filter');

writeFileSync(cp.p, s);

// ---- commissions.js ----
let cm = load('api/src/routes/commissions.js');
let c = cm.s;

// 3) /my/monthly payout query filter -> stamped payout owner.
c = replaceOnce(
  c,
`          where: {
            itemCommission: {
              commission: {
                salesPersonName: req.user.name
              }
            },
            paidAt: {`,
`          where: {
            salesPersonName: req.user.name,
            paidAt: {`,
  'commissions: /my/monthly filter');

// 4) /my/paid payout query filter -> stamped payout owner.
c = replaceOnce(
  c,
`          itemCommission: {
            commission: {
              salesPersonName: req.user.name,
            },
          },
        },
        include: {`,
`          salesPersonName: req.user.name,
        },
        include: {`,
  'commissions: /my/paid filter');

writeFileSync(cm.p, c);

console.log('\nApplied Phase 2 step 1 edits to commissionPayouts.js and commissions.js');
console.log('Review: git --no-pager diff api/src/routes/commissionPayouts.js api/src/routes/commissions.js');
console.log('Verify: node --check api/src/routes/commissionPayouts.js && node --check api/src/routes/commissions.js');
