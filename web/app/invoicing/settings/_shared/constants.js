// Domain constants used across multiple settings tabs.

export const EMAIL_STAGES = [
  { key: "MANUFACTURING", label: "Manufacturing",        icon: "\uD83C\uDFED" },
  { key: "TESTING",       label: "Debugging & Testing",  icon: "\uD83D\uDD27" },
  { key: "SHIPPING",      label: "Preparing Shipment",   icon: "\uD83D\uDCE6" },
  { key: "AT_SEA",        label: "Container At Sea",     icon: "\uD83D\uDEA2" },
  { key: "SMT",           label: "Arrived at SMT",       icon: "\uD83C\uDFE2" },
  { key: "QC",            label: "Quality Control",      icon: "\u2705" },
  { key: "DELIVERED",     label: "Delivered",            icon: "\uD83C\uDF89" },
];

export const COMM_STAGES = [
  "MANUFACTURING","TESTING","SHIPPING","AT_SEA","SMT","QC","DELIVERED","ONSITE","COMPLETED","FOLLOW_UP",
];

export const EMAIL_CATEGORIES = {
  invoicing: { label: "Invoicing",      color: "#10b981" },
  orders:    { label: "Order Tracking", color: "#3b82f6" },
  internal:  { label: "Internal",       color: "#8b5cf6" },
};

export const ALL_STAGES = [
  { key: "MANUFACTURING", label: "MANUFACTURING", desc: "Manufacturing & Assembly phase" },
  { key: "TESTING",       label: "TESTING",       desc: "Testing, calibration & export preparation" },
  { key: "SHIPPING",      label: "SHIPPING",      desc: "Ocean freight transit" },
  { key: "AT_SEA",        label: "AT SEA",        desc: "Ocean freight transit (on vessel)" },
  { key: "SMT",           label: "SMT",           desc: "At SMT facility \u2013 customs clearance and domestic routing" },
  { key: "QC",            label: "QC",            desc: "Quality control inspection at SMT" },
  { key: "DELIVERED",     label: "DELIVERED",     desc: "Delivered to customer location" },
  { key: "ONSITE",        label: "ONSITE",        desc: "On-site installation and training" },
  { key: "COMPLETED",     label: "COMPLETED",     desc: "Awaiting final documentation" },
  { key: "FOLLOW_UP",     label: "FOLLOW UP",     desc: "Post-delivery follow-up" },
];

export const ETA_STAGES_KEYS = ["MANUFACTURING","TESTING","SHIPPING","AT_SEA","SMT","QC","DELIVERED"];

export const COMPANY_FIELDS   = ["companyName","logoUrl","address","city","state","zipCode","phone","email","website"];
export const INVOICING_FIELDS = ["invoicePrefix","estimatePrefix","paymentPrefix","customerPrefix","defaultTaxRate","defaultPaymentTerms","defaultValidityDays","discountApprovalThreshold","amountApprovalThreshold","defaultEstimateTerms","defaultInvoiceTerms"];
