// api/scripts/applySplitFeatureUI.mjs
// Self-verifying codemod for the "Split Commission" UI. Uses plain-text anchors
// (no base64) so it transmits cleanly. Wires up:
//   - api/src/routes/commissions.js   -> import + mount the split route module
//   - web/app/admin/orders/[id]/page.jsx                 -> Split modal wiring
//   - web/app/admin/orders/[id]/components/OrderInformation.jsx -> Split button
// The route logic lives in api/src/routes/commissionSplitRoute.js (separate file).
// The modal lives in .../components/SplitRepModal.jsx (separate file).
//
// Each OLD anchor must appear EXACTLY ONCE per file, or that file is skipped and
// nothing is written. Idempotent: re-running after success is a no-op.
//
//   node scripts/applySplitFeatureUI.mjs           # dry run (writes nothing)
//   APPLY=1 node scripts/applySplitFeatureUI.mjs    # apply
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const APPLY = process.env.APPLY === '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const EDITS = [
  {
    path: 'api/src/routes/commissions.js',
    hunks: [
      {
        old: `import { recalculateAllCommissions, calculateCommissionForOrder } from '../helpers/commission.js';`,
        new: `import { recalculateAllCommissions, calculateCommissionForOrder } from '../helpers/commission.js';\nimport { mountCommissionSplitRoute } from './commissionSplitRoute.js';`,
      },
      {
        old: `  return router;\n}\n\nexport default createCommissionsRouter;`,
        new: `  mountCommissionSplitRoute(router, { prisma, adminGuard, canManageCommissions });\n\n  return router;\n}\n\nexport default createCommissionsRouter;`,
      },
    ],
  },
  {
    path: 'web/app/admin/orders/[id]/components/OrderInformation.jsx',
    hunks: [
      {
        old: `  canSwitchRep = false,\n  onSwitchRepClick\n}) {`,
        new: `  canSwitchRep = false,\n  onSwitchRepClick,\n  onSplitRepClick\n}) {`,
      },
      {
        old: `                  🔁 Switch Rep\n                </button>\n              )}\n            </div>`,
        new: `                  🔁 Switch Rep\n                </button>\n              )}\n              {salesAgentLocked && canSwitchRep && onSplitRepClick && (\n                <button\n                  type="button"\n                  onClick={onSplitRepClick}\n                  className="btn"\n                  style={{\n                    padding: "8px 12px",\n                    backgroundColor: "#dc2626",\n                    color: "#fff",\n                    border: "none",\n                    borderRadius: "4px",\n                    fontSize: "13px",\n                    cursor: "pointer",\n                    whiteSpace: "nowrap"\n                  }}\n                >\n                  ➕ Split\n                </button>\n              )}\n            </div>`,
      },
    ],
  },
  {
    path: 'web/app/admin/orders/[id]/page.jsx',
    hunks: [
      {
        old: `import SwitchRepModal from "./components/SwitchRepModal";`,
        new: `import SwitchRepModal from "./components/SwitchRepModal";\nimport SplitRepModal from "./components/SplitRepModal";`,
      },
      {
        old: `  const [showSwitchRep, setShowSwitchRep] = useState(false);`,
        new: `  const [showSwitchRep, setShowSwitchRep] = useState(false);\n  const [showSplitRep, setShowSplitRep] = useState(false);`,
      },
      {
        old: `              canSwitchRep={canSwitchRep}\n              onSwitchRepClick={() => setShowSwitchRep(true)}\n            />`,
        new: `              canSwitchRep={canSwitchRep}\n              onSwitchRepClick={() => setShowSwitchRep(true)}\n              onSplitRepClick={() => setShowSplitRep(true)}\n            />`,
      },
      {
        old: `          getAuthHeaders={getAuthHeaders}\n          onDone={async () => { await load(); }}\n        />\n\n        {/* Delete Confirmation Dialog */}`,
        new: `          getAuthHeaders={getAuthHeaders}\n          onDone={async () => { await load(); }}\n        />\n\n        <SplitRepModal\n          show={showSplitRep && canSwitchRep && !!order}\n          onClose={() => setShowSplitRep(false)}\n          orderId={order?.id}\n          currentRep={salesAgent}\n          salesAgents={salesAgents}\n          getAuthHeaders={getAuthHeaders}\n          onDone={async () => { await load(); }}\n        />\n\n        {/* Delete Confirmation Dialog */}`,
      },
    ],
  },
];

let ok = true, changed = 0;
for (const e of EDITS) {
  const abs = path.join(repoRoot, e.path);
  if (!fs.existsSync(abs)) { console.log('✗ MISSING:', e.path); ok = false; continue; }
  let content = fs.readFileSync(abs, 'utf8');
  // Idempotency: if every hunk's NEW text is already present, skip.
  if (e.hunks.every(h => content.includes(h.new))) { console.log('✓ already applied:', e.path); continue; }
  let failed = false;
  let next = content;
  for (const h of e.hunks) {
    if (next.includes(h.new)) continue; // this hunk already applied
    const count = next.split(h.old).length - 1;
    if (count !== 1) { console.log(`✗ ANCHOR x${count} (expected 1) in ${e.path}: ${JSON.stringify(h.old.slice(0, 40))}`); failed = true; ok = false; break; }
    next = next.replace(h.old, h.new);
  }
  if (failed) continue;
  if (APPLY) { fs.writeFileSync(abs, next); console.log('✔ wrote', e.path); changed++; }
  else { console.log('would write', e.path); changed++; }
}

console.log(`\n${APPLY ? 'Applied' : 'Planned'} ${changed} file(s).` + (ok ? '' : '  ⚠ SOME FILES FAILED — see above.'));
if (!ok) process.exitCode = 1;
if (!APPLY && ok) console.log('DRY RUN OK — re-run with APPLY=1 to write.');
