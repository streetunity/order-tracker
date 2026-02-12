"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../modal.css";

const STATUS_COLORS = {
  NEW: { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgba(59, 130, 246, 0.5)', text: '#60a5fa' },
  CONTACTED: { bg: 'rgba(234, 179, 8, 0.2)', border: 'rgba(234, 179, 8, 0.5)', text: '#facc15' },
  QUALIFIED: { bg: 'rgba(34, 197, 94, 0.2)', border: 'rgba(34, 197, 94, 0.5)', text: '#4ade80' },
  CONVERTED: { bg: 'rgba(147, 51, 234, 0.2)', border: 'rgba(147, 51, 234, 0.5)', text: '#a78bfa' },
  LOST: { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 0.5)', text: '#f87171' }
};

const SOURCE_ICONS = {
  manual: '✏️',
  zapier: '⚡',
  website: '🌐',
  referral: '🤝',
  facebook: '📘',
  google: '🔍',
  email: '📧',
  phone: '📞',
  default: '📋'
};

export default function LeadsPage() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Convert confirmation modal
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [pendingConvert, setPendingConvert] = useState(null);
  const [converting, setConverting] = useState(false);

  // Notification
  const [notification, setNotification] = useState({ show: false, message: "", type: "info" });

  function showNotif(message, type = "info") {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 3000);
  }

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  async function loadLeads() {
    if (!user) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (search) {
        params.set("search", search);
      }

      const res = await fetch(`/api/leads?${params.toString()}`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLeads(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadLeads();
    }
  }, [user, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) loadLeads();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleDelete(lead) {
    setPendingDelete(lead);
    setShowDeleteConfirm(true);
  }

  async function executeDelete() {
    if (!pendingDelete) return;

    try {
      const res = await fetch(`/api/leads/${pendingDelete.id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      await loadLeads();
      setShowDeleteConfirm(false);
      setPendingDelete(null);
      showNotif("Lead deleted successfully", "success");
    } catch (err) {
      showNotif(`Failed to delete: ${err.message}`, "error");
    }
  }

  async function handleConvert(lead) {
    setPendingConvert(lead);
    setShowConvertConfirm(true);
  }

  async function executeConvert() {
    if (!pendingConvert) return;

    try {
      setConverting(true);
      const res = await fetch(`/api/leads/${pendingConvert.id}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({})
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await loadLeads();
      setShowConvertConfirm(false);
      setPendingConvert(null);
      showNotif(`Lead converted to customer ${data.customer.customerNumber}`, "success");

      // Navigate to the new customer
      router.push(`/invoicing/customers/${data.customer.id}`);
    } catch (err) {
      showNotif(`Failed to convert: ${err.message}`, "error");
    } finally {
      setConverting(false);
    }
  }

  async function handleStatusChange(lead, newStatus) {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadLeads();
      showNotif(`Status updated to ${newStatus}`, "success");
    } catch (err) {
      showNotif(`Failed to update status: ${err.message}`, "error");
    }
  }

  // Calculate status counts from all leads (before filtering)
  const allLeadsForCounts = leads;
  const statusCounts = {
    ALL: allLeadsForCounts.length,
    NEW: allLeadsForCounts.filter(l => l.status === 'NEW').length,
    CONTACTED: allLeadsForCounts.filter(l => l.status === 'CONTACTED').length,
    QUALIFIED: allLeadsForCounts.filter(l => l.status === 'QUALIFIED').length,
    CONVERTED: allLeadsForCounts.filter(l => l.status === 'CONVERTED').length,
    LOST: allLeadsForCounts.filter(l => l.status === 'LOST').length,
  };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 8 }}>
              Leads
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "14px" }}>
              Manage your sales leads and convert them to customers
            </p>
          </div>
          <Link
            href="/invoicing/leads/new"
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "14px"
            }}
          >
            + New Lead
          </Link>
        </div>

        {/* Status Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["ALL", "NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: "8px 16px",
                background: statusFilter === status
                  ? (status === "ALL" ? "rgba(220, 38, 38, 0.2)" : STATUS_COLORS[status]?.bg || "rgba(255,255,255,0.1)")
                  : "rgba(255, 255, 255, 0.05)",
                border: statusFilter === status
                  ? `1px solid ${status === "ALL" ? "#dc2626" : STATUS_COLORS[status]?.border || "rgba(255,255,255,0.2)"}`
                  : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                color: statusFilter === status
                  ? (status === "ALL" ? "#dc2626" : STATUS_COLORS[status]?.text || "#fff")
                  : "rgba(255, 255, 255, 0.7)",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: statusFilter === status ? "600" : "400"
              }}
            >
              {status} ({statusCounts[status] || 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search by name, email, company, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "rgba(255, 255, 255, 0.9)",
              fontSize: "14px"
            }}
          />
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
            Error: {error}
          </div>
        )}

        {/* Leads Table */}
        {loading ? (
          <div style={{ color: "#a0a0a0", padding: 40, textAlign: "center" }}>Loading leads...</div>
        ) : leads.length === 0 ? (
          <div style={{
            color: "#a0a0a0",
            padding: 60,
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.05)"
          }}>
            <div style={{ fontSize: "48px", marginBottom: 16 }}>📋</div>
            <p style={{ marginBottom: 16 }}>No leads found</p>
            <Link
              href="/invoicing/leads/new"
              style={{
                color: "#dc2626",
                textDecoration: "none",
                fontWeight: "500"
              }}
            >
              Create your first lead →
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Source</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Name</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Contact</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Company</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Assigned To</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Created</th>
                  <th style={{ padding: "12px", textAlign: "right", color: "rgba(255, 255, 255, 0.6)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                      cursor: "pointer"
                    }}
                    onClick={() => router.push(`/invoicing/leads/${lead.id}`)}
                  >
                    <td style={{ padding: "14px 12px" }}>
                      <span title={lead.source} style={{ fontSize: "18px" }}>
                        {SOURCE_ICONS[lead.source] || SOURCE_ICONS.default}
                      </span>
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <div style={{ fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                        {lead.firstName} {lead.lastName}
                      </div>
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "13px" }}>
                        {lead.email}
                      </div>
                      {lead.phone && (
                        <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "12px" }}>
                          {lead.phone}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 12px", color: "rgba(255, 255, 255, 0.7)" }}>
                      {lead.company || "-"}
                    </td>
                    <td style={{ padding: "14px 12px" }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                        disabled={lead.status === "CONVERTED"}
                        style={{
                          padding: "4px 8px",
                          background: STATUS_COLORS[lead.status]?.bg || "rgba(255,255,255,0.1)",
                          border: `1px solid ${STATUS_COLORS[lead.status]?.border || "rgba(255,255,255,0.2)"}`,
                          borderRadius: "4px",
                          color: STATUS_COLORS[lead.status]?.text || "#fff",
                          fontSize: "12px",
                          fontWeight: "500",
                          cursor: lead.status === "CONVERTED" ? "not-allowed" : "pointer"
                        }}
                      >
                        <option value="NEW">NEW</option>
                        <option value="CONTACTED">CONTACTED</option>
                        <option value="QUALIFIED">QUALIFIED</option>
                        <option value="CONVERTED" disabled>CONVERTED</option>
                        <option value="LOST">LOST</option>
                      </select>
                    </td>
                    <td style={{ padding: "14px 12px", color: "rgba(255, 255, 255, 0.7)", fontSize: "13px" }}>
                      {lead.assignedTo?.name || "-"}
                    </td>
                    <td style={{ padding: "14px 12px", color: "rgba(255, 255, 255, 0.5)", fontSize: "12px" }}>
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 12px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {lead.status !== "CONVERTED" && lead.status !== "LOST" && (
                          <button
                            onClick={() => handleConvert(lead)}
                            style={{
                              padding: "6px 10px",
                              background: "rgba(147, 51, 234, 0.2)",
                              border: "1px solid rgba(147, 51, 234, 0.5)",
                              borderRadius: "4px",
                              color: "#a78bfa",
                              fontSize: "12px",
                              cursor: "pointer"
                            }}
                            title="Convert to Customer"
                          >
                            Convert
                          </button>
                        )}
                        {lead.status === "CONVERTED" && lead.convertedToCustomer && (
                          <Link
                            href={`/invoicing/customers/${lead.convertedToCustomer.id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: "6px 10px",
                              background: "rgba(147, 51, 234, 0.1)",
                              border: "1px solid rgba(147, 51, 234, 0.3)",
                              borderRadius: "4px",
                              color: "#a78bfa",
                              fontSize: "12px",
                              textDecoration: "none"
                            }}
                          >
                            {lead.convertedToCustomer.customerNumber}
                          </Link>
                        )}
                        <button
                          onClick={() => handleDelete(lead)}
                          disabled={lead.status === "CONVERTED"}
                          style={{
                            padding: "6px 10px",
                            background: lead.status === "CONVERTED" ? "rgba(255,255,255,0.02)" : "rgba(239, 68, 68, 0.1)",
                            border: `1px solid ${lead.status === "CONVERTED" ? "rgba(255,255,255,0.05)" : "rgba(239, 68, 68, 0.3)"}`,
                            borderRadius: "4px",
                            color: lead.status === "CONVERTED" ? "rgba(255,255,255,0.3)" : "#f87171",
                            fontSize: "12px",
                            cursor: lead.status === "CONVERTED" ? "not-allowed" : "pointer"
                          }}
                          title={lead.status === "CONVERTED" ? "Cannot delete converted lead" : "Delete lead"}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && pendingDelete && (
          <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setPendingDelete(null); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Delete Lead</h2>
              <p className="modal-confirm-text">
                Are you sure you want to delete <strong>{pendingDelete.firstName} {pendingDelete.lastName}</strong>?
              </p>
              <div className="modal-actions">
                <button className="modal-btn cancel" onClick={() => { setShowDeleteConfirm(false); setPendingDelete(null); }}>
                  Cancel
                </button>
                <button className="modal-btn danger" onClick={executeDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Convert Confirmation Modal */}
        {showConvertConfirm && pendingConvert && (
          <div className="modal-overlay" onClick={() => { setShowConvertConfirm(false); setPendingConvert(null); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Convert Lead to Customer</h2>
              <p className="modal-confirm-text">
                Convert <strong>{pendingConvert.firstName} {pendingConvert.lastName}</strong> to a new customer?
              </p>
              <p className="modal-confirm-warning" style={{ color: "rgba(255,255,255,0.5)" }}>
                This will create a new customer record with the lead's information.
              </p>
              <div className="modal-actions">
                <button className="modal-btn cancel" onClick={() => { setShowConvertConfirm(false); setPendingConvert(null); }} disabled={converting}>
                  Cancel
                </button>
                <button className="modal-btn primary" onClick={executeConvert} disabled={converting}>
                  {converting ? "Converting..." : "Convert"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Toast */}
        {notification.show && (
          <div
            style={{
              position: "fixed",
              top: "100px",
              right: "24px",
              backgroundColor: notification.type === "error" ? "#7f1d1d" : notification.type === "success" ? "#14532d" : "#1f1f1f",
              border: `1px solid ${notification.type === "error" ? "#991b1b" : notification.type === "success" ? "#15803d" : "#404040"}`,
              borderRadius: "8px",
              padding: "1rem 1.5rem",
              zIndex: 1200,
              maxWidth: "400px"
            }}
          >
            <span style={{ color: notification.type === "error" ? "#fecaca" : notification.type === "success" ? "#bbf7d0" : "#d1d5db", fontSize: "14px" }}>
              {notification.message}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
