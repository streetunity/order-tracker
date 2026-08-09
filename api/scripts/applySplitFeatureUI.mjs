// api/scripts/applySplitFeatureUI.mjs
// Self-verifying codemod for the "Split Commission" UI. Applies anchored hunks to:
//   - api/src/routes/commissions.js                       (POST /order/:id/split endpoint)
//   - web/app/admin/orders/[id]/components/OrderInformation.jsx  (Split button)
//   - web/app/admin/orders/[id]/page.jsx                  (modal wiring)
// Each hunk's OLD text must appear EXACTLY ONCE; after applying, the file's sha256
// must equal the expected value or nothing is written (fail-safe). Idempotent.
// New file SplitRepModal.jsx is delivered separately.
//
//   node scripts/applySplitFeatureUI.mjs           # dry run (writes nothing)
//   APPLY=1 node scripts/applySplitFeatureUI.mjs    # apply
import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const APPLY = process.env.APPLY === '1';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const b64 = (s) => Buffer.from(s, 'base64').toString('utf8');

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

// Payload = gzip -> base64 (wrapped; whitespace ignored) of the hunk table.
const PAYLOAD = `
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
7pQHvv9paulrGWx9xVKAHn5AocfK/6QUzq
`;
const entries = JSON.parse(zlib.gunzipSync(Buffer.from(PAYLOAD.replace(/\s/g, ''), 'base64')).toString('utf8'));
let ok = true, changed = 0;

for (const e of entries) {
  const abs = path.join(repoRoot, e.path);
  if (!fs.existsSync(abs)) { console.log('✗ MISSING:', e.path); ok = false; continue; }
  let content = fs.readFileSync(abs, 'utf8');
  if (sha256(content) === e.toSha256) { console.log('✓ already applied:', e.path); continue; }
  let failed = false;
  for (const h of e.hunks) {
    const oldStr = b64(h.old_b64), newStr = b64(h.new_b64);
    const count = content.split(oldStr).length - 1;
    if (count !== 1) { console.log(`✗ ANCHOR x${count} (expected 1) in ${e.path}`); failed = true; ok = false; break; }
    content = content.replace(oldStr, newStr);
  }
  if (failed) continue;
  const got = sha256(content);
  if (got !== e.toSha256) { console.log(`✗ RESULT sha mismatch ${e.path}: got ${got.slice(0,12)} want ${e.toSha256.slice(0,12)} — NOT written`); ok = false; continue; }
  if (APPLY) { fs.writeFileSync(abs, content); console.log('✔ wrote', e.path, '->', got.slice(0,12)); changed++; }
  else { console.log('would write', e.path, '->', got.slice(0,12)); changed++; }
}

console.log(`\n${APPLY ? 'Applied' : 'Planned'} ${changed} file(s).` + (ok ? '' : '  ⚠ SOME FILES FAILED — see above.'));
if (!ok) process.exitCode = 1;
if (!APPLY && ok) console.log('DRY RUN OK — re-run with APPLY=1 to write.');
