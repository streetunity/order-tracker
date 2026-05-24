"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
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
  const [showMoreMenu,     setShowMoreMenu]     = useState(false);
  const moreRef = useRef(null);

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

  useEffect(() => {
    function handleClickOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  /**
   * Open the Record Payment modal.
   *
   * When called without an argument (from the header or summary panel),
   * auto-selects the next PENDING schedule item and pre-fills the exact
   * dollar amount so staff never need to calculate or look it up manually.
   *
   * When called with a specific schedule item (from the schedule table row),
   * uses that item directly.
   */
  function openPaymentModal(scheduleItem = null) {
    if (scheduleItem) {
      // Specific schedule row clicked
      setSelectedScheduleItem(scheduleItem);
      setPaymentAmount(scheduleItem.amount.toFixed(2));
    } else {
      // Generic button — auto-select next pending schedule item
      const nextPending = invoice?.paymentSchedule?.find(item => item.status === 'PENDING');
      if (nextPending) {
        setSelectedScheduleItem(nextPending);
        setPaymentAmount(nextPending.amount.toFixed(2));
      } else {
        // No schedule or all items paid — fall back to full balance
        setSelectedScheduleItem(null);
        setPaymentAmount((invoice?.balanceDue || 0).toFixed(2));
      }
    }
    setPaymentMethod("CHECK");
    setPaymentReference("");
    setPaymentNotes("");
    setShowPaymentModal(true);
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
  const sectionStyle = { background: "linear-gradient(180deg,#1d1d1d,#151515 48%,#111)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", padding: 16, marginBottom: 14, boxShadow: "0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.07)" };
  const metricCardStyle = { ...sectionStyle, marginBottom: 0, minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" };

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
    <div style={{ width: 300, minWidth: 300, flexShrink: 0, position: "sticky", top: 60, height: "calc(100vh - 60px)", background: "linear-gradient(180deg,#171717,#111)", borderRight: "1px solid rgba(255,255,255,0.1)", boxShadow: "18px 0 44px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      <style>{`
        .isb-header{padding:18px 14px 12px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;background:radial-gradient(circle at 20% 0%,rgba(220,38,38,0.12),transparent 180px)}
        .isb-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .isb-title h2{font-size:18px;font-weight:700;color:#dc2626;margin:0}
        .isb-new-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;background:linear-gradient(135deg,#dc2626,#991b1b);border:1px solid rgba(255,255,255,0.14);border-radius:7px;color:#fff;font-size:18px;text-decoration:none;line-height:1;cursor:pointer;box-shadow:0 10px 24px rgba(220,38,38,0.22),inset 0 1px 0 rgba(255,255,255,0.18);transition:filter 0.15s,transform 0.15s}
        .isb-new-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .isb-search{width:100%;padding:9px 12px;background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.045));border:1px solid rgba(255,255,255,0.14);border-radius:8px;color:rgba(255,255,255,0.9);font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05)}
        .isb-search:focus{border-color:rgba(220,38,38,0.5)}
        .isb-search::placeholder{color:rgba(255,255,255,0.35)}
        .isb-filters{display:flex;gap:6px}
        .isb-filter-sel{flex:1;padding:6px 8px;background:#242424;border:1px solid rgba(255,255,255,0.13);border-radius:7px;color:rgba(255,255,255,0.85);font-size:12px;outline:none;cursor:pointer}
        .isb-filter-sel:focus{border-color:rgba(220,38,38,0.4)}
        .isb-sort-bar{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0}
        .isb-sort-btn{flex:1;padding:4px 6px;background:transparent;border:1px solid transparent;border-radius:5px;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;text-align:center;transition:all 0.12s}
        .isb-sort-btn:hover{color:rgba(255,255,255,0.7)}
        .isb-sort-btn.active{background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.25);color:#dc2626}
        .isb-list{flex:1;overflow-y:auto;padding:8px}
        .isb-list::-webkit-scrollbar{width:6px}
        .isb-list::-webkit-scrollbar-track{background:transparent}
        .isb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}
        .isb-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.25)}
        .isb-item{padding:12px 12px;cursor:pointer;border:1px solid rgba(255,255,255,0.08);border-left:3px solid transparent;border-radius:8px;transition:background 0.12s,border-color 0.12s,transform 0.12s,box-shadow 0.12s;text-decoration:none;display:block;margin-bottom:8px;background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02));box-shadow:0 10px 24px rgba(0,0,0,0.2)}
        .isb-item:hover{background:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03));border-color:rgba(255,255,255,0.13);transform:translateY(-1px)}
        .isb-item.active{background:linear-gradient(135deg,rgba(220,38,38,0.18),rgba(38,38,38,0.94));border-color:rgba(220,38,38,0.36);border-left-color:#dc2626;box-shadow:0 18px 34px rgba(220,38,38,0.12),0 10px 30px rgba(0,0,0,0.28)}
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
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading invoice…</div>
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
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>{error || "Invoice not found"}</p>
            <Link href="/invoicing/invoices" style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", textDecoration: "none" }}>Back to Invoices</Link>
          </div>
        </div>
      </div>
    </>
  );

  const statusColor = STATUS_COLORS[invoice.status] || STATUS_COLORS.DRAFT;
  const canPay = invoice.balanceDue > 0 && invoice.status !== 'VOID';

  // Derive which schedule item is next — shown in the modal hint
  const nextPendingScheduleItem = invoice.paymentSchedule?.find(item => item.status === 'PENDING');
  const amountPaid = invoice.amountPaid || (invoice.payments || []).reduce((sum, payment) => sum + (payment.amount || 0), 0);
  const daysOverdue = isOverdue ? Math.max(0, Math.ceil((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24))) : 0;
  const paidPct = invoice.total ? Math.min(100, Math.round((amountPaid / invoice.total) * 100)) : 0;
  const dueState = isOverdue
    ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
    : invoice.status === "PAID" ? "Paid in full" : "On schedule";
  const agingBuckets = [
    { label: "0 - 30 Days", max: 30 },
    { label: "31 - 60 Days", max: 60 },
    { label: "61 - 90 Days", max: 90 },
    { label: "91+ Days", max: Infinity },
  ].map((bucket, index, buckets) => {
    const min = index === 0 ? 0 : buckets[index - 1].max + 1;
    const isActiveBucket = invoice.balanceDue > 0 && (!isOverdue ? index === 0 : daysOverdue >= min && daysOverdue <= bucket.max);
    return { ...bucket, value: isActiveBucket ? invoice.balanceDue : 0 };
  });
  const timelineItems = [
    {
      title: isOverdue ? "Invoice Overdue" : invoice.status === "PAID" ? "Invoice Paid" : "Invoice Due",
      detail: isOverdue ? `Invoice is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past due` : dueState,
      date: invoice.dueDate,
      color: isOverdue ? "#ef4444" : "rgba(255,255,255,0.58)",
    },
    {
      title: invoice.lastSentAt ? "Invoice Sent" : "Ready to Send",
      detail: invoice.lastSentAt ? `Sent to ${invoice.customer?.email || "customer"}` : "No send activity recorded",
      date: invoice.lastSentAt,
      color: "rgba(255,255,255,0.58)",
    },
    {
      title: "Invoice Created",
      detail: `By ${invoice.createdBy?.name || "team"}`,
      date: invoice.createdAt,
      color: "rgba(255,255,255,0.45)",
    },
  ];

  return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", paddingTop: 60, minHeight: "100vh", background: "radial-gradient(circle at 18% 0%, rgba(220,38,38,0.11), transparent 420px), radial-gradient(circle at 100% 8%, rgba(255,255,255,0.045), transparent 360px), #0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, minWidth: 0, padding: "16px 18px 48px", overflowX: "hidden" }}>
          <style>{`
            .invoice-back-link{display:inline-flex;align-items:center;gap:6px;color:rgba(255,255,255,0.54);font-size:13px;text-decoration:none;margin-bottom:10px}
            .invoice-back-link:hover{color:#fff}
            .invoice-action-btn{height:38px;padding:0 14px;background:linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.035));border:1px solid rgba(255,255,255,0.14);border-radius:6px;color:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:8px;box-shadow:0 12px 24px rgba(0,0,0,0.24),inset 0 1px 0 rgba(255,255,255,0.08)}
            .invoice-action-primary{background:linear-gradient(180deg,#dc2626,#991b1b);border-color:rgba(255,255,255,0.18);color:#fff;box-shadow:0 14px 28px rgba(220,38,38,0.24),inset 0 1px 0 rgba(255,255,255,0.18)}
            .invoice-action-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:190px;background:#171717;border:1px solid rgba(255,255,255,0.13);border-radius:8px;overflow:hidden;z-index:100;box-shadow:0 22px 48px rgba(0,0,0,0.5)}
            .invoice-action-menu button{width:100%;padding:10px 13px;background:transparent;border:0;color:rgba(255,255,255,0.82);font-size:13px;text-align:left;cursor:pointer}
            .invoice-action-menu button:hover{background:rgba(255,255,255,0.06);color:#fff}
            .invoice-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
            .invoice-insight-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:12px;margin-bottom:12px}
            .invoice-kpi-label{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.58);text-transform:uppercase;letter-spacing:.04em}
            .invoice-kpi-icon{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(220,38,38,0.28);background:rgba(220,38,38,0.08);color:#ef4444}
            .invoice-kpi-value{font-size:22px;font-weight:800;color:#fff;line-height:1.05;margin-top:10px}
            .invoice-kpi-sub{font-size:12px;color:rgba(255,255,255,0.48);margin-top:5px}
            .invoice-icon{min-width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:currentColor}
            .invoice-line-panel{padding:0 !important;overflow:hidden}
            .invoice-line-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.1)}
            .invoice-tabs{display:flex;align-items:center;gap:20px}
            .invoice-tab{height:34px;display:inline-flex;align-items:center;border-bottom:2px solid transparent;color:rgba(255,255,255,0.62);font-size:14px;font-weight:600}
            .invoice-tab.active{color:#fff;border-bottom-color:#dc2626}
            .invoice-line-count{font-size:12px;color:rgba(255,255,255,0.42);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
            .invoice-line-table-wrap{padding:0 18px 16px}
            .invoice-soft-table thead tr{background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))}
            .invoice-soft-table tbody tr{background:rgba(255,255,255,0.025)}
            .invoice-soft-table tbody tr:hover{background:rgba(255,255,255,0.045)}
            @media (max-width: 1280px){.invoice-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.invoice-insight-grid{grid-template-columns:1fr}}
            @media (max-width: 860px){.invoice-kpi-grid{grid-template-columns:1fr}}
          `}</style>

          {/* Header */}
          <div style={{ marginBottom: 14 }}>
            <Link href="/invoicing/invoices" className="invoice-back-link">Back to invoices</Link>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                  <h1 style={{ fontSize: 29, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: 0 }}>{invoice.invoiceNumber}</h1>
                  <span style={{ padding: "4px 12px", background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: 6, color: statusColor.text, fontSize: 12, fontWeight: 500 }}>{invoice.status}</span>
                  {isOverdue && invoice.status !== 'OVERDUE' && <span style={{ padding: "4px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#ef4444", fontSize: 12 }}>Overdue</span>}
                </div>
                <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, margin: 0 }}>{invoice.customer?.companyName || invoice.customer?.company || [invoice.customer?.firstName, invoice.customer?.lastName].filter(Boolean).join(" ") || "Customer"} <span style={{ color: "rgba(255,255,255,0.32)", margin: "0 8px" }}>|</span> Created by {invoice.createdBy?.name} on {formatDate(invoice.createdAt)}</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {canPay && (
                  <button onClick={() => openPaymentModal()} className="invoice-action-btn invoice-action-primary">
                    <span className="invoice-icon">$</span>Record Payment
                  </button>
                )}
                <button onClick={() => { setEmailTo(invoice?.customer?.email || ""); setShowSendModal(true); }} disabled={saving} className="invoice-action-btn">
                  <span className="invoice-icon">&gt;</span>Send
                </button>
                <button onClick={generatingPDF ? null : (invoice?.pdfS3Key ? downloadPDF : generatePDF)} disabled={generatingPDF} className="invoice-action-btn">
                  <span className="invoice-icon">[]</span>{generatingPDF ? "Generating" : "PDF"}
                </button>
                <div style={{ position: "relative" }} ref={moreRef}>
                  <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="invoice-action-btn">
                    <span className="invoice-icon">...</span>More
                  </button>
                  {showMoreMenu && (
                    <div className="invoice-action-menu">
                      {invoice.status === 'DRAFT' && <button onClick={() => { setShowMoreMenu(false); updateStatus('SENT'); }}>Mark as Sent</button>}
                      {invoice.status !== 'VOID' && invoice.amountPaid === 0 && <button onClick={() => { setShowMoreMenu(false); confirmVoidInvoice(); }}>Void Invoice</button>}
                      <button onClick={() => { setShowMoreMenu(false); confirmDeleteInvoice(); }} style={{ color: "#ef4444" }}>Delete Invoice</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>
              {error}
              <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>×</button>
            </div>
          )}

          <div className="invoice-kpi-grid">
            <div style={metricCardStyle}>
              <div className="invoice-kpi-label"><span className="invoice-kpi-icon" style={{ color: "#ef4444" }}>$</span>Balance Due</div>
              <div>
                <div className="invoice-kpi-value">{formatCurrency(invoice.balanceDue)}</div>
                <div className="invoice-kpi-sub">{invoice.balanceDue > 0 ? "Outstanding balance" : "Nothing outstanding"}</div>
              </div>
            </div>
            <div style={metricCardStyle}>
              <div className="invoice-kpi-label"><span className="invoice-kpi-icon">$</span>Amount Paid</div>
              <div>
                <div className="invoice-kpi-value">{formatCurrency(amountPaid)}</div>
                <div className="invoice-kpi-sub">{paidPct}% of {formatCurrency(invoice.total)}</div>
              </div>
            </div>
            <div style={{ ...metricCardStyle, borderColor: isOverdue ? "rgba(239,68,68,0.38)" : "rgba(255,255,255,0.12)" }}>
              <div className="invoice-kpi-label"><span className="invoice-kpi-icon">!</span>Due Date</div>
              <div>
                <div className="invoice-kpi-value" style={{ color: isOverdue ? "#fff" : "#fff", fontSize: 21 }}>{formatDate(invoice.dueDate)}</div>
                <div className="invoice-kpi-sub" style={{ color: isOverdue ? "#ef4444" : "rgba(255,255,255,0.48)" }}>{dueState}</div>
              </div>
            </div>
            <div style={metricCardStyle}>
              <div className="invoice-kpi-label"><span className="invoice-kpi-icon">#</span>Payment Terms</div>
              <div>
                <div className="invoice-kpi-value" style={{ fontSize: 22 }}>{invoice.paymentTerms || "-"}</div>
                <div className="invoice-kpi-sub">{invoice.status === "PAID" ? "Closed" : "Due on receipt terms shown here"}</div>
              </div>
            </div>
          </div>

          <div className="invoice-insight-grid">
            <div style={sectionStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 22 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>Invoice Aging</h2>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>As of {formatDate(new Date())}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>
                {agingBuckets.map(bucket => {
                  const active = bucket.value > 0;
                  return (
                    <div key={bucket.label} style={{ borderLeft: "1px solid rgba(255,255,255,0.09)", paddingLeft: 12 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", marginBottom: 8 }}>{bucket.label}</div>
                      <div style={{ fontSize: 13, color: active ? "#fff" : "rgba(255,255,255,0.45)", marginBottom: 8 }}>{formatCurrency(bucket.value)}</div>
                      <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{ width: active ? "100%" : "0%", height: "100%", borderRadius: 999, background: active ? "linear-gradient(90deg,#dc2626,#ef4444)" : "transparent", boxShadow: active ? "0 0 18px rgba(239,68,68,0.42)" : "none" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ color: "rgba(255,255,255,0.52)" }}>Total Outstanding</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{formatCurrency(invoice.balanceDue)}</span>
              </div>
            </div>

            <div style={sectionStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 18px" }}>Payment Timeline</h2>
              <div style={{ display: "grid", gap: 0 }}>
                {timelineItems.map((item, index) => (
                  <div key={item.title} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 10, paddingBottom: index === timelineItems.length - 1 ? 0 : 16, marginBottom: index === timelineItems.length - 1 ? 0 : 16, borderBottom: index === timelineItems.length - 1 ? "none" : "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${item.color}`, color: item.color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, boxShadow: `0 0 18px ${item.color === "rgba(255,255,255,0.45)" ? "rgba(255,255,255,0.08)" : item.color + "40"}` }}>!</span>
                    <span>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 3 }}>{item.detail}</div>
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.52)", fontSize: 12, textAlign: "right", whiteSpace: "nowrap" }}>{formatDate(item.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
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
              <div className="invoice-line-panel" style={sectionStyle}>
                <div className="invoice-line-head">
                  <div className="invoice-tabs">
                    <span className="invoice-tab active">Line Items</span>
                  </div>
                  <span className="invoice-line-count">{invoice.items?.length || 0} item{invoice.items?.length === 1 ? "" : "s"}</span>
                </div>
                {invoice.items && invoice.items.length > 0 ? (
                  <div className="invoice-line-table-wrap">
                    <table className="invoice-soft-table" style={{ width: "100%", borderCollapse: "collapse" }}>
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
                            <td style={{ padding: "11px 8px" }}>
                              <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>{item.name}</div>
                              {item.sku && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{item.sku}</div>}
                              {item.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, whiteSpace: "pre-wrap" }}>{item.description}</div>}
                            </td>
                            <td style={{ padding: "11px 8px", textAlign: "center", color: "rgba(255,255,255,0.7)" }}>{item.quantity}</td>
                            <td style={{ padding: "11px 8px", textAlign: "right",  color: "rgba(255,255,255,0.7)" }}>{formatCurrency(item.unitPrice)}</td>
                            <td style={{ padding: "11px 8px", textAlign: "right",  fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{formatCurrency(item.amount || item.quantity * item.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.4)" }}>No items in this invoice</div>}
              </div>

              {/* Payment Schedule */}
              {invoice.paymentSchedule && invoice.paymentSchedule.length > 0 && (
                <div style={sectionStyle}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>Payment Schedule</h2>
                  <table className="invoice-soft-table" style={{ width: "100%", borderCollapse: "collapse" }}>
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
                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>{formatCurrency(item.amount)}</td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{ padding: "4px 10px", background: item.status === 'PAID' ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${item.status === 'PAID' ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: 6, color: item.status === 'PAID' ? "#22c55e" : "#f59e0b", fontSize: 12 }}>{item.status}</span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            {item.status !== 'PAID' && (
                              <button
                                onClick={() => openPaymentModal(item)}
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
                  <table className="invoice-soft-table" style={{ width: "100%", borderCollapse: "collapse" }}>
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
                    onClick={() => openPaymentModal()}
                    style={{ marginTop: 16, width: "100%", padding: "11px", background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                  >
                    {nextPendingScheduleItem
                      ? `Record ${nextPendingScheduleItem.description} \u2014 ${formatCurrency(nextPendingScheduleItem.amount)}`
                      : "Record Payment"}
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

      {/* ── Record Payment Modal ── */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => { setShowPaymentModal(false); setSelectedScheduleItem(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Record Payment</h2>

            {/* Show which schedule item this is for */}
            {selectedScheduleItem && (
              <div style={{ padding: "12px 16px", marginBottom: 16, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>Applying to schedule item</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{selectedScheduleItem.description}</div>
                <div style={{ fontSize: 13, color: "#f59e0b", marginTop: 2 }}>Expected: {formatCurrency(selectedScheduleItem.amount)}</div>
              </div>
            )}

            <div className="modal-form-group">
              <label>Amount *</label>
              <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" step="0.01" min="0.01" />
              <span className="modal-hint">Balance due: {formatCurrency(invoice.balanceDue)}</span>
            </div>
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
