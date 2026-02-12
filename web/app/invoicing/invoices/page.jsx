"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const STATUS_COLORS = {
  DRAFT: { bg: 'rgba(156, 163, 175, 0.1)', border: 'rgba(156, 163, 175, 0.3)', text: '#9ca3af' },
  SENT: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
  VIEWED: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' },
  PARTIAL: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  PAID: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  OVERDUE: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  VOID: { bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)', text: '#6b7280' }
};

export default function InvoicesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [salesReps, setSalesReps] = useState([]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadInvoices();
    loadSalesReps();
  }, [user, router]);

  async function loadSalesReps() {
    try {
      const res = await fetch("/api/users", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        // Filter to active users flagged as sales reps
        const reps = data.filter(u =>
          u.isActive !== false && u.showInSalesRepDropdown === true
        );
        setSalesReps(reps);
      }
    } catch (e) {
      console.error("Error loading sales reps:", e);
    }
  }

  async function loadInvoices() {
    try {
      const res = await fetch("/api/invoices", {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load invoices");
      }

      const data = await res.json();
      setInvoices(data);
    } catch (e) {
      console.error("Error loading invoices:", e);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesSalesRep = !salesRepFilter || invoice.createdById === salesRepFilter;
    const matchesSearch =
      !searchTerm ||
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.customer &&
        (`${invoice.customer.firstName} ${invoice.customer.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (invoice.customer.company || invoice.customer.companyName || '').toLowerCase().includes(searchTerm.toLowerCase())));

    return matchesStatus && matchesSalesRep && matchesSearch;
  });

  // Calculate summary stats
  const totalOutstanding = invoices
    .filter(i => !['PAID', 'VOID'].includes(i.status))
    .reduce((sum, i) => sum + (i.balanceDue || 0), 0);

  const totalOverdue = invoices
    .filter(i => i.status === 'OVERDUE' || (new Date(i.dueDate) < new Date() && !['PAID', 'VOID'].includes(i.status)))
    .reduce((sum, i) => sum + (i.balanceDue || 0), 0);

  const paidThisMonth = invoices
    .filter(i => {
      if (i.status !== 'PAID') return false;
      const paidDate = new Date(i.updatedAt);
      const now = new Date();
      return paidDate.getMonth() === now.getMonth() && paidDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, i) => sum + (i.total || 0), 0);

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    outline: "none"
  };

  const statCardStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: "20px 24px"
  };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 4 }}>
                Invoices
              </h1>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
                Manage invoices and track payments
              </p>
            </div>
            <Link
              href="/invoicing/invoices/new"
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "14px",
                fontWeight: "500",
                textDecoration: "none",
                display: "inline-block"
              }}
            >
              + New Invoice
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
              Total Invoices
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "rgba(255,255,255,0.9)" }}>
              {invoices.length}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
              Outstanding
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b" }}>
              {formatCurrency(totalOutstanding)}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
              Overdue
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#ef4444" }}>
              {formatCurrency(totalOverdue)}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
              Paid This Month
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#22c55e" }}>
              {formatCurrency(paidThisMonth)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, flex: 1, maxWidth: "300px" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "150px", cursor: "pointer" }}
          >
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="VIEWED">Viewed</option>
            <option value="PARTIAL">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="VOID">Void</option>
          </select>
          <select
            value={salesRepFilter}
            onChange={(e) => setSalesRepFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "180px", cursor: "pointer" }}
          >
            <option value="">All Sales Reps</option>
            {salesReps.map(rep => (
              <option key={rep.id} value={rep.id}>
                {rep.name || rep.email}
              </option>
            ))}
          </select>
        </div>

        {/* Invoices Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading invoices...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
              {searchTerm || statusFilter !== "all" ? "No invoices match your filters" : "No invoices yet"}
            </p>
            {!searchTerm && statusFilter === "all" && (
              <Link
                href="/invoicing/invoices/new"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  background: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  borderRadius: "8px",
                  color: "#dc2626",
                  textDecoration: "none"
                }}
              >
                Create Your First Invoice
              </Link>
            )}
          </div>
        ) : (
          <div style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: "12px",
            overflow: "hidden"
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Invoice #
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Customer
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Date
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Due Date
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Total
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Balance
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Status
                  </th>
                  <th style={{ padding: "14px 16px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "500", textTransform: "uppercase" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => {
                  const statusColor = STATUS_COLORS[invoice.status] || STATUS_COLORS.DRAFT;
                  const isOverdue = new Date(invoice.dueDate) < new Date() && !['PAID', 'VOID'].includes(invoice.status);

                  return (
                    <tr
                      key={invoice.id}
                      style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <Link
                          href={`/invoicing/invoices/${invoice.id}`}
                          style={{ color: "#dc2626", fontFamily: "monospace", textDecoration: "none", fontWeight: "500" }}
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {invoice.customer ? (
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
                              {invoice.customer.firstName} {invoice.customer.lastName}
                            </div>
                            {(invoice.customer.company || invoice.customer.companyName) && (
                              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                                {invoice.customer.company || invoice.customer.companyName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,0.4)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.7)" }}>
                        {formatDate(invoice.invoiceDate)}
                      </td>
                      <td style={{ padding: "14px 16px", color: isOverdue ? "#ef4444" : "rgba(255,255,255,0.7)" }}>
                        {formatDate(invoice.dueDate)}
                        {isOverdue && <span style={{ fontSize: "10px", marginLeft: 4 }}>⚠️</span>}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
                        {formatCurrency(invoice.total)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", color: invoice.balanceDue > 0 ? "#f59e0b" : "#22c55e", fontWeight: "600" }}>
                        {formatCurrency(invoice.balanceDue)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <span style={{
                          padding: "4px 10px",
                          background: statusColor.bg,
                          border: `1px solid ${statusColor.border}`,
                          borderRadius: "6px",
                          color: statusColor.text,
                          fontSize: "12px",
                          fontWeight: "500"
                        }}>
                          {invoice.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <Link
                          href={`/invoicing/invoices/${invoice.id}`}
                          style={{
                            padding: "6px 12px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "6px",
                            color: "rgba(255, 255, 255, 0.9)",
                            fontSize: "13px",
                            textDecoration: "none"
                          }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
