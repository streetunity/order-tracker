"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function CommissionsPage() {
  const { user } = useAuth();
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

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT") {
      router.push("/my-commissions");
    } else {
      fetchData();
    }
  }, [user, router, activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${user.token}` };

      switch (activeTab) {
        case "pending":
          const pendingRes = await fetch("/api/commissions/payouts/pending", { headers });
          if (pendingRes.ok) {
            const data = await pendingRes.json();
            setPayoutGroups(data);
          }
          break;

        case "flagged":
          const flaggedRes = await fetch("/api/commissions/flagged", { headers });
          if (flaggedRes.ok) {
            const data = await flaggedRes.json();
            setFlaggedCommissions(data);
          }
          break;

        case "approved":
          const approvedRes = await fetch("/api/commissions/approved", { headers });
          if (approvedRes.ok) {
            const data = await approvedRes.json();
            setApprovedPayouts(data);
          }
          break;

        case "paid":
          const paidRes = await fetch("/api/commissions/paid?limit=50", { headers });
          if (paidRes.ok) {
            const data = await paidRes.json();
            setRecentlyPaid(data);
          }
          break;

        case "orphaned":
          const orphanedRes = await fetch("/api/commissions/orphaned", { headers });
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
      const res = await fetch(`/api/commissions/payout/${payoutId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ approvalNotes }),
      });

      if (res.ok) {
        alert("Payout approved successfully");
        fetchData();
      } else {
        alert("Failed to approve payout");
      }
    } catch (error) {
      console.error("Error approving payout:", error);
      alert("Error approving payout");
    }
  };

  const handleRejectPayout = async (payoutId, reason) => {
    const rejectionReason = reason || prompt("Please provide a reason for rejection:");
    if (!rejectionReason) return;

    try {
      const res = await fetch(`/api/commissions/payout/${payoutId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ rejectionReason }),
      });

      if (res.ok) {
        alert("Payout rejected");
        fetchData();
      } else {
        alert("Failed to reject payout");
      }
    } catch (error) {
      console.error("Error rejecting payout:", error);
      alert("Error rejecting payout");
    }
  };

  const handleBulkApprove = async () => {
    if (selectedPayouts.size === 0) {
      alert("Please select payouts to approve");
      return;
    }

    try {
      const res = await fetch("/api/commissions/payouts/bulk-approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          payoutIds: Array.from(selectedPayouts),
          approvalNotes,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Approved ${result.updated} payouts`);
        setSelectedPayouts(new Set());
        fetchData();
      } else {
        alert("Failed to bulk approve payouts");
      }
    } catch (error) {
      console.error("Error bulk approving:", error);
      alert("Error bulk approving payouts");
    }
  };

  const handleMarkAsPaid = async (payoutId) => {
    try {
      const res = await fetch(`/api/commissions/payout/${payoutId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ paymentMethod, paymentNotes }),
      });

      if (res.ok) {
        alert("Payment marked as complete");
        fetchData();
      } else {
        alert("Failed to mark as paid");
      }
    } catch (error) {
      console.error("Error marking as paid:", error);
      alert("Error marking as paid");
    }
  };

  const handleBulkPay = async () => {
    if (selectedPayouts.size === 0) {
      alert("Please select payouts to mark as paid");
      return;
    }

    try {
      const res = await fetch("/api/commissions/payouts/bulk-pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          payoutIds: Array.from(selectedPayouts),
          paymentMethod,
          paymentNotes,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Marked ${result.paid} payouts as paid`);
        setSelectedPayouts(new Set());
        fetchData();
      } else {
        alert("Failed to bulk pay");
      }
    } catch (error) {
      console.error("Error bulk paying:", error);
      alert("Error bulk paying");
    }
  };

  const handleDeleteOrphanedCommission = async (commissionId) => {
    if (!confirm("Are you sure you want to delete this orphaned commission?")) return;

    try {
      const res = await fetch(`/api/commissions/${commissionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (res.ok) {
        alert("Orphaned commission deleted");
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || "Failed to delete commission");
      }
    } catch (error) {
      console.error("Error deleting commission:", error);
      alert("Error deleting commission");
    }
  };

  const handleRecalculate = async (commissionId) => {
    if (!confirm("Are you sure you want to recalculate this commission?")) return;

    try {
      const res = await fetch(`/api/commissions/${commissionId}/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (res.ok) {
        alert("Commission recalculated successfully");
        fetchData();
      } else {
        alert("Failed to recalculate commission");
      }
    } catch (error) {
      console.error("Error recalculating:", error);
      alert("Error recalculating commission");
    }
  };

  const handleUnflag = async (commissionId) => {
    const reviewNotes = prompt("Add review notes (optional):");

    try {
      const res = await fetch(`/api/commissions/${commissionId}/unflag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ reviewNotes }),
      });

      if (res.ok) {
        alert("Commission unflagged");
        fetchData();
      } else {
        alert("Failed to unflag commission");
      }
    } catch (error) {
      console.error("Error unflagging:", error);
      alert("Error unflagging commission");
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
        <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "32px", color: "#ef4444" }}>
          Commission Management
        </h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "30px", borderBottom: "2px solid #333" }}>
          {["flagged", "pending", "approved", "paid", "orphaned", user.role === "SUPER_ADMIN" && "settings"]
            .filter(Boolean)
            .map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "12px 24px",
                  background: "none",
                  color: activeTab === tab ? "#ef4444" : "#999",
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid #ef4444" : "2px solid transparent",
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
                            {group.payouts.length} orders • Rate: {group.payouts[0]?.commission?.commissionRate || 0}%
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#999", fontSize: "14px" }}>Total Commission</div>
                        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ef4444" }}>
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
                        <table style={{ width: "100%" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #333" }}>
                              <th style={{ padding: "8px", textAlign: "left" }}>Select</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Order #</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Stage</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Payout %</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Amount</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.payouts.map((payout) => (
                              <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ padding: "8px" }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedPayouts.has(payout.id)}
                                    onChange={() => togglePayoutSelection(payout.id)}
                                  />
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <a
                                    href={`/admin/orders/${payout.commission.orderId}`}
                                    style={{ color: "#ef4444", textDecoration: "none" }}
                                  >
                                    #{payout.commission.order?.poNumber || "N/A"}
                                  </a>
                                </td>
                                <td style={{ padding: "8px", color: "#ccc" }}>{payout.stage}</td>
                                <td style={{ padding: "8px", color: "#ccc" }}>{payout.percentage}%</td>
                                <td style={{ padding: "8px", color: "#ccc", fontWeight: "bold" }}>
                                  {formatCurrency(payout.amount)}
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <button
                                    onClick={() => handleApprovePayout(payout.id)}
                                    style={{
                                      padding: "4px 12px",
                                      background: "#10b981",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      marginRight: "4px",
                                      fontSize: "12px",
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayout(payout.id)}
                                    style={{
                                      padding: "4px 12px",
                                      background: "#ef4444",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                    }}
                                  >
                                    Reject
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
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{ padding: "12px", textAlign: "left" }}>
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
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Order #</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Sales Rep</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Stage</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Amount</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Approved Date</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedPayouts.map((payout) => (
                        <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                          <td style={{ padding: "12px" }}>
                            <input
                              type="checkbox"
                              checked={selectedPayouts.has(payout.id)}
                              onChange={() => togglePayoutSelection(payout.id)}
                            />
                          </td>
                          <td style={{ padding: "12px" }}>
                            <a
                              href={`/admin/orders/${payout.commission.orderId}`}
                              style={{ color: "#ef4444", textDecoration: "none" }}
                            >
                              #{payout.commission.order?.poNumber || "N/A"}
                            </a>
                          </td>
                          <td style={{ padding: "12px", color: "#ccc" }}>
                            {payout.commission.salesPersonName}
                          </td>
                          <td style={{ padding: "12px", color: "#ccc" }}>{payout.stage}</td>
                          <td style={{ padding: "12px", color: "#10b981", fontWeight: "bold" }}>
                            {formatCurrency(payout.amount)}
                          </td>
                          <td style={{ padding: "12px", color: "#999" }}>
                            {new Date(payout.approvedAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: "12px" }}>
                            <button
                              onClick={() => handleMarkAsPaid(payout.id)}
                              style={{
                                padding: "6px 12px",
                                background: "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "12px",
                              }}
                            >
                              Mark as Paid
                            </button>
                          </td>
                        </tr>
                      ))}
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
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Order #</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Sales Rep</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Stage</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Amount</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Payment Method</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Paid Date</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Paid By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentlyPaid.map((payout) => (
                        <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                          <td style={{ padding: "12px" }}>
                            <a
                              href={`/admin/orders/${payout.commission.orderId}`}
                              style={{ color: "#ef4444", textDecoration: "none" }}
                            >
                              #{payout.commission.order?.poNumber || "N/A"}
                            </a>
                          </td>
                          <td style={{ padding: "12px", color: "#ccc" }}>
                            {payout.commission.salesPersonName}
                          </td>
                          <td style={{ padding: "12px", color: "#ccc" }}>{payout.stage}</td>
                          <td style={{ padding: "12px", color: "#ccc", fontWeight: "bold" }}>
                            {formatCurrency(payout.amount)}
                          </td>
                          <td style={{ padding: "12px", color: "#999" }}>
                            {payout.paymentMethod || "N/A"}
                          </td>
                          <td style={{ padding: "12px", color: "#999" }}>
                            {new Date(payout.paidAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: "12px", color: "#999" }}>
                            {payout.paidByName || "N/A"}
                          </td>
                        </tr>
                      ))}
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
                          {commission.payouts?.map((payout) => (
                            <div key={payout.id} style={{ color: "#666", fontSize: "13px" }}>
                              {payout.stage}: {formatCurrency(payout.amount)} ({payout.status})
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {user.role === "SUPER_ADMIN" && (
                          <button
                            onClick={() => handleDeleteOrphanedCommission(commission.id)}
                            style={{
                              padding: "8px 16px",
                              background: "#ef4444",
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
    </>
  );
}
