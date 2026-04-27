"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Extracted components
import {
  RejectPaymentModal,
  UnflagModal,
  DeleteOrphanModal,
  RecalculateModal,
  UnapproveModal,
  UnpayModal,
  PdfReportModal,
  NotificationToast
} from "./CommissionModals";
import BulkActionsBar from "./BulkActionsBar";

export default function CommissionsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedPayouts, setSelectedPayouts] = useState(new Set());
  const [payoutGroups, setPayoutGroups] = useState([]);
  const [flaggedCommissions, setFlaggedCommissions] = useState([]);
  const [approvedPayouts, setApprovedPayouts] = useState([]);
  const [recentlyPaid, setRecentlyPaid] = useState([]);
  const [orphanedCommissions, setOrphanedCommissions] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [paymentMethod, setPaymentMethod] = useState("Check");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [stageSettings, setStageSettings] = useState([]);
  const [paidFilterSalesRep, setPaidFilterSalesRep] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectPayoutId, setRejectPayoutId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showUnflagModal, setShowUnflagModal] = useState(false);
  const [unflagCommissionId, setUnflagCommissionId] = useState(null);
  const [unflagNotes, setUnflagNotes] = useState("");
  const [showDeleteOrphanModal, setShowDeleteOrphanModal] = useState(false);
  const [deleteOrphanId, setDeleteOrphanId] = useState(null);
  const [showRecalculateModal, setShowRecalculateModal] = useState(false);
  const [recalculateCommissionId, setRecalculateCommissionId] = useState(null);
  const [showUnapproveModal, setShowUnapproveModal] = useState(false);
  const [unapprovePayoutId, setUnapprovePayoutId] = useState(null);
  const [showUnpayModal, setShowUnpayModal] = useState(false);
  const [unpayPayoutId, setUnpayPayoutId] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfAgent, setPdfAgent] = useState("");
  const [pdfStartDate, setPdfStartDate] = useState("");
  const [pdfEndDate, setPdfEndDate] = useState("");
  const [availableAgents, setAvailableAgents] = useState([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState("success");

  const showNotif = (message, type = "success") => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  useEffect(() => {
    if (!user) { router.push("/login"); }
    else if (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT") { router.push("/my-commissions"); }
  }, [user, router]);

  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) fetchStageSettings();
  }, [user]);

  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) fetchData();
  }, [user, activeTab]);

  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) fetchAvailableAgents();
  }, [user]);

  useEffect(() => { setSelectedPayouts(new Set()); }, [activeTab]);

  const fetchStageSettings = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/commission-settings/stages", { headers: getAuthHeaders(), cache: "no-store" });
      if (res.ok) { const data = await res.json(); setStageSettings(data.sort((a, b) => a.sortOrder - b.sortOrder)); }
    } catch (error) {
      console.error("Error fetching stage settings:", error);
      setStageSettings([{ stage: "SHIPPING", percentage: 50 }, { stage: "DELIVERED", percentage: 50 }]);
    }
  };

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      switch (activeTab) {
        case "pending":   { const r = await fetch("/api/commissions/payouts/pending", { headers, cache: "no-store" }); if (r.ok) setPayoutGroups(await r.json()); break; }
        case "flagged":   { const r = await fetch("/api/commissions/flagged", { headers, cache: "no-store" }); if (r.ok) setFlaggedCommissions(await r.json()); break; }
        case "approved":  { const r = await fetch("/api/commissions/approved", { headers, cache: "no-store" }); if (r.ok) setApprovedPayouts(await r.json()); break; }
        case "paid":      { const r = await fetch("/api/commissions/paid?limit=50", { headers, cache: "no-store" }); if (r.ok) setRecentlyPaid(await r.json()); break; }
        case "orphaned":  { const r = await fetch("/api/commissions/orphaned", { headers, cache: "no-store" }); if (r.ok) setOrphanedCommissions(await r.json()); break; }
        case "settings":  if (user.role === "SUPER_ADMIN") router.push("/admin/commission-settings"); break;
      }
    } catch (error) { console.error("Error fetching data:", error); }
    finally { setLoading(false); }
  };

  const handleApprovePayout = async (payoutId) => {
    try {
      const res = await fetch(`/api/commissions/payouts/${payoutId}/approve`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ approvalNotes }) });
      if (res.ok) {
        setPayoutGroups(prev => prev.map(g => ({ ...g, payouts: g.payouts.filter(p => p.id !== payoutId), total: g.payouts.filter(p => p.id !== payoutId).reduce((s, p) => s + p.amount, 0) })).filter(g => g.payouts.length > 0));
        setSelectedPayouts(prev => { const s = new Set(prev); s.delete(payoutId); return s; });
      } else { showNotif(`Failed to approve payout: ${await res.text()}`, "error"); }
    } catch (e) { showNotif("Error approving payout", "error"); }
  };

  const handleRejectPayout = (id) => { setRejectPayoutId(id); setRejectionReason(""); setShowRejectModal(true); };

  const executeReject = async () => {
    if (!rejectionReason || rejectionReason.trim().length < 10) return;
    try {
      const res = await fetch(`/api/commissions/payouts/${rejectPayoutId}/reject`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ rejectionReason: rejectionReason.trim() }) });
      if (res.ok) {
        setPayoutGroups(prev => prev.map(g => ({ ...g, payouts: g.payouts.filter(p => p.id !== rejectPayoutId), total: g.payouts.filter(p => p.id !== rejectPayoutId).reduce((s, p) => s + p.amount, 0) })).filter(g => g.payouts.length > 0));
        setSelectedPayouts(prev => { const s = new Set(prev); s.delete(rejectPayoutId); return s; });
        showNotif("Payment denied - moved to Flagged tab for review");
        setShowRejectModal(false); setRejectPayoutId(null); setRejectionReason("");
      } else { showNotif("Failed to reject payout", "error"); }
    } catch (e) { showNotif("Error rejecting payout", "error"); }
  };

  const handleBulkApprove = async () => {
    if (selectedPayouts.size === 0) { showNotif("Please select payouts to approve", "error"); return; }
    try {
      const res = await fetch("/api/commissions/payouts/bulk-approve", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ payoutIds: Array.from(selectedPayouts), approvalNotes }) });
      if (res.ok) {
        const result = await res.json();
        const ids = Array.from(selectedPayouts);
        setPayoutGroups(prev => prev.map(g => ({ ...g, payouts: g.payouts.filter(p => !ids.includes(p.id)), total: g.payouts.filter(p => !ids.includes(p.id)).reduce((s, p) => s + p.amount, 0) })).filter(g => g.payouts.length > 0));
        setSelectedPayouts(new Set());
        showNotif(`Approved ${result.updated} payouts`);
      } else { showNotif("Failed to bulk approve payouts", "error"); }
    } catch (e) { showNotif("Error bulk approving payouts", "error"); }
  };

  const handleUnapprove    = (id) => { setUnapprovePayoutId(id); setShowUnapproveModal(true); };
  const handleUnpay        = (id) => { setUnpayPayoutId(id); setShowUnpayModal(true); };
  const handleRecalculate  = (id) => { setRecalculateCommissionId(id); setShowRecalculateModal(true); };
  const handleUnflag       = (id) => { setUnflagCommissionId(id); setUnflagNotes(""); setShowUnflagModal(true); };
  const handleDeleteOrphanedCommission = (id) => { setDeleteOrphanId(id); setShowDeleteOrphanModal(true); };

  const executeUnapprove = async () => {
    try {
      const res = await fetch(`/api/commissions/payouts/${unapprovePayoutId}/unapprove`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() } });
      if (res.ok) { setApprovedPayouts(prev => prev.filter(p => p.id !== unapprovePayoutId)); setSelectedPayouts(prev => { const s = new Set(prev); s.delete(unapprovePayoutId); return s; }); setShowUnapproveModal(false); setUnapprovePayoutId(null); }
      else { const e = await res.json().catch(() => ({})); showNotif(`Failed to unapprove: ${e.error || 'Unknown error'}`, "error"); }
    } catch (e) { showNotif("Error unapproving payout", "error"); }
  };

  const executeUnpay = async () => {
    try {
      const res = await fetch(`/api/commissions/payouts/${unpayPayoutId}/unpay`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() } });
      if (res.ok) { setRecentlyPaid(prev => prev.filter(p => p.id !== unpayPayoutId)); showNotif("Payment moved back to approved status"); setShowUnpayModal(false); setUnpayPayoutId(null); }
      else { const e = await res.json().catch(() => ({})); showNotif(`Failed to unpay: ${e.error || 'Unknown error'}`, "error"); }
    } catch (e) { showNotif("Error unpaying payout", "error"); }
  };

  const handleMarkAsPaid = async (payoutId) => {
    try {
      const res = await fetch(`/api/commissions/payouts/${payoutId}/pay`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ paymentMethod, paymentNotes }) });
      if (res.ok) { showNotif("Payment marked as complete"); fetchData(); }
      else { showNotif("Failed to mark as paid", "error"); }
    } catch (e) { showNotif("Error marking as paid", "error"); }
  };

  const handleBulkPay = async () => {
    if (selectedPayouts.size === 0) { showNotif("Please select payouts to mark as paid", "error"); return; }
    try {
      const res = await fetch("/api/commissions/payouts/bulk-pay", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ payoutIds: Array.from(selectedPayouts), paymentMethod, paymentNotes }) });
      if (res.ok) { const r = await res.json(); showNotif(`Marked ${r.paid} payouts as paid`); setSelectedPayouts(new Set()); fetchData(); }
      else { showNotif("Failed to bulk pay", "error"); }
    } catch (e) { showNotif("Error bulk paying payouts", "error"); }
  };

  const executeDeleteOrphan = async () => {
    try {
      const res = await fetch(`/api/commissions/${deleteOrphanId}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) { setOrphanedCommissions(prev => prev.filter(c => c.id !== deleteOrphanId)); setShowDeleteOrphanModal(false); setDeleteOrphanId(null); }
      else { const e = await res.json(); showNotif(e.message || "Failed to delete commission", "error"); }
    } catch (e) { showNotif("Error deleting commission", "error"); }
  };

  const executeRecalculate = async () => {
    try {
      const res = await fetch(`/api/commissions/${recalculateCommissionId}/recalculate`, { method: "POST", headers: getAuthHeaders() });
      if (res.ok) { setShowRecalculateModal(false); setRecalculateCommissionId(null); fetchData(); }
      else { showNotif("Failed to recalculate commission", "error"); }
    } catch (e) { showNotif("Error recalculating commission", "error"); }
  };

  const executeUnflag = async () => {
    try {
      const res = await fetch(`/api/commissions/${unflagCommissionId}/unflag`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ reviewNotes: unflagNotes.trim() || null }) });
      if (res.ok) { setFlaggedCommissions(prev => prev.filter(c => c.id !== unflagCommissionId)); setShowUnflagModal(false); setUnflagCommissionId(null); setUnflagNotes(""); }
      else { showNotif("Failed to unflag commission", "error"); }
    } catch (e) { showNotif("Error unflagging commission", "error"); }
  };

  const fetchAvailableAgents = async () => {
    try { const res = await fetch("/api/users/sales-reps", { headers: getAuthHeaders() }); if (res.ok) setAvailableAgents(await res.json()); }
    catch (e) { console.error("Error fetching sales reps:", e); }
  };

  const addSignatureSection = (doc, startY, pageWidth) => {
    doc.setFontSize(11); doc.setFont(undefined, "normal");
    doc.text("Accountant Signature:", 14, startY); doc.line(55, startY, 120, startY);
    doc.text("Date:", 130, startY); doc.line(145, startY, 190, startY);
  };

  const formatDateString = (d) => { if (!d) return ""; const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day).toLocaleDateString(); };
  const toOrdinal = (n) => { const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };

  const generatePdfReport = async () => {
    if (!pdfAgent) { showNotif("Please select an agent", "error"); return; }
    if (!pdfStartDate || !pdfEndDate) { showNotif("Please select start and end dates", "error"); return; }
    try {
      const params = new URLSearchParams({ salesPerson: pdfAgent, startDate: pdfStartDate, endDate: pdfEndDate });
      const res = await fetch(`/api/commissions/payouts/paid?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) { showNotif("Failed to fetch commission data", "error"); return; }
      const payouts = await res.json();
      if (payouts.length === 0) { showNotif("No paid commissions found for selected period", "error"); return; }
      const logoImg = new Image(); logoImg.src = "/smt-logo.png";
      await new Promise((res, rej) => { logoImg.onload = res; logoImg.onerror = rej; });
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const lw = 30, lh = (logoImg.height / logoImg.width) * lw;
      doc.addImage(logoImg, "PNG", pw - lw - 14, 10, lw, lh);
      doc.setFontSize(18); doc.setFont(undefined, "bold"); doc.text("Commission Payout Report", 14, 20);
      doc.setFontSize(12); doc.setFont(undefined, "normal");
      doc.text(`Sales Agent: ${pdfAgent}`, 14, 35);
      doc.text(`Pay Period: ${formatDateString(pdfStartDate)} - ${formatDateString(pdfEndDate)}`, 14, 42);
      doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, 49);
      const totalPaid = payouts.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      const tableData = payouts.map(p => {
        const pn = stageSettings.findIndex(s => s.stage === p.stage) + 1;
        const cr = p.itemCommission?.commission?.commissionRate || 0;
        const acp = stageSettings.length > 0 ? (cr / stageSettings.length).toFixed(2) : cr.toFixed(2);
        return [p.itemCommission?.commission?.order?.account?.name||"N/A", p.itemCommission?.productCode||"N/A", pn>0?toOrdinal(pn):"N/A", `$${parseFloat(p.amount||0).toFixed(2)}`, `${acp}%`, p.paymentMethod||"N/A", new Date(p.paidAt).toLocaleDateString()];
      });
      autoTable(doc, { startY: 55, head: [["Customer","Item","Stage","Amount","Commission %","Method","Paid Date"]], body: tableData, theme: "grid", headStyles: { fillColor: [60,60,60], textColor: 255 }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 3: { halign: "right" }, 4: { halign: "center" } } });
      const fy = doc.lastAutoTable.finalY;
      doc.setFontSize(12); doc.setFont(undefined, "bold");
      doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, pw - 14, fy + 10, { align: "right" });
      const sy = fy + 30;
      if (sy + 40 > ph - 20) { doc.addPage(); addSignatureSection(doc, 30, pw); } else { addSignatureSection(doc, sy, pw); }
      doc.save(`Commission_Report_${pdfAgent.replace(/\s+/g, "_")}_${pdfStartDate}_to_${pdfEndDate}.pdf`);
      showNotif("PDF report generated successfully");
      setShowPdfModal(false); setPdfAgent(""); setPdfStartDate(""); setPdfEndDate("");
    } catch (e) { console.error(e); showNotif("Error generating PDF report", "error"); }
  };

  const generateReportFromSelected = async () => {
    if (selectedPayouts.size === 0) { showNotif("Please select commissions to generate report", "error"); return; }
    try {
      const items = recentlyPaid.filter(p => selectedPayouts.has(p.id));
      if (items.length === 0) { showNotif("No selected commissions found", "error"); return; }
      const logoImg = new Image(); logoImg.src = "/smt-logo.png";
      await new Promise((res, rej) => { logoImg.onload = res; logoImg.onerror = rej; });
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const lw = 30, lh = (logoImg.height / logoImg.width) * lw;
      doc.addImage(logoImg, "PNG", pw - lw - 14, 10, lw, lh);
      doc.setFontSize(18); doc.setFont(undefined, "bold"); doc.text("Commission Payout Report", 14, 20);
      const reps = [...new Set(items.map(p => p.itemCommission?.commission?.salesPersonName).filter(Boolean))];
      const repText = reps.length === 1 ? reps[0] : `${reps.length} Sales Reps`;
      const dates = items.map(p => new Date(p.paidAt)).sort((a, b) => a - b);
      doc.setFontSize(12); doc.setFont(undefined, "normal");
      doc.text(`Sales Agent: ${repText}`, 14, 35);
      doc.text(`Pay Period: ${dates[0].toLocaleDateString()} - ${dates[dates.length-1].toLocaleDateString()}`, 14, 42);
      doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, 49);
      doc.text(`Selected Items: ${items.length}`, 14, 56);
      const totalPaid = items.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      const tableData = items.map(p => {
        const pn = stageSettings.findIndex(s => s.stage === p.stage) + 1;
        const cr = p.itemCommission?.commission?.commissionRate || 0;
        const acp = stageSettings.length > 0 ? (cr / stageSettings.length).toFixed(2) : cr.toFixed(2);
        return [p.itemCommission?.commission?.order?.account?.name||"N/A", p.itemCommission?.productCode||"N/A", p.itemCommission?.commission?.salesPersonName||"N/A", pn>0?toOrdinal(pn):"N/A", `$${parseFloat(p.amount||0).toFixed(2)}`, `${acp}%`, new Date(p.paidAt).toLocaleDateString()];
      });
      autoTable(doc, { startY: 62, head: [["Customer","Item","Sales Rep","Stage","Amount","Commission %","Paid Date"]], body: tableData, theme: "grid", headStyles: { fillColor: [60,60,60], textColor: 255 }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 4: { halign: "right" }, 5: { halign: "center" } } });
      const fy = doc.lastAutoTable.finalY;
      doc.setFontSize(12); doc.setFont(undefined, "bold");
      doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, pw - 14, fy + 10, { align: "right" });
      const sy = fy + 30;
      if (sy + 40 > ph - 20) { doc.addPage(); addSignatureSection(doc, 30, pw); } else { addSignatureSection(doc, sy, pw); }
      doc.save(`Commission_Report_Selected_${new Date().toISOString().split('T')[0]}.pdf`);
      showNotif("PDF report generated successfully"); setSelectedPayouts(new Set());
    } catch (e) { console.error(e); showNotif("Error generating PDF report", "error"); }
  };

  const toggleGroup = (id) => { const s = new Set(expandedGroups); s.has(id) ? s.delete(id) : s.add(id); setExpandedGroups(s); };
  const togglePayoutSelection = (id) => { const s = new Set(selectedPayouts); s.has(id) ? s.delete(id) : s.add(id); setSelectedPayouts(s); };
  const selectAllInGroup = (group) => { const s = new Set(selectedPayouts); group.payouts.forEach(p => s.add(p.id)); setSelectedPayouts(s); };
  const formatCurrency = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
  const isPaymentDenied = (r) => r && r.startsWith("PAYMENT_DENIED:");
  const parseDenialReason = (r) => isPaymentDenied(r) ? r.replace("PAYMENT_DENIED: ", "") : null;
  const getCommissionDisplayName = (c) => c.order?.account?.name || (c.order?.poNumber ? `PO #${c.order.poNumber}` : "Order Deleted");

  const uniquePaidSalesReps = [...new Set(recentlyPaid.map(p => p.itemCommission?.commission?.salesPersonName).filter(Boolean))].sort();
  const filteredPaidCommissions = paidFilterSalesRep ? recentlyPaid.filter(p => p.itemCommission?.commission?.salesPersonName === paidFilterSalesRep) : recentlyPaid;

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT")) return null;

  const TABS = ["flagged", "pending", "approved", "paid", "orphaned", user.role === "SUPER_ADMIN" ? "settings" : null].filter(Boolean);

  return (
    <>
      <TopNav />
      <style>{`
        .commission-polish-table tbody tr {
          transition: background 0.14s, box-shadow 0.14s;
        }
        .commission-polish-table tbody tr:hover {
          background: linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03));
          box-shadow: inset 3px 0 0 rgba(220,38,38,0.65);
        }
      `}</style>
      <div style={{ minHeight: "calc(100vh - 60px)", background: "radial-gradient(circle at 12% 0%,rgba(220,38,38,0.07),transparent 420px)" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 24px 40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: "24px", fontWeight: "700", margin: 0, color: "#fff", letterSpacing: "-0.3px" }}>Commission Management</h1>
        </div>

        {/* Tab bar + Generate Report */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 30, borderBottom: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.08))", borderRadius: 10, padding: "8px 10px 0", boxShadow: "0 12px 28px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "10px 18px", background: activeTab === tab ? "linear-gradient(180deg,rgba(220,38,38,0.16),rgba(220,38,38,0.07))" : "transparent",
                color: activeTab === tab ? "#ff4b4b" : "#999",
                border: activeTab === tab ? "1px solid rgba(255,75,75,0.32)" : "1px solid transparent",
                borderBottom: activeTab === tab ? "2px solid #dc2626" : "2px solid transparent",
                borderRadius: "7px 7px 0 0", cursor: "pointer", fontSize: 14, marginBottom: "-1px", textTransform: "capitalize",
              }}>
                {tab === "settings" ? "⚙️ Settings" : tab}
              </button>
            ))}
          </div>
          <button onClick={() => setShowPdfModal(true)} style={{
            padding: "7px 16px", background: "linear-gradient(180deg,rgba(255,75,75,0.2),rgba(220,38,38,0.09))", color: "#ff5a5a",
            border: "1px solid rgba(255,75,75,0.4)", borderRadius: 7,
            cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8, boxShadow: "0 12px 26px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}>Generate Report</button>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading...</div>
        ) : (
          <>
            {/* Flagged */}
            {activeTab === "flagged" && (
              <div>
                <div style={{ marginBottom: 20, color: "#999" }}>{flaggedCommissions.length} commissions need attention</div>
                {flaggedCommissions.map(commission => (
                  <div key={commission.id} style={{ background: "linear-gradient(180deg,#202020,#151515)", border: isPaymentDenied(commission.flagReason) ? "1px solid #dc2626" : "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ color: isPaymentDenied(commission.flagReason) ? "#dc2626" : "#f59e0b", marginBottom: 8 }}>
                          {isPaymentDenied(commission.flagReason) ? "🚫" : "⚠️"} {getCommissionDisplayName(commission)} - {commission.salesPersonName}
                        </h3>
                        {isPaymentDenied(commission.flagReason) ? (
                          <div>
                            <div style={{ color: "#dc2626", fontWeight: 600, marginBottom: 8, fontSize: 15 }}>Payment Denied</div>
                            <div style={{ color: "#ccc", marginBottom: 8, fontSize: 14, lineHeight: 1.5 }}>{parseDenialReason(commission.flagReason)}</div>
                            <div style={{ padding: 12, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, marginTop: 12 }}>
                              <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>The payout has been reset to WAITING status and will be retriggered when the item reaches the appropriate stage again, or you can unflag this commission to clear the denial.</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ color: "#999", marginBottom: 8 }}>Flag Reason: <span style={{ color: "#f59e0b" }}>{commission.flagReason}</span></div>
                            {commission.flagReason === "AWAITING_PRICES" && <div style={{ color: "#999" }}>Missing prices for order items</div>}
                            {commission.flagReason === "PRICE_CHANGED" && <div style={{ color: "#999" }}>Prices changed after commission calculation<div style={{ marginTop: 8, fontSize: 14 }}>Old total: {formatCurrency(commission.orderTotalAmount)} &rarr; New total: Check current prices</div></div>}
                            {commission.flagReason === "ORDER_DELETED" && <div style={{ color: "#999" }}>Order was deleted — commission is orphaned</div>}
                          </>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
                        {(isPaymentDenied(commission.flagReason) || commission.flagReason === "AWAITING_PRICES") && commission.orderId && (
                          <button onClick={() => router.push(`/admin/orders/${commission.orderId}`)} style={{ padding: "8px 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>View Order</button>
                        )}
                        {commission.flagReason === "PRICE_CHANGED" && user.role === "SUPER_ADMIN" && (
                          <button onClick={() => handleRecalculate(commission.id)} style={{ padding: "8px 16px", background: "#f59e0b", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Recalculate</button>
                        )}
                        <button onClick={() => handleUnflag(commission.id)} style={{ padding: "8px 16px", background: "#666", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Unflag</button>
                      </div>
                    </div>
                  </div>
                ))}
                {flaggedCommissions.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No flagged commissions</div>}
              </div>
            )}

            {/* Pending */}
            {activeTab === "pending" && (
              <div>
                <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#999" }}>{payoutGroups.length} agents with pending commissions</div>
                  <div>Total pending: {formatCurrency(payoutGroups.reduce((s, g) => s + g.total, 0))}</div>
                </div>
                {payoutGroups.map(group => (
                  <div key={group.salesPerson} style={{ background: "linear-gradient(180deg,#202020,#151515)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", marginBottom: 20, overflow: "hidden", boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <div onClick={() => toggleGroup(group.salesPerson)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, cursor: "pointer", background: expandedGroups.has(group.salesPerson) ? "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))" : "transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#667eea,#764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "white" }}>
                          {group.salesPerson.split(" ").map(n => n[0]).join("").toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 16 }}>{group.salesPerson}</div>
                          <div style={{ color: "#999", fontSize: 14 }}>{group.payouts.length} orders &bull; Rate: {group.payouts[0]?.itemCommission?.commission?.commissionRate || 0}%</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#999", fontSize: 14 }}>Total Commission</div>
                        <div style={{ fontSize: 24, fontWeight: "bold", color: "#dc2626" }}>{formatCurrency(group.total)}</div>
                      </div>
                      <span style={{ color: "#999", transform: expandedGroups.has(group.salesPerson) ? "rotate(180deg)" : "rotate(0)", display: "inline-block" }}>&#9660;</span>
                    </div>
                    {expandedGroups.has(group.salesPerson) && (
                      <div style={{ padding: "0 20px 20px" }}>
                        <div style={{ marginBottom: 16 }}>
                          <button onClick={() => selectAllInGroup(group)} style={{ padding: "8px 16px", background: "#333", color: "white", border: "none", borderRadius: 4, cursor: "pointer", marginRight: 8 }}>Select All</button>
                        </div>
                        <table className="commission-polish-table" style={{ width: "100%", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: 40 }} /><col style={{ width: "27%" }} /><col style={{ width: "27%" }} />
                            {stageSettings.map((_, i) => <col key={i} style={{ width: 50 }} />)}
                            <col style={{ width: 100 }} /><col style={{ width: 70 }} />
                          </colgroup>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #333" }}>
                              <th style={{ padding: 4, textAlign: "left", fontSize: 11 }}>&#10003;</th>
                              <th style={{ padding: 8, textAlign: "left", fontSize: 12 }}>Customer Name</th>
                              <th style={{ padding: 8, textAlign: "left", fontSize: 12 }}>Item Name</th>
                              {stageSettings.map((ss, i) => <th key={ss.stage} style={{ padding: "4px 2px", textAlign: "center", fontSize: 11, color: "#fff" }} title={`${ss.stage} (${ss.percentage}%)`}>P{i+1}</th>)}
                              <th style={{ padding: "8px 4px", textAlign: "right", fontSize: 12 }}>Amount</th>
                              <th style={{ padding: 4, textAlign: "center", fontSize: 11 }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.payouts.map(payout => (
                              <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ padding: 4, textAlign: "center" }}><input type="checkbox" checked={selectedPayouts.has(payout.id)} onChange={() => togglePayoutSelection(payout.id)} /></td>
                                <td style={{ padding: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <a href={`/admin/orders/${payout.itemCommission.commission.orderId}`} style={{ color: "#dc2626", textDecoration: "none" }}>{payout.itemCommission.commission.order?.account?.name || "N/A"}</a>
                                </td>
                                <td style={{ padding: 8, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payout.itemCommission?.productCode || "N/A"}</td>
                                {stageSettings.map(ss => <td key={ss.stage} style={{ padding: "4px 2px", textAlign: "center", color: "#10b981", fontSize: 14 }}>{payout.stage === ss.stage ? "✓" : ""}</td>)}
                                <td style={{ padding: "8px 4px", color: "#ccc", fontWeight: "bold", textAlign: "right", fontSize: 13 }}>
                                  {formatCurrency(payout.amount)}
                                  {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && (
                                    <span style={{ color: "#dc2626", fontSize: 11, marginLeft: 4 }}>({formatCurrency(((payout.itemCommission.itemSubtotal||0)/stageSettings.length)-(payout.itemCommission.allocatedDiscount/stageSettings.length))})</span>
                                  )}
                                </td>
                                <td style={{ padding: "4px 2px", textAlign: "center" }}>
                                  <button onClick={() => handleApprovePayout(payout.id)} title="Approve" style={{ padding: "4px 6px", background: "#10b981", color: "white", border: "none", borderRadius: 3, cursor: "pointer", marginRight: 2, fontSize: 12 }}>✓</button>
                                  <button onClick={() => handleRejectPayout(payout.id)} title="Deny" style={{ padding: "4px 6px", background: "#dc2626", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 12 }}>✕</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
                {payoutGroups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No pending approvals</div>}
              </div>
            )}

            {/* Approved */}
            {activeTab === "approved" && (
              <div>
                <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#999" }}>{approvedPayouts.length} approved payouts ready for payment</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ padding: 8, background: "#1a1a1a", color: "white", border: "1px solid #333", borderRadius: 4 }}>
                      <option value="Check">Check</option><option value="Wire">Wire Transfer</option><option value="ACH">ACH</option><option value="Cash">Cash</option>
                    </select>
                    <input type="text" placeholder="Payment notes (optional)" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} style={{ padding: 8, background: "#1a1a1a", color: "white", border: "1px solid #333", borderRadius: 4, width: 200 }} />
                  </div>
                </div>
                <div style={{ background: "linear-gradient(180deg,#202020,#151515 48%,#121212)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 22px 52px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
                  <table className="commission-polish-table" style={{ width: "100%", tableLayout: "fixed" }}>
                    <colgroup><col style={{width:40}}/><col style={{width:"20%"}}/><col style={{width:"20%"}}/><col style={{width:"13%"}}/><col style={{width:80}}/><col style={{width:100}}/><col style={{width:100}}/><col style={{width:90}}/></colgroup>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{padding:4,textAlign:"center",fontSize:11}}><input type="checkbox" onChange={e => { if(e.target.checked) setSelectedPayouts(new Set(approvedPayouts.map(p=>p.id))); else setSelectedPayouts(new Set()); }} /></th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Customer Name</th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Item Name</th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Sales Rep</th>
                        <th style={{padding:"8px 4px",textAlign:"center",color:"#fff",fontSize:12}}>Payment</th>
                        <th style={{padding:"8px 4px",textAlign:"right",color:"#999",fontSize:12}}>Amount</th>
                        <th style={{padding:"8px 4px",textAlign:"left",color:"#999",fontSize:12}}>Approved</th>
                        <th style={{padding:4,textAlign:"center",color:"#999",fontSize:11}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedPayouts.map(payout => {
                        const pn = stageSettings.findIndex(s => s.stage === payout.stage) + 1;
                        return (
                          <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                            <td style={{padding:4,textAlign:"center"}}><input type="checkbox" checked={selectedPayouts.has(payout.id)} onChange={() => togglePayoutSelection(payout.id)} /></td>
                            <td style={{padding:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><a href={`/admin/orders/${payout.itemCommission.commission.orderId}`} style={{color:"#dc2626",textDecoration:"none"}}>{payout.itemCommission.commission.order?.account?.name||"N/A"}</a></td>
                            <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payout.itemCommission?.productCode||"N/A"}</td>
                            <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payout.itemCommission.commission.salesPersonName}</td>
                            <td style={{padding:"8px 4px",color:"#999",textAlign:"center",fontSize:11}}>P{pn>0?pn:"?"}</td>
                            <td style={{padding:"8px 4px",color:"#10b981",fontWeight:"bold",textAlign:"right",fontSize:13}}>
                              {formatCurrency(payout.amount)}
                              {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && <span style={{color:"#dc2626",fontSize:11,marginLeft:4}}>({formatCurrency(((payout.itemCommission.itemSubtotal||0)/stageSettings.length)-(payout.itemCommission.allocatedDiscount/stageSettings.length))})</span>}
                            </td>
                            <td style={{padding:"8px 4px",color:"#999",fontSize:11}}>{new Date(payout.approvedAt).toLocaleDateString()}</td>
                            <td style={{padding:"4px 2px",textAlign:"center"}}>
                              <button onClick={() => handleMarkAsPaid(payout.id)} style={{padding:"4px 8px",background:"#10b981",color:"white",border:"none",borderRadius:3,cursor:"pointer",fontSize:11,marginRight:2}}>Pay</button>
                              <button onClick={() => handleUnapprove(payout.id)} title="Undo Approval" style={{padding:"4px 8px",background:"#f59e0b",color:"white",border:"none",borderRadius:3,cursor:"pointer",fontSize:11}}>&#8630;</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {approvedPayouts.length === 0 && <div style={{padding:40,textAlign:"center",color:"#666"}}>No approved payouts ready for payment</div>}
              </div>
            )}

            {/* Paid */}
            {activeTab === "paid" && (
              <div>
                <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#999" }}>
                    {paidFilterSalesRep ? <>Showing {filteredPaidCommissions.length} of {recentlyPaid.length} paid commissions</> : <>Last {recentlyPaid.length} paid commissions</>}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <select value={paidFilterSalesRep} onChange={e => { setPaidFilterSalesRep(e.target.value); setSelectedPayouts(new Set()); }} style={{ padding: 8, background: "#1a1a1a", color: "white", border: "1px solid #333", borderRadius: 4, minWidth: 180 }}>
                      <option value="">All Sales Reps</option>
                      {uniquePaidSalesReps.map(rep => <option key={rep} value={rep}>{rep}</option>)}
                    </select>
                    {paidFilterSalesRep && <button onClick={() => { setPaidFilterSalesRep(""); setSelectedPayouts(new Set()); }} style={{ padding: "8px 12px", background: "#333", color: "#999", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Clear</button>}
                  </div>
                </div>
                <div style={{ background: "linear-gradient(180deg,#202020,#151515 48%,#121212)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 22px 52px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
                  <table className="commission-polish-table" style={{ width: "100%", tableLayout: "fixed" }}>
                    <colgroup><col style={{width:40}}/><col style={{width:"15%"}}/><col style={{width:"18%"}}/><col style={{width:"12%"}}/><col style={{width:50}}/><col style={{width:90}}/><col style={{width:65}}/><col style={{width:80}}/><col style={{width:"10%"}}/><col style={{width:50}}/></colgroup>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{padding:4,textAlign:"center",fontSize:11}}><input type="checkbox" checked={filteredPaidCommissions.length>0&&filteredPaidCommissions.every(p=>selectedPayouts.has(p.id))} onChange={e=>{ if(e.target.checked) setSelectedPayouts(new Set(filteredPaidCommissions.map(p=>p.id))); else setSelectedPayouts(new Set()); }}/></th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Customer Name</th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Item Name</th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Sales Rep</th>
                        <th style={{padding:"8px 4px",textAlign:"center",color:"#fff",fontSize:12}}>Pmt</th>
                        <th style={{padding:"8px 4px",textAlign:"right",color:"#999",fontSize:12}}>Amount</th>
                        <th style={{padding:"8px 4px",textAlign:"left",color:"#999",fontSize:12}}>Method</th>
                        <th style={{padding:"8px 4px",textAlign:"left",color:"#999",fontSize:12}}>Paid Date</th>
                        <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Paid By</th>
                        <th style={{padding:4,textAlign:"center",color:"#999",fontSize:11}}>Undo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPaidCommissions.map(payout => {
                        const pn = stageSettings.findIndex(s => s.stage === payout.stage) + 1;
                        return (
                          <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                            <td style={{padding:4,textAlign:"center"}}><input type="checkbox" checked={selectedPayouts.has(payout.id)} onChange={() => togglePayoutSelection(payout.id)} /></td>
                            <td style={{padding:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><a href={`/admin/orders/${payout.itemCommission.commission.orderId}`} style={{color:"#dc2626",textDecoration:"none"}}>{payout.itemCommission.commission.order?.account?.name||"N/A"}</a></td>
                            <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payout.itemCommission?.productCode||"N/A"}</td>
                            <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payout.itemCommission.commission.salesPersonName}</td>
                            <td style={{padding:"8px 4px",color:"#999",textAlign:"center",fontSize:11}}>P{pn>0?pn:"?"}</td>
                            <td style={{padding:"8px 4px",color:"#ccc",fontWeight:"bold",textAlign:"right",fontSize:13}}>
                              {formatCurrency(payout.amount)}
                              {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && <span style={{color:"#dc2626",fontSize:11,marginLeft:4}}>({formatCurrency(((payout.itemCommission.itemSubtotal||0)/stageSettings.length)-(payout.itemCommission.allocatedDiscount/stageSettings.length))})</span>}
                            </td>
                            <td style={{padding:"8px 4px",color:"#999",fontSize:11}}>{payout.paymentMethod||"N/A"}</td>
                            <td style={{padding:"8px 4px",color:"#999",fontSize:11}}>{new Date(payout.paidAt).toLocaleDateString()}</td>
                            <td style={{padding:8,color:"#999",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:11}}>{payout.paidByName||"N/A"}</td>
                            <td style={{padding:"4px 2px",textAlign:"center"}}><button onClick={() => handleUnpay(payout.id)} title="Undo Payment" style={{padding:"4px 8px",background:"#f59e0b",color:"white",border:"none",borderRadius:3,cursor:"pointer",fontSize:11}}>&#8630;</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredPaidCommissions.length === 0 && <div style={{padding:40,textAlign:"center",color:"#666"}}>{paidFilterSalesRep ? "No paid commissions for selected sales rep" : "No payment history available"}</div>}
              </div>
            )}

            {/* Orphaned */}
            {activeTab === "orphaned" && (
              <div>
                <div style={{ marginBottom: 20, color: "#f59e0b" }}>⚠️ These commissions are from deleted orders</div>
                {orphanedCommissions.map(commission => (
                  <div key={commission.id} style={{ background: "linear-gradient(180deg,#202020,#151515)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <h3 style={{ color: "#f59e0b", marginBottom: 8 }}>PO #{commission.order?.poNumber || "Unknown"} - {commission.salesPersonName}</h3>
                        <div style={{ color: "#999", marginBottom: 4 }}>Commission: {formatCurrency(commission.totalCommissionAmount)}</div>
                        <div style={{ color: "#999", fontSize: 14 }}>Status: {commission.status}</div>
                        <div style={{ marginTop: 8 }}>
                          {commission.itemCommissions?.map(ic => ic.payouts?.map(p => <div key={p.id} style={{ color: "#666", fontSize: 13 }}>{p.stage}: {formatCurrency(p.amount)} ({p.status})</div>))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {user.role === "SUPER_ADMIN" && <button onClick={() => handleDeleteOrphanedCommission(commission.id)} style={{ padding: "8px 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Delete Commission</button>}
                        <button style={{ padding: "8px 16px", background: "#666", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Keep for Records</button>
                      </div>
                    </div>
                  </div>
                ))}
                {orphanedCommissions.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No orphaned commissions</div>}
              </div>
            )}
          </>
        )}

        <BulkActionsBar activeTab={activeTab} selectedCount={selectedPayouts.size} onBulkApprove={handleBulkApprove} onBulkPay={handleBulkPay} onGenerateReport={generateReportFromSelected} onClearSelection={() => setSelectedPayouts(new Set())} />
      </div>
      </div>

      <RejectPaymentModal show={showRejectModal} onClose={() => setShowRejectModal(false)} rejectionReason={rejectionReason} setRejectionReason={setRejectionReason} onExecute={executeReject} />
      <UnflagModal show={showUnflagModal} onClose={() => setShowUnflagModal(false)} unflagNotes={unflagNotes} setUnflagNotes={setUnflagNotes} onExecute={executeUnflag} />
      <DeleteOrphanModal show={showDeleteOrphanModal} onClose={() => setShowDeleteOrphanModal(false)} onExecute={executeDeleteOrphan} />
      <RecalculateModal show={showRecalculateModal} onClose={() => setShowRecalculateModal(false)} onExecute={executeRecalculate} />
      <UnapproveModal show={showUnapproveModal} onClose={() => setShowUnapproveModal(false)} onExecute={executeUnapprove} />
      <UnpayModal show={showUnpayModal} onClose={() => setShowUnpayModal(false)} onExecute={executeUnpay} />
      <PdfReportModal show={showPdfModal} onClose={() => setShowPdfModal(false)} pdfAgent={pdfAgent} setPdfAgent={setPdfAgent} pdfStartDate={pdfStartDate} setPdfStartDate={setPdfStartDate} pdfEndDate={pdfEndDate} setPdfEndDate={setPdfEndDate} availableAgents={availableAgents} onGenerate={generatePdfReport} />
      <NotificationToast show={showNotification} message={notificationMessage} type={notificationType} />
    </>
  );
}
