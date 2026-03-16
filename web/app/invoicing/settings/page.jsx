"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import InvoicingNav from "@/components/InvoicingNav";
import { useAuth } from "@/contexts/AuthContext";

// ---- Constants ----------------------------------------------------------------

const EMAIL_STAGES = [
  { key: "MANUFACTURING", label: "Manufacturing",        icon: "\uD83C\uDFED" },
  { key: "TESTING",       label: "Debugging & Testing",  icon: "\uD83D\uDD27" },
  { key: "SHIPPING",      label: "Preparing Shipment",   icon: "\uD83D\uDCE6" },
  { key: "AT_SEA",        label: "Container At Sea",     icon: "\uD83D\uDEA2" },
  { key: "SMT",           label: "Arrived at SMT",       icon: "\uD83C\uDFE2" },
  { key: "QC",            label: "Quality Control",      icon: "\u2705" },
  { key: "DELIVERED",     label: "Delivered",            icon: "\uD83C\uDF89" },
];

const COMM_STAGES = [
  "MANUFACTURING","TESTING","SHIPPING","AT_SEA","SMT","QC","DELIVERED","ONSITE","COMPLETED","FOLLOW_UP",
];

const EMAIL_CATEGORIES = {
  invoicing: { label: "Invoicing",      color: "#10b981" },
  orders:    { label: "Order Tracking", color: "#3b82f6" },
  internal:  { label: "Internal",       color: "#8b5cf6" },
};

// All 10 manufacturing stages with labels and descriptions
const ALL_STAGES = [
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

// Stages that contribute to ETA calculation (through DELIVERED only)
const ETA_STAGES_KEYS = ["MANUFACTURING","TESTING","SHIPPING","AT_SEA","SMT","QC","DELIVERED"];

// ---- Helpers ------------------------------------------------------------------

function SectionHeader({ label, desc }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: desc ? 6 : 0 }}>
        <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>{label}</h3>
      </div>
      {desc && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "0 0 0 13px", lineHeight: 1.6 }}>{desc}</p>}
    </div>
  );
}

function SaveBar({ hasChanges, saving, onSave, msg }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, paddingTop: 16, marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      {msg?.text && <span style={{ fontSize: 13, color: msg.type === "success" ? "#10b981" : "#dc2626" }}>{msg.text}</span>}
      <button
        onClick={onSave}
        disabled={!hasChanges || saving}
        style={{ padding: "9px 22px", background: hasChanges && !saving ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 7, color: hasChanges && !saving ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600, cursor: hasChanges && !saving ? "pointer" : "not-allowed" }}
      >
        {saving ? "Saving\u2026" : hasChanges ? "Save Changes" : "No Changes"}
      </button>
    </div>
  );
}

const INP  = { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.9)", fontSize: 13, boxSizing: "border-box", outline: "none" };
const LBL  = { display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 };
const CARD = { background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 24, marginBottom: 20 };
const HINT = { fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4 };

// ---- Main Component -----------------------------------------------------------

