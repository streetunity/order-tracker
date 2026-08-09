// DEPRECATED — do not run.
// This combined codemod was superseded because its payload was corrupted in
// transit. The Switch Rep UI is now delivered as three verified pieces:
//   - web/app/admin/orders/[id]/components/SwitchRepModal.jsx   (committed directly)
//   - web/app/admin/orders/[id]/components/OrderInformation.jsx (committed directly)
//   - api/scripts/apply-page-switch-rep.mjs                     (patches page.jsx)
// To wire the order page, run from repo root:
//   node api/scripts/apply-page-switch-rep.mjs
console.error('Deprecated. Run api/scripts/apply-page-switch-rep.mjs instead.');
process.exit(1);
