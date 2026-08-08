// apply-phase1.mjs — Phase 1 codemod (run from the repo root).
// Stamps rep-ownership on write in api/src/helpers/commission.js via 5 anchored
// replacements. Each anchor must match exactly once or it aborts without writing.
// Behavior-neutral: only fills the new (inert) owner fields + ensures a primary
// CommissionRep. Review `git diff` afterward, then `node --check`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(process.cwd(), 'api/src/helpers/commission.js');
if (!existsSync(FILE)) {
  console.error(`Cannot find ${FILE}\nRun this from the repo root: cd /var/www/order-tracker && node api/scripts/apply-phase1.mjs`);
  process.exit(1);
}
let s = readFileSync(FILE, 'utf8');

function replaceOnce(oldStr, newStr, label) {
  const n = s.split(oldStr).length - 1;
  if (n !== 1) { console.error(`ANCHOR FAIL [${label}]: matched ${n} times (expected 1). No changes written.`); process.exit(1); }
  s = s.replace(oldStr, newStr);
  console.log(`ok  ${label}`);
}

replaceOnce(
`const ACTIVE_COMMISSION_STATUSES = ['CALCULATED', 'PARTIAL_PAID'];`,
`const ACTIVE_COMMISSION_STATUSES = ['CALCULATED', 'PARTIAL_PAID'];

/**
 * Ensure the commission has a PRIMARY CommissionRep (100% share) and return it.
 * Foundation for split/switch: every commission gets an explicit participant, and
 * every payout is stamped with an owner. Idempotent; never renames an existing rep.
 */
async function ensurePrimaryCommissionRep(commission) {
  let rep = await prisma.commissionRep.findFirst({
    where: { commissionId: commission.id, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (rep) return rep;
  let userId = null;
  if (commission.salesPersonName) {
    const u = await prisma.user.findFirst({
      where: { name: commission.salesPersonName },
      select: { id: true },
    });
    userId = u?.id ?? null;
  }
  return prisma.commissionRep.create({
    data: {
      commissionId: commission.id,
      salesPersonName: commission.salesPersonName ?? '',
      userId,
      sharePercentage: 100,
      role: 'PRIMARY',
      isActive: true,
    },
  });
}`,
'1: ensurePrimaryCommissionRep helper');

replaceOnce(
`  const stageSettings = await getPayoutStageSettings();
  console.log(\`[COMMISSION] Using \${stageSettings.length} payout stages:\`, stageSettings.map(s => \`\${s.stage} (\${s.percentage}%)\`).join(', '));`,
`  const stageSettings = await getPayoutStageSettings();
  console.log(\`[COMMISSION] Using \${stageSettings.length} payout stages:\`, stageSettings.map(s => \`\${s.stage} (\${s.percentage}%)\`).join(', '));
  const primaryRep = await ensurePrimaryCommissionRep(commission);`,
'2: createItemCommissions primaryRep');

replaceOnce(
`          status: payoutStatus, triggeredByItemId: item.id,
          triggeredAt: shouldTrigger ? new Date() : null,
        },`,
`          status: payoutStatus, triggeredByItemId: item.id,
          triggeredAt: shouldTrigger ? new Date() : null,
          salesPersonName: primaryRep.salesPersonName,
          userId: primaryRep.userId,
          commissionRepId: primaryRep.id,
        },`,
'3: createItemCommissions payout stamp');

replaceOnce(
`    const stageSettings = await getPayoutStageSettings();

    console.log(\`[COMMISSION] Adding \${newPricedItems.length} new item(s) to commission \${commission.id}\`);`,
`    const stageSettings = await getPayoutStageSettings();
    const primaryRep = await ensurePrimaryCommissionRep(commission);

    console.log(\`[COMMISSION] Adding \${newPricedItems.length} new item(s) to commission \${commission.id}\`);`,
'4: addNewItems primaryRep');

replaceOnce(
`            status: shouldTrigger ? 'PENDING' : 'WAITING',
            triggeredByItemId: item.id, triggeredAt: shouldTrigger ? new Date() : null,
          },`,
`            status: shouldTrigger ? 'PENDING' : 'WAITING',
            triggeredByItemId: item.id, triggeredAt: shouldTrigger ? new Date() : null,
            salesPersonName: primaryRep.salesPersonName,
            userId: primaryRep.userId,
            commissionRepId: primaryRep.id,
          },`,
'5: addNewItems payout stamp');

writeFileSync(FILE, s);
console.log('\nApplied 5 edits to api/src/helpers/commission.js');
console.log('Review: git --no-pager diff api/src/helpers/commission.js');
console.log('Verify: node --check api/src/helpers/commission.js');