export default function UnifiedSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState("company");

  // ---- Invoicing Settings ----
  const [invLoading, setInvLoading]     = useState(true);
  const [form, setForm]                 = useState({
    companyName: "", logoUrl: "", address: "", city: "", state: "", zipCode: "",
    phone: "", email: "", website: "",
    defaultTaxRate: 0, defaultPaymentTerms: "NET30", defaultValidityDays: 30,
    invoicePrefix: "INV", estimatePrefix: "EST", paymentPrefix: "PAY", customerPrefix: "CUST",
    discountApprovalThreshold: "", amountApprovalThreshold: "",
    defaultEstimateTerms: "", defaultInvoiceTerms: "",
  });
  const [origForm, setOrigForm]         = useState({});
  const [compMsg,  setCompMsg]          = useState({ type: "", text: "" });
  const [compSaving, setCompSaving]     = useState(false);
  const [invMsg,   setInvMsg]           = useState({ type: "", text: "" });
  const [invSaving, setInvSaving]       = useState(false);

  // ---- Email Templates ----
  const [emailLoading,    setEmailLoading]    = useState(false);
  const [emailLoaded,     setEmailLoaded]     = useState(false);
  const [templates,       setTemplates]       = useState([]);
  const [stageConfigs,    setStageConfigs]    = useState([]);
  const [emailView,       setEmailView]       = useState("templates");
  const [selTpl,          setSelTpl]          = useState(null);
  const [editSubject,     setEditSubject]     = useState("");
  const [editBody,        setEditBody]        = useState("");
  const [editClosing,     setEditClosing]     = useState("");
  const [editFooter,      setEditFooter]      = useState("");
  const [tplChanges,      setTplChanges]      = useState(false);
  const [tplSaving,       setTplSaving]       = useState(false);
  const [tplMsg,          setTplMsg]          = useState({ type: "", text: "" });
  const [showPreview,     setShowPreview]     = useState(false);
  const [previewHtml,     setPreviewHtml]     = useState("");
  const [previewSubject,  setPreviewSubject]  = useState("");
  const [showTestSend,    setShowTestSend]    = useState(false);
  const [testEmail,       setTestEmail]       = useState("");
  const [sendingTest,     setSendingTest]     = useState(false);
  const bodyRef = useRef(null);

  // ---- Order Stages ----
  const [stagesLoading,    setStagesLoading]    = useState(false);
  const [stagesLoaded,     setStagesLoaded]     = useState(false);
  const [localThresh,      setLocalThresh]      = useState([]);
  const [threshChanges,    setThreshChanges]    = useState(false);
  const [threshSaving,     setThreshSaving]     = useState(false);
  const [threshMsg,        setThreshMsg]        = useState({ type: "", text: "" });
  const [holidayStart,     setHolidayStart]     = useState("10-01");
  const [holidayEnd,       setHolidayEnd]       = useState("12-31");
  const [bufferDays,       setBufferDays]       = useState("25");
  const [extendedDays,     setExtendedDays]     = useState("30");
  const [holidayChanges,   setHolidayChanges]   = useState(false);
  const [holidaySaving,    setHolidaySaving]    = useState(false);
  const [holidayMsg,       setHolidayMsg]       = useState({ type: "", text: "" });
  const [recalcETA,        setRecalcETA]        = useState(false);
  const [showETAConfirm,   setShowETAConfirm]   = useState(false);

  // ---- Commissions ----
  const [commLoading,     setCommLoading]     = useState(false);
  const [commLoaded,      setCommLoaded]      = useState(false);
  const [commTab,         setCommTab]         = useState("global");
  const [globalComm,      setGlobalComm]      = useState({ enabled: true, defaultRate: 5.0, calculationBasis: "ORDER_TOTAL", minimumOrderValue: 0 });
  const [stageDist,       setStageDist]       = useState([{ stage: "SHIPPING", percentage: 50 }, { stage: "DELIVERED", percentage: 50 }]);
  const [salesReps,       setSalesReps]       = useState([]);
  const [indRates,        setIndRates]        = useState({});
  const [globalChanges,   setGlobalChanges]   = useState(false);
  const [stageDistChange, setStageDistChange] = useState(false);
  const [commMsg,         setCommMsg]         = useState({ type: "", text: "" });
  const [commSaving,      setCommSaving]      = useState(false);
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [recalcReason,    setRecalcReason]    = useState("");
  const [recalculating,   setRecalculating]   = useState(false);

  // ---- Auth guard ----
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!["SUPER_ADMIN","ADMIN","ACCOUNTANT"].includes(user.role)) { router.push("/invoicing"); return; }
    loadInvSettings();
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === "email"       && !emailLoaded)  loadEmailTemplates();
    if (activeTab === "stages"      && !stagesLoaded) loadStageSettings();
    if (activeTab === "commissions" && !commLoaded)   loadCommissions();
  }, [activeTab, user]);

  // =============================================================================
  // DATA LOADERS
  // =============================================================================

  const loadInvSettings = useCallback(async () => {
    setInvLoading(true);
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
    } finally { setInvLoading(false); }
  }, [getAuthHeaders]);

  const loadEmailTemplates = async () => {
    setEmailLoading(true);
    try {
      const h = getAuthHeaders();
      const [tRes, sRes] = await Promise.all([
        fetch("/api/email-templates",              { headers: h, cache: "no-store" }),
        fetch("/api/email-templates/stages/config",{ headers: h, cache: "no-store" }),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setTemplates(d); if (d.length > 0) selectTemplate(d[0]); }
      if (sRes.ok) setStageConfigs(await sRes.json());
      setEmailLoaded(true);
    } finally { setEmailLoading(false); }
  };

  const loadStageSettings = async () => {
    setStagesLoading(true);
    try {
      const h = getAuthHeaders();
      const [tRes, sRes] = await Promise.all([
        fetch("/api/settings/thresholds", { headers: h }),
        fetch("/api/settings/system",     { headers: h }),
      ]);
      if (tRes.ok) setLocalThresh(JSON.parse(JSON.stringify(await tRes.json())));
      if (sRes.ok) {
        const d = await sRes.json();
        setHolidayStart(d.HOLIDAY_SEASON_START?.value   || "10-01");
        setHolidayEnd(d.HOLIDAY_SEASON_END?.value       || "12-31");
        setBufferDays(d.HOLIDAY_BUFFER_DAYS?.value      || "25");
        setExtendedDays(d.EXTENDED_SHIPPING_DAYS?.value || "30");
      }
      setStagesLoaded(true); setThreshChanges(false); setHolidayChanges(false);
    } finally { setStagesLoading(false); }
  };

  const loadCommissions = async () => {
    setCommLoading(true);
    try {
      const h = getAuthHeaders();
      const [gRes, stRes, rRes, repRes] = await Promise.all([
        fetch("/api/commission-settings/global",    { headers: h, cache: "no-store" }),
        fetch("/api/commission-settings/stages",    { headers: h, cache: "no-store" }),
        fetch("/api/commission-settings/rates",     { headers: h, cache: "no-store" }),
        fetch("/api/commission-settings/sales-reps",{ headers: h, cache: "no-store" }),
      ]);
      if (gRes.ok)   setGlobalComm(await gRes.json());
      if (stRes.ok)  setStageDist((await stRes.json()).map(s => ({ stage: s.stage, percentage: s.percentage })));
      if (rRes.ok)   { const d = await rRes.json(); const m = {}; d.forEach(r => { m[r.salesPersonName] = r.rate; }); setIndRates(m); }
      if (repRes.ok) setSalesReps(await repRes.json());
      setCommLoaded(true);
    } finally { setCommLoading(false); }
  };

  // =============================================================================
  // SAVE HANDLERS
  // =============================================================================

  const saveCompany = async () => {
    setCompSaving(true); setCompMsg({ type: "", text: "" });
    const companyFields = ["companyName","logoUrl","address","city","state","zipCode","phone","email","website"];
    const body = { ...form };
    try {
      const res = await fetch("/api/invoicing-settings", { method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(body) });
      if (res.ok) { setOrigForm({ ...origForm, ...Object.fromEntries(companyFields.map(k => [k, form[k]])) }); setCompMsg({ type: "success", text: "\u2713 Saved" }); setTimeout(() => setCompMsg({ type: "", text: "" }), 3000); }
      else { const e = await res.json(); setCompMsg({ type: "error", text: e.error || "Save failed" }); }
    } finally { setCompSaving(false); }
  };

  const saveInvoicing = async () => {
    setInvSaving(true); setInvMsg({ type: "", text: "" });
    try {
      const res = await fetch("/api/invoicing-settings", { method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(form) });
      if (res.ok) { setOrigForm(form); setInvMsg({ type: "success", text: "\u2713 Saved" }); setTimeout(() => setInvMsg({ type: "", text: "" }), 3000); }
      else { const e = await res.json(); setInvMsg({ type: "error", text: e.error || "Save failed" }); }
    } finally { setInvSaving(false); }
  };

  // Email helpers
  const selectTemplate = (tpl) => {
    setSelTpl(tpl); setEditSubject(tpl.subject); setEditBody(tpl.bodyContent);
    setEditClosing(tpl.closingContent || ""); setEditFooter(tpl.footerContent || "");
    setTplChanges(false);
  };
  const insertVariable = (v) => {
    const ta = bodyRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const ins = `{{${v}}}`;
    setEditBody(editBody.substring(0, s) + ins + editBody.substring(e)); setTplChanges(true);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + ins.length, s + ins.length); }, 0);
  };
  const saveTemplate = async () => {
    if (!selTpl) return;
    setTplSaving(true); setTplMsg({ type: "", text: "" });
    try {
      const res = await fetch(`/api/email-templates/${selTpl.key}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, bodyContent: editBody, closingContent: editClosing, footerContent: editFooter }),
      });
      if (res.ok) { setTplChanges(false); setTplMsg({ type: "success", text: "\u2713 Template saved" }); await loadEmailTemplates(); setTimeout(() => setTplMsg({ type: "", text: "" }), 3000); }
      else { const e = await res.json(); setTplMsg({ type: "error", text: e.error || "Save failed" }); }
    } finally { setTplSaving(false); }
  };
  const resetTemplate = async () => {
    if (!selTpl || !confirm(`Reset "${selTpl.name}" to system default?`)) return;
    setTplSaving(true);
    try {
      const res = await fetch(`/api/email-templates/${selTpl.key}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setTplChanges(false); await loadEmailTemplates(); if (d.template) selectTemplate(d.template); }
    } finally { setTplSaving(false); }
  };
  const generatePreview = async () => {
    if (!selTpl) return;
    const res = await fetch(`/api/email-templates/preview/${selTpl.key}`, {
      method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ subject: editSubject, bodyContent: editBody, closingContent: editClosing, footerContent: editFooter }),
    });
    if (res.ok) {
      const d = await res.json();
      setPreviewSubject(d.subject);
      setPreviewHtml(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;color:#333"><div style="background:#dc2626;color:#fff;padding:20px;text-align:center"><h1 style="margin:0;font-size:24px">Stealth Machine Tools</h1></div><div style="padding:30px">${d.bodyContent}${d.closingContent ? `<div style="margin-top:30px;padding-top:20px;border-top:1px solid #ddd">${d.closingContent}</div>` : ""}</div><div style="text-align:center;padding:20px;color:#666;font-size:12px;background:#f5f5f5">${d.footerContent}</div></div>`);
      setShowPreview(true);
    }
  };
  const sendTestEmail = async () => {
    if (!testEmail || !selTpl) return;
    setSendingTest(true);
    const res = await fetch("/api/email-templates/test-send", {
      method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ templateKey: selTpl.key, toEmail: testEmail }),
    });
    const d = await res.json();
    if (d.success) { setTplMsg({ type: "success", text: `Test sent to ${testEmail}` }); setShowTestSend(false); setTestEmail(""); }
    else setTplMsg({ type: "error", text: d.message || "Send failed" });
    setSendingTest(false);
  };
  const saveStageEmails = async () => {
    setTplSaving(true);
    const res = await fetch("/api/email-templates/stages/config", {
      method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ stages: stageConfigs }),
    });
    if (res.ok) setTplMsg({ type: "success", text: "\u2713 Stage notifications saved" });
    else setTplMsg({ type: "error", text: "Save failed" });
    setTplSaving(false); setTimeout(() => setTplMsg({ type: "", text: "" }), 3000);
  };

  // Stage thresholds
  const saveThresholds = async () => {
    setThreshSaving(true); setThreshMsg({ type: "", text: "" });
    try {
      await Promise.all(localThresh.map(t =>
        fetch(`/api/settings/thresholds/${t.stage}`, {
          method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ warningDays: t.warningDays, criticalDays: t.criticalDays }),
        })
      ));
      setThreshChanges(false); setThreshMsg({ type: "success", text: "\u2713 Thresholds saved" }); setTimeout(() => setThreshMsg({ type: "", text: "" }), 3000);
    } catch { setThreshMsg({ type: "error", text: "Save failed" }); }
    finally { setThreshSaving(false); }
  };
  const saveHoliday = async () => {
    setHolidaySaving(true); setHolidayMsg({ type: "", text: "" });
    const dateRx = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
    if (!dateRx.test(holidayStart) || !dateRx.test(holidayEnd)) { setHolidayMsg({ type: "error", text: "Dates must be in MM-DD format (e.g. 10-01)" }); setHolidaySaving(false); return; }
    try {
      await Promise.all([
        fetch("/api/settings/system/HOLIDAY_SEASON_START",  { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: holidayStart }) }),
        fetch("/api/settings/system/HOLIDAY_SEASON_END",    { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: holidayEnd }) }),
        fetch("/api/settings/system/HOLIDAY_BUFFER_DAYS",   { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: bufferDays }) }),
        fetch("/api/settings/system/EXTENDED_SHIPPING_DAYS",{ method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: extendedDays }) }),
      ]);
      setHolidayChanges(false); setHolidayMsg({ type: "success", text: "\u2713 Saved" }); setTimeout(() => setHolidayMsg({ type: "", text: "" }), 3000);
    } catch { setHolidayMsg({ type: "error", text: "Save failed" }); }
    finally { setHolidaySaving(false); }
  };
  const recalcETAs = async () => {
    setShowETAConfirm(false); setRecalcETA(true);
    const res = await fetch("/api/settings/recalculate-etas", { method: "POST", headers: getAuthHeaders() });
    const d = await res.json();
    setThreshMsg({ type: res.ok ? "success" : "error", text: d.message || (res.ok ? "ETAs recalculated" : "Failed") });
    setRecalcETA(false); setTimeout(() => setThreshMsg({ type: "", text: "" }), 5000);
  };

  // Commissions
  const saveGlobalComm = async () => {
    setCommSaving(true); setCommMsg({ type: "", text: "" });
    const res = await fetch("/api/commission-settings/global", { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(globalComm) });
    if (res.ok) { setGlobalChanges(false); setCommMsg({ type: "success", text: "\u2713 Global settings saved" }); }
    else setCommMsg({ type: "error", text: "Save failed" });
    setCommSaving(false); setTimeout(() => setCommMsg({ type: "", text: "" }), 3000);
  };
  const saveStageDistribution = async () => {
    const total = stageDist.reduce((s, x) => s + Number(x.percentage), 0);
    if (Math.abs(total - 100) > 0.01) { setCommMsg({ type: "error", text: `Percentages must total 100% (currently ${total}%)` }); return; }
    setCommSaving(true); setCommMsg({ type: "", text: "" });
    const res = await fetch("/api/commission-settings/stages", { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(stageDist.map((s, i) => ({ ...s, percentage: Number(s.percentage), sortOrder: i + 1 }))) });
    if (res.ok) { setStageDistChange(false); setCommMsg({ type: "success", text: "\u2713 Stage distribution saved" }); await loadCommissions(); }
    else setCommMsg({ type: "error", text: "Save failed" });
    setCommSaving(false); setTimeout(() => setCommMsg({ type: "", text: "" }), 3000);
  };
  const saveIndRate = async (name, rate) => {
    const res = await fetch(`/api/commission-settings/rates/${encodeURIComponent(name)}`, { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ rate: Number(rate) }) });
    if (res.ok) { setIndRates(p => ({ ...p, [name]: Number(rate) })); setCommMsg({ type: "success", text: `\u2713 Rate saved for ${name}` }); }
    else setCommMsg({ type: "error", text: "Save failed" });
    setTimeout(() => setCommMsg({ type: "", text: "" }), 3000);
  };
  const executeRecalc = async () => {
    if (recalcReason.trim().length < 10) return;
    setRecalculating(true);
    const res = await fetch("/api/commission-settings/recalculate-all", { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ reason: recalcReason.trim() }) });
    const d = await res.json();
    if (res.ok) { setCommMsg({ type: "success", text: `Recalculated: ${d.results?.recalculated ?? 0}, Skipped: ${d.results?.skipped ?? 0}, Failed: ${d.results?.failed ?? 0}` }); setShowRecalcModal(false); setRecalcReason(""); }
    else setCommMsg({ type: "error", text: d.error || "Recalculation failed" });
    setRecalculating(false); setTimeout(() => setCommMsg({ type: "", text: "" }), 8000);
  };

  // =============================================================================
  // DERIVED
  // =============================================================================

  if (authLoading || !user) return null;

  const companyFields   = ["companyName","logoUrl","address","city","state","zipCode","phone","email","website"];
  const invoicingFields = ["invoicePrefix","estimatePrefix","paymentPrefix","customerPrefix","defaultTaxRate","defaultPaymentTerms","defaultValidityDays","discountApprovalThreshold","amountApprovalThreshold","defaultEstimateTerms","defaultInvoiceTerms"];
  const companyHasChanges   = companyFields.some(k   => String(form[k])   !== String(origForm[k]   ?? ""));
  const invoicingHasChanges = invoicingFields.some(k  => String(form[k])   !== String(origForm[k]   ?? ""));

  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isAdmin      = ["SUPER_ADMIN","ADMIN"].includes(user.role);

  // ETA totals — computed live from current threshold inputs
  const etaTotals = (() => {
    let warnTotal = 0, critTotal = 0;
    ETA_STAGES_KEYS.forEach(s => {
      const t = localThresh.find(x => x.stage === s);
      if (t) { warnTotal += t.warningDays || 0; critTotal += t.criticalDays || 0; }
    });
    const avg    = (warnTotal + critTotal) / 2;
    const extDays = parseInt(extendedDays || "0", 10);
    return { warnTotal, critTotal, avg, extDays, extAvg: avg + extDays };
  })();

  const TABS = [
    { id: "company",        label: "Company",         icon: "\uD83C\uDFE2" },
    { id: "invoicing",      label: "Invoicing",        icon: "\uD83D\uDCC4" },
    ...(isAdmin      ? [{ id: "email",        label: "Email Templates", icon: "\u2709\uFE0F" }] : []),
    ...(isAdmin      ? [{ id: "stages",       label: "Order Stages",    icon: "\u2699\uFE0F" }] : []),
    ...(isSuperAdmin ? [{ id: "commissions",  label: "Commissions",     icon: "\uD83D\uDCB0" }] : []),
  ];

  const groupedTemplates = {};
  templates.forEach(t => { const c = t.category || "other"; if (!groupedTemplates[c]) groupedTemplates[c] = []; groupedTemplates[c].push(t); });

  const stageTotal = stageDist.reduce((s, x) => s + Number(x.percentage), 0);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f", paddingTop: 60 }}>

        {/* ---- Left sidebar ---- */}
        <div style={{ width: 220, flexShrink: 0, background: "#141414", borderRight: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 60, height: "calc(100vh - 60px)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px 16px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Settings</div>
          </div>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(220,38,38,0.08)" : "transparent", border: "none", borderLeft: active ? "3px solid #dc2626" : "3px solid transparent", color: active ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, textAlign: "left", width: "100%", transition: "all 0.12s" }}>
                <span style={{ fontSize: 15 }}>{tab.icon}</span>{tab.label}
              </button>
            );
          })}
        </div>

        {/* ---- Right content ---- */}
        <div style={{ flex: 1, minWidth: 0, padding: "32px 36px 80px", overflowX: "hidden" }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{TABS.find(t => t.id === activeTab)?.label}</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>System-wide configuration for Stealth Machine Tools</p>
          </div>

          {invLoading && (activeTab === "company" || activeTab === "invoicing") ? (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, paddingTop: 40 }}>Loading\u2026</div>
          ) : (
            <>
              {/* ================================================================ */}
              {/* COMPANY                                                          */}
              {/* ================================================================ */}
              {activeTab === "company" && (
                <>
                  <div style={CARD}>
                    <SectionHeader label="Company Information" desc="Used in invoices, estimates, email templates, and customer-facing documents" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Company Name</label><input style={INP} value={form.companyName} onChange={e => setForm(p => ({...p,companyName:e.target.value}))} placeholder="Stealth Machine Tools" /></div>
                      <div><label style={LBL}>Phone</label><input style={INP} value={form.phone} onChange={e => setForm(p => ({...p,phone:e.target.value}))} placeholder="877-45LASER" /></div>
                      <div><label style={LBL}>Email</label><input style={INP} value={form.email} onChange={e => setForm(p => ({...p,email:e.target.value}))} placeholder="Sales@StealthLaser.com" /></div>
                      <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Website</label><input style={INP} value={form.website} onChange={e => setForm(p => ({...p,website:e.target.value}))} placeholder="www.StealthLaser.com" /></div>
                      <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Street Address</label><input style={INP} value={form.address} onChange={e => setForm(p => ({...p,address:e.target.value}))} /></div>
                      <div><label style={LBL}>City</label><input style={INP} value={form.city} onChange={e => setForm(p => ({...p,city:e.target.value}))} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label style={LBL}>State</label><input style={INP} value={form.state} onChange={e => setForm(p => ({...p,state:e.target.value}))} placeholder="AZ" /></div>
                        <div><label style={LBL}>ZIP</label><input style={INP} value={form.zipCode} onChange={e => setForm(p => ({...p,zipCode:e.target.value}))} placeholder="85120" /></div>
                      </div>
                    </div>
                    <SaveBar hasChanges={companyHasChanges} saving={compSaving} onSave={saveCompany} msg={compMsg} />
                  </div>
                  <div style={CARD}>
                    <SectionHeader label="Email Branding" desc="Logo shown in email header. Must be a publicly accessible URL. Leave blank to show company name text instead." />
                    <div><label style={LBL}>Logo URL</label><input style={INP} value={form.logoUrl} onChange={e => setForm(p => ({...p,logoUrl:e.target.value}))} placeholder="https://smt-orders.com/smt-logo.png" /></div>
                    <p style={HINT}>Recommended: PNG or SVG, transparent background, max 260\u00d760px.</p>
                    {form.logoUrl && <div style={{ marginTop: 14, padding: "14px 20px", background: "#000", borderRadius: 8, display: "inline-block" }}><img src={form.logoUrl} alt="Logo preview" style={{ maxHeight: 52, maxWidth: 240, display: "block" }} onError={e => e.target.style.display="none"} /></div>}
                    <SaveBar hasChanges={companyHasChanges} saving={compSaving} onSave={saveCompany} msg={compMsg} />
                  </div>
                </>
              )}

              {/* ================================================================ */}
              {/* INVOICING                                                        */}
              {/* ================================================================ */}
              {activeTab === "invoicing" && (
                <>
                  <div style={CARD}>
                    <SectionHeader label="Number Sequences" desc="Prefix for auto-generated document numbers" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                      {[["invoicePrefix","Invoice Prefix","INV"],["estimatePrefix","Estimate Prefix","EST"],["paymentPrefix","Payment Prefix","PAY"],["customerPrefix","Customer Prefix","CUST"]].map(([k,l,ph]) => (
                        <div key={k}><label style={LBL}>{l}</label><input style={INP} value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} placeholder={ph} /><p style={HINT}>e.g. {form[k]||ph}-2026-00001</p></div>
                      ))}
                    </div>
                  </div>
                  <div style={CARD}>
                    <SectionHeader label="Defaults" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                      <div><label style={LBL}>Local Tax Rate (%)</label><input style={INP} type="number" step="0.01" min="0" value={form.defaultTaxRate} onChange={e => setForm(p => ({...p,defaultTaxRate:e.target.value}))} /><p style={HINT}>Applied when Pinal County Sales Tax is selected</p></div>
                      <div><label style={LBL}>Default Payment Terms</label>
                        <select style={{ ...INP, cursor: "pointer" }} value={form.defaultPaymentTerms} onChange={e => setForm(p => ({...p,defaultPaymentTerms:e.target.value}))}>
                          {["DUE_ON_RECEIPT","NET15","NET30","NET45","NET60","NET90"].map(v => <option key={v} value={v}>{v.replace("_"," ").replace("DUE ON RECEIPT","Due on Receipt").replace("NET","Net ")}</option>)}
                        </select>
                      </div>
                      <div><label style={LBL}>Estimate Validity (days)</label><input style={INP} type="number" min="1" value={form.defaultValidityDays} onChange={e => setForm(p => ({...p,defaultValidityDays:e.target.value}))} /></div>
                    </div>
                  </div>
                  <div style={CARD}>
                    <SectionHeader label="Approval Thresholds" desc="Require admin approval when these limits are exceeded. Leave blank to disable." />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div><label style={LBL}>Discount Threshold (%)</label><input style={INP} type="number" step="0.1" min="0" value={form.discountApprovalThreshold} onChange={e => setForm(p => ({...p,discountApprovalThreshold:e.target.value}))} placeholder="e.g. 10" /></div>
                      <div><label style={LBL}>Amount Threshold ($)</label><input style={INP} type="number" step="1" min="0" value={form.amountApprovalThreshold} onChange={e => setForm(p => ({...p,amountApprovalThreshold:e.target.value}))} placeholder="e.g. 50000" /></div>
                    </div>
                  </div>
                  <div style={CARD}>
                    <SectionHeader label="Default Terms & Conditions" />
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div><label style={LBL}>Default Estimate Terms</label><textarea style={{ ...INP, minHeight: 90, resize: "vertical", lineHeight: 1.6 }} value={form.defaultEstimateTerms} onChange={e => setForm(p => ({...p,defaultEstimateTerms:e.target.value}))} rows={4} /></div>
                      <div><label style={LBL}>Default Invoice Terms</label><textarea style={{ ...INP, minHeight: 90, resize: "vertical", lineHeight: 1.6 }} value={form.defaultInvoiceTerms} onChange={e => setForm(p => ({...p,defaultInvoiceTerms:e.target.value}))} rows={4} /></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, alignItems: "center" }}>
                    {invMsg.text && <span style={{ fontSize: 13, color: invMsg.type === "success" ? "#10b981" : "#dc2626" }}>{invMsg.text}</span>}
                    <button onClick={saveInvoicing} disabled={invSaving || !invoicingHasChanges} style={{ padding: "9px 22px", background: invoicingHasChanges && !invSaving ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 7, color: invoicingHasChanges && !invSaving ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600, cursor: invoicingHasChanges && !invSaving ? "pointer" : "not-allowed" }}>{invSaving ? "Saving\u2026" : invoicingHasChanges ? "Save Changes" : "No Changes"}</button>
                  </div>
                </>
              )}

              {/* ================================================================ */}
              {/* EMAIL TEMPLATES                                                  */}
              {/* ================================================================ */}
              {activeTab === "email" && (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {[["templates","Email Templates"],["stages","Stage Notifications"]].map(([id,label]) => (
                      <button key={id} onClick={() => setEmailView(id)} style={{ padding: "9px 18px", background: "none", border: "none", borderBottom: emailView === id ? "2px solid #dc2626" : "2px solid transparent", color: emailView === id ? "#dc2626" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontWeight: emailView === id ? 600 : 400, marginBottom: -1 }}>{label}</button>
                    ))}
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
                      {tplMsg.text && <span style={{ fontSize: 12, color: tplMsg.type === "success" ? "#10b981" : "#dc2626" }}>{tplMsg.text}</span>}
                    </div>
                  </div>
                  {emailLoading ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "40px 0" }}>Loading templates\u2026</div>
                  : emailView === "templates" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, minHeight: 500 }}>
                      <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.7px" }}>Templates</div>
                        <div style={{ padding: 6 }}>
                          {Object.entries(groupedTemplates).map(([cat, tpls]) => (
                            <div key={cat} style={{ marginBottom: 10 }}>
                              <div style={{ padding: "6px 10px", fontSize: 10, color: EMAIL_CATEGORIES[cat]?.color || "#999", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>{EMAIL_CATEGORIES[cat]?.label || cat}</div>
                              {tpls.map(t => (
                                <button key={t.key} onClick={() => selectTemplate(t)} style={{ width: "100%", textAlign: "left", padding: "9px 12px", background: selTpl?.key === t.key ? "rgba(255,255,255,0.06)" : "transparent", border: selTpl?.key === t.key ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.8)", marginBottom: 2, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  {t.name}{t.isCustomized && <span style={{ fontSize: 9, background: "#dc2626", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>EDITED</span>}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                        {selTpl ? (
                          <>
                            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div><div style={{ fontSize: 16, fontWeight: 600 }}>{selTpl.name}</div>{selTpl.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{selTpl.description}</div>}</div>
                              <div style={{ display: "flex", gap: 7 }}>
                                <button onClick={generatePreview} style={{ padding: "6px 13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Preview</button>
                                <button onClick={() => setShowTestSend(true)} style={{ padding: "6px 13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Test Send</button>
                                {selTpl.isCustomized && <button onClick={resetTemplate} disabled={tplSaving} style={{ padding: "6px 13px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, cursor: "pointer", color: "#f59e0b", fontSize: 12 }}>Reset Default</button>}
                                <button onClick={saveTemplate} disabled={tplSaving || !tplChanges} style={{ padding: "6px 16px", background: tplChanges ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, cursor: tplChanges ? "pointer" : "not-allowed", color: tplChanges ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 600 }}>{tplSaving ? "Saving\u2026" : "Save"}</button>
                              </div>
                            </div>
                            <div style={{ padding: 20 }}>
                              <div style={{ marginBottom: 14 }}><label style={LBL}>Email Subject</label><input style={INP} value={editSubject} onChange={e => { setEditSubject(e.target.value); setTplChanges(true); }} /></div>
                              {selTpl.variables?.length > 0 && (
                                <div style={{ marginBottom: 14, padding: 14, background: "#252525", borderRadius: 7, border: "1px solid rgba(255,255,255,0.07)" }}>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Available Variables <span style={{ fontWeight: 400 }}>(click to insert)</span></div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                    {selTpl.variables.map(v => <button key={v.name} onClick={() => insertVariable(v.name)} title={v.description} style={{ padding: "3px 9px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#60a5fa", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>&#123;&#123;{v.name}&#125;&#125;</button>)}
                                  </div>
                                </div>
                              )}
                              <div style={{ marginBottom: 14 }}><label style={LBL}>Email Body (HTML)</label><textarea ref={bodyRef} value={editBody} onChange={e => { setEditBody(e.target.value); setTplChanges(true); }} style={{ ...INP, minHeight: 260, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }} /></div>
                              <div style={{ marginBottom: 14 }}><label style={LBL}>Closing / Sign-off (HTML) &#8212; optional</label><textarea value={editClosing} onChange={e => { setEditClosing(e.target.value); setTplChanges(true); }} style={{ ...INP, minHeight: 80, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }} /></div>
                              <div><label style={LBL}>Footer (HTML) &#8212; optional</label><textarea value={editFooter} onChange={e => { setEditFooter(e.target.value); setTplChanges(true); }} style={{ ...INP, minHeight: 60, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }} /></div>
                            </div>
                          </>
                        ) : <div style={{ padding: "60px 24px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Select a template to edit</div>}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ ...CARD, marginBottom: 16 }}>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.7 }}>Configure the subject line and message body for each order stage notification. These are sent to customers when their items progress through manufacturing stages. Use <code style={{ background: "rgba(255,255,255,0.07)", padding: "0 4px", borderRadius: 3, color: "#60a5fa" }}>&#123;&#123;productCode&#125;&#125;</code> to insert the item&#39;s product code.</p>
                      </div>
                      {stageConfigs.map(stage => {
                        const info = EMAIL_STAGES.find(s => s.key === stage.stage) || { label: stage.stage, icon: "\uD83D\uDCCC" };
                        return (
                          <div key={stage.stage} style={{ ...CARD, marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stage.notify ? 16 : 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>{info.icon}</span>
                                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{info.label}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginTop: 2 }}>{stage.stage}</div></div>
                                {stage.isCustomized && <span style={{ fontSize: 9, background: "#dc2626", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>EDITED</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: stage.notify ? "#10b981" : "rgba(255,255,255,0.3)" }}>{stage.notify ? "Enabled" : "Disabled"}</span>
                                <div onClick={() => setStageConfigs(p => p.map(s => s.stage === stage.stage ? { ...s, notify: !s.notify } : s))} style={{ width: 40, height: 22, borderRadius: 11, background: stage.notify ? "#10b981" : "rgba(255,255,255,0.1)", position: "relative", cursor: "pointer", transition: "all 0.2s" }}>
                                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: stage.notify ? 20 : 2, transition: "all 0.2s" }} />
                                </div>
                              </div>
                            </div>
                            {stage.notify && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div><label style={LBL}>Subject Line</label><input style={INP} value={stage.subject} onChange={e => setStageConfigs(p => p.map(s => s.stage === stage.stage ? { ...s, subject: e.target.value } : s))} /></div><div><label style={LBL}>Message Body</label><textarea value={stage.message} onChange={e => setStageConfigs(p => p.map(s => s.stage === stage.stage ? { ...s, message: e.target.value } : s))} style={{ ...INP, minHeight: 60, resize: "vertical", lineHeight: 1.5 }} /></div></div>}
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, alignItems: "center" }}>
                        {tplMsg.text && <span style={{ fontSize: 13, color: tplMsg.type === "success" ? "#10b981" : "#dc2626" }}>{tplMsg.text}</span>}
                        <button onClick={saveStageEmails} disabled={tplSaving} style={{ padding: "9px 22px", background: "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{tplSaving ? "Saving\u2026" : "Save Stage Settings"}</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ================================================================ */}
              {/* ORDER STAGES                                                     */}
              {/* ================================================================ */}
              {activeTab === "stages" && (
                <>
                  {stagesLoading ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "40px 0" }}>Loading\u2026</div> : (
                    <>
                      {/* Special Shipping & Holiday */}
                      <div style={CARD}>
                        <SectionHeader label="Special Shipping & Holiday Configuration" desc="Configure holiday season dates and special shipping requirements for extended lead time items." />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div>
                            <label style={LBL}>Holiday Season Start (MM-DD)</label>
                            <input style={INP} value={holidayStart} onChange={e => { setHolidayStart(e.target.value); setHolidayChanges(true); }} placeholder="10-01" />
                            <p style={HINT}>Format: MM-DD (e.g., 10-01 for October 1st)</p>
                          </div>
                          <div>
                            <label style={LBL}>Holiday Season End (MM-DD)</label>
                            <input style={INP} value={holidayEnd} onChange={e => { setHolidayEnd(e.target.value); setHolidayChanges(true); }} placeholder="12-31" />
                            <p style={HINT}>Format: MM-DD (e.g., 12-31 for December 31st)</p>
                          </div>
                          <div>
                            <label style={LBL}>Holiday Buffer Days (Manufacturing Only)</label>
                            <input style={INP} type="number" min="0" max="100" value={bufferDays} onChange={e => { setBufferDays(e.target.value); setHolidayChanges(true); }} />
                            <p style={HINT}>Extra days for MANUFACTURING stage only during holidays (0&#8211;100)</p>
                          </div>
                          <div>
                            <label style={{ ...LBL, color: "#10b981" }}>Extended Shipping Days &#11088;</label>
                            <input style={{ ...INP, borderColor: "rgba(16,185,129,0.3)" }} type="number" min="0" max="100" value={extendedDays} onChange={e => { setExtendedDays(e.target.value); setHolidayChanges(true); }} />
                            <p style={{ ...HINT, color: "rgba(16,185,129,0.6)" }}>Additional days for items marked as &#8220;Extended Shipping&#8221; (special machines)</p>
                          </div>
                        </div>
                        <SaveBar hasChanges={holidayChanges} saving={holidaySaving} onSave={saveHoliday} msg={holidayMsg} />
                      </div>

                      {/* Stage Time Thresholds */}
                      <div style={CARD}>
                        <SectionHeader label="Stage Time Thresholds" desc="Set warning and critical thresholds for each manufacturing stage. Orders exceeding these times will be flagged in OVaR and Chokepoints reports." />
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                                {["Stage","Warning Days","Critical Days","Description"].map(h => (
                                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {ALL_STAGES.map(stage => {
                                const isETA = ETA_STAGES_KEYS.includes(stage.key);
                                const t = localThresh.find(x => x.stage === stage.key) || { stage: stage.key, warningDays: 0, criticalDays: 0, description: stage.desc };
                                return (
                                  <tr key={stage.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isETA ? "transparent" : "rgba(255,255,255,0.02)", opacity: isETA ? 1 : 0.65 }}>
                                    <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                                      <span style={{ color: isETA ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}>{stage.label}</span>
                                      {isETA && <span style={{ marginLeft: 7, fontSize: 10, color: "#dc2626", fontWeight: 700, background: "rgba(220,38,38,0.1)", padding: "1px 5px", borderRadius: 3 }}>(ETA)</span>}
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <input type="number" min="1" max="365" value={t.warningDays || ""} onChange={e => { setLocalThresh(p => p.map(x => x.stage === stage.key ? { ...x, warningDays: parseInt(e.target.value) || 0 } : x)); setThreshChanges(true); }} style={{ ...INP, width: 90 }} />
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <input type="number" min="1" max="365" value={t.criticalDays || ""} onChange={e => { setLocalThresh(p => p.map(x => x.stage === stage.key ? { ...x, criticalDays: parseInt(e.target.value) || 0 } : x)); setThreshChanges(true); }} style={{ ...INP, width: 90 }} />
                                    </td>
                                    <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.description || stage.desc}</td>
                                  </tr>
                                );
                              })}

                              {/* Standard ETA Totals row */}
                              <tr style={{ borderTop: "2px solid #dc2626", background: "rgba(220,38,38,0.07)", fontWeight: 700 }}>
                                <td style={{ padding: "11px 12px" }}>
                                  <span style={{ fontSize: 12, color: "#dc2626" }}>STANDARD ETA TOTALS</span>
                                  <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Includes stages through DELIVERED only</div>
                                </td>
                                <td style={{ padding: "11px 12px", color: "#dc2626", fontSize: 14 }}>{etaTotals.warnTotal} days</td>
                                <td style={{ padding: "11px 12px", color: "#dc2626", fontSize: 14 }}>{etaTotals.critTotal} days</td>
                                <td style={{ padding: "11px 12px" }}>
                                  <span style={{ color: "#dc2626", fontSize: 14, fontWeight: 700 }}>Average: {etaTotals.avg.toFixed(1)} days</span>
                                  <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Base ETA calculation for standard items</div>
                                </td>
                              </tr>

                              {/* Extended Shipping Totals row */}
                              <tr style={{ background: "rgba(16,185,129,0.06)", fontWeight: 700 }}>
                                <td style={{ padding: "11px 12px" }}>
                                  <span style={{ fontSize: 12, color: "#10b981" }}>EXTENDED SHIPPING TOTALS &#11088;</span>
                                  <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>For items marked as Extended Shipping</div>
                                </td>
                                <td style={{ padding: "11px 12px", color: "#10b981", fontSize: 14 }}>{etaTotals.warnTotal + etaTotals.extDays} days</td>
                                <td style={{ padding: "11px 12px", color: "#10b981", fontSize: 14 }}>{etaTotals.critTotal + etaTotals.extDays} days</td>
                                <td style={{ padding: "11px 12px" }}>
                                  <span style={{ color: "#10b981", fontSize: 14, fontWeight: 700 }}>Average: {etaTotals.extAvg.toFixed(1)} days</span>
                                  <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Standard ETA + {etaTotals.extDays} extended days</div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* ETA Calculation Examples */}
                        <div style={{ marginTop: 20, padding: 16, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginBottom: 10 }}>&#128197; ETA Calculation Examples</div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>Standard Items:</div>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", paddingLeft: 16 }}>Order Date + <strong style={{ color: "rgba(255,255,255,0.8)" }}>{etaTotals.avg.toFixed(0)} days</strong> = Estimated Delivery</div>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981", marginBottom: 2 }}>Extended Shipping Items (Special Machines):</div>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", paddingLeft: 16 }}>Order Date + <strong style={{ color: "#10b981" }}>{etaTotals.extAvg.toFixed(0)} days</strong> = Estimated Delivery</div>
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: 8 }}>Note: If ANY item in an order requires extended shipping, the entire order uses the extended ETA.</div>
                        </div>

                        <SaveBar hasChanges={threshChanges} saving={threshSaving} onSave={saveThresholds} msg={threshMsg} />
                      </div>

                      {/* Customer ETA Management */}
                      <div style={CARD}>
                        <SectionHeader label="Customer ETA Management" desc="Recalculate estimated delivery dates for all existing orders based on current threshold settings. This will update the ETA shown on all customer tracking pages." />
                        <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, marginBottom: 16 }}>
                          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>&#9888;&#65039; Warning: This will overwrite ALL existing ETA dates on customer tracking pages.</p>
                          <p style={{ margin: "0 0 4px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Standard orders: Order Date + <strong>{etaTotals.avg.toFixed(0)} days</strong> = ETA</p>
                          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Extended shipping orders: Order Date + <strong>{etaTotals.extAvg.toFixed(0)} days</strong> = ETA</p>
                        </div>
                        <button onClick={() => setShowETAConfirm(true)} disabled={recalcETA} style={{ padding: "9px 20px", background: recalcETA ? "rgba(220,38,38,0.3)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: recalcETA ? "not-allowed" : "pointer" }}>{recalcETA ? "Recalculating\u2026" : "Recalculate All ETAs"}</button>
                        {threshMsg.text && <span style={{ marginLeft: 12, fontSize: 13, color: threshMsg.type === "success" ? "#10b981" : "#dc2626" }}>{threshMsg.text}</span>}
                      </div>

                      {/* How Thresholds Work */}
                      <div style={{ ...CARD, background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 14 }}>&#128161; How Thresholds Work</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            ["Warning",         "Items exceeding this time are flagged yellow (attention needed)"],
                            ["Critical",         "Items exceeding this time are flagged red (urgent action required)"],
                            ["Holiday Adjustment","Buffer days are ONLY added to MANUFACTURING stage (Oct\u2013Dec)"],
                            ["Extended Shipping",  "Additional days for special machines that require extended lead times"],
                            ["ETA Calculation",    "Uses average of Warning and Critical days for stages through DELIVERED"],
                            ["Order-Level ETA",    "If ANY item has extended shipping, the entire order uses the extended timeline"],
                          ].map(([term, def]) => (
                            <div key={term} style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                              <strong style={{ color: "rgba(255,255,255,0.8)" }}>{term}:</strong> {def}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ================================================================ */}
              {/* COMMISSIONS                                                      */}
              {/* ================================================================ */}
              {activeTab === "commissions" && (
                <>
                  {commLoading ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "40px 0" }}>Loading\u2026</div> : (
                    <>
                      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {[["global","Global Settings"],["stages","Stage Distribution"],["rates","Individual Rates"]].map(([id, label]) => (
                          <button key={id} onClick={() => setCommTab(id)} style={{ padding: "9px 18px", background: "none", border: "none", borderBottom: commTab === id ? "2px solid #dc2626" : "2px solid transparent", color: commTab === id ? "#dc2626" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontWeight: commTab === id ? 600 : 400, marginBottom: -1 }}>{label}</button>
                        ))}
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
                          {commMsg.text && <span style={{ fontSize: 12, color: commMsg.type === "success" ? "#10b981" : "#dc2626" }}>{commMsg.text}</span>}
                          <button onClick={() => setShowRecalcModal(true)} style={{ padding: "6px 14px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, color: "#f59e0b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Recalculate All</button>
                        </div>
                      </div>

                      {commTab === "global" && (
                        <div style={CARD}>
                          <SectionHeader label="Global Commission Settings" />
                          <div style={{ padding: "12px 14px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 8, marginBottom: 18, fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                            Commissions are calculated based on the total order value when an order reaches specified stages. Individual agent rates override the default rate. Stage distribution determines when payouts occur.
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                              <input type="checkbox" checked={globalComm.enabled} onChange={e => { setGlobalComm(p => ({...p,enabled:e.target.checked})); setGlobalChanges(true); }} />
                              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Enable commission system</span>
                            </label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                              <div><label style={LBL}>Default Rate (%)</label><input style={INP} type="number" step="0.1" min="0" max="100" value={globalComm.defaultRate} onChange={e => { setGlobalComm(p => ({...p,defaultRate:parseFloat(e.target.value)||0})); setGlobalChanges(true); }} /></div>
                              <div><label style={LBL}>Calculation Basis</label>
                                <select style={{ ...INP, cursor: "pointer" }} value={globalComm.calculationBasis} onChange={e => { setGlobalComm(p => ({...p,calculationBasis:e.target.value})); setGlobalChanges(true); }}>
                                  <option value="ORDER_TOTAL">Order Total Value</option>
                                  <option value="SUBTOTAL">Order Subtotal (before tax)</option>
                                  <option value="PROFIT_MARGIN">Profit Margin</option>
                                </select>
                              </div>
                              <div><label style={LBL}>Min. Order Value ($)</label><input style={INP} type="number" step="100" min="0" value={globalComm.minimumOrderValue} onChange={e => { setGlobalComm(p => ({...p,minimumOrderValue:parseFloat(e.target.value)||0})); setGlobalChanges(true); }} /></div>
                            </div>
                          </div>
                          <SaveBar hasChanges={globalChanges} saving={commSaving} onSave={saveGlobalComm} msg={{}} />
                        </div>
                      )}

                      {commTab === "stages" && (
                        <div style={CARD}>
                          <SectionHeader label="Stage Distribution" desc="Set the percentage of total commission paid when an order reaches each stage. Must total 100%. Changes only apply to NEW orders — existing commissions use their original distribution." />
                          <div style={{ overflowX: "auto", marginBottom: 14 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                                  {["Stage","Commission %","Example ($10k @ 5%)",""].map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {stageDist.map((item, i) => (
                                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                    <td style={{ padding: "10px 12px" }}><select style={{ ...INP, width: 160 }} value={item.stage} onChange={e => { const n = [...stageDist]; n[i].stage = e.target.value; setStageDist(n); setStageDistChange(true); }}>{COMM_STAGES.map(s => <option key={s} value={s} disabled={stageDist.some((d, j) => d.stage === s && j !== i)}>{s}</option>)}</select></td>
                                    <td style={{ padding: "10px 12px" }}><input type="number" step="0.1" min="0" max="100" value={item.percentage} onChange={e => { const n = [...stageDist]; n[i].percentage = Number(e.target.value); setStageDist(n); setStageDistChange(true); }} style={{ ...INP, width: 80 }} /></td>
                                    <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>${(500 * item.percentage / 100).toFixed(2)}</td>
                                    <td style={{ padding: "10px 12px" }}><button onClick={() => { setStageDist(p => p.filter((_,j) => j !== i)); setStageDistChange(true); }} disabled={stageDist.length <= 1} style={{ padding: "4px 10px", background: stageDist.length > 1 ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.05)", border: stageDist.length > 1 ? "1px solid rgba(220,38,38,0.2)" : "1px solid transparent", borderRadius: 5, color: stageDist.length > 1 ? "#dc2626" : "rgba(255,255,255,0.2)", fontSize: 11, cursor: stageDist.length > 1 ? "pointer" : "not-allowed" }}>Remove</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                            <button onClick={() => { const avail = COMM_STAGES.filter(s => !stageDist.find(d => d.stage === s)); if (avail.length) { setStageDist(p => [...p, { stage: avail[0], percentage: 0 }]); setStageDistChange(true); } }} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>+ Add Stage</button>
                            <span style={{ fontSize: 13, fontWeight: 700, color: Math.abs(stageTotal - 100) < 0.01 ? "#10b981" : stageTotal > 100 ? "#dc2626" : "#f59e0b" }}>Total: {stageTotal.toFixed(1)}% {Math.abs(stageTotal - 100) < 0.01 && "\u2713"}</span>
                          </div>
                          <SaveBar hasChanges={stageDistChange} saving={commSaving} onSave={saveStageDistribution} msg={{}} />
                        </div>
                      )}

                      {commTab === "rates" && (
                        <div style={CARD}>
                          <SectionHeader label="Individual Rates" desc="Set custom commission rates per sales agent. Leave blank to use the global default rate." />
                          {salesReps.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No sales reps found. Enable \u201cShow in Sales Rep Dropdown\u201d on user accounts.</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {salesReps.map(rep => (
                                <div key={rep.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#252525", borderRadius: 8 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,#991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{rep.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)}</div>
                                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{rep.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{rep.email}</div></div>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 11, padding: "2px 7px", background: indRates[rep.name] ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.06)", border: indRates[rep.name] ? "1px solid rgba(220,38,38,0.2)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: indRates[rep.name] ? "#dc2626" : "rgba(255,255,255,0.35)" }}>{indRates[rep.name] ? "Custom" : "Default"}</span>
                                    <input type="number" step="0.1" min="0" max="100" value={indRates[rep.name] || ""} onChange={e => setIndRates(p => ({ ...p, [rep.name]: e.target.value }))} placeholder={String(globalComm.defaultRate)} style={{ ...INP, width: 80, textAlign: "center" }} />
                                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>%</span>
                                    <button onClick={() => saveIndRate(rep.name, indRates[rep.name] || globalComm.defaultRate)} style={{ padding: "5px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, color: "#10b981", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Save</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* MODALS                                                           */}
      {/* ================================================================ */}

      {showPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowPreview(false)}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: "90%", maxWidth: 680, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>Email Preview</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Subject: {previewSubject}</div></div>
              <button onClick={() => setShowPreview(false)} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Close</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#f5f5f5" }}><div dangerouslySetInnerHTML={{ __html: previewHtml }} /></div>
          </div>
        </div>
      )}

      {showTestSend && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowTestSend(false)}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 28, width: "90%", maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Send Test Email</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Send a test version of \u201c{selTpl?.name}\u201d with sample data.</p>
            <label style={LBL}>Recipient Email</label>
            <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@example.com" style={{ ...INP, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowTestSend(false)} style={{ padding: "8px 18px", background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={sendTestEmail} disabled={sendingTest || !testEmail} style={{ padding: "8px 18px", background: testEmail ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: testEmail ? "#fff" : "rgba(255,255,255,0.3)", cursor: testEmail ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}>{sendingTest ? "Sending\u2026" : "Send Test"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ETA Recalculate Confirm Modal */}
      {showETAConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowETAConfirm(false)}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 28, width: "90%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Recalculate All ETAs</h3>
            <div style={{ padding: "12px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>&#9888;&#65039; This will overwrite ALL existing ETA dates on customer tracking pages.</p>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Standard orders: Order Date + <strong>{etaTotals.avg.toFixed(0)} days</strong> = ETA</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Extended shipping orders: Order Date + <strong>{etaTotals.extAvg.toFixed(0)} days</strong> = ETA</p>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowETAConfirm(false)} style={{ padding: "8px 18px", background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={recalcETAs} style={{ padding: "8px 18px", background: "#dc2626", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Yes, Recalculate All ETAs</button>
            </div>
          </div>
        </div>
      )}

      {showRecalcModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setShowRecalcModal(false); setRecalcReason(""); }}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 28, width: "90%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Recalculate All Commissions</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>This will recalculate all unpaid commissions based on current rates and stage settings. Commissions with paid payouts will be skipped. This action will be logged in the audit trail.</p>
            <label style={LBL}>Reason (minimum 10 characters)</label>
            <textarea value={recalcReason} onChange={e => setRecalcReason(e.target.value)} placeholder="Enter reason for recalculation\u2026" rows={3} style={{ ...INP, resize: "vertical", lineHeight: 1.6, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowRecalcModal(false); setRecalcReason(""); }} style={{ padding: "8px 18px", background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={executeRecalc} disabled={recalculating || recalcReason.trim().length < 10} style={{ padding: "8px 18px", background: recalcReason.trim().length >= 10 ? "#f59e0b" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: recalcReason.trim().length >= 10 ? "#000" : "rgba(255,255,255,0.3)", cursor: recalcReason.trim().length >= 10 ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}>{recalculating ? "Recalculating\u2026" : "Recalculate Commissions"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
