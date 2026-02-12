"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import InvoicingNav from "@/components/InvoicingNav";
import { useAuth } from "@/contexts/AuthContext";

export default function InvoicingDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentEstimates, setRecentEstimates] = useState([]);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to finish loading before checking user
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    fetchDashboardData();
  }, [user, authLoading, router]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    try {
      const headers = getAuthHeaders();

      // Fetch all dashboard data in parallel
      const [
        pipelineRes,
        estimatesRes,
        invoicesRes,
        leadsRes
      ] = await Promise.all([
        fetch("/api/invoicing-reports/pipeline", { headers }),
        fetch("/api/estimates?limit=5&sort=createdAt&order=desc", { headers }),
        fetch("/api/invoices?limit=20", { headers }),
        fetch("/api/leads?limit=5&sort=createdAt&order=desc", { headers })
      ]);

      // Parse pipeline stats
      if (pipelineRes.ok) {
        const pipelineData = await pipelineRes.json();
        setStats({
          totalPipeline: pipelineData.summary?.totalValue || 0,
          totalEstimates: pipelineData.summary?.totalCount || 0,
          avgDealSize: pipelineData.summary?.avgValue || 0,
        });
      }

      // Parse recent estimates
      if (estimatesRes.ok) {
        const estimatesData = await estimatesRes.json();
        setRecentEstimates(estimatesData.estimates || estimatesData.slice?.(0, 5) || []);
      }

      // Parse invoices - separate pending and overdue
      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        const invoices = invoicesData.invoices || invoicesData || [];

        const pending = invoices.filter(inv =>
          ["SENT", "VIEWED", "PARTIAL"].includes(inv.status)
        ).slice(0, 5);

        const overdue = invoices.filter(inv => {
          if (inv.status === "PAID" || inv.status === "VOID") return false;
          if (!inv.dueDate) return false;
          return new Date(inv.dueDate) < new Date();
        });

        setPendingInvoices(pending);
        setOverdueInvoices(overdue);
      }

      // Parse recent leads
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setRecentLeads(leadsData.leads || leadsData.slice?.(0, 5) || []);
      }
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusStyle = (status) => {
    const styles = {
      DRAFT: { bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)", text: "#6b7280" },
      SENT: { bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)", text: "#3b82f6" },
      VIEWED: { bg: "rgba(99, 102, 241, 0.1)", border: "rgba(99, 102, 241, 0.3)", text: "#6366f1" },
      ACCEPTED: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e" },
      DECLINED: { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", text: "#ef4444" },
      EXPIRED: { bg: "rgba(249, 115, 22, 0.1)", border: "rgba(249, 115, 22, 0.3)", text: "#f97316" },
      PAID: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e" },
      PARTIAL: { bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", text: "#f59e0b" },
      OVERDUE: { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", text: "#ef4444" },
      NEW: { bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)", text: "#3b82f6" },
      CONTACTED: { bg: "rgba(168, 85, 247, 0.1)", border: "rgba(168, 85, 247, 0.3)", text: "#a855f7" },
      QUALIFIED: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e" },
      CONVERTED: { bg: "rgba(20, 184, 166, 0.1)", border: "rgba(20, 184, 166, 0.3)", text: "#14b8a6" },
      LOST: { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", text: "#ef4444" },
    };
    return styles[status] || styles.DRAFT;
  };

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: "20px"
  };

  // Show loading state while auth is being checked
  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 4 }}>
              Invoicing Dashboard
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              Manage leads, customers, estimates, and invoices
            </p>
          </div>
        </div>

        {/* Overdue Alert */}
        {overdueInvoices.length > 0 && (
          <div style={{
            padding: "16px 20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "20px" }}>⚠️</span>
              <div>
                <strong style={{ color: "#ef4444" }}>
                  {overdueInvoices.length} Overdue Invoice{overdueInvoices.length !== 1 ? "s" : ""}
                </strong>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>
                  Total: {formatCurrency(overdueInvoices.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0))}
                </p>
              </div>
            </div>
            <Link
              href="/invoicing/invoices"
              style={{
                padding: "8px 16px",
                background: "rgba(239, 68, 68, 0.2)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "6px",
                color: "#ef4444",
                textDecoration: "none",
                fontSize: "13px"
              }}
            >
              View All
            </Link>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap"
        }}>
          <Link
            href="/invoicing/leads/new"
            style={{
              padding: "12px 20px",
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              borderRadius: "8px",
              color: "white",
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "14px"
            }}
          >
            + New Lead
          </Link>
          <Link
            href="/invoicing/estimates/new"
            style={{
              padding: "12px 20px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "white",
              textDecoration: "none",
              fontWeight: "500",
              fontSize: "14px"
            }}
          >
            + New Estimate
          </Link>
          <Link
            href="/invoicing/invoices/new"
            style={{
              padding: "12px 20px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "white",
              textDecoration: "none",
              fontWeight: "500",
              fontSize: "14px"
            }}
          >
            + New Invoice
          </Link>
          <Link
            href="/invoicing/reports"
            style={{
              padding: "12px 20px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "white",
              textDecoration: "none",
              fontWeight: "500",
              fontSize: "14px"
            }}
          >
            Reports
          </Link>
        </div>

        {/* Navigation Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}>
          <Link href="/invoicing/leads" style={{ textDecoration: "none" }}>
            <div style={{
              ...sectionStyle,
              cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                Leads
              </div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                Manage Leads →
              </div>
            </div>
          </Link>

          <Link href="/invoicing/customers" style={{ textDecoration: "none" }}>
            <div style={{
              ...sectionStyle,
              cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                Customers
              </div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                Manage Customers →
              </div>
            </div>
          </Link>

          <Link href="/invoicing/estimates" style={{ textDecoration: "none" }}>
            <div style={{
              ...sectionStyle,
              cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                Estimates
              </div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                Manage Estimates →
              </div>
            </div>
          </Link>

          <Link href="/invoicing/invoices" style={{ textDecoration: "none" }}>
            <div style={{
              ...sectionStyle,
              cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                Invoices
              </div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                Manage Invoices →
              </div>
            </div>
          </Link>

          <Link href="/invoicing/products" style={{ textDecoration: "none" }}>
            <div style={{
              ...sectionStyle,
              cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                Products
              </div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                Manage Products →
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "rgba(255,255,255,0.5)" }}>
            Loading dashboard...
          </div>
        ) : (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px"
            }}>
              <div style={sectionStyle}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                  Total Pipeline
                </div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
                  {formatCurrency(stats?.totalPipeline)}
                </div>
              </div>

              <div style={sectionStyle}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                  Open Estimates
                </div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "rgba(255,255,255,0.9)" }}>
                  {stats?.totalEstimates || 0}
                </div>
              </div>

              <div style={sectionStyle}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                  Pending Invoices
                </div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b" }}>
                  {pendingInvoices.length}
                </div>
              </div>

              <div style={sectionStyle}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase" }}>
                  Avg Deal Size
                </div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "rgba(255,255,255,0.9)" }}>
                  {formatCurrency(stats?.avgDealSize)}
                </div>
              </div>
            </div>

            {/* Three Column Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
              {/* Recent Leads */}
              <div style={sectionStyle}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px"
                }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                    Recent Leads
                  </h3>
                  <Link
                    href="/invoicing/leads"
                    style={{
                      color: "#dc2626",
                      fontSize: "13px",
                      textDecoration: "none"
                    }}
                  >
                    View All →
                  </Link>
                </div>

                {recentLeads.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>No recent leads</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {recentLeads.map((lead) => (
                      <Link
                        key={lead.id}
                        href={`/invoicing/leads/${lead.id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px",
                          background: "rgba(255, 255, 255, 0.02)",
                          borderRadius: "8px",
                          textDecoration: "none"
                        }}
                      >
                        <div>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>
                            {lead.firstName} {lead.lastName}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                            {lead.company || lead.email}
                          </div>
                        </div>
                        <span style={{
                          padding: "2px 8px",
                          background: getStatusStyle(lead.status).bg,
                          border: `1px solid ${getStatusStyle(lead.status).border}`,
                          borderRadius: "4px",
                          color: getStatusStyle(lead.status).text,
                          fontSize: "10px",
                          fontWeight: "500"
                        }}>
                          {lead.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Estimates */}
              <div style={sectionStyle}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px"
                }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                    Recent Estimates
                  </h3>
                  <Link
                    href="/invoicing/estimates"
                    style={{
                      color: "#dc2626",
                      fontSize: "13px",
                      textDecoration: "none"
                    }}
                  >
                    View All →
                  </Link>
                </div>

                {recentEstimates.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>No recent estimates</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {recentEstimates.map((est) => (
                      <Link
                        key={est.id}
                        href={`/invoicing/estimates/${est.id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px",
                          background: "rgba(255, 255, 255, 0.02)",
                          borderRadius: "8px",
                          textDecoration: "none"
                        }}
                      >
                        <div>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>
                            {est.estimateNumber}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                            {est.customer?.companyName || `${est.customer?.firstName} ${est.customer?.lastName}`}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600", fontSize: "14px" }}>
                            {formatCurrency(est.total)}
                          </div>
                          <span style={{
                            padding: "2px 8px",
                            background: getStatusStyle(est.status).bg,
                            border: `1px solid ${getStatusStyle(est.status).border}`,
                            borderRadius: "4px",
                            color: getStatusStyle(est.status).text,
                            fontSize: "10px",
                            fontWeight: "500"
                          }}>
                            {est.status}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Invoices */}
              <div style={sectionStyle}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px"
                }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                    Pending Invoices
                  </h3>
                  <Link
                    href="/invoicing/invoices"
                    style={{
                      color: "#dc2626",
                      fontSize: "13px",
                      textDecoration: "none"
                    }}
                  >
                    View All →
                  </Link>
                </div>

                {pendingInvoices.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>No pending invoices</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {pendingInvoices.map((inv) => {
                      const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
                      return (
                        <Link
                          key={inv.id}
                          href={`/invoicing/invoices/${inv.id}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px",
                            background: isOverdue ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.02)",
                            border: isOverdue ? "1px solid rgba(239, 68, 68, 0.2)" : "none",
                            borderRadius: "8px",
                            textDecoration: "none"
                          }}
                        >
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>
                              {inv.invoiceNumber}
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                              Due: {formatDate(inv.dueDate)}
                              {isOverdue && <span style={{ color: "#ef4444", marginLeft: "8px" }}>OVERDUE</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600", fontSize: "14px" }}>
                              {formatCurrency(inv.balanceDue)}
                            </div>
                            <span style={{
                              padding: "2px 8px",
                              background: getStatusStyle(inv.status).bg,
                              border: `1px solid ${getStatusStyle(inv.status).border}`,
                              borderRadius: "4px",
                              color: getStatusStyle(inv.status).text,
                              fontSize: "10px",
                              fontWeight: "500"
                            }}>
                              {inv.status}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
