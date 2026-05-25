"use client";

import { useCallback, useEffect, useState } from "react";
import { COMPANY_FIELDS, INVOICING_FIELDS } from "../constants";

// Shared hook owned by the page shell.
// Company + Invoicing tabs both edit the same /api/invoicing-settings record,
// so the form state must live above both tabs and survive tab switches.
export function useInvoicingSettings(getAuthHeaders) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    companyName: "", logoUrl: "", address: "", city: "", state: "", zipCode: "",
    phone: "", email: "", website: "",
    defaultTaxRate: 0, defaultPaymentTerms: "NET30", defaultValidityDays: 30,
    invoicePrefix: "INV", estimatePrefix: "EST", paymentPrefix: "PAY", customerPrefix: "CUST",
    discountApprovalThreshold: "", amountApprovalThreshold: "",
    defaultEstimateTerms: "", defaultInvoiceTerms: "",
  });
  const [origForm, setOrigForm] = useState({});

  const [compMsg, setCompMsg] = useState({ type: "", text: "" });
  const [compSaving, setCompSaving] = useState(false);
  const [invMsg, setInvMsg] = useState({ type: "", text: "" });
  const [invSaving, setInvSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoicing-settings", { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        const f = {
          companyName: d.companyName || "", logoUrl: d.logoUrl || "",
          address: d.address || "", city: d.city || "", state: d.state || "", zipCode: d.zipCode || "",
          phone: d.phone || "", email: d.email || "", website: d.website || "",
          defaultTaxRate: d.defaultTaxRate ?? 0, defaultPaymentTerms: d.defaultPaymentTerms || "NET30",
          defaultValidityDays: d.defaultValidityDays || 30,
          invoicePrefix: d.invoicePrefix || "INV", estimatePrefix: d.estimatePrefix || "EST",
          paymentPrefix: d.paymentPrefix || "PAY", customerPrefix: d.customerPrefix || "CUST",
          discountApprovalThreshold: d.discountApprovalThreshold ?? "",
          amountApprovalThreshold:   d.amountApprovalThreshold   ?? "",
          defaultEstimateTerms: d.defaultEstimateTerms || "",
          defaultInvoiceTerms:  d.defaultInvoiceTerms  || "",
        };
        setForm(f); setOrigForm(f);
      }
    } finally { setLoading(false); }
  }, [getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  const saveCompany = async () => {
    setCompSaving(true); setCompMsg({ type: "", text: "" });
    try {
      const res = await fetch("/api/invoicing-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ...form }),
      });
      if (res.ok) {
        setOrigForm({ ...origForm, ...Object.fromEntries(COMPANY_FIELDS.map(k => [k, form[k]])) });
        setCompMsg({ type: "success", text: "\u2713 Saved" });
        setTimeout(() => setCompMsg({ type: "", text: "" }), 3000);
      } else {
        const e = await res.json();
        setCompMsg({ type: "error", text: e.error || "Save failed" });
      }
    } finally { setCompSaving(false); }
  };

  const saveInvoicing = async () => {
    setInvSaving(true); setInvMsg({ type: "", text: "" });
    try {
      const res = await fetch("/api/invoicing-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setOrigForm(form);
        setInvMsg({ type: "success", text: "\u2713 Saved" });
        setTimeout(() => setInvMsg({ type: "", text: "" }), 3000);
      } else {
        const e = await res.json();
        setInvMsg({ type: "error", text: e.error || "Save failed" });
      }
    } finally { setInvSaving(false); }
  };

  const companyHasChanges   = COMPANY_FIELDS.some(k   => String(form[k]) !== String(origForm[k] ?? ""));
  const invoicingHasChanges = INVOICING_FIELDS.some(k => String(form[k]) !== String(origForm[k] ?? ""));

  return {
    loading, form, setForm,
    compMsg, compSaving, saveCompany, companyHasChanges,
    invMsg, invSaving, saveInvoicing, invoicingHasChanges,
  };
}
