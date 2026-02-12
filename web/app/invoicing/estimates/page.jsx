"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'VIEWED', label: 'Viewed' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'EXPIRED', label: 'Expired' }
];

const STATUS_COLORS = {
  DRAFT: { bg: 'rgba(156, 163, 175, 0.1)', border: 'rgba(156, 163, 175, 0.3)', text: '#9ca3af' },
  SENT: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
  VIEWED: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' },
  ACCEPTED: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  DECLINED: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  EXPIRED: { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)', text: '#eab308' },
  CONVERTED: { bg: 'rgba(20, 184, 166, 0.1)', border: 'rgba(20, 184, 166, 0.3)', text: '#14b8a6' }
};

export default function EstimatesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [salesReps, setSalesReps] = useState([]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadEstimates();
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

  async function loadEstimates() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/estimates?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load estimates");
      }

      const data = await res.json();
      setEstimates(data);
    } catch (e) {
      console.error("Error loading estimates:", e);
      setError("Failed to load estimates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadEstimates();
    }
  }, [statusFilter]);

  const filteredEstimates = estimates.filter((estimate) => {
    // Sales rep filter
    if (salesRepFilter && estimate.createdById !== salesRepFilter) {
      return false;
    }

    // Search filter
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      estimate.estimateNumber?.toLowerCase().includes(searchLower) ||
      estimate.customer?.firstName?.toLowerCase().includes(searchLower) ||
      estimate.customer?.lastName?.toLowerCase().includes(searchLower) ||
      estimate.customer?.company?.toLowerCase().includes(searchLower) ||
      estimate.customer?.companyName?.toLowerCase().includes(searchLower)
    );
  });

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    outline: "none"
  };

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

  const isExpired = (expiryDate) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading estimates...
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 4 }}>
              Estimates
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              {filteredEstimates.length} estimate{filteredEstimates.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/invoicing/estimate-templates"
              style={{
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                textDecoration: "none",
                fontSize: "14px"
              }}
            >
              Templates
            </Link>
            <Link
              href="/invoicing/estimates/new"
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "600"
              }}
            >
              + New Estimate
            </Link>
          </div>
        </div>

        {error && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444"
          }}>
            {error}
          </div>
        )}

        {/* Filters */}
        <div style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
          alignItems: "center"
        }}>
          <input
            type="text"
            placeholder="Search estimates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, minWidth: "250px", flex: 1 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "150px" }}
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={salesRepFilter}
            onChange={(e) => setSalesRepFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "180px" }}
          >
            <option value="">All Sales Reps</option>
            {salesReps.map(rep => (
              <option key={rep.id} value={rep.id}>
                {rep.name || rep.email}
              </option>
            ))}
          </select>
        </div>

        {/* Estimates Table */}
        <div style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "12px",
          overflow: "hidden"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Estimate #</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Customer</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Date</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Expires</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Items</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEstimates.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: "60px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>📄</div>
                    <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
                      {searchTerm || statusFilter ? "No estimates match your filters" : "No estimates yet"}
                    </p>
                    {!searchTerm && !statusFilter && (
                      <Link
                        href="/invoicing/estimates/new"
                        style={{
                          display: "inline-block",
                          padding: "10px 20px",
                          background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                          borderRadius: "8px",
                          color: "white",
                          textDecoration: "none",
                          fontSize: "14px",
                          fontWeight: "600"
                        }}
                      >
                        Create your first estimate
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                filteredEstimates.map((estimate) => {
                  const statusColor = STATUS_COLORS[estimate.status] || STATUS_COLORS.DRAFT;
                  const expired = isExpired(estimate.expiryDate) && estimate.status !== 'ACCEPTED' && estimate.status !== 'DECLINED' && estimate.status !== 'EXPIRED';

                  return (
                    <tr
                      key={estimate.id}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                      onClick={() => router.push(`/invoicing/estimates/${estimate.id}`)}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontFamily: "monospace", color: "#dc2626", fontWeight: "500" }}>
                          {estimate.estimateNumber}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>
                          {estimate.customer?.firstName} {estimate.customer?.lastName}
                        </div>
                        {(estimate.customer?.company || estimate.customer?.companyName) && (
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                            {estimate.customer?.company || estimate.customer?.companyName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>
                        {formatDate(estimate.estimateDate)}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          color: expired ? "#ef4444" : "rgba(255,255,255,0.7)",
                          fontSize: "13px"
                        }}>
                          {formatDate(estimate.expiryDate)}
                          {expired && <span style={{ marginLeft: 6, fontSize: "11px" }}>(Expired)</span>}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <span style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                          {formatCurrency(estimate.total)}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                        {estimate._count?.items || 0}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          background: statusColor.bg,
                          border: `1px solid ${statusColor.border}`,
                          borderRadius: "6px",
                          color: statusColor.text,
                          fontSize: "12px",
                          fontWeight: "500"
                        }}>
                          {estimate.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/invoicing/estimates/${estimate.id}`);
                          }}
                          style={{
                            padding: "6px 12px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "6px",
                            color: "rgba(255, 255, 255, 0.9)",
                            cursor: "pointer",
                            fontSize: "13px"
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
