"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const STATUS_COLORS = {
  ACTIVE: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e" },
  INACTIVE: { bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)", text: "#6b7280" },
};

const PAYMENT_TERMS_LABELS = {
  NET15: "Net 15",
  NET30: "Net 30",
  NET60: "Net 60",
  DUE_ON_RECEIPT: "Due on Receipt",
  CUSTOM: "Custom"
};

export default function CustomersPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [salesRepFilter, setSalesRepFilter] = useState("all");
  const [salesReps, setSalesReps] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadCustomers();
    loadSalesReps();
  }, [user, router]);

  async function loadSalesReps() {
    try {
      const res = await fetch("/api/sales-reps", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSalesReps(data);
      }
    } catch (e) {
      console.error("Error loading sales reps:", e);
    }
  }

  async function loadCustomers() {
    try {
      const res = await fetch("/api/customers", {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load customers");
      }

      const data = await res.json();
      setCustomers(data);
    } catch (e) {
      console.error("Error loading customers:", e);
      setError("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusToggle(e, customerId, currentStatus) {
    e.stopPropagation(); // Prevent row click navigation
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      // Update the customer in the local state
      setCustomers(prev => prev.map(c =>
        c.id === customerId ? { ...c, status: newStatus } : c
      ));
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(""), 3000);
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    const matchesSalesRep = salesRepFilter === "all" ||
      (salesRepFilter === "unassigned" && !customer.assignedToId) ||
      customer.assignedToId === salesRepFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      (customer.firstName && customer.firstName.toLowerCase().includes(searchLower)) ||
      (customer.lastName && customer.lastName.toLowerCase().includes(searchLower)) ||
      (customer.email && customer.email.toLowerCase().includes(searchLower)) ||
      (customer.company && customer.company.toLowerCase().includes(searchLower)) ||
      (customer.companyName && customer.companyName.toLowerCase().includes(searchLower)) ||
      (customer.customerNumber && customer.customerNumber.toLowerCase().includes(searchLower)) ||
      (customer.assignedTo?.name && customer.assignedTo.name.toLowerCase().includes(searchLower));

    return matchesStatus && matchesSalesRep && matchesSearch;
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

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading customers...
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
              Customers
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            href="/invoicing/customers/new"
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            + New Customer
          </Link>
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
          flexWrap: "wrap"
        }}>
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, minWidth: "250px", flex: 1 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "150px" }}
          >
            <option value="all">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select
            value={salesRepFilter}
            onChange={(e) => setSalesRepFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "150px" }}
          >
            <option value="all">All Sales Reps</option>
            <option value="unassigned">Unassigned</option>
            {salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
        </div>

        {/* Customer List */}
        <div style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "12px",
          overflow: "hidden"
        }}>
          {filteredCustomers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>👥</div>
              <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
                {searchTerm || statusFilter !== "all" ? "No customers match your filters" : "No customers yet"}
              </p>
              {!searchTerm && statusFilter === "all" && (
                <Link
                  href="/invoicing/customers/new"
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
                  Create your first customer
                </Link>
              )}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Customer #</th>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Name / Company</th>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Email</th>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Phone</th>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Terms</th>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Sales Rep</th>
                  <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const statusColor = STATUS_COLORS[customer.status] || STATUS_COLORS.ACTIVE;
                  const displayName = customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'No Name';
                  const contactName = customer.companyName ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : null;

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => router.push(`/invoicing/customers/${customer.id}`)}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "16px", fontFamily: "monospace", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
                        {customer.customerNumber}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>{displayName}</div>
                        {contactName && (
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginTop: 2 }}>{contactName}</div>
                        )}
                      </td>
                      <td style={{ padding: "16px", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                        {customer.email || '—'}
                      </td>
                      <td style={{ padding: "16px", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                        {customer.phone || '—'}
                      </td>
                      <td style={{ padding: "16px", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                        {PAYMENT_TERMS_LABELS[customer.paymentTerms] || customer.paymentTerms || 'Net 30'}
                      </td>
                      <td style={{ padding: "16px", color: customer.assignedTo?.name ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)", fontSize: "14px", fontStyle: customer.assignedTo?.name ? "normal" : "italic" }}>
                        {customer.assignedTo?.name || 'Unassigned'}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <button
                          onClick={(e) => handleStatusToggle(e, customer.id, customer.status)}
                          title={`Click to ${customer.status === 'ACTIVE' ? 'deactivate' : 'activate'}`}
                          style={{
                            padding: "4px 10px",
                            background: statusColor.bg,
                            border: `1px solid ${statusColor.border}`,
                            borderRadius: "6px",
                            color: statusColor.text,
                            fontSize: "12px",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.opacity = "0.8";
                            e.target.style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.opacity = "1";
                            e.target.style.transform = "scale(1)";
                          }}
                        >
                          {customer.status}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
