// api/scripts/applyRadioTheme.mjs
// Adds a RED-THEME radio-button style to web/app/globals.css that mirrors the
// existing custom checkbox (same 18px box, red on select) but round with a filled
// dot. Without this, native radios render gray and look unrelated to the checkboxes
// (e.g. in the Split Commission modal). Plain-text anchor, idempotent, fail-safe.
//
//   node scripts/applyRadioTheme.mjs           # dry run (writes nothing)
//   APPLY=1 node scripts/applyRadioTheme.mjs    # apply
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const APPLY = process.env.APPLY === '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const target = path.join(repoRoot, 'web/app/globals.css');

const ANCHOR = `input[type="checkbox"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}`;

const RADIO_CSS = `

/* Radio styling - RED THEME (mirrors the checkbox above, round with a filled dot) */
input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid #6b7280;
  border-radius: 50%;
  background-color: #1a1a1a !important;
  cursor: pointer;
  position: relative;
  padding: 0;
  margin: 0;
  transition: all 0.2s;
}

input[type="radio"]:hover {
  border-color: #9ca3af;
  background-color: #1e1e1e !important;
}

input[type="radio"]:checked {
  border-color: #ef4444;
}

input[type="radio"]:checked::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  transform: translate(-50%, -50%);
}

input[type="radio"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

input[type="radio"]:focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent) !important;
}`;

if (!fs.existsSync(target)) { console.log('✗ MISSING: web/app/globals.css'); process.exitCode = 1; }
else {
  const css = fs.readFileSync(target, 'utf8');
  if (css.includes('/* Radio styling - RED THEME')) {
    console.log('✓ already applied: web/app/globals.css');
  } else {
    const count = css.split(ANCHOR).length - 1;
    if (count !== 1) {
      console.log(`✗ ANCHOR x${count} (expected 1) in globals.css — NOT written`);
      process.exitCode = 1;
    } else {
      const next = css.replace(ANCHOR, ANCHOR + RADIO_CSS);
      if (APPLY) { fs.writeFileSync(target, next); console.log('✔ wrote web/app/globals.css (radio theme added)'); }
      else { console.log('would write web/app/globals.css (radio theme added)\n\nDRY RUN — re-run with APPLY=1 to write.'); }
    }
  }
}
