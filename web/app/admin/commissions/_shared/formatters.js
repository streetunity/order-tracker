// Pure helpers shared across commission tabs.

export const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

export const formatDateString = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString();
};

export const toOrdinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const isPaymentDenied = (r) => r && r.startsWith("PAYMENT_DENIED:");

export const parseDenialReason = (r) =>
  isPaymentDenied(r) ? r.replace("PAYMENT_DENIED: ", "") : null;

export const getCommissionDisplayName = (c) =>
  c.order?.account?.name || (c.order?.poNumber ? `PO #${c.order.poNumber}` : "Order Deleted");
