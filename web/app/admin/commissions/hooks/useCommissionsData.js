"use client";

import { useState, useEffect } from "react";
import { generateAgentPdfReport, generateSelectedPdfReport } from "../_shared/pdfGenerator";

// Owns all state, data fetching, and action handlers for the commissions page.
// page.jsx is a thin shell that wires this hook to the tab components.
export function useCommissionsData(user, getAuthHeaders, router) {
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
  const [approvalNotes] = useState("");
  const [stageSettings, setStageSettings] = useState([]);
  const [paidFilterSalesRep, setPaidFilterSalesRep] = useState("");

  // Modal state
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

  // Notification toast
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState("success");

  const showNotif = (message, type = "success") => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  // ===== Data loading =====

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

  const fetchAvailableAgents = async () => {
    try { const res = await fetch("/api/users/sales-reps", { headers: getAuthHeaders() }); if (res.ok) setAvailableAgents(await res.json()); }
    catch (e) { console.error("Error fetching sales reps:", e); }
  };

  // ===== Pending handlers =====

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

  // ===== Approved handlers =====

  const handleUnapprove = (id) => { setUnapprovePayoutId(id); setShowUnapproveModal(true); };

  const executeUnapprove = async () => {
    try {
      const res = await fetch(`/api/commissions/payouts/${unapprovePayoutId}/unapprove`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() } });
      if (res.ok) {
        setApprovedPayouts(prev => prev.filter(p => p.id !== unapprovePayoutId));
        setSelectedPayouts(prev => { const s = new Set(prev); s.delete(unapprovePayoutId); return s; });
        setShowUnapproveModal(false); setUnapprovePayoutId(null);
      } else { const e = await res.json().catch(() => ({})); showNotif(`Failed to unapprove: ${e.error || 'Unknown error'}`, "error"); }
    } catch (e) { showNotif("Error unapproving payout", "error"); }
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

  // ===== Paid handlers =====

  const handleUnpay = (id) => { setUnpayPayoutId(id); setShowUnpayModal(true); };

  const executeUnpay = async () => {
    try {
      const res = await fetch(`/api/commissions/payouts/${unpayPayoutId}/unpay`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() } });
      if (res.ok) { setRecentlyPaid(prev => prev.filter(p => p.id !== unpayPayoutId)); showNotif("Payment moved back to approved status"); setShowUnpayModal(false); setUnpayPayoutId(null); }
      else { const e = await res.json().catch(() => ({})); showNotif(`Failed to unpay: ${e.error || 'Unknown error'}`, "error"); }
    } catch (e) { showNotif("Error unpaying payout", "error"); }
  };

  // ===== Flagged handlers =====

  const handleRecalculate = (id) => { setRecalculateCommissionId(id); setShowRecalculateModal(true); };

  const executeRecalculate = async () => {
    try {
      const res = await fetch(`/api/commissions/${recalculateCommissionId}/recalculate`, { method: "POST", headers: getAuthHeaders() });
      if (res.ok) { setShowRecalculateModal(false); setRecalculateCommissionId(null); fetchData(); }
      else { showNotif("Failed to recalculate commission", "error"); }
    } catch (e) { showNotif("Error recalculating commission", "error"); }
  };

  const handleUnflag = (id) => { setUnflagCommissionId(id); setUnflagNotes(""); setShowUnflagModal(true); };

  const executeUnflag = async () => {
    try {
      const res = await fetch(`/api/commissions/${unflagCommissionId}/unflag`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ reviewNotes: unflagNotes.trim() || null }) });
      if (res.ok) { setFlaggedCommissions(prev => prev.filter(c => c.id !== unflagCommissionId)); setShowUnflagModal(false); setUnflagCommissionId(null); setUnflagNotes(""); }
      else { showNotif("Failed to unflag commission", "error"); }
    } catch (e) { showNotif("Error unflagging commission", "error"); }
  };

  // ===== Orphaned handlers =====

  const handleDeleteOrphanedCommission = (id) => { setDeleteOrphanId(id); setShowDeleteOrphanModal(true); };

  const executeDeleteOrphan = async () => {
    try {
      const res = await fetch(`/api/commissions/${deleteOrphanId}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) { setOrphanedCommissions(prev => prev.filter(c => c.id !== deleteOrphanId)); setShowDeleteOrphanModal(false); setDeleteOrphanId(null); }
      else { const e = await res.json(); showNotif(e.message || "Failed to delete commission", "error"); }
    } catch (e) { showNotif("Error deleting commission", "error"); }
  };

  // ===== Selection helpers =====

  const toggleGroup = (id) => { const s = new Set(expandedGroups); s.has(id) ? s.delete(id) : s.add(id); setExpandedGroups(s); };
  const togglePayoutSelection = (id) => { const s = new Set(selectedPayouts); s.has(id) ? s.delete(id) : s.add(id); setSelectedPayouts(s); };
  const selectAllInGroup = (group) => { const s = new Set(selectedPayouts); group.payouts.forEach(p => s.add(p.id)); setSelectedPayouts(s); };

  // ===== PDF generation =====

  const generatePdfReport = async () => {
    if (!pdfAgent) { showNotif("Please select an agent", "error"); return; }
    if (!pdfStartDate || !pdfEndDate) { showNotif("Please select start and end dates", "error"); return; }
    try {
      await generateAgentPdfReport({ pdfAgent, pdfStartDate, pdfEndDate, stageSettings, getAuthHeaders });
      showNotif("PDF report generated successfully");
      setShowPdfModal(false); setPdfAgent(""); setPdfStartDate(""); setPdfEndDate("");
    } catch (e) {
      console.error(e);
      showNotif(e.message || "Error generating PDF report", "error");
    }
  };

  const generateReportFromSelected = async () => {
    if (selectedPayouts.size === 0) { showNotif("Please select commissions to generate report", "error"); return; }
    try {
      const items = recentlyPaid.filter(p => selectedPayouts.has(p.id));
      await generateSelectedPdfReport({ items, stageSettings });
      showNotif("PDF report generated successfully");
      setSelectedPayouts(new Set());
    } catch (e) {
      console.error(e);
      showNotif(e.message || "Error generating PDF report", "error");
    }
  };

  return {
    // State
    loading, activeTab, setActiveTab,
    selectedPayouts, setSelectedPayouts,
    payoutGroups, flaggedCommissions, approvedPayouts, recentlyPaid, orphanedCommissions,
    expandedGroups,
    paymentMethod, setPaymentMethod, paymentNotes, setPaymentNotes,
    stageSettings,
    paidFilterSalesRep, setPaidFilterSalesRep,

    // Modal state
    showRejectModal, setShowRejectModal, rejectionReason, setRejectionReason,
    showUnflagModal, setShowUnflagModal, unflagNotes, setUnflagNotes,
    showDeleteOrphanModal, setShowDeleteOrphanModal,
    showRecalculateModal, setShowRecalculateModal,
    showUnapproveModal, setShowUnapproveModal,
    showUnpayModal, setShowUnpayModal,
    showPdfModal, setShowPdfModal,
    pdfAgent, setPdfAgent, pdfStartDate, setPdfStartDate, pdfEndDate, setPdfEndDate,
    availableAgents,

    // Notification toast
    showNotification, notificationMessage, notificationType,

    // Selection helpers
    toggleGroup, togglePayoutSelection, selectAllInGroup,

    // Handlers
    handleApprovePayout, handleRejectPayout, executeReject,
    handleBulkApprove, handleBulkPay,
    handleUnapprove, executeUnapprove,
    handleMarkAsPaid,
    handleUnpay, executeUnpay,
    handleRecalculate, executeRecalculate,
    handleUnflag, executeUnflag,
    handleDeleteOrphanedCommission, executeDeleteOrphan,
    generatePdfReport, generateReportFromSelected,
  };
}
