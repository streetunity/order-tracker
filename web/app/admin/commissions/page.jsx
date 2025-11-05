"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  // Modal states
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

  // PDF Report Modal state
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfAgent, setPdfAgent] = useState("");
  const [pdfStartDate, setPdfStartDate] = useState("");
  const [pdfEndDate, setPdfEndDate] = useState("");
  const [availableAgents, setAvailableAgents] = useState([]);

  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState("success"); // "success" or "error"

  const showNotif = (message, type = "success") => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT") {
      router.push("/my-commissions");
    }
  }, [user, router]);

  // Separate useEffect for loading stage settings - only runs once when user is available
  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) {
      fetchStageSettings();
    }
  }, [user]);

  // Separate useEffect for loading data - runs when user or activeTab changes
  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) {
      fetchData();
    }
  }, [user, activeTab]);

  // Load available agents for PDF report
  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) {
      fetchAvailableAgents();
    }
  }, [user]);

  const fetchStageSettings = async () => {
    if (!user) return;
    
    try {
      const res = await fetch("/api/commission-settings/stages", { 
        headers: getAuthHeaders(),
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setStageSettings(data.sort((a, b) => a.sortOrder - b.sortOrder));
      }
    } catch (error) {
      console.error("Error fetching stage settings:", error);
      // Set default stages if fetch fails
      setStageSettings([
        { stage: "SHIPPING", percentage: 50 },
        { stage: "DELIVERED", percentage: 50 }
      ]);
    }
  };

  const fetchData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      switch (activeTab) {
        case "pending":
          const pendingRes = await fetch("/api/commissions/payouts/pending", { 
            headers,
            cache: "no-store"
          });
          if (pendingRes.ok) {
            const data = await pendingRes.json();
            setPayoutGroups(data);
          }
          break;

        case "flagged":
          const flaggedRes = await fetch("/api/commissions/flagged", { 
            headers,
            cache: "no-store"
          });
          if (flaggedRes.ok) {
            const data = await flaggedRes.json();
            setFlaggedCommissions(data);
          }
          break;

        case "approved":
          const approvedRes = await fetch("/api/commissions/approved", { 
            headers,
            cache: "no-store"
          });
          if (approvedRes.ok) {
            const data = await approvedRes.json();
            setApprovedPayouts(data);
          }
          break;

        case "paid":
          const paidRes = await fetch("/api/commissions/paid?limit=50", { 
            headers,
            cache: "no-store"
          });
          if (paidRes.ok) {
            const data = await paidRes.json();
            setRecentlyPaid(data);
          }
          break;

        case "orphaned":
          const orphanedRes = await fetch("/api/commissions/orphaned", { 
            headers,
            cache: "no-store"
          });
          if (orphanedRes.ok) {
            const data = await orphanedRes.json();
            setOrphanedCommissions(data);
          }
          break;

        case "settings":
          if (user.role === "SUPER_ADMIN") {
            router.push("/admin/commission-settings");
          }
          break;
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePayout = async (payoutId) => {
    try {
      const res = await fetch(`/api/commissions/payouts/${payoutId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ approvalNotes }),
      });

      if (res.ok) {
        // Update local state instead of refetching
        setPayoutGroups(prevGroups => {
          return prevGroups.map(group => ({
            ...group,
            payouts: group.payouts.filter(p => p.id !== payoutId),
            total: group.payouts
              .filter(p => p.id !== payoutId)
              .reduce((sum, p) => sum + p.amount, 0)
          })).filter(group => group.payouts.length > 0); // Remove empty groups
        });

        // Remove from selected if it was selected
        setSelectedPayouts(prev => {
          const newSet = new Set(prev);
          newSet.delete(payoutId);
          return newSet;
        });
      } else {
        const error = await res.text();
        showNotif(`Failed to approve payout: ${error}`, "error");
      }
    } catch (error) {
      console.error("Error approving payout:", error);
      showNotif("Error approving payout", "error");
    }
  };

  const handleRejectPayout = (payoutId) => {
    setRejectPayoutId(payoutId);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const executeReject = async () => {
    if (!rejectionReason || rejectionReason.trim().length < 10) return;

    try {
      const res = await fetch(`/api/commissions/payouts/${rejectPayoutId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });

      if (res.ok) {
        // Update local state instead of refetching
        setPayoutGroups(prevGroups => {
          return prevGroups.map(group => ({
            ...group,
            payouts: group.payouts.filter(p => p.id !== rejectPayoutId),
            total: group.payouts
              .filter(p => p.id !== rejectPayoutId)
              .reduce((sum, p) => sum + p.amount, 0)
          })).filter(group => group.payouts.length > 0); // Remove empty groups
        });

        // Remove from selected if it was selected
        setSelectedPayouts(prev => {
          const newSet = new Set(prev);
          newSet.delete(rejectPayoutId);
          return newSet;
        });

        setShowRejectModal(false);
        setRejectPayoutId(null);
        setRejectionReason("");
      } else {
        showNotif("Failed to reject payout", "error");
      }
    } catch (error) {
      console.error("Error rejecting payout:", error);
      showNotif("Error rejecting payout", "error");
    }
  };

  const handleBulkApprove = async () => {
    if (selectedPayouts.size === 0) {
      showNotif("Please select payouts to approve", "error");
      return;
    }

    try {
      const res = await fetch("/api/commissions/payouts/bulk-approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          payoutIds: Array.from(selectedPayouts),
          approvalNotes,
        }),
      });

      if (res.ok) {
        const result = await res.json();

        // Update local state instead of refetching
        const approvedIds = Array.from(selectedPayouts);
        setPayoutGroups(prevGroups => {
          return prevGroups.map(group => ({
            ...group,
            payouts: group.payouts.filter(p => !approvedIds.includes(p.id)),
            total: group.payouts
              .filter(p => !approvedIds.includes(p.id))
              .reduce((sum, p) => sum + p.amount, 0)
          })).filter(group => group.payouts.length > 0); // Remove empty groups
        });

        setSelectedPayouts(new Set());

        // Show success message
        showNotif(`Approved ${result.updated} payouts`);
      } else {
        showNotif("Failed to bulk approve payouts", "error");
      }
    } catch (error) {
      console.error("Error bulk approving:", error);
      showNotif("Error bulk approving payouts", "error");
    }
  };

  const handleUnapprove = (payoutId) => {
    setUnapprovePayoutId(payoutId);
    setShowUnapproveModal(true);
  };

  const executeUnapprove = async () => {
    try {
      const res = await fetch(`/api/commissions/payouts/${unapprovePayoutId}/unapprove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });

      if (res.ok) {
        // Update local state to remove from approved list
        setApprovedPayouts(prev => prev.filter(p => p.id !== unapprovePayoutId));

        // Remove from selected if it was selected
        setSelectedPayouts(prev => {
          const newSet = new Set(prev);
          newSet.delete(unapprovePayoutId);
          return newSet;
        });

        setShowUnapproveModal(false);
        setUnapprovePayoutId(null);
      } else {
        const error = await res.json().catch(() => ({}));
        showNotif(`Failed to unapprove: ${error.error || 'Unknown error'}`, "error");
      }
    } catch (error) {
      console.error("Error unapproving payout:", error);
      showNotif("Error unapproving payout", "error");
    }
  };

  const handleMarkAsPaid = async (payoutId) => {
    try {
      const res = await fetch(`/api/commissions/payouts/${payoutId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ paymentMethod, paymentNotes }),
      });

      if (res.ok) {
        showNotif("Payment marked as complete");
        fetchData();
      } else {
        showNotif("Failed to mark as paid", "error");
      }
    } catch (error) {
      console.error("Error marking as paid:", error);
      showNotif("Error marking as paid", "error");
    }
  };

  const handleBulkPay = async () => {
    if (selectedPayouts.size === 0) {
      showNotif("Please select payouts to mark as paid", "error");
      return;
    }

    try {
      const res = await fetch("/api/commissions/payouts/bulk-pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          payoutIds: Array.from(selectedPayouts),
          paymentMethod,
          paymentNotes,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        showNotif(`Marked ${result.paid} payouts as paid`);
        setSelectedPayouts(new Set());
        fetchData();
      } else {
        showNotif("Failed to bulk pay", "error");
      }
    } catch (error) {
      console.error("Error bulk paying:", error);
      showNotif("Error bulk paying payouts", "error");
    }
  };

  const handleDeleteOrphanedCommission = (commissionId) => {
    setDeleteOrphanId(commissionId);
    setShowDeleteOrphanModal(true);
  };

  const executeDeleteOrphan = async () => {
    try {
      const res = await fetch(`/api/commissions/${deleteOrphanId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        setOrphanedCommissions(prev => prev.filter(c => c.id !== deleteOrphanId));
        setShowDeleteOrphanModal(false);
        setDeleteOrphanId(null);
      } else {
        const error = await res.json();
        showNotif(error.message || "Failed to delete commission", "error");
      }
    } catch (error) {
      console.error("Error deleting commission:", error);
      showNotif("Error deleting commission", "error");
    }
  };

  const fetchAvailableAgents = async () => {
    try {
      const res = await fetch("/api/users?role=SALES_AGENT", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableAgents(data);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  const addSignatureSection = (doc, startY, pageWidth) => {
    doc.setFontSize(11);
    doc.setFont(undefined, "normal");

    // Accountant signature line
    doc.text("Accountant Signature:", 14, startY);
    doc.line(55, startY, 120, startY); // Signature line

    // Date line
    doc.text("Date:", 130, startY);
    doc.line(145, startY, 190, startY); // Date line
  };

  const generatePdfReport = async () => {
    if (!pdfAgent) {
      showNotif("Please select an agent", "error");
      return;
    }
    if (!pdfStartDate || !pdfEndDate) {
      showNotif("Please select start and end dates", "error");
      return;
    }

    try {
      // Fetch paid commissions for the selected agent and date range
      const params = new URLSearchParams({
        salesPerson: pdfAgent,
        startDate: pdfStartDate,
        endDate: pdfEndDate,
      });

      const res = await fetch(`/api/commissions/payouts/paid?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        showNotif("Failed to fetch commission data", "error");
        return;
      }

      const payouts = await res.json();

      if (payouts.length === 0) {
        showNotif("No paid commissions found for selected period", "error");
        return;
      }

      // Load logo as base64
      const logoImg = new Image();
      logoImg.src = "/smt-logo.png";

      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });

      // Generate PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Add logo in top right corner
      const logoWidth = 30;
      const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
      doc.addImage(logoImg, "PNG", pageWidth - logoWidth - 14, 10, logoWidth, logoHeight);

      // Header
      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.text("Commission Payout Report", 14, 20);

      // Agent and date range info
      doc.setFontSize(12);
      doc.setFont(undefined, "normal");
      doc.text(`Sales Agent: ${pdfAgent}`, 14, 35);
      doc.text(`Pay Period: ${new Date(pdfStartDate).toLocaleDateString()} - ${new Date(pdfEndDate).toLocaleDateString()}`, 14, 42);
      doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, 49);

      // Helper to convert number to ordinal (1st, 2nd, 3rd, etc.)
      const toOrdinal = (num) => {
        const suffixes = ["th", "st", "nd", "rd"];
        const v = num % 100;
        return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
      };

      // Calculate total
      const totalPaid = payouts.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      // Table data
      const tableData = payouts.map((payout) => {
        const paymentNumber = stageSettings.findIndex(s => s.stage === payout.stage) + 1;
        const commissionRate = payout.itemCommission?.commission?.commissionRate || 0;
        const appliedCommissionPercent = stageSettings.length > 0
          ? (commissionRate / stageSettings.length).toFixed(2)
          : commissionRate.toFixed(2);

        return [
          payout.itemCommission?.commission?.order?.account?.name || "N/A",
          payout.itemCommission?.productCode || "N/A",
          paymentNumber > 0 ? toOrdinal(paymentNumber) : "N/A",
          `$${parseFloat(payout.amount || 0).toFixed(2)}`,
          `${appliedCommissionPercent}%`,
          payout.paymentMethod || "N/A",
          new Date(payout.paidAt).toLocaleDateString(),
        ];
      });

      // Add table
      autoTable(doc, {
        startY: 55,
        head: [["Customer", "Item", "Stage", "Amount", "Commission %", "Method", "Paid Date"]],
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [60, 60, 60], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "center" },
        },
      });

      // Get final Y position after table
      const finalY = doc.lastAutoTable.finalY;

      // Add total
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, pageWidth - 14, finalY + 10, { align: "right" });

      // Add signature section
      const signatureY = finalY + 30;

      // Check if we need a new page for signature
      if (signatureY + 40 > pageHeight - 20) {
        doc.addPage();
        const newSignatureY = 30;
        addSignatureSection(doc, newSignatureY, pageWidth);
      } else {
        addSignatureSection(doc, signatureY, pageWidth);
      }

      // Save PDF
      const fileName = `Commission_Report_${pdfAgent.replace(/\s+/g, "_")}_${pdfStartDate}_to_${pdfEndDate}.pdf`;
      doc.save(fileName);

      showNotif("PDF report generated successfully");
      setShowPdfModal(false);
      setPdfAgent("");
      setPdfStartDate("");
      setPdfEndDate("");
    } catch (error) {
      console.error("Error generating PDF:", error);
      showNotif("Error generating PDF report", "error");
    }
  };

  const handleRecalculate = (commissionId) => {
    setRecalculateCommissionId(commissionId);
    setShowRecalculateModal(true);
  };

  const executeRecalculate = async () => {
    try {
      const res = await fetch(`/api/commissions/${recalculateCommissionId}/recalculate`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        setShowRecalculateModal(false);
        setRecalculateCommissionId(null);
        fetchData();
      } else {
        showNotif("Failed to recalculate commission", "error");
      }
    } catch (error) {
      console.error("Error recalculating:", error);
      showNotif("Error recalculating commission", "error");
    }
  };

  const handleUnflag = (commissionId) => {
    setUnflagCommissionId(commissionId);
    setUnflagNotes("");
    setShowUnflagModal(true);
  };

  const executeUnflag = async () => {
    try {
      const res = await fetch(`/api/commissions/${unflagCommissionId}/unflag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ reviewNotes: unflagNotes.trim() || null }),
      });

      if (res.ok) {
        setFlaggedCommissions(prev => prev.filter(c => c.id !== unflagCommissionId));
        setShowUnflagModal(false);
        setUnflagCommissionId(null);
        setUnflagNotes("");
      } else {
        showNotif("Failed to unflag commission", "error");
      }
    } catch (error) {
      console.error("Error unflagging:", error);
      showNotif("Error unflagging commission", "error");
    }
  };

  const toggleGroup = (groupId) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const togglePayoutSelection = (payoutId) => {
    const newSelected = new Set(selectedPayouts);
    if (newSelected.has(payoutId)) {
      newSelected.delete(payoutId);
    } else {
      newSelected.add(payoutId);
    }
    setSelectedPayouts(newSelected);
  };

  const selectAllInGroup = (group) => {
    const newSelected = new Set(selectedPayouts);
    group.payouts.forEach((payout) => {
      newSelected.add(payout.id);
    });
    setSelectedPayouts(newSelected);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  if (!user) return null;
  if (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT") return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "100px 24px 24px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "32px", color: "#dc2626" }}>
          Commission Management
        </h1>

        {/* Tabs and Generate Report Button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "30px", borderBottom: "2px solid #333" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            {["flagged", "pending", "approved", "paid", "orphaned", user.role === "SUPER_ADMIN" && "settings"]
              .filter(Boolean)
              .map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "12px 24px",
                    background: "none",
                    color: activeTab === tab ? "#dc2626" : "#999",
                    border: "none",
                    borderBottom: activeTab === tab ? "2px solid #dc2626" : "2px solid transparent",
                    cursor: "pointer",
                    fontSize: "16px",
                    marginBottom: "-2px",
                    textTransform: "capitalize",
                  }}
                >
                  {tab === "settings" ? "⚙️ Settings" : tab}
                </button>
              ))}
          </div>
          <button
            onClick={() => setShowPdfModal(true)}
            style={{
              padding: "8px 16px",
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              marginBottom: "8px",
            }}
          >
            📄 Generate Report
          </button>
        </div>

        {/* Content based on active tab */}
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading...</div>
        ) : (
          <>
            {/* Flagged Tab */}
            {activeTab === "flagged" && (
              <div>
                <div style={{ marginBottom: "20px", color: "#999" }}>
                  {flaggedCommissions.length} commissions need attention
                </div>
                {flaggedCommissions.map((commission) => (
                  <div
                    key={commission.id}
                    style={{
                      background: "#1a1a1a",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "20px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <h3 style={{ color: "#f59e0b", marginBottom: "8px" }}>
                          ⚠️ Order #{commission.order?.poNumber || "Deleted"} - {commission.salesPersonName}
                        </h3>
                        <div style={{ color: "#999", marginBottom: "8px" }}>
                          Flag Reason: <span style={{ color: "#f59e0b" }}>{commission.flagReason}</span>
                        </div>
                        {commission.flagReason === "AWAITING_PRICES" && (
                          <div style={{ color: "#999" }}>
                            Missing prices for order items
                          </div>
                        )}
                        {commission.flagReason === "PRICE_CHANGED" && (
                          <div style={{ color: "#999" }}>
                            Prices changed after commission calculation
                            <div style={{ marginTop: "8px", fontSize: "14px" }}>
                              Old total: {formatCurrency(commission.orderTotalAmount)} →{" "}
                              New total: Check current prices
                            </div>
                          </div>
                        )}
                        {commission.flagReason === "ORDER_DELETED" && (
                          <div style={{ color: "#999" }}>
                            Order was deleted - commission is orphaned
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {commission.flagReason === "AWAITING_PRICES" && commission.orderId && (
                          <button
                            onClick={() => router.push(`/admin/orders/${commission.orderId}`)}
                            style={{
                              padding: "8px 16px",
                              background: "#dc2626",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            View Order
                          </button>
                        )}
                        {commission.flagReason === "PRICE_CHANGED" && user.role === "SUPER_ADMIN" && (
                          <button
                            onClick={() => handleRecalculate(commission.id)}
                            style={{
                              padding: "8px 16px",
                              background: "#f59e0b",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            Recalculate
                          </button>
                        )}
                        <button
                          onClick={() => handleUnflag(commission.id)}
                          style={{
                            padding: "8px 16px",
                            background: "#666",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Unflag
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {flaggedCommissions.length === 0 && (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    No flagged commissions
                  </div>
                )}
              </div>
            )}

            {/* Pending Approval Tab */}
            {activeTab === "pending" && (
              <div>
                <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#999" }}>
                    {payoutGroups.length} agents with pending commissions
                  </div>
                  <div>
                    Total pending: {formatCurrency(
                      payoutGroups.reduce((sum, group) => sum + group.total, 0)
                    )}
                  </div>
                </div>

                {payoutGroups.map((group) => (
                  <div
                    key={group.salesPerson}
                    style={{
                      background: "#1a1a1a",
                      borderRadius: "8px",
                      border: "1px solid #333",
                      marginBottom: "20px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      onClick={() => toggleGroup(group.salesPerson)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "20px",
                        cursor: "pointer",
                        background: expandedGroups.has(group.salesPerson) ? "#252525" : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            color: "white",
                          }}
                        >
                          {group.salesPerson.split(" ").map(n => n[0]).join("").toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "16px" }}>{group.salesPerson}</div>
                          <div style={{ color: "#999", fontSize: "14px" }}>
                            {group.payouts.length} orders • Rate: {group.payouts[0]?.itemCommission?.commission?.commissionRate || 0}%
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#999", fontSize: "14px" }}>Total Commission</div>
                        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#dc2626" }}>
                          {formatCurrency(group.total)}
                        </div>
                      </div>
                      <span style={{ color: "#999", transition: "transform 0.3s", transform: expandedGroups.has(group.salesPerson) ? "rotate(180deg)" : "rotate(0)" }}>
                        ▼
                      </span>
                    </div>

                    {expandedGroups.has(group.salesPerson) && (
                      <div style={{ padding: "0 20px 20px" }}>
                        <div style={{ marginBottom: "16px" }}>
                          <button
                            onClick={() => selectAllInGroup(group)}
                            style={{
                              padding: "8px 16px",
                              background: "#333",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              marginRight: "8px",
                            }}
                          >
                            Select All
                          </button>
                        </div>
                        <table style={{ width: "100%", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "27%" }} />
                            <col style={{ width: "27%" }} />
                            {stageSettings.map((_, index) => (
                              <col key={index} style={{ width: "50px" }} />
                            ))}
                            <col style={{ width: "100px" }} />
                            <col style={{ width: "70px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #333" }}>
                              <th style={{ padding: "4px", textAlign: "left", fontSize: "11px" }}>✓</th>
                              <th style={{ padding: "8px", textAlign: "left", fontSize: "12px" }}>Customer Name</th>
                              <th style={{ padding: "8px", textAlign: "left", fontSize: "12px" }}>Item Name</th>
                              {stageSettings.map((stageSetting, index) => (
                                <th
                                  key={stageSetting.stage}
                                  style={{
                                    padding: "4px 2px",
                                    textAlign: "center",
                                    fontSize: "11px",
                                    color: "#fff"
                                  }}
                                  title={`${stageSetting.stage} (${stageSetting.percentage}%)`}
                                >
                                  P{index + 1}
                                </th>
                              ))}
                              <th style={{ padding: "8px 4px", textAlign: "right", fontSize: "12px" }}>Amount</th>
                              <th style={{ padding: "4px", textAlign: "center", fontSize: "11px" }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.payouts.map((payout) => (
                              <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ padding: "4px", textAlign: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedPayouts.has(payout.id)}
                                    onChange={() => togglePayoutSelection(payout.id)}
                                  />
                                </td>
                                <td style={{ padding: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <a
                                    href={`/admin/orders/${payout.itemCommission.commission.orderId}`}
                                    style={{ color: "#dc2626", textDecoration: "none" }}
                                  >
                                    {payout.itemCommission.commission.order?.account?.name || "N/A"}
                                  </a>
                                </td>
                                <td style={{ padding: "8px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {payout.itemCommission?.productCode || "N/A"}
                                </td>
                                {stageSettings.map((stageSetting) => (
                                  <td
                                    key={stageSetting.stage}
                                    style={{
                                      padding: "4px 2px",
                                      textAlign: "center",
                                      color: "#10b981",
                                      fontSize: "14px"
                                    }}
                                  >
                                    {payout.stage === stageSetting.stage ? "✓" : ""}
                                  </td>
                                ))}
                                <td style={{ padding: "8px 4px", color: "#ccc", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>
                                  {formatCurrency(payout.amount)}
                                  {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && (
                                    <span style={{ color: "#dc2626", fontSize: "11px", marginLeft: "4px" }}>
                                      ({formatCurrency(((payout.itemCommission.itemSubtotal || 0) / stageSettings.length) - (payout.itemCommission.allocatedDiscount / stageSettings.length))})
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: "4px 2px", textAlign: "center" }}>
                                  <button
                                    onClick={() => handleApprovePayout(payout.id)}
                                    title="Approve Payment"
                                    style={{
                                      padding: "4px 6px",
                                      background: "#10b981",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      marginRight: "2px",
                                      fontSize: "12px",
                                    }}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayout(payout.id)}
                                    title="Deny Payment"
                                    style={{
                                      padding: "4px 6px",
                                      background: "#dc2626",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                    }}
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}

                {payoutGroups.length === 0 && (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    No pending approvals
                  </div>
                )}
              </div>
            )}

            {/* Approved Tab */}
            {activeTab === "approved" && (
              <div>
                <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#999" }}>
                    {approvedPayouts.length} approved payouts ready for payment
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      style={{
                        padding: "8px",
                        background: "#1a1a1a",
                        color: "white",
                        border: "1px solid #333",
                        borderRadius: "4px",
                      }}
                    >
                      <option value="Check">Check</option>
                      <option value="Wire">Wire Transfer</option>
                      <option value="ACH">ACH</option>
                      <option value="Cash">Cash</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Payment notes (optional)"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      style={{
                        padding: "8px",
                        background: "#1a1a1a",
                        color: "white",
                        border: "1px solid #333",
                        borderRadius: "4px",
                        width: "200px",
                      }}
                    />
                  </div>
                </div>

                <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
                  <table style={{ width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "40px" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "90px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{ padding: "4px", textAlign: "center", fontSize: "11px" }}>
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPayouts(new Set(approvedPayouts.map(p => p.id)));
                              } else {
                                setSelectedPayouts(new Set());
                              }
                            }}
                          />
                        </th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Customer Name</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Item Name</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Sales Rep</th>
                        <th style={{ padding: "8px 4px", textAlign: "center", color: "#fff", fontSize: "12px" }}>Payment</th>
                        <th style={{ padding: "8px 4px", textAlign: "right", color: "#999", fontSize: "12px" }}>Amount</th>
                        <th style={{ padding: "8px 4px", textAlign: "left", color: "#999", fontSize: "12px" }}>Approved</th>
                        <th style={{ padding: "4px", textAlign: "center", color: "#999", fontSize: "11px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedPayouts.map((payout) => {
                        const paymentNumber = stageSettings.findIndex(s => s.stage === payout.stage) + 1;
                        return (
                          <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                            <td style={{ padding: "4px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedPayouts.has(payout.id)}
                                onChange={() => togglePayoutSelection(payout.id)}
                              />
                            </td>
                            <td style={{ padding: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <a
                                href={`/admin/orders/${payout.itemCommission.commission.orderId}`}
                                style={{ color: "#dc2626", textDecoration: "none" }}
                              >
                                {payout.itemCommission.commission.order?.account?.name || "N/A"}
                              </a>
                            </td>
                            <td style={{ padding: "8px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {payout.itemCommission?.productCode || "N/A"}
                            </td>
                            <td style={{ padding: "8px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {payout.itemCommission.commission.salesPersonName}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#999", textAlign: "center", fontSize: "11px" }}>
                              P{paymentNumber > 0 ? paymentNumber : "?"}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#10b981", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>
                              {formatCurrency(payout.amount)}
                              {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && (
                                <span style={{ color: "#dc2626", fontSize: "11px", marginLeft: "4px" }}>
                                  ({formatCurrency(((payout.itemCommission.itemSubtotal || 0) / stageSettings.length) - (payout.itemCommission.allocatedDiscount / stageSettings.length))})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#999", fontSize: "11px" }}>
                              {new Date(payout.approvedAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "4px 2px", textAlign: "center" }}>
                              <button
                                onClick={() => handleMarkAsPaid(payout.id)}
                                title="Mark as Paid"
                                style={{
                                  padding: "4px 8px",
                                  background: "#10b981",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  marginRight: "2px",
                                }}
                              >
                                Pay
                              </button>
                              <button
                                onClick={() => handleUnapprove(payout.id)}
                                title="Undo Approval (Move back to Pending)"
                                style={{
                                  padding: "4px 8px",
                                  background: "#f59e0b",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                }}
                              >
                                ↶
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {approvedPayouts.length === 0 && (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    No approved payouts ready for payment
                  </div>
                )}
              </div>
            )}

            {/* Recently Paid Tab */}
            {activeTab === "paid" && (
              <div>
                <div style={{ marginBottom: "20px", color: "#999" }}>
                  Last 50 paid commissions
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
                  <table style={{ width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "70px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "13%" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Customer Name</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Item Name</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Sales Rep</th>
                        <th style={{ padding: "8px 4px", textAlign: "center", color: "#fff", fontSize: "12px" }}>Payment</th>
                        <th style={{ padding: "8px 4px", textAlign: "right", color: "#999", fontSize: "12px" }}>Amount</th>
                        <th style={{ padding: "8px 4px", textAlign: "left", color: "#999", fontSize: "12px" }}>Method</th>
                        <th style={{ padding: "8px 4px", textAlign: "left", color: "#999", fontSize: "12px" }}>Paid Date</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#999", fontSize: "12px" }}>Paid By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentlyPaid.map((payout) => {
                        const paymentNumber = stageSettings.findIndex(s => s.stage === payout.stage) + 1;
                        return (
                          <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                            <td style={{ padding: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <a
                                href={`/admin/orders/${payout.itemCommission.commission.orderId}`}
                                style={{ color: "#dc2626", textDecoration: "none" }}
                              >
                                {payout.itemCommission.commission.order?.account?.name || "N/A"}
                              </a>
                            </td>
                            <td style={{ padding: "8px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {payout.itemCommission?.productCode || "N/A"}
                            </td>
                            <td style={{ padding: "8px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {payout.itemCommission.commission.salesPersonName}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#999", textAlign: "center", fontSize: "11px" }}>
                              P{paymentNumber > 0 ? paymentNumber : "?"}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#ccc", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>
                              {formatCurrency(payout.amount)}
                              {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && (
                                <span style={{ color: "#dc2626", fontSize: "11px", marginLeft: "4px" }}>
                                  ({formatCurrency(((payout.itemCommission.itemSubtotal || 0) / stageSettings.length) - (payout.itemCommission.allocatedDiscount / stageSettings.length))})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#999", fontSize: "11px" }}>
                              {payout.paymentMethod || "N/A"}
                            </td>
                            <td style={{ padding: "8px 4px", color: "#999", fontSize: "11px" }}>
                              {new Date(payout.paidAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "8px", color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px" }}>
                              {payout.paidByName || "N/A"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {recentlyPaid.length === 0 && (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    No payment history available
                  </div>
                )}
              </div>
            )}

            {/* Orphaned Commissions Tab */}
            {activeTab === "orphaned" && (
              <div>
                <div style={{ marginBottom: "20px", color: "#f59e0b" }}>
                  ⚠️ These commissions are from deleted orders
                </div>
                {orphanedCommissions.map((commission) => (
                  <div
                    key={commission.id}
                    style={{
                      background: "#1a1a1a",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "20px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <h3 style={{ color: "#f59e0b", marginBottom: "8px" }}>
                          PO #{commission.order?.poNumber || "Unknown"} - {commission.salesPersonName}
                        </h3>
                        <div style={{ color: "#999", marginBottom: "4px" }}>
                          Commission: {formatCurrency(commission.totalCommissionAmount)}
                        </div>
                        <div style={{ color: "#999", fontSize: "14px" }}>
                          Status: {commission.status}
                        </div>
                        <div style={{ marginTop: "8px" }}>
                          {commission.itemCommissions?.map((itemComm) => 
                            itemComm.payouts?.map((payout) => (
                              <div key={payout.id} style={{ color: "#666", fontSize: "13px" }}>
                                {payout.stage}: {formatCurrency(payout.amount)} ({payout.status})
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {user.role === "SUPER_ADMIN" && (
                          <button
                            onClick={() => handleDeleteOrphanedCommission(commission.id)}
                            style={{
                              padding: "8px 16px",
                              background: "#dc2626",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            Delete Commission
                          </button>
                        )}
                        <button
                          style={{
                            padding: "8px 16px",
                            background: "#666",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Keep for Records
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {orphanedCommissions.length === 0 && (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    No orphaned commissions
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Bulk Actions Bar */}
        {(activeTab === "pending" || activeTab === "approved") && selectedPayouts.size > 0 && (
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#1a1a1a",
              padding: "20px",
              borderTop: "2px solid #333",
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span style={{ color: "#999" }}>
              {selectedPayouts.size} selected
            </span>
            {activeTab === "pending" && (
              <button
                onClick={handleBulkApprove}
                style={{
                  padding: "10px 20px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Approve Selected ({selectedPayouts.size})
              </button>
            )}
            {activeTab === "approved" && (
              <button
                onClick={handleBulkPay}
                style={{
                  padding: "10px 20px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Mark Selected as Paid ({selectedPayouts.size})
              </button>
            )}
            <button
              onClick={() => setSelectedPayouts(new Set())}
              style={{
                padding: "10px 20px",
                background: "#666",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Reject Payment Modal */}
      {showRejectModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowRejectModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              ✕ Deny Commission Payment
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Please provide a reason for denying this commission payment. This will be logged in the audit trail.
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0", fontSize: "14px", color: "#ef4444" }}>
                <strong>Note:</strong> Denied payments will be reset to WAITING status and can be retriggered.
              </p>
            </div>
            <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}>
              <strong>Reason:</strong>
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter reason for denying payment (minimum 10 characters)"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "10px",
                background: "#252525",
                border: "1px solid #404040",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "14px",
                marginBottom: "1rem",
                fontFamily: "inherit"
              }}
            />
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeReject}
                disabled={rejectionReason.trim().length < 10}
                style={{
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: rejectionReason.trim().length < 10 ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: rejectionReason.trim().length < 10 ? 0.5 : 1
                }}
              >
                Deny Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unflag Commission Modal */}
      {showUnflagModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowUnflagModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              Remove Flag from Commission
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Are you sure you want to unflag this commission? You can optionally add review notes.
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0", fontSize: "14px", color: "#f59e0b" }}>
                <strong>Note:</strong> This action will be recorded in the audit log.
              </p>
            </div>
            <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}>
              <strong>Review Notes (Optional):</strong>
            </p>
            <textarea
              value={unflagNotes}
              onChange={(e) => setUnflagNotes(e.target.value)}
              placeholder="Optional notes about resolving this flag"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "10px",
                background: "#252525",
                border: "1px solid #404040",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "14px",
                marginBottom: "1rem",
                fontFamily: "inherit"
              }}
            />
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => setShowUnflagModal(false)}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeUnflag}
                style={{
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Unflag Commission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Orphaned Commission Modal */}
      {showDeleteOrphanModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowDeleteOrphanModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              🗑️ Delete Orphaned Commission
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Are you sure you want to permanently delete this orphaned commission?
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#ef4444" }}>
                <strong>Warning:</strong> This action cannot be undone.
              </p>
              <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#ef4444" }}>
                <li>The commission record will be permanently deleted</li>
                <li>All associated payout records will be removed</li>
                <li>This action will be logged in the audit trail</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => setShowDeleteOrphanModal(false)}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteOrphan}
                style={{
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Delete Commission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recalculate Commission Modal */}
      {showRecalculateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowRecalculateModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              🔄 Recalculate Commission
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Are you sure you want to recalculate this commission based on current order prices?
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#f59e0b" }}>
                <strong>Note:</strong> This will update commission amounts:
              </p>
              <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
                <li>Commission will be recalculated using current item prices</li>
                <li>All pending payouts will be updated</li>
                <li>Approved and paid payouts will NOT be affected</li>
                <li>This action will be logged in the audit trail</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => setShowRecalculateModal(false)}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeRecalculate}
                style={{
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unapprove Payment Modal */}
      {showUnapproveModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowUnapproveModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              ↶ Undo Approval
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Are you sure you want to move this payment back to pending status?
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#f59e0b" }}>
                <strong>Note:</strong> This will:
              </p>
              <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
                <li>Move the payment back to PENDING status</li>
                <li>Clear approval information</li>
                <li>Allow the payment to be re-reviewed</li>
                <li>Log this action in the audit trail</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => setShowUnapproveModal(false)}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeUnapprove}
                style={{
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Undo Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate PDF Report Modal */}
      {showPdfModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowPdfModal(false)}
        >
          <div
            style={{
              background: "#1a1a1a",
              padding: "30px",
              borderRadius: "12px",
              maxWidth: "500px",
              width: "90%",
              border: "1px solid #333",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "24px", color: "#dc2626", fontSize: "20px" }}>
              Generate Commission Report
            </h2>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>
                Sales Agent
              </label>
              <select
                value={pdfAgent}
                onChange={(e) => setPdfAgent(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "4px",
                  color: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="">Select an agent...</option>
                {availableAgents.map((agent) => (
                  <option key={agent.id} value={agent.name}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>
                Start Date
              </label>
              <input
                type="date"
                value={pdfStartDate}
                onChange={(e) => setPdfStartDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "4px",
                  color: "#fff",
                  fontSize: "14px",
                }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>
                End Date
              </label>
              <input
                type="date"
                value={pdfEndDate}
                onChange={(e) => setPdfEndDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "4px",
                  color: "#fff",
                  fontSize: "14px",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowPdfModal(false);
                  setPdfAgent("");
                  setPdfStartDate("");
                  setPdfEndDate("");
                }}
                style={{
                  background: "#2a2a2a",
                  color: "#999",
                  border: "1px solid #444",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={generatePdfReport}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {showNotification && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: notificationType === "success" ? "#10b981" : "#dc2626",
            color: "white",
            padding: "16px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            zIndex: 99999,
            minWidth: "300px",
            maxWidth: "500px",
            fontSize: "15px",
            fontWeight: "600",
            textAlign: "center",
            animation: "slideIn 0.3s ease-out"
          }}
        >
          {notificationMessage}
        </div>
      )}
    </>
  );
}
