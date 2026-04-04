"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

const STATUS_COLORS = {
  DRAFT:   { bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af' },
  SENT:    { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  text: '#3b82f6' },
  VIEWED:  { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  text: '#a855f7' },
  PARTIAL: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  text: '#f59e0b' },
  PAID:    { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e' },
  OVERDUE: { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444' },
  VOID:    { bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.3)', text: '#6b7280' },
};

const STATUS_DOT = {
  DRAFT: '#9ca3af', SENT: '#3b82f6', VIEWED: '#a855f7',
  PARTIAL: '#f59e0b', PAID: '#22c55e', OVERDUE: '#ef4444', VOID: '#6b7280',
};

export default function InvoiceDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [generatingPDF,  setGeneratingPDF]  = useState(false);
  const [sendingEmail,   setSendingEmail]   = useState(false);
  const [showSendModal,  setShowSendModal]  = useState(false);
  const [emailTo,        setEmailTo]        = useState("");
  const [emailCc,        setEmailCc]        = useState("");
  const [emailMessage,   setEmailMessage]   = useState("");
  const [emailHistory,   setEmailHistory]   = useState([]);
  const [showEmailHistory, setShowEmailHistory] = useState(false);

  // Manual payment state
  const [showPaymentModal,     setShowPaymentModal]     = useState(false);
  const [paymentAmount,        setPaymentAmount]        = useState("");
  const [paymentMethod,        setPaymentMethod]        = useState("CHECK");
  const [paymentReference,     setPaymentReference]     = useState("");
  const [paymentNotes,         setPaymentNotes]         = useState("");
  const [selectedScheduleItem, setSelectedScheduleItem] = useState(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig,    setConfirmConfig]    = useState({ title: "", message: "", onConfirm: null });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage,   setSuccessMessage]   = useState("");

  // Sidebar state
  const [allInvoices,    setAllInvoices]    = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [sidebarSearch,  setSidebarSearch]  = useState("");
  const [sidebarStatus,  setSidebarStatus]  = useState("all");
  const [sidebarSortBy,  setSidebarSortBy]  = useState("date");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadInvoice();
    loadAllInvoices();
  }, [user, router, id]);

  async function loadAllInvoices() {
    setSidebarLoading(true);
    try {
      const r = await fetch("/api/invoices", { headers: getAuthHeaders() });
      if (r.ok) {
        const d = await r.json();
        setAllInvoices(Array.isArray(d) ? d : (d.invoices || []));
      }
    } catch {}
    finally { setSidebarLoading(false); }
  }

  async function loadInvoice() {
    try {
      const res = await fetch(`/api/invoices/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 404) { setError("Invoice not found"); setLoading(false); return; }
        throw new Error("Failed to load invoice");
      }
      setInvoice(await res.json());
    } catch { setError("Failed to load invoice"); }
    finally { setLoading(false); }
  }

  async function generatePDF() {
    setGeneratingPDF(true); setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/generate-pdf`, { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to generate PDF");
      const data = await res.json();
      setInvoice(data.invoice);
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank');
    } catch (e) { setError(e.message); }
    finally { setGeneratingPDF(false); }
  }

  async function downloadPDF() {
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`, { headers: getAuthHeaders() });
      if (!res.ok) { await generatePDF(); return; }
      const data = await res.json();
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank');
    } catch (e) { setError(e.message); }
  }

  async function sendInvoice() {
    if (!emailTo) { setError("Recipient email is required"); return; }
    setSendingEmail(true); setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          toEmail: emailTo,
          ccEmails: emailCc ? emailCc.split(',').map(e => e.trim()).filter(e => e) : [],
          customMessage: emailMessage,
          regeneratePDF: !invoice?.pdfS3Key,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to send invoice"); }
      const data = await res.json();
      setInvoice(data.invoice);
      setShowSendModal(false); setEmailTo(""); setEmailCc(""); setEmailMessage("");
      setSuccessMessage("Invoice sent successfully!"); setShowSuccessModal(true);
    } catch (e) { setError(e.message); }
    finally { setSendingEmail(false); }
  }

  async function loadEmailHistory() {
    try {
      const r = await fetch(`/api/invoices/${id}/email-history`, { headers: getAuthHeaders() });
      if (r.ok) setEmailHistory(await r.json());
    } catch {}
  }

  async function recordPayment() {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) { setError("Valid payment amount is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          paymentMethod,
          checkNumber:     paymentMethod === "CHECK" ? paymentReference : null,
          wireReference:   paymentMethod === "WIRE"  ? paymentReference : null,
          referenceNumber: !["CHECK","WIRE"].includes(paymentMethod) ? paymentReference : null,
          notes: paymentNotes,
          scheduleItemId: selectedScheduleItem?.id,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to record payment"); }
      const data = await res.json();
      setInvoice(data.invoice);
      setShowPaymentModal(false);
      setPaymentAmount(""); setPaymentMethod("CHECK"); setPaymentReference(""); setPaymentNotes(""); setSelectedScheduleItem(null);
      setSuccessMessage("Payment recorded successfully!"); setShowSuccessModal(true);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function showConfirm(title, message, onConfirm) { setConfirmConfig({ title, message, onConfirm }); setShowConfirmModal(true); }
  function confirmVoidInvoice()   { showConfirm("Void Invoice",   "Are you sure you want to void this invoice? This cannot be undone.",           () => voidInvoice()); }
  function confirmDeleteInvoice() { showConfirm("Delete Invoice", "Are you sure you want to delete this invoice? This action cannot be undone.", () => deleteInvoice()); }

  async function updateStatus(newStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setInvoice(await res.json());
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function voidInvoice() {
    setShowConfirmModal(false); setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}/void`, { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to void invoice"); }
      setInvoice(await res.json());
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteInvoice() {
    setShowConfirmModal(false); setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to delete invoice");
      router.push("/invoicing/invoices");
    } catch (e) { setError(e.message); setSaving(false); }
  }

  const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  const formatDate     = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '\u2014';
  const isOverdue = invoice?.dueDate && new Date(invoice.dueDate) < new Date() && !['PAID','VOID'].includes(invoice?.status);

  const inputStyle   = { padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px", width: "100%", boxSizing: "border-box" };
  const sectionStyle = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: 24, marginBottom: 24 };

  if (authLoading || !user) return null;

  // Sidebar computed
  const filteredSidebarInvoices = allInvoices
    .filter(inv => {
      if (sidebarStatus !== "all" && inv.status !== sidebarStatus) return false;
      if (sidebarSearch.trim()) {
        const q = sidebarSearch.toLowerCase();
        return (
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          inv.customer?.firstName?.toLowerCase().includes(q) ||
          inv.customer?.lastName?.toLowerCase().includes(q) ||
          inv.customer?.companyName?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sidebarSortBy === "amount")  return (b.total || 0) - (a.total || 0);
      if (sidebarSortBy === "balance") return (b.balanceDue || 0) - (a.balanceDue || 0);
      if (sidebarSortBy === "due")     return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const sidebarJSX = (
    <div style={{ width: 300, minWidth: 300, flexShrink: 0, position: "sticky", top: 60, height: "calc(100vh - 60px)", background: "#141414", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      <style>{`
        .isb-header{padding:16px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0}
        .isb-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .isb-title h2{font-size:18px;font-weight:700;color:#dc2626;margin:0}
        .isb-new-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);border-radius:6px;color:#dc2626;font-size:18px;text-decoration:none;line-height:1;cursor:pointer;transition:background 0.15s}
        .isb-new-btn:hover{background:rgba(220,38,38,0.22)}
        .isb-search{width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:rgba(255,255,255,0.9);font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px}
        .isb-search:focus{border-color:rgba(220,38,38,0.5)}
        .isb-search::placeholder{color:rgba(255,255,255,0.35)}
        .isb-filters{display:flex;gap:6px}
        .isb-filter-sel{flex:1;padding:5px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.8);font-size:12px;outline:none;cursor:pointer}
        .isb-filter-sel:focus{border-color:rgba(220,38,38,0.4)}
        .isb-sort-bar{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0}
        .isb-sort-btn{flex:1;padding:4px 6px;background:transparent;border:1px solid transparent;border-radius:5px;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;text-align:center;transition:all 0.12s}
        .isb-sort-btn:hover{color:rgba(255,255,255,0.7)}
        .isb-sort-btn.active{background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.25);color:#dc2626}
        .isb-list{flex:1;overflow-y:auto;padding:6px 0}
        .isb-list::-webkit-scrollbar{width:6px}
        .isb-list::-webkit-scrollbar-track{background:transparent}
        .isb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}
        .isb-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.25)}
        .isb-item{padding:10px 14px;cursor:pointer;border-left:3px solid transparent;transition:background 0.12s;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;display:block}
        .isb-item:hover{background:rgba(255,255,255,0.04)}
        .isb-item.active{background:rgba(220,38,38,0.08);border-left-color:#dc2626}
        .isb-item-num{font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace}
        .isb-item.active .isb-item-num{color:#fff}
        .isb-item-cust{font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .isb-item-foot{display:flex;align-items:center;justify-content:space-between;margin-top:3px}
        .isb-item-bal{font-size:11px;color:rgba(255,255,255,0.45)}
        .isb-item-bal.owed{color:#f59e0b}
        .isb-item-status{display:flex;align-items:center;gap:3px;font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.3px}
        .isb-count{padding:6px 14px;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0}
      `}</style>

      <div className="isb-header">
        <div className="isb-title">
          <h2>Invoices</h2>
          <Link href="/invoicing/invoices/new" className="isb-new-btn" title="New Invoice">+</Link>
        </div>
        <input type="text" placeholder="Search invoices..." value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} className="isb-search" />
        <div className="isb-filters">
          <select value={sidebarStatus} onChange={e => setSidebarStatus(e.target.value)} className="isb-filter-sel">
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="VIEWED">Viewed</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="VOID">Void</option>
          </select>
        </div>
      </div>

      <div className="isb-sort-bar">
        {[["date","Date"],["amount","Amount"],["balance","Balance"],["due","Due"]].map(([key,label]) => (
          <button key={key} className={`isb-sort-btn${sidebarSortBy === key ? ' active' : ''}`} onClick={() => setSidebarSortBy(key)}>{label}</button>
        ))}
      </div>

      <div className="isb-list">
        {sidebarLoading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading...</div>
        ) : filteredSidebarInvoices.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No invoices</div>
        ) : filteredSidebarInvoices.map(inv => {
          const isActive  = inv.id === id;
          const custName  = inv.customer?.companyName || [inv.customer?.firstName, inv.customer?.lastName].filter(Boolean).join(" ") || "No customer";
          const dot       = STATUS_DOT[inv.status] || "#9ca3af";
          const balOwed   = (inv.balanceDue || 0) > 0;
          return (
            <Link key={inv.id} href={`/invoicing/invoices/${inv.id}`} className={`isb-item${isActive ? ' active' : ''}`}>
              <div className="isb-item-num">{inv.invoiceNumber}</div>
              <div className="isb-item-cust">{custName}</div>
              <div className="isb-item-foot">
                <span className={`isb-item-bal${balOwed ? ' owed' : ''}`}>
                  {balOwed ? `${formatCurrency(inv.balanceDue)} due` : formatCurrency(inv.total)}
                </span>
                <span className="isb-item-status">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />
                  {inv.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="isb-count">{filteredSidebarInvoices.length} invoice{filteredSidebarInvoices.length !== 1 ? 's' : ''}</div>
    </div>
  );

  if (loading) return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: 60, minHeight: "100vh", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading invoice\u2026</div>
        </div>
      </div>
    </>
  );

  if (!invoice) return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: 60, minHeight: "100vh", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>\ud83d\udcca</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>{error || "Invoice not found"}</p>
            <Link href="/invoicing/invoices" style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", textDecoration: "none" }}>Back to Invoices</Link>
          </div>
        </div>
      </div>
    </>
  );

  const statusColor = STATUS_COLORS[invoice.status] || STATUS_COLORS.DRAFT;
  const canPay = invoice.balanceDue > 0 && invoice.status !== 'VOID';

  return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: 60, minHeight: "100vh", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, minWidth: 0, padding: "24px 28px 60px", overflowX: "hidden" }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                  <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626", margin: 0 }}>{invoice.invoiceNumber}</h1>
                  <span style={{ padding: "4px 12px", background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: 6, color: statusColor.text, fontSize: 12, fontWeight: 500 }}>{invoice.status}</span>
                  {isOverdue && invoice.status !== 'OVERDUE' && <span style={{ padding: "4px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#ef4444", fontSize: 12 }}>Overdue</span>}
                </div>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Created by {invoice.createdBy?.name} on {formatDate(invoice.createdAt)}</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {invoice.status === 'DRAFT' && (
                  <button onClick={() => updateStatus('SENT')} disabled={saving} style={{ padding: "8px 16px", background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", borderRadius: 8, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>Mark as Sent</button>
                )}
                <button onClick={generatingPDF ? null : (invoice?.pdfS3Key ? downloadPDF : generatePDF)} disabled={generatingPDF} style={{ padding: "8px 16px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, color: "#3b82f6", cursor: generatingPDF ? "not-allowed" : "pointer", fontSize: 14 }}>
                  {generatingPDF ? "Generating..." : (invoice?.pdfS3Key ? "View PDF" : "Generate PDF")}
                </button>
                <button onClick={() => { setEmailTo(invoice?.customer?.email || ""); setShowSendModal(true); }} disabled={saving} style={{ padding: "8px 16px", background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", borderRadius: 8, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>Send to Customer</button>
                {canPay && (
                  <button onClick={() => { setPaymentAmount(invoice.balanceDue.toString()); setShowPaymentModal(true); }} style={{ padding: "8px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, color: "#f59e0b", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Record Payment</button>
                )}
                {invoice.status !== 'VOID' && invoice.amountPaid === 0 && (
                  <button onClick={confirmVoidInvoice} disabled={saving} style={{ padding: "8px 16px", background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 8, color: "#6b7280", cursor: saving ? "not-allowed" : "pointer", fontSize: 14 }}>Void</button>
                )}
                <button onClick={confirmDeleteInvoice} disabled={saving} style={{ padding: "8px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", cursor: saving ? "not-allowed" : "pointer", fontSize: 14 }}>Delete</button>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>
              {error}
              <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>\u00d7</button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
            <div>
              {/* Bill To */}
              <div style={sectionStyle}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>Bill To</h2>
                {invoice.customer ? (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>{invoice.customer.firstName} {invoice.customer.lastName}</div>
                    {(invoice.customer.company || invoice.customer.companyName) && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{invoice.customer.company || invoice.customer.companyName}</div>}
                    {invoice.customer.email && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{invoice.customer.email}</div>}
                  </div>
                ) : <div style={{ color: "rgba(255,255,255,0.4)" }}>No customer assigned</div>}
              </div>

              {/* Line Items */}
              <div style={sectionStyle}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>Line Items ({invoice.items?.length || 0})</h2>
                {invoice.items && invoice.items.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <th style={{ padding: "8px", textAlign: "left",   fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Item</th>
                        <th style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", width: 80  }}>Qty</th>
                        <th style={{ padding: "8px", textAlign: "right",  fontSize: 12, color: "rgba(255,255,255,0.5)", width: 100 }}>Price</th>
                        <th style={{ padding: "8px", textAlign: "right",  fontSize: 12, color: "rgba(255,255,255,0.5)", width: 100 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map(item => (
                        <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "12px 8px" }}>
                            <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{item.name}</div>
                            {item.sku && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{item.sku}</div>}
                            {item.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, whiteSpace: "pre-wrap" }}>{item.description}</div>}
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center", color: "rgba(255,255,255,0.7)" }}>{item.quantity}</td>
                          <td style={{ padding: "12px 8px", textAlign: "right",  color: "rgba(255,255,255,0.7)" }}>{formatCurrency(item.unitPrice)}</td>
                          <td style={{ padding: "12px 8px", textAlign: "right",  fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{formatCurrency(item.amount || item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>No items in this invoice</div>}
              </div>

              {/* Payment Schedule */}
              {invoice.paymentSchedule && invoice.paymentSchedule.length > 0 && (
                <div style={sectionStyle}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>Payment Schedule</h2>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <th style={{ padding: "8px", textAlign: "left",   fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Description</th>
                        <th style={{ padding: "8px", textAlign: "right",  fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Amount</th>
                        <th style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Status</th>
                        <th style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.paymentSchedule.map(item => (
                        <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.9)", whiteSpace: "pre-wrap" }}>
                            {item.description}
                            {item.dueDate && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Due: {formatDate(item.dueDate)}</div>}
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{formatCurrency(item.amount)}</td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{ padding: "4px 10px", background: item.status === 'PAID' ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${item.status === 'PAID' ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: 6, color: item.status === 'PAID' ? "#22c55e" : "#f59e0b", fontSize: 12 }}>{item.status}</span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            {item.status !== 'PAID' && (
                              <button
                                onClick={() => { setSelectedScheduleItem(item); setPaymentAmount(item.amount.toString()); setShowPaymentModal(true); }}
                                style={{ padding: "4px 10px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, color: "#f59e0b", cursor: "pointer", fontSize: 12 }}
                              >
                                Record Payment
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payments History */}
              {invoice.payments && invoice.payments.length > 0 && (
                <div style={sectionStyle}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>Payments</h2>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <th style={{ padding: "8px", textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Date</th>
                        <th style={{ padding: "8px", textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Method</th>
                        <th style={{ padding: "8px", textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Reference</th>
                        <th style={{ padding: "8px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.payments.map(payment => (
                        <tr key={payment.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.7)" }}>{formatDate(payment.paymentDate)}</td>
                          <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.9)" }}>{payment.paymentMethod}</td>
                          <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.5)" }}>
                            {payment.paymentNumber}
                            {(payment.checkNumber || payment.wireReference || payment.referenceNumber || payment.nextnpTransactionId) && (
                              <span style={{ marginLeft: 8, fontSize: 11, fontFamily: "monospace" }}>({payment.nextnpTransactionId || payment.checkNumber || payment.wireReference || payment.referenceNumber})</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 600, color: "#22c55e" }}>{formatCurrency(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes */}
              {(invoice.notes || invoice.internalNotes || invoice.termsConditions) && (
                <div style={sectionStyle}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>Notes</h2>
                  {invoice.notes && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Customer Notes:</div><div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{invoice.notes}</div></div>}
                  {invoice.internalNotes && <div style={{ marginBottom: 16, padding: 12, background: "rgba(234,179,8,0.1)", borderRadius: 6 }}><div style={{ fontSize: 12, color: "#eab308", marginBottom: 4 }}>Internal Notes:</div><div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{invoice.internalNotes}</div></div>}
                  {invoice.termsConditions && <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Terms & Conditions:</div><div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, whiteSpace: "pre-wrap" }}>{invoice.termsConditions}</div></div>}
                </div>
              )}
            </div>

            {/* Right column */}
            <div>
              <div style={sectionStyle}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>Dates & Tracking</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Invoice Date</div><div style={{ color: "rgba(255,255,255,0.9)" }}>{formatDate(invoice.invoiceDate)}</div></div>
                  <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Due Date</div><div style={{ color: isOverdue ? "#ef4444" : "rgba(255,255,255,0.9)" }}>{formatDate(invoice.dueDate)}{isOverdue && " (Overdue)"}</div></div>
                  <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Payment Terms</div><div style={{ color: "rgba(255,255,255,0.9)" }}>{invoice.paymentTerms}</div></div>
                  {invoice.lastSentAt   && <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Last Sent</div><div style={{ color: "#3b82f6" }}>{formatDate(invoice.lastSentAt)}</div></div>}
                  {invoice.lastViewedAt && <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Last Viewed</div><div style={{ color: "#a855f7" }}>{formatDate(invoice.lastViewedAt)}</div></div>}
                  {invoice.viewCount > 0 && <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Views</div><div style={{ color: "rgba(255,255,255,0.9)" }}>{invoice.viewCount}</div></div>}
                </div>
              </div>

              <div style={sectionStyle}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>Summary</h2>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Subtotal:</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.subtotal)}</span></div>
                  {invoice.discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Discount:</span><span style={{ color: "#22c55e" }}>-{formatCurrency(invoice.discountAmount)}</span></div>}
                  {invoice.taxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Tax ({invoice.taxRate}%):</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.taxAmount)}</span></div>}
                  {invoice.shippingAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Shipping:</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.shippingAmount)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}><span style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>Total:</span><span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.total)}</span></div>
                  {invoice.amountPaid > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#22c55e" }}>Paid:</span><span style={{ color: "#22c55e" }}>-{formatCurrency(invoice.amountPaid)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}><span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 16 }}>Balance Due:</span><span style={{ fontWeight: 700, color: invoice.balanceDue > 0 ? "#dc2626" : "#22c55e", fontSize: 18 }}>{formatCurrency(invoice.balanceDue)}</span></div>
                </div>
                {canPay && (
                  <button
                    onClick={() => { setPaymentAmount(invoice.balanceDue.toString()); setShowPaymentModal(true); }}
                    style={{ marginTop: 16, width: "100%", padding: "11px", background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                  >
                    Record Payment
                  </button>
                )}
              </div>

              {invoice.estimate && (
                <div style={sectionStyle}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>Source Estimate</h2>
                  <Link href={`/invoicing/estimates/${invoice.estimate.id}`} style={{ display: "block", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, textDecoration: "none" }}>
                    <div style={{ color: "#dc2626", fontFamily: "monospace" }}>{invoice.estimate.estimateNumber}</div>
                  </Link>
                </div>
              )}

              <div style={sectionStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", margin: 0 }}>Email History</h2>
                  {!showEmailHistory && <button onClick={() => { setShowEmailHistory(true); loadEmailHistory(); }} style={{ padding: "4px 8px", background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Show</button>}
                </div>
                {showEmailHistory && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {emailHistory.length === 0
                      ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No emails sent yet</div>
                      : emailHistory.map(email => (
                        <div key={email.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>{email.toEmail}</div>
                            {email.openedAt && <span style={{ padding: "2px 6px", background: "rgba(34,197,94,0.1)", borderRadius: 4, fontSize: 10, color: "#22c55e" }}>Opened</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Sent {formatDateTime(email.sentAt)}</div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Send Modal ── */}
      {showSendModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Send Invoice</h2>
            <div className="modal-form-group"><label>To *</label><input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@example.com" /></div>
            <div className="modal-form-group"><label>CC (comma-separated)</label><input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="copy@example.com" /></div>
            <div className="modal-form-group"><label>Message (optional)</label><textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} placeholder="Add a personal message..." rows={4} /></div>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowSendModal(false); setError(""); }}>Cancel</button>
              <button className="modal-btn primary" onClick={sendInvoice} disabled={sendingEmail || !emailTo}>{sendingEmail ? "Sending..." : "Send Invoice"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Manual Payment Modal ── */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => { setShowPaymentModal(false); setSelectedScheduleItem(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Record Payment</h2>
            {selectedScheduleItem && (
              <div style={{ padding: "12px 16px", marginBottom: 16, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: "#3b82f6" }}>Recording payment for: <strong>{selectedScheduleItem.description}</strong></div>
              </div>
            )}
            <div className="modal-form-group"><label>Amount *</label><input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" step="0.01" min="0.01" /><span className="modal-hint">Balance due: {formatCurrency(invoice.balanceDue)}</span></div>
            <div className="modal-form-group"><label>Payment Method *</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="CHECK">Check</option><option value="WIRE">Wire Transfer</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></div>
            <div className="modal-form-group"><label>{paymentMethod === "CHECK" ? "Check Number" : paymentMethod === "WIRE" ? "Wire Reference" : "Reference Number"}</label><input type="text" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Optional" /></div>
            <div className="modal-form-group"><label>Notes</label><textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Optional notes..." rows={3} /></div>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowPaymentModal(false); setSelectedScheduleItem(null); setError(""); }}>Cancel</button>
              <button className="modal-btn primary" onClick={recordPayment} disabled={saving || !paymentAmount}>{saving ? "Recording..." : "Record Payment"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
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

      {/* ── Success Modal ── */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Success</h2>
            <div className="modal-success">{successMessage}</div>
            <div className="modal-actions"><button className="modal-btn primary" onClick={() => setShowSuccessModal(false)}>OK</button></div>
          </div>
        </div>
      )}
    </>
  );
}
