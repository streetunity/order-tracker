"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

// ─── Constants ───────────────────────────────────────────────────────────────

const CUSTOMER_STATUS_COLORS = {
  ACTIVE:   { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)",  text: "#10b981" },
  INACTIVE: { bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.3)", text: "#6b7280" },
};

const ESTIMATE_STATUS_META = {
  DRAFT:     { label: "Draft",     bg: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.3)", text: "#9ca3af" },
  SENT:      { label: "Sent",      bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.3)",  text: "#60a5fa" },
  VIEWED:    { label: "Viewed",    bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.3)",  text: "#818cf8" },
  ACCEPTED:  { label: "Accepted",  bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)",  text: "#10b981" },
  DECLINED:  { label: "Declined",  bg: "rgba(220,38,38,0.12)",   border: "rgba(220,38,38,0.3)",   text: "#f87171" },
  EXPIRED:   { label: "Expired",   bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)",  text: "#f59e0b" },
  CONVERTED: { label: "Converted", bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.3)",  text: "#a78bfa" },
};

const INVOICE_STATUS_META = {
  DRAFT:   { label: "Draft",   bg: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.3)", text: "#9ca3af" },
  SENT:    { label: "Sent",    bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.3)",  text: "#60a5fa" },
  VIEWED:  { label: "Viewed",  bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.3)",  text: "#818cf8" },
  PAID:    { label: "Paid",    bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)",  text: "#10b981" },
  PARTIAL: { label: "Partial", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)",  text: "#f59e0b" },
  OVERDUE: { label: "Overdue", bg: "rgba(220,38,38,0.12)",   border: "rgba(220,38,38,0.3)",   text: "#f87171" },
  VOID:    { label: "Void",    bg: "rgba(75,85,99,0.12)",    border: "rgba(75,85,99,0.3)",    text: "#6b7280" },
};

const PAYMENT_TERMS_OPTIONS = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'NET15',          label: 'Net 15' },
  { value: 'NET30',          label: 'Net 30' },
  { value: 'NET60',          label: 'Net 60' },
  { value: 'CUSTOM',         label: 'Custom' },
];

const CONTACT_ROLES = [
  { value: 'PRIMARY',   label: 'Primary Contact' },
  { value: 'BILLING',   label: 'Billing Contact' },
  { value: 'SHIPPING',  label: 'Shipping Contact' },
  { value: 'TECHNICAL', label: 'Technical Contact' },
  { value: 'OTHER',     label: 'Other' },
];

const TABS = [
  { id: 'transactions', label: 'Transaction List' },
  { id: 'details',      label: 'Customer Details' },
  { id: 'activity',     label: 'Activity Feed' },
  { id: 'contacts',     label: 'Contacts' },
  { id: 'portal',       label: 'Portal Access' },
];

