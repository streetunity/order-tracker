// Canonical payment schedule options -- single source of truth for
// dropdown rendering and display labels across the invoicing UI.
// Mirrors api/src/utils/paymentSchedule.js -- keep them in sync.

export const PAYMENT_SCHEDULE_OPTIONS = [
  { value: 'DUE_ON_RECEIPT',  label: 'Due on Receipt' },
  { value: 'NET15',           label: 'Net 15' },
  { value: 'NET30',           label: 'Net 30' },
  { value: 'NET45',           label: 'Net 45' },
  { value: 'NET60',           label: 'Net 60' },
  { value: 'DEPOSIT_BALANCE', label: '50% Deposit / 50% Balance' },
  { value: '50_40_10',        label: '50/40/10 (Deposit / Progress / Final)' },
];

const BY_VALUE = Object.fromEntries(PAYMENT_SCHEDULE_OPTIONS.map(o => [o.value, o]));
const MILESTONE = new Set(['DEPOSIT_BALANCE', '50_40_10']);

export function isMilestoneSchedule(type) {
  return MILESTONE.has(type);
}

export function formatScheduleLabel(type) {
  return BY_VALUE[type]?.label || 'Full Payment';
}
