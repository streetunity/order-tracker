"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const STATUS_COLORS = {
  // Estimate statuses
  DRAFT: { bg: 'rgba(156, 163, 175, 0.1)', border: 'rgba(156, 163, 175, 0.3)', text: '#9ca3af' },
  SENT: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
  VIEWED: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' },
  ACCEPTED: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  DECLINED: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  EXPIRED: { bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)', text: '#6b7280' },
  CONVERTED: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  // Invoice statuses
  PARTIAL: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  PAID: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  OVERDUE: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  VOID: { bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)', text: '#6b7280' },
  // Payment statuses
  COMPLETED: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  PROCESSING: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' }
};

export default function CustomerPortalPage() {
  const params = useParams();
  const [customer, setCustomer] = useState(null);
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("estimates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data for each tab
  const [estimates, setEstimates] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    loadPortal();
  }, [params.token]);

  useEffect(() => {
    if (customer) {
      loadTabData(activeTab);
    }
  }, [activeTab, customer]);

  async function loadPortal() {
    try {
      const res = await fetch(`/api/portal/${params.token}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Invalid or expired portal access");
        } else {
          throw new Error("Failed to load portal");
        }
        return;
      }

      const data = await res.json();
      setCustomer(data.customer);
      setSummary(data.summary);
    } catch (e) {
      console.error("Error loading portal:", e);
      setError("Unable to access portal");
    } finally {
      setLoading(false);
    }
  }

  async function loadTabData(tab) {
    setDataLoading(true);
    try {
      const res = await fetch(`/api/portal/${params.token}/${tab}`);
      if (res.ok) {
        const data = await res.json();
        if (tab === "estimates") setEstimates(data);
        else if (tab === "invoices") setInvoices(data);
        else if (tab === "payments") setPayments(data);
      }
    } catch (e) {
      console.error(`Error loading ${tab}:`, e);
    } finally {
      setDataLoading(false);
    }
  }

  async function downloadPdf(type, id, number) {
    try {
      const res = await fetch(`/api/portal/${params.token}/${type}/${id}/pdf`);
      if (!res.ok) throw new Error("PDF not available");

      const data = await res.json();
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
    } catch (e) {
      console.error("Error downloading PDF:", e);
      alert("PDF is not available for download");
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const containerStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
    padding: "40px 20px"
  };

  const cardStyle = {
    maxWidth: "1000px",
    margin: "0 auto",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    padding: "32px"
  };

  const tabStyle = (isActive) => ({
    padding: "10px 20px",
    background: isActive ? "rgba(220, 38, 38, 0.1)" : "transparent",
    border: isActive ? "1px solid rgba(220, 38, 38, 0.5)" : "1px solid transparent",
    borderRadius: "8px",
    color: isActive ? "#dc2626" : "rgba(255, 255, 255, 0.6)",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500"
  });

  const statCardStyle = {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "16px 20px",
    textAlign: "center"
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Loading...</div>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>Accessing your portal</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
          <h2 style={{ color: "#ef4444", marginBottom: "8px" }}>{error}</h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            Please contact us if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: "8px" }}>
            Customer Portal
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "16px" }}>
            Welcome, {customer?.firstName} {customer?.lastName}
            {(customer?.company || customer?.companyName) && (
              <span style={{ color: "rgba(255,255,255,0.5)" }}>
                {" "}— {customer.company || customer.companyName}
              </span>
            )}
          </p>
        </div>

        {/* Summary Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px", textTransform: "uppercase" }}>
              Estimates
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "rgba(255,255,255,0.9)" }}>
              {summary?.estimateCount || 0}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px", textTransform: "uppercase" }}>
              Invoices
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "rgba(255,255,255,0.9)" }}>
              {summary?.invoiceCount || 0}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px", textTransform: "uppercase" }}>
              Payments
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#22c55e" }}>
              {summary?.paymentCount || 0}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px", textTransform: "uppercase" }}>
              Outstanding
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: summary?.outstandingBalance > 0 ? "#f59e0b" : "#22c55e" }}>
              {formatCurrency(summary?.outstandingBalance || 0)}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "16px" }}>
          <button onClick={() => setActiveTab("estimates")} style={tabStyle(activeTab === "estimates")}>
            Estimates
          </button>
          <button onClick={() => setActiveTab("invoices")} style={tabStyle(activeTab === "invoices")}>
            Invoices
          </button>
          <button onClick={() => setActiveTab("payments")} style={tabStyle(activeTab === "payments")}>
            Payment History
          </button>
        </div>

        {/* Tab Content */}
        {dataLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading...
          </div>
        ) : (
          <>
            {/* Estimates Tab */}
            {activeTab === "estimates" && (
              <div>
                {estimates.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: "40px", marginBottom: "12px" }}>📝</div>
                    <p style={{ color: "rgba(255,255,255,0.5)" }}>No estimates available</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {estimates.map((est) => {
                      const statusColor = STATUS_COLORS[est.status] || STATUS_COLORS.DRAFT;
                      return (
                        <div
                          key={est.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "16px 20px",
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "10px"
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: "4px" }}>
                              {est.estimateNumber}
                              {est.version > 1 && <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginLeft: "8px" }}>v{est.version}</span>}
                            </div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                              {formatDate(est.estimateDate)} • Valid until {formatDate(est.expiryDate)}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                                {formatCurrency(est.total)}
                              </div>
                              <span style={{
                                padding: "3px 8px",
                                background: statusColor.bg,
                                border: `1px solid ${statusColor.border}`,
                                borderRadius: "4px",
                                color: statusColor.text,
                                fontSize: "11px",
                                fontWeight: "500"
                              }}>
                                {est.isSigned ? "SIGNED" : est.status}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                              {!est.isSigned && ['SENT', 'VIEWED'].includes(est.status) && (
                                <Link
                                  href={`/sign/${est.id}`}
                                  style={{
                                    padding: "8px 16px",
                                    background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                                    border: "none",
                                    borderRadius: "6px",
                                    color: "white",
                                    fontSize: "13px",
                                    fontWeight: "500",
                                    textDecoration: "none"
                                  }}
                                >
                                  Sign
                                </Link>
                              )}
                              {est.pdfS3Key && (
                                <button
                                  onClick={() => downloadPdf("estimates", est.id, est.estimateNumber)}
                                  style={{
                                    padding: "8px 12px",
                                    background: "rgba(255, 255, 255, 0.05)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: "6px",
                                    color: "rgba(255, 255, 255, 0.9)",
                                    fontSize: "13px",
                                    cursor: "pointer"
                                  }}
                                >
                                  PDF
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === "invoices" && (
              <div>
                {invoices.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: "40px", marginBottom: "12px" }}>📊</div>
                    <p style={{ color: "rgba(255,255,255,0.5)" }}>No invoices available</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {invoices.map((inv) => {
                      const displayStatus = inv.isOverdue ? "OVERDUE" : inv.status;
                      const statusColor = STATUS_COLORS[displayStatus] || STATUS_COLORS.SENT;
                      return (
                        <div
                          key={inv.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "16px 20px",
                            background: "rgba(255, 255, 255, 0.03)",
                            border: inv.isOverdue ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "10px"
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: "4px" }}>
                              {inv.invoiceNumber}
                            </div>
                            <div style={{ fontSize: "13px", color: inv.isOverdue ? "#ef4444" : "rgba(255,255,255,0.5)" }}>
                              {formatDate(inv.invoiceDate)} • Due: {formatDate(inv.dueDate)}
                              {inv.isOverdue && " (Overdue)"}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                                {formatCurrency(inv.total)}
                              </div>
                              {inv.balanceDue > 0 && inv.balanceDue !== inv.total && (
                                <div style={{ fontSize: "12px", color: "#f59e0b" }}>
                                  Due: {formatCurrency(inv.balanceDue)}
                                </div>
                              )}
                              <span style={{
                                padding: "3px 8px",
                                background: statusColor.bg,
                                border: `1px solid ${statusColor.border}`,
                                borderRadius: "4px",
                                color: statusColor.text,
                                fontSize: "11px",
                                fontWeight: "500"
                              }}>
                                {displayStatus}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                              {inv.balanceDue > 0 && inv.status !== "VOID" && (
                                <Link
                                  href={`/pay/invoice/${inv.id}`}
                                  style={{
                                    padding: "8px 16px",
                                    background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                                    border: "none",
                                    borderRadius: "6px",
                                    color: "white",
                                    fontSize: "13px",
                                    fontWeight: "500",
                                    textDecoration: "none"
                                  }}
                                >
                                  Pay
                                </Link>
                              )}
                              {inv.pdfS3Key && (
                                <button
                                  onClick={() => downloadPdf("invoices", inv.id, inv.invoiceNumber)}
                                  style={{
                                    padding: "8px 12px",
                                    background: "rgba(255, 255, 255, 0.05)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: "6px",
                                    color: "rgba(255, 255, 255, 0.9)",
                                    fontSize: "13px",
                                    cursor: "pointer"
                                  }}
                                >
                                  PDF
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Payments Tab */}
            {activeTab === "payments" && (
              <div>
                {payments.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: "40px", marginBottom: "12px" }}>💳</div>
                    <p style={{ color: "rgba(255,255,255,0.5)" }}>No payment history</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {payments.map((pmt) => {
                      const statusColor = STATUS_COLORS[pmt.status] || STATUS_COLORS.COMPLETED;
                      return (
                        <div
                          key={pmt.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "16px 20px",
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "10px"
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: "4px" }}>
                              {pmt.paymentNumber}
                            </div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                              {formatDate(pmt.paymentDate)} • {pmt.paymentMethod}
                              {pmt.last4 && ` •••• ${pmt.last4}`}
                              {pmt.invoice && ` • ${pmt.invoice.invoiceNumber}`}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: "600", color: "#22c55e", fontSize: "18px" }}>
                                {formatCurrency(pmt.amount)}
                              </div>
                              <span style={{
                                padding: "3px 8px",
                                background: statusColor.bg,
                                border: `1px solid ${statusColor.border}`,
                                borderRadius: "4px",
                                color: statusColor.text,
                                fontSize: "11px",
                                fontWeight: "500"
                              }}>
                                {pmt.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "40px",
          paddingTop: "20px",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          textAlign: "center"
        }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
            Secure customer portal • All documents and payments are encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