const NAV_H = 60; // InvoicingNav height in px

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function relativeDate(dateStr) {
  const date = new Date(dateStr);
  const diffMs   = Date.now() - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffH    = Math.floor(diffMs / 3600000);
  const diffD    = Math.floor(diffMs / 86400000);
  if (diffMins < 1)  return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffH < 24)    return `${diffH}h ago`;
  if (diffD < 7)     return `${diffD}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ meta }) {
  if (!meta) return null;
  return (
    <span style={{ padding: "2px 9px", background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 12, color: meta.text, fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", whiteSpace: "nowrap" }}>
      {meta.label}
    </span>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2 }} />
      <h3 style={{ fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.9px", margin: 0 }}>{label}</h3>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();

  // Customer / page state
  const [customer,          setCustomer]          = useState(null);
  const [contacts,          setContacts]           = useState([]);
  const [activities,        setActivities]         = useState([]);
  const [activitiesLoading, setActivitiesLoading]  = useState(true);
  const [loading,           setLoading]            = useState(true);
  const [salesReps,         setSalesReps]          = useState([]);
  const [saving,            setSaving]             = useState(false);
  const [error,             setError]              = useState("");
  const [success,           setSuccess]            = useState("");
  const [isEditing,         setIsEditing]          = useState(false);
  const [showContactModal,  setShowContactModal]   = useState(false);
  const [editingContact,    setEditingContact]      = useState(null);
  const [showPortalUrl,     setShowPortalUrl]       = useState(false);
  const [activeTab,         setActiveTab]           = useState("transactions");

  // Transaction filters
  const [txTypeFilter,   setTxTypeFilter]   = useState("ALL");
  const [txStatusFilter, setTxStatusFilter] = useState("ALL");

  // Sidebar
  const [sidebarSearch,  setSidebarSearch]  = useState("");
  const [allCustomers,   setAllCustomers]   = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig,    setConfirmConfig]    = useState({ title: "", message: "", onConfirm: null });
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState(null);

  // Form state
  const [formData,          setFormData]          = useState({});
  const [originalFormData,  setOriginalFormData]  = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal,  setShowUnsavedModal]  = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [contactForm,       setContactForm]       = useState({ firstName: "", lastName: "", email: "", phone: "", role: "OTHER", isPrimary: false, notes: "" });

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadAllCustomers();
    if (params.id) { loadCustomer(); loadContacts(); loadActivities(); loadSalesReps(); }
  }, [user, authLoading, router, params.id]);

  useEffect(() => {
    if (!isEditing || !originalFormData || !Object.keys(originalFormData).length) { setHasUnsavedChanges(false); return; }
    setHasUnsavedChanges(Object.keys(formData).some(k => formData[k] !== originalFormData[k]));
  }, [formData, originalFormData, isEditing]);

  useEffect(() => {
    const fn = (e) => { if (hasUnsavedChanges && isEditing) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [hasUnsavedChanges, isEditing]);

  // Intercept ALL internal link clicks while editing (covers sidebar links too)
  useEffect(() => {
    if (!hasUnsavedChanges || !isEditing) return;
    const fn = (e) => {
      const link = e.target.closest("a[href]");
      if (link) { const h = link.getAttribute("href"); if (h?.startsWith("/")) { e.preventDefault(); e.stopPropagation(); setPendingNavigation(h); setShowUnsavedModal(true); } }
    };
    document.addEventListener("click", fn, true);
    return () => document.removeEventListener("click", fn, true);
  }, [hasUnsavedChanges, isEditing]);

  // ── Loaders ──────────────────────────────────────────────────────────────

  async function loadAllCustomers() {
    setSidebarLoading(true);
    try { const r = await fetch("/api/customers", { headers: getAuthHeaders() }); if (r.ok) setAllCustomers(await r.json()); } catch {}
    finally { setSidebarLoading(false); }
  }

  async function loadSalesReps() {
    try { const r = await fetch("/api/sales-reps", { headers: getAuthHeaders() }); if (r.ok) setSalesReps(await r.json()); } catch {}
  }

  async function loadCustomer() {
    setLoading(true);
    try {
      const r = await fetch(`/api/customers/${params.id}`, { headers: getAuthHeaders() });
      if (!r.ok) {
        if (r.status === 401) { router.push("/login"); return; }
        if (r.status === 404) { setError("Customer not found"); setLoading(false); return; }
        throw new Error("Failed to load customer");
      }
      const data = await r.json();
      setCustomer(data);
      const fd = {
        companyName:     data.companyName     || "",
        firstName:       data.firstName       || "",
        lastName:        data.lastName        || "",
        email:           data.email           || "",
        phone:           data.phone           || "",
        billingAddress:  data.billingAddress  || "",
        billingCity:     data.billingCity     || "",
        billingState:    data.billingState    || "",
        billingZipCode:  data.billingZipCode  || "",
        billingCountry:  data.billingCountry  || "USA",
        shippingAddress: data.shippingAddress || "",
        shippingCity:    data.shippingCity    || "",
        shippingState:   data.shippingState   || "",
        shippingZipCode: data.shippingZipCode || "",
        shippingCountry: data.shippingCountry || "USA",
        sameAsBilling:   data.sameAsBilling   ?? true,
        paymentTerms:    data.paymentTerms    || "NET30",
        taxExempt:       data.taxExempt       || false,
        taxExemptId:     data.taxExemptId     || "",
        tags:            Array.isArray(data.tags) ? data.tags.join(", ") : (data.tags || ""),
        notes:           data.notes           || "",
        status:          data.status          || "ACTIVE",
        assignedToId:    data.assignedToId    || "",
      };
      setFormData(fd); setOriginalFormData(fd); setHasUnsavedChanges(false);
    } catch (e) { setError("Failed to load customer"); }
    finally { setLoading(false); }
  }

  async function loadContacts() {
    try { const r = await fetch(`/api/customers/${params.id}/contacts`, { headers: getAuthHeaders() }); if (r.ok) setContacts(await r.json()); } catch {}
  }

  async function loadActivities() {
    setActivitiesLoading(true);
    try { const r = await fetch(`/api/customers/${params.id}/activity?limit=20`, { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setActivities(d.activities || []); } } catch {}
    finally { setActivitiesLoading(false); }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const body = { ...formData, tags: formData.tags ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : [], assignedToId: formData.assignedToId || null };
      const r = await fetch(`/api/customers/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to update customer");
      setCustomer(d); setIsEditing(false); setSuccess("Customer updated successfully");
      // Refresh sidebar to pick up any name changes
      loadAllCustomers();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function showConfirm(title, message, onConfirm) { setConfirmConfig({ title, message, onConfirm }); setShowConfirmModal(true); }

  function handleNav(dest) {
    if (hasUnsavedChanges && isEditing) { setPendingNavigation(dest); setShowUnsavedModal(true); }
    else router.push(dest);
  }

  function confirmDiscard() {
    setShowUnsavedModal(false); setHasUnsavedChanges(false); setIsEditing(false);
    if (pendingNavigation) router.push(pendingNavigation); else loadCustomer();
    setPendingNavigation(null);
  }

  async function handleStatusToggle() {
    const ns = customer.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const r = await fetch(`/api/customers/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ status: ns }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setCustomer(d); setFormData(p => ({ ...p, status: ns })); setOriginalFormData(p => ({ ...p, status: ns }));
      loadAllCustomers();
      setSuccess(`Customer ${ns === "ACTIVE" ? "activated" : "deactivated"}`); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
  }

  async function handleDelete() {
    setShowConfirmModal(false);
    try { const r = await fetch(`/api/customers/${params.id}`, { method: "DELETE", headers: getAuthHeaders() }); if (!r.ok) { const d = await r.json(); throw new Error(d.error); } router.push("/invoicing/customers"); }
    catch (e) { setError(e.message); }
  }

  async function handleRegenerateToken() {
    setShowConfirmModal(false);
    try {
      const r = await fetch(`/api/customers/${params.id}/regenerate-portal-token`, { method: "POST", headers: getAuthHeaders() });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setCustomer(p => ({ ...p, portalToken: d.portalToken })); setSuccess("Portal token regenerated"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
  }

  function openContactModal(contact = null) {
    if (contact) { setEditingContact(contact); setContactForm({ firstName: contact.firstName || "", lastName: contact.lastName || "", email: contact.email || "", phone: contact.phone || "", role: contact.role || "OTHER", isPrimary: contact.isPrimary || false, notes: contact.notes || "" }); }
    else          { setEditingContact(null); setContactForm({ firstName: "", lastName: "", email: "", phone: "", role: "OTHER", isPrimary: contacts.length === 0, notes: "" }); }
    setShowContactModal(true);
  }

  async function handleSaveContact(e) {
    e.preventDefault(); setSaving(true);
    try {
      const url = editingContact ? `/api/customers/${params.id}/contacts/${editingContact.id}` : `/api/customers/${params.id}/contacts`;
      const r = await fetch(url, { method: editingContact ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(contactForm) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      await loadContacts(); setShowContactModal(false); setSuccess(editingContact ? "Contact updated" : "Contact added"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeleteContact(contactId) {
    setShowConfirmModal(false);
    const id = contactId || pendingDeleteContactId; setPendingDeleteContactId(null); if (!id) return;
    try { const r = await fetch(`/api/customers/${params.id}/contacts/${id}`, { method: "DELETE", headers: getAuthHeaders() }); if (!r.ok) { const d = await r.json(); throw new Error(d.error); } await loadContacts(); setSuccess("Contact deleted"); setTimeout(() => setSuccess(""), 3000); }
    catch (e) { setError(e.message); }
  }

  // ── Activity helpers ──────────────────────────────────────────────────────

  function activityColor(type) {
    return { created: "#10b981", updated: "#3b82f6", sent: "#8b5cf6", viewed: "#6366f1", signed: "#10b981", paid: "#10b981", comment: "#f59e0b", status_change: "#f97316", assigned: "#06b6d4", reminder_created: "#f59e0b", converted: "#10b981", order_created: "#dc2626" }[type] || "#6b7280";
  }
  function activityLabel(type) {
    return { created: "Created", updated: "Updated", sent: "Sent", viewed: "Viewed", signed: "Signed", paid: "Payment", comment: "Comment", status_change: "Status", assigned: "Assigned", reminder_created: "Reminder", converted: "Converted", order_created: "Order" }[type] || type;
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const estimates = customer?.estimates || [];
  const invoices  = customer?.invoices  || [];

  const openBalance = useMemo(() => invoices.filter(i => !["PAID","VOID"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0), [invoices]);

  const transactions = useMemo(() => {
    const est = estimates.map(e => ({ ...e, _type: "estimate", _number: e.estimateNumber, _date: e.createdAt, _statusMeta: ESTIMATE_STATUS_META[e.status] || ESTIMATE_STATUS_META.DRAFT, _href: `/invoicing/estimates/${e.id}` }));
    const inv = invoices.map(i  => ({ ...i,  _type: "invoice",  _number: i.invoiceNumber,  _date: i.createdAt, _statusMeta: INVOICE_STATUS_META[i.status]   || INVOICE_STATUS_META.DRAFT,  _href: `/invoicing/invoices/${i.id}` }));
    return [...est, ...inv].sort((a, b) => new Date(b._date) - new Date(a._date));
  }, [estimates, invoices]);

  const filteredTx = useMemo(() => transactions.filter(tx => {
    if (txTypeFilter   !== "ALL" && tx._type  !== txTypeFilter.toLowerCase()) return false;
    if (txStatusFilter !== "ALL" && tx.status !== txStatusFilter)              return false;
    return true;
  }), [transactions, txTypeFilter, txStatusFilter]);

  const txTotalCount = transactions.length;

  // Sidebar filtered customers
  const filteredSidebarCustomers = useMemo(() => {
    if (!sidebarSearch.trim()) return allCustomers;
    const q = sidebarSearch.toLowerCase();
    return allCustomers.filter(c => {
      const name = (c.companyName || `${c.firstName} ${c.lastName}`).toLowerCase();
      return name.includes(q) || (c.customerNumber || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q);
    });
  }, [allCustomers, sidebarSearch]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const inp = { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "7px", color: "rgba(255,255,255,0.9)", fontSize: "13px" };
  const lbl = { display: "block", marginBottom: "5px", fontSize: "12px", fontWeight: "500", color: "rgba(255,255,255,0.5)" };
  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" };

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (authLoading || !user) return null;

  // ── Sidebar JSX (shared across loading/error/main states) ─────────────────

  const sidebarJSX = (
    <div style={{
      width: 256,
      flexShrink: 0,
      position: "sticky",
      top: NAV_H,
      height: `calc(100vh - ${NAV_H}px)`,
      background: "#141414",
      borderRight: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      flexDirection: "column",
      overflowY: "hidden",
    }}>
      {/* Sidebar header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.9px" }}>Customers</span>
          <Link
            href="/invoicing/customers/new"
            style={{ fontSize: 11, color: "#dc2626", textDecoration: "none", padding: "3px 8px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, lineHeight: 1.5, whiteSpace: "nowrap" }}
          >
            + New
          </Link>
        </div>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "rgba(255,255,255,0.25)", pointerEvents: "none", fill: "none", stroke: "currentColor", strokeWidth: 2 }} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search customers…"
            value={sidebarSearch}
            onChange={e => setSidebarSearch(e.target.value)}
            style={{ width: "100%", padding: "6px 8px 6px 26px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(255,255,255,0.8)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        {!sidebarLoading && (
          <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
            {filteredSidebarCustomers.length} customer{filteredSidebarCustomers.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Customer list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {sidebarLoading ? (
          <div style={{ padding: "28px 14px", color: "rgba(255,255,255,0.25)", fontSize: 12, textAlign: "center" }}>Loading…</div>
        ) : filteredSidebarCustomers.length === 0 ? (
          <div style={{ padding: "28px 14px", color: "rgba(255,255,255,0.25)", fontSize: 12, textAlign: "center" }}>No customers found</div>
        ) : (
          filteredSidebarCustomers.map(c => {
            const isActive = c.id === params.id;
            const name     = c.companyName || `${c.firstName} ${c.lastName}`;
            const inactive = c.status === "INACTIVE";
            return (
              <Link
                key={c.id}
                href={`/invoicing/customers/${c.id}`}
                style={{
                  display: "block",
                  padding: "9px 14px",
                  borderLeft: isActive ? "2px solid #dc2626" : "2px solid transparent",
                  background: isActive ? "rgba(220,38,38,0.07)" : "transparent",
                  textDecoration: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "rgba(255,255,255,0.92)" : inactive ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.7)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}>
                  {name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontFamily: "monospace" }}>{c.customerNumber}</span>
                  {inactive && (
                    <span style={{ fontSize: 9, color: "#6b7280", background: "rgba(107,114,128,0.12)", padding: "0 4px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase" }}>Inactive</span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer link */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <Link href="/invoicing/customers" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>
          ← All Customers
        </Link>
      </div>
    </div>
  );

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: NAV_H, minHeight: "100vh", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading customer…</div>
        </div>
      </div>
    </>
  );

  // ── 404 state ─────────────────────────────────────────────────────────────

  if (!customer) return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: NAV_H, minHeight: "100vh", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
            <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>Customer not found</p>
          </div>
        </div>
      </div>
    </>
  );

  // ── Computed display values ───────────────────────────────────────────────

  const statusColor = CUSTOMER_STATUS_COLORS[customer.status] || CUSTOMER_STATUS_COLORS.ACTIVE;
  const displayName = customer.companyName || `${customer.firstName} ${customer.lastName}`;
  const initials    = customer.companyName ? customer.companyName.substring(0, 2).toUpperCase() : `${(customer.firstName || "?")[0]}${(customer.lastName || "")[0] || ""}`.toUpperCase();
  const tags        = Array.isArray(customer.tags) ? customer.tags : (customer.tags ? JSON.parse(customer.tags) : []);

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: NAV_H, minHeight: "100vh", background: "#0f0f0f" }}>

        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        {sidebarJSX}

        {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, padding: "24px 28px 60px", overflowX: "hidden" }}>

          {/* ══ HEADER CARD ════════════════════════════════════════════ */}
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden", marginBottom: 0 }}>

            {/* Top row */}
            <div style={{ padding: "18px 24px", display: "flex", gap: 18, alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Avatar */}
              <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,#991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "white", boxShadow: "0 0 0 3px rgba(220,38,38,0.16)", letterSpacing: 1 }}>
                {initials}
              </div>

              {/* Name block */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 3 }}>
                  <h1 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40vw" }}>{displayName}</h1>
                  <button onClick={handleStatusToggle} style={{ padding: "2px 8px", background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: 20, color: statusColor.text, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0 }}>{customer.status}</button>
                  {tags.map((t, i) => <span key={i} style={{ padding: "2px 7px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 12, color: "#dc2626", fontSize: 10 }}>{t}</span>)}
                </div>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, fontFamily: "monospace", margin: "0 0 7px" }}>{customer.customerNumber}</p>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {customer.email      && <a href={`mailto:${customer.email}`} style={{ color: "#dc2626", fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>✉</span>{customer.email}</a>}
                  {customer.phone      && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>☎</span>{customer.phone}</span>}
                  {customer.billingCity && <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>◎</span>{customer.billingCity}{customer.billingState ? `, ${customer.billingState}` : ""}</span>}
                  {customer.assignedTo && (
                    <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,#991b1b)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "white" }}>{customer.assignedTo.name[0].toUpperCase()}</span>
                      {customer.assignedTo.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ flexShrink: 0, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Link href={`/invoicing/estimates/new?customer=${params.id}`} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>+ Estimate</Link>
                <Link href={`/invoicing/invoices/new?customer=${params.id}`} style={{ padding: "7px 12px", background: "#dc2626", border: "none", borderRadius: 7, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>+ Invoice</Link>
                {!isEditing ? (
                  <>
                    <button onClick={() => { setIsEditing(true); setActiveTab("details"); }} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 12 }}>Edit</button>
                    <button onClick={() => showConfirm("Delete Customer", "Are you sure? This cannot be undone.", handleDelete)} style={{ padding: "7px 12px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7, color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Delete</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { if (hasUnsavedChanges) { setShowUnsavedModal(true); setPendingNavigation(null); } else { setIsEditing(false); loadCustomer(); } }} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: "7px 14px", background: "#dc2626", border: "none", borderRadius: 7, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
                  </>
                )}
              </div>
            </div>

            {/* Stat strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                { label: "Estimates",     value: estimates.length || "0" },
                { label: "Invoices",      value: invoices.length  || "0" },
                { label: "Open Balance",  value: openBalance > 0 ? fmtMoney(openBalance) : "—", accent: openBalance > 0 ? "#f59e0b" : null },
                { label: "Payment Terms", value: PAYMENT_TERMS_OPTIONS.find(o => o.value === customer.paymentTerms)?.label || customer.paymentTerms || "—" },
                { label: "Tax Exempt",    value: customer.taxExempt ? "Yes" : "No" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "11px 18px", borderRight: i < 4 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: s.accent || "rgba(255,255,255,0.82)" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", padding: "0 24px", background: "#161616" }}>
              {TABS.map(tab => {
                const active = activeTab === tab.id;
                const badge  = tab.id === "transactions" ? txTotalCount : tab.id === "contacts" ? contacts.length : tab.id === "activity" ? activities.length : 0;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "11px 14px", background: "none", border: "none", borderBottom: active ? "2px solid #dc2626" : "2px solid transparent", color: active ? "#dc2626" : "rgba(255,255,255,0.38)", cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, transition: "all 0.15s", marginBottom: -1, whiteSpace: "nowrap" }}>
                    {tab.label}
                    {badge > 0 && <span style={{ marginLeft: 4, padding: "1px 5px", background: active ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.07)", borderRadius: 10, fontSize: 10, color: active ? "#dc2626" : "rgba(255,255,255,0.3)" }}>{badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alerts */}
          {error   && <div style={{ padding: "10px 14px", marginTop: 10, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>{error}</div>}
          {success && <div style={{ padding: "10px 14px", marginTop: 10, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, color: "#10b981", fontSize: 13 }}>{success}</div>}

          {/* ══ TAB CONTENT ════════════════════════════════════════════ */}
          <div style={{ marginTop: 1, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 14px 14px" }}>

            {/* ─ TRANSACTION LIST ─────────────────────────────────── */}
            {activeTab === "transactions" && (
              <div>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {["ALL","ESTIMATE","INVOICE"].map(v => (
                    <button key={v} onClick={() => setTxTypeFilter(v)} style={{ padding: "4px 10px", background: txTypeFilter === v ? "rgba(220,38,38,0.12)" : "rgba(255,255,255,0.04)", border: txTypeFilter === v ? "1px solid rgba(220,38,38,0.3)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: txTypeFilter === v ? "#dc2626" : "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 11, fontWeight: txTypeFilter === v ? 600 : 400 }}>
                      {v === "ALL" ? "All Types" : v === "ESTIMATE" ? "Estimates" : "Invoices"}
                    </button>
                  ))}
                  <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)", margin: "0 2px" }} />
                  <select value={txStatusFilter} onChange={e => setTxStatusFilter(e.target.value)} style={{ padding: "4px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(255,255,255,0.55)", fontSize: 11, cursor: "pointer" }}>
                    <option value="ALL">All Statuses</option>
                    {txTypeFilter !== "INVOICE"  && <><option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="ACCEPTED">Accepted</option><option value="DECLINED">Declined</option><option value="EXPIRED">Expired</option><option value="CONVERTED">Converted</option></>}
                    {txTypeFilter !== "ESTIMATE" && <><option value="PAID">Paid</option><option value="PARTIAL">Partial</option><option value="OVERDUE">Overdue</option><option value="VOID">Void</option></>}
                  </select>
                  <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.28)", fontSize: 11 }}>{filteredTx.length} record{filteredTx.length !== 1 ? "s" : ""}</span>
                </div>

                {filteredTx.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "100px 80px 1fr 100px 100px 80px", padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.12)" }}>
                    {["Date","Type","Number","Amount","Balance Due","Status"].map(h => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</span>
                    ))}
                  </div>
                )}

                {filteredTx.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "50px 0" }}>
                    <div style={{ fontSize: 34, marginBottom: 10 }}>📄</div>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 16 }}>{transactions.length === 0 ? "No transactions yet for this customer" : "No transactions match the current filters"}</p>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <Link href={`/invoicing/estimates/new?customer=${params.id}`} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: 12 }}>New Estimate</Link>
                      <Link href={`/invoicing/invoices/new?customer=${params.id}`} style={{ padding: "8px 16px", background: "#dc2626", border: "none", borderRadius: 7, color: "white", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>New Invoice</Link>
                    </div>
                  </div>
                ) : (
                  filteredTx.map((tx, idx) => (
                    <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "100px 80px 1fr 100px 100px 80px", padding: "11px 20px", borderBottom: idx < filteredTx.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{fmtDate(tx._date)}</span>
                      <span><span style={{ padding: "2px 7px", background: tx._type === "invoice" ? "rgba(59,130,246,0.1)" : "rgba(139,92,246,0.1)", border: tx._type === "invoice" ? "1px solid rgba(59,130,246,0.22)" : "1px solid rgba(139,92,246,0.22)", borderRadius: 10, color: tx._type === "invoice" ? "#60a5fa" : "#a78bfa", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{tx._type === "invoice" ? "Invoice" : "Estimate"}</span></span>
                      <span>
                        <Link href={tx._href} style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: 500, textDecoration: "none", fontFamily: "monospace" }}
                          onMouseEnter={e => e.target.style.color = "#dc2626"}
                          onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.82)"}
                        >{tx._number}</Link>
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "monospace" }}>{fmtMoney(tx.total)}</span>
                      <span style={{ color: tx.balanceDue > 0 ? "#f59e0b" : "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "monospace" }}>{tx._type === "invoice" ? fmtMoney(tx.balanceDue) : "—"}</span>
                      <span><StatusBadge meta={tx._statusMeta} /></span>
                    </div>
                  ))
                )}

                {transactions.length >= 10 && (
                  <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                    <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}>Showing most recent 10 of each type · </span>
                    <Link href={`/invoicing/invoices?customer=${params.id}`} style={{ color: "#dc2626", fontSize: 11, textDecoration: "none" }}>View all invoices</Link>
                  </div>
                )}
              </div>
            )}

            {/* ─ CUSTOMER DETAILS ─────────────────────────────────── */}
            {activeTab === "details" && (
              <div style={{ padding: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
                {/* LEFT */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {/* Company Info */}
                  <div>
                    <SectionHeader label={isEditing ? "Company & Contact" : "Company Information"} />
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div><label style={lbl}>Company Name</label><input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} style={inp} /></div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div><label style={lbl}>First Name *</label><input type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} style={inp} required /></div>
                          <div><label style={lbl}>Last Name *</label><input type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} style={inp} required /></div>
                        </div>
                        <div><label style={lbl}>Email *</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={inp} required /></div>
                        <div><label style={lbl}>Phone</label><input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} style={inp} /></div>
                      </div>
                    ) : (
                      <div style={{ background: "#252525", borderRadius: 9, overflow: "hidden" }}>
                        {customer.companyName && <div style={row}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Company</span><span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500 }}>{customer.companyName}</span></div>}
                        <div style={row}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Contact</span><span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.firstName} {customer.lastName}</span></div>
                        <div style={row}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Email</span><a href={`mailto:${customer.email}`} style={{ color: "#dc2626", fontSize: 13, textDecoration: "none" }}>{customer.email}</a></div>
                        <div style={{ ...row, borderBottom: "none" }}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Phone</span><span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.phone || "—"}</span></div>
                      </div>
                    )}
                  </div>

                  {/* Billing */}
                  <div>
                    <SectionHeader label="Billing Address" />
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div><label style={lbl}>Street</label><input type="text" value={formData.billingAddress} onChange={e => setFormData({...formData, billingAddress: e.target.value})} style={inp} /></div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div><label style={lbl}>City</label><input type="text" value={formData.billingCity} onChange={e => setFormData({...formData, billingCity: e.target.value})} style={inp} /></div>
                          <div><label style={lbl}>State</label><input type="text" value={formData.billingState} onChange={e => setFormData({...formData, billingState: e.target.value})} style={inp} /></div>
                          <div><label style={lbl}>ZIP</label><input type="text" value={formData.billingZipCode} onChange={e => setFormData({...formData, billingZipCode: e.target.value})} style={inp} /></div>
                          <div><label style={lbl}>Country</label><input type="text" value={formData.billingCountry} onChange={e => setFormData({...formData, billingCountry: e.target.value})} style={inp} /></div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: "#252525", borderRadius: 9, padding: "12px 14px" }}>
                        {customer.billingAddress ? <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.7 }}><div>{customer.billingAddress}</div><div>{customer.billingCity}{customer.billingState ? `, ${customer.billingState}` : ""} {customer.billingZipCode}</div><div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{customer.billingCountry}</div></div> : <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, fontStyle: "italic" }}>No billing address set</span>}
                      </div>
                    )}
                  </div>

                  {/* Shipping */}
                  <div>
                    <SectionHeader label="Shipping Address" />
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                          <input type="checkbox" checked={formData.sameAsBilling} onChange={e => setFormData({...formData, sameAsBilling: e.target.checked})} style={{ width: 14, height: 14 }} />
                          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>Same as billing</span>
                        </label>
                        {!formData.sameAsBilling && (
                          <>
                            <div><label style={lbl}>Street</label><input type="text" value={formData.shippingAddress} onChange={e => setFormData({...formData, shippingAddress: e.target.value})} style={inp} /></div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <div><label style={lbl}>City</label><input type="text" value={formData.shippingCity} onChange={e => setFormData({...formData, shippingCity: e.target.value})} style={inp} /></div>
                              <div><label style={lbl}>State</label><input type="text" value={formData.shippingState} onChange={e => setFormData({...formData, shippingState: e.target.value})} style={inp} /></div>
                              <div><label style={lbl}>ZIP</label><input type="text" value={formData.shippingZipCode} onChange={e => setFormData({...formData, shippingZipCode: e.target.value})} style={inp} /></div>
                              <div><label style={lbl}>Country</label><input type="text" value={formData.shippingCountry} onChange={e => setFormData({...formData, shippingCountry: e.target.value})} style={inp} /></div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div style={{ background: "#252525", borderRadius: 9, padding: "12px 14px" }}>
                        {customer.sameAsBilling ? <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontStyle: "italic" }}>Same as billing address</span> : customer.shippingAddress ? <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.7 }}><div>{customer.shippingAddress}</div><div>{customer.shippingCity}{customer.shippingState ? `, ${customer.shippingState}` : ""} {customer.shippingZipCode}</div><div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{customer.shippingCountry}</div></div> : <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, fontStyle: "italic" }}>No shipping address set</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {/* Sales Rep */}
                  <div>
                    <SectionHeader label="Sales Rep" />
                    {isEditing ? (
                      <select value={formData.assignedToId} onChange={e => setFormData({...formData, assignedToId: e.target.value})} style={inp}>
                        <option value="">-- Unassigned --</option>
                        {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ background: "#252525", borderRadius: 9, padding: "13px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <div style={{ width: 38, height: 38, borderRadius: "50%", background: customer.assignedTo ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white" }}>{customer.assignedTo ? customer.assignedTo.name[0].toUpperCase() : "?"}</div>
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 13 }}>{customer.assignedTo?.name || "Unassigned"}</div>
                            {customer.assignedTo?.email && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{customer.assignedTo.email}</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment */}
                  <div>
                    <SectionHeader label="Payment Settings" />
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div><label style={lbl}>Payment Terms</label><select value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})} style={inp}>{PAYMENT_TERMS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}><input type="checkbox" checked={formData.taxExempt} onChange={e => setFormData({...formData, taxExempt: e.target.checked})} style={{ width: 14, height: 14 }} /><span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>Tax Exempt</span></label>
                        {formData.taxExempt && <div><label style={lbl}>Tax Exempt Number</label><input type="text" value={formData.taxExemptId} onChange={e => setFormData({...formData, taxExemptId: e.target.value})} style={inp} /></div>}
                      </div>
                    ) : (
                      <div style={{ background: "#252525", borderRadius: 9, overflow: "hidden" }}>
                        <div style={row}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Payment Terms</span><span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500 }}>{PAYMENT_TERMS_OPTIONS.find(o => o.value === customer.paymentTerms)?.label || customer.paymentTerms}</span></div>
                        <div style={{ ...row, borderBottom: "none" }}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Tax Exempt</span><span style={{ color: customer.taxExempt ? "#f59e0b" : "rgba(255,255,255,0.7)", fontSize: 13 }}>{customer.taxExempt ? `Yes${customer.taxExemptId ? ` (${customer.taxExemptId})` : ""}` : "No"}</span></div>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <SectionHeader label="Notes & Tags" />
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div><label style={lbl}>Tags (comma-separated)</label><input type="text" value={formData.tags} onChange={e => setFormData({...formData, tags: e.target.value})} style={inp} placeholder="VIP, wholesale, referral" /></div>
                        <div><label style={lbl}>Notes</label><textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} style={{ ...inp, minHeight: 90, resize: "vertical" }} /></div>
                      </div>
                    ) : (
                      <div style={{ background: "#252525", borderRadius: 9, padding: "12px 14px", color: "rgba(255,255,255,0.65)", fontSize: 13, whiteSpace: "pre-wrap", minHeight: 48 }}>
                        {customer.notes || <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>No notes</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─ ACTIVITY ─────────────────────────────────────────── */}
            {activeTab === "activity" && (
              <div style={{ padding: "24px" }}>
                <SectionHeader label="Activity Timeline" />
                {activitiesLoading ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>Loading…</div>
                ) : activities.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}><div style={{ fontSize: 30, marginBottom: 10 }}>📋</div><p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No activity recorded yet</p></div>
                ) : (
                  <div style={{ position: "relative", paddingLeft: 24 }}>
                    <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "rgba(220,38,38,0.1)", borderRadius: 1 }} />
                    {activities.map((a, i) => (
                      <div key={a.id} style={{ position: "relative", marginBottom: i === activities.length - 1 ? 0 : 12 }}>
                        <div style={{ position: "absolute", left: -18, top: 12, width: 10, height: 10, borderRadius: "50%", background: activityColor(a.type), border: "2px solid #1a1a1a", boxShadow: `0 0 0 2px ${activityColor(a.type)}22` }} />
                        <div style={{ background: "#252525", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 9, padding: "11px 13px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ padding: "2px 7px", background: `${activityColor(a.type)}18`, border: `1px solid ${activityColor(a.type)}30`, borderRadius: 10, color: activityColor(a.type), fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{activityLabel(a.type)}</span>
                              {a.estimate && <Link href={`/invoicing/estimates/${a.estimate.id}`} style={{ color: "#dc2626", fontSize: 11 }}>{a.estimate.estimateNumber}</Link>}
                              {a.invoice  && <Link href={`/invoicing/invoices/${a.invoice.id}`}  style={{ color: "#dc2626", fontSize: 11 }}>{a.invoice.invoiceNumber}</Link>}
                              {a.payment  && <span style={{ color: "#10b981", fontSize: 11, fontWeight: 600 }}>{fmtMoney(a.payment.amount)}</span>}
                            </div>
                            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, whiteSpace: "nowrap", marginLeft: 8 }}>{relativeDate(a.createdAt)}</span>
                          </div>
                          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: 0 }}>{a.description}</p>
                          {a.performedBy && <p style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, marginTop: 3, marginBottom: 0 }}>by {a.performedBy.name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ CONTACTS ─────────────────────────────────────────── */}
            {activeTab === "contacts" && (
              <div style={{ padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <SectionHeader label="Additional Contacts" />
                  <button onClick={() => openContactModal()} style={{ padding: "6px 13px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 7, color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>+ Add Contact</button>
                </div>
                {contacts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 30, marginBottom: 10 }}>👤</div>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 14 }}>No additional contacts</p>
                    <button onClick={() => openContactModal()} style={{ padding: "7px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 7, color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Add First Contact</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
                    {contacts.map(c => (
                      <div key={c.id} style={{ background: "#252525", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#dc2626" }}>{`${(c.firstName||"?")[0]}${(c.lastName||"")[0]||""}`.toUpperCase()}</div>
                            <div>
                              <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 13 }}>{c.firstName} {c.lastName}</div>
                              <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                                <span style={{ padding: "1px 5px", background: "rgba(255,255,255,0.05)", borderRadius: 7, color: "rgba(255,255,255,0.38)", fontSize: 9, textTransform: "uppercase" }}>{CONTACT_ROLES.find(r => r.value === c.role)?.label || c.role}</span>
                                {c.isPrimary && <span style={{ padding: "1px 5px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7, color: "#dc2626", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>Primary</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => openContactModal(c)} style={{ padding: "3px 8px", background: "transparent", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 5, color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 11 }}>Edit</button>
                            <button onClick={() => { setPendingDeleteContactId(c.id); showConfirm("Delete Contact", "Are you sure?", () => handleDeleteContact(c.id)); }} style={{ padding: "3px 8px", background: "transparent", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, color: "#dc2626", cursor: "pointer", fontSize: 11 }}>Del</button>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {c.email && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>✉ {c.email}</div>}
                          {c.phone && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>☎ {c.phone}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ PORTAL ───────────────────────────────────────────── */}
            {activeTab === "portal" && (
              <div style={{ padding: "24px", maxWidth: 500 }}>
                <SectionHeader label="Customer Portal Access" />
                <div style={{ background: "#252525", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 20 }}>
                  {customer.portalToken ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 11px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.16)", borderRadius: 7 }}>
                        <span style={{ color: "#10b981" }}>✓</span><span style={{ color: "#10b981", fontSize: 12, fontWeight: 500 }}>Portal access is active</span>
                      </div>
                      <button onClick={() => setShowPortalUrl(!showPortalUrl)} style={{ padding: "8px 13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.65)", cursor: "pointer", fontSize: 12, width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showPortalUrl ? 9 : 13 }}>
                        <span>{showPortalUrl ? "Hide URL" : "Show Portal URL"}</span><span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{showPortalUrl ? "▲" : "▼"}</span>
                      </button>
                      {showPortalUrl && <div style={{ padding: "9px 11px", background: "rgba(0,0,0,0.22)", borderRadius: 7, marginBottom: 13, wordBreak: "break-all", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.05)" }}>{typeof window !== "undefined" ? `${window.location.origin}/portal/${customer.portalToken}` : `/portal/${customer.portalToken}`}</div>}
                      <button onClick={() => showConfirm("Regenerate Token", "This will invalidate the current portal link. Continue?", handleRegenerateToken)} style={{ padding: "7px 13px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7, color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Regenerate Token</button>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: "18px 0 14px" }}>
                      <div style={{ fontSize: 30, marginBottom: 10 }}>🔐</div>
                      <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, marginBottom: 16 }}>No portal access configured</p>
                      <button onClick={() => showConfirm("Generate Token", "Generate a portal access link for this customer?", handleRegenerateToken)} style={{ padding: "8px 20px", background: "#dc2626", border: "none", borderRadius: 7, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Generate Portal Token</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────── */}

      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingContact ? "Edit Contact" : "Add Contact"}</h2>
            <form onSubmit={handleSaveContact}>
              <div className="modal-form-row">
                <div className="modal-form-group"><label>First Name *</label><input type="text" value={contactForm.firstName} onChange={e => setContactForm({...contactForm, firstName: e.target.value})} required /></div>
                <div className="modal-form-group"><label>Last Name *</label><input type="text" value={contactForm.lastName} onChange={e => setContactForm({...contactForm, lastName: e.target.value})} required /></div>
              </div>
              <div className="modal-form-group"><label>Email</label><input type="email" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} /></div>
              <div className="modal-form-group"><label>Phone</label><input type="tel" value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} /></div>
              <div className="modal-form-group"><label>Role</label><select value={contactForm.role} onChange={e => setContactForm({...contactForm, role: e.target.value})}>{CONTACT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
              <div className="modal-form-group"><label className="modal-checkbox-label"><input type="checkbox" checked={contactForm.isPrimary} onChange={e => setContactForm({...contactForm, isPrimary: e.target.checked})} />Primary Contact</label></div>
              <div className="modal-form-group"><label>Notes</label><textarea value={contactForm.notes} onChange={e => setContactForm({...contactForm, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowContactModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving}>{saving ? "Saving…" : editingContact ? "Update" : "Add Contact"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{confirmConfig.title}</h2>
            <p className="modal-confirm-text">{confirmConfig.message}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="modal-btn danger" onClick={confirmConfig.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showUnsavedModal && (
        <div className="modal-overlay" onClick={() => { setShowUnsavedModal(false); setPendingNavigation(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Unsaved Changes</h2>
            <p className="modal-confirm-text">You have unsaved changes that will be lost. Continue?</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowUnsavedModal(false); setPendingNavigation(null); }}>Keep Editing</button>
              <button className="modal-btn danger" onClick={confirmDiscard}>Discard Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
