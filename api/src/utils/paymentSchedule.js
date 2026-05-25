// Canonical list of payment schedule options.
//
// paymentScheduleType is the canonical field on Invoice and Customer for
// answering the question "how does this invoice get paid?". It replaces the
// older paymentTerms field, which is kept in the DB for back-compat and
// mirrored automatically by the route handlers.
//
// Two flavors:
//   NET-X / DUE_ON_RECEIPT  -- single full payment, dueDate = invoiceDate + N days
//   Milestone schedules     -- multiple InvoicePaymentSchedule rows created,
//                              invoice.dueDate set to deposit grace period (30d)

export const PAYMENT_SCHEDULE_OPTIONS = [
  { value: 'DUE_ON_RECEIPT',  label: 'Due on Receipt',                         netDays: 0  },
  { value: 'NET15',           label: 'Net 15',                                  netDays: 15 },
  { value: 'NET30',           label: 'Net 30',                                  netDays: 30 },
  { value: 'NET45',           label: 'Net 45',                                  netDays: 45 },
  { value: 'NET60',           label: 'Net 60',                                  netDays: 60 },
  { value: 'DEPOSIT_BALANCE', label: '50% Deposit / 50% Balance',               isMilestone: true, depositGraceDays: 30 },
  { value: '50_40_10',        label: '50/40/10 (Deposit / Progress / Final)',  isMilestone: true, depositGraceDays: 30 },
];

const BY_VALUE = Object.fromEntries(PAYMENT_SCHEDULE_OPTIONS.map(o => [o.value, o]));

export function isMilestoneSchedule(type) {
  return !!BY_VALUE[type]?.isMilestone;
}

export function formatScheduleLabel(type) {
  return BY_VALUE[type]?.label || 'Full Payment';
}

// Invoice dueDate from schedule type.
//   NET-X      -> invoiceDate + N days
//   Milestone  -> invoiceDate + depositGraceDays (30)
//   Unknown    -> invoiceDate + 30 days
export function calculateDueDate(scheduleType, invoiceDate) {
  const base = invoiceDate ? new Date(invoiceDate) : new Date();
  const opt = BY_VALUE[scheduleType];
  const days = opt?.netDays ?? opt?.depositGraceDays ?? 30;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

// Mirror value for the legacy paymentTerms column.
//   NET-X      -> same value
//   Milestone  -> 'NET30' (the deposit grace term)
export function scheduleTypeToLegacyTerms(scheduleType) {
  const opt = BY_VALUE[scheduleType];
  if (!opt) return 'NET30';
  return opt.isMilestone ? 'NET30' : scheduleType;
}
