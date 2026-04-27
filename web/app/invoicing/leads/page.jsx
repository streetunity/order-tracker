"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../modal.css";

const STATUS_COLORS = {
  NEW:       { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  text: '#60a5fa' },
  CONTACTED: { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.35)',   text: '#facc15' },
  QUALIFIED: { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.35)',   text: '#4ade80' },
  CONVERTED: { bg: 'rgba(147,51,234,0.12)',  border: 'rgba(147,51,234,0.35)',  text: '#a78bfa' },
  LOST:      { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#f87171' },
};

function sourceIcon(source) {
  switch (source) {
    case 'zapier':   return '⚡';
    case 'website':  return '🌐';
    case 'referral': return '🤝';
    case 'email':    return '📧';
    case 'phone':    return '📞';
    default:         return '✎';
  }
}

export default function LeadsPage() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [pendingConvert, setPendingConvert] = useState(null);
  const [converting, setConverting] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: "", type: "info" });

  function showNotif(message, type = "info") {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 3000);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
  }, [user, authLoading, router]);

  async function loadLeads() {
    if (!user) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/leads?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLeads(await res.json());
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load leads"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (user) loadLeads(); }, [user, statusFilter]);
  useEffect(() => {
    const t = setTimeout(() => { if (user) loadLeads(); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleDelete(lead) { setPendingDelete(lead); setShowDeleteConfirm(true); }
  async function executeDelete() {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/leads/${pendingDelete.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      await loadLeads(); setShowDeleteConfirm(false); setPendingDelete(null);
      showNotif("Lead deleted successfully", "success");
    } catch (err) { showNotif(`Failed to delete: ${err.message}`, "error"); }
  }
  async function handleConvert(lead) { setPendingConvert(lead); setShowConvertConfirm(true); }
  async function executeConvert() {
    if (!pendingConvert) return;
    try {
      setConverting(true);
      const res = await fetch(`/api/leads/${pendingConvert.id}/convert`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadLeads(); setShowConvertConfirm(false); setPendingConvert(null);
      showNotif(`Lead converted to customer ${data.customer.customerNumber}`, "success");
      router.push(`/invoicing/customers/${data.customer.id}`);
    } catch (err) { showNotif(`Failed to convert: ${err.message}`, "error"); }
    finally { setConverting(false); }
  }
  async function handleStatusChange(lead, newStatus) {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadLeads(); showNotif(`Status updated to ${newStatus}`, "success");
    } catch (err) { showNotif(`Failed to update status: ${err.message}`, "error"); }
  }

  const statusCounts = {
    ALL: leads.length,
    NEW: leads.filter(l => l.status === 'NEW').length,
    CONTACTED: leads.filter(l => l.status === 'CONTACTED').length,
    QUALIFIED: leads.filter(l => l.status === 'QUALIFIED').length,
    CONVERTED: leads.filter(l => l.status === 'CONVERTED').length,
    LOST: leads.filter(l => l.status === 'LOST').length,
  };

  if (authLoading || !user) return null;

  const activeRedBtn = { padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(220,38,38,0.34)", background: "linear-gradient(180deg,rgba(220,38,38,0.16),rgba(220,38,38,0.08))", color: "#ff4b4b", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" };
  const inactiveBtn  = { padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid rgba(255,255,255,0.09)", background: "linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))", color: "rgba(255,255,255,0.52)" };

  return (
    <>
      <InvoicingNav />
      <style>{`
        .leads-row-tr { border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: background 0.14s, box-shadow 0.14s; }
        .leads-row-tr:hover { background: linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03)); box-shadow: inset 3px 0 0 rgba(255,75,75,0.72); }
        .lead-action-btn { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 18px rgba(0,0,0,0.18); }
      `}</style>

      <div style={{ minHeight: "calc(100vh - 64px)", background: "radial-gradient(circle at 12% 8%,rgba(220,38,38,0.095),transparent 360px),radial-gradient(circle at 70% 0%,rgba(255,255,255,0.035),transparent 420px),#0f0f0f", padding: "24px 24px 48px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.3px" }}>Leads</h1>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>Manage your sales pipeline and convert leads to customers</p>
          </div>
          <Link href="/invoicing/leads/new" style={{ padding: "8px 16px", background: "linear-gradient(180deg,rgba(255,75,75,0.24),rgba(220,38,38,0.12))", border: "1px solid rgba(255,75,75,0.46)", borderRadius: 7, color: "#ff5a5a", textDecoration: "none", fontWeight: 600, fontSize: 13, boxShadow: "0 12px 24px rgba(0,0,0,0.32), 0 0 18px rgba(220,38,38,0.08), inset 0 1px 0 rgba(255,255,255,0.12)" }}>+ New Lead</Link>
        </div>

        {/* Status Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {["ALL", "NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"].map(status => {
            const sc = STATUS_COLORS[status];
            const isActive = statusFilter === status;
            const isAll = status === 'ALL';
            return (
              <button key={status} onClick={() => setStatusFilter(status)}
                style={isAll
                  ? (isActive ? activeRedBtn : inactiveBtn)
                  : { padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: isActive ? 600 : 500, cursor: "pointer", border: `1px solid ${isActive ? sc.border : 'rgba(255,255,255,0.09)'}`, background: isActive ? sc.bg : 'linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))', color: isActive ? sc.text : 'rgba(255,255,255,0.52)', boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }
                }
              >
                {status} <span style={{ opacity: 0.65, fontSize: 11 }}>({statusCounts[status] || 0})</span>
              </button>
            );
          })}
          <div style={{ marginLeft: 'auto' }}>
            <input type="text" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: "9px 12px", background: "linear-gradient(180deg,rgba(255,255,255,0.11),rgba(255,255,255,0.055))", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, color: "rgba(255,255,255,0.92)", fontSize: 13, outline: "none", width: 220, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 20px rgba(0,0,0,0.2)" }} />
          </div>
        </div>

        {error && <div style={{ padding: "12px 16px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.3)", padding: "60px 0", textAlign: "center", fontSize: 14 }}>Loading leads&hellip;</div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", background: "linear-gradient(180deg,#1b1b1b,#121212)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 18px 38px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>No leads found</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginBottom: 20 }}>Add your first lead to start tracking your pipeline</div>
            <Link href="/invoicing/leads/new" style={{ padding: "8px 18px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7, color: "#dc2626", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>+ Create First Lead</Link>
          </div>
        ) : (
          <div style={{ background: "linear-gradient(180deg,#1f1f1f,#151515 48%,#111)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, overflow: "hidden", boxShadow: "0 18px 42px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(180deg,rgba(255,255,255,0.07),rgba(0,0,0,0.22))" }}>
                  {["Src", "Name", "Contact", "Company", "Status", "Assigned", "Created", ""].map((h, i) => (
                    <th key={i} style={{ padding: "10px 13px", textAlign: i === 7 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id} className="leads-row-tr" onClick={() => router.push(`/invoicing/leads/${lead.id}`)}>
                    <td style={{ padding: "11px 13px", fontSize: 15 }} title={lead.source}>
                      {sourceIcon(lead.source)}
                    </td>
                    <td style={{ padding: "11px 13px" }}><div style={{ fontWeight: 600, color: "rgba(255,255,255,0.88)", fontSize: 13 }}>{lead.firstName} {lead.lastName}</div></td>
                    <td style={{ padding: "11px 13px" }}>
                      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{lead.email}</div>
                      {lead.phone && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{lead.phone}</div>}
                    </td>
                    <td style={{ padding: "11px 13px", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{lead.company || <span style={{ color: 'rgba(255,255,255,0.2)' }}>&mdash;</span>}</td>
                    <td style={{ padding: "11px 13px" }} onClick={e => e.stopPropagation()}>
                      <select value={lead.status} onChange={e => handleStatusChange(lead, e.target.value)} disabled={lead.status === "CONVERTED"}
                        style={{ padding: "4px 8px", background: STATUS_COLORS[lead.status]?.bg || "rgba(255,255,255,0.07)", border: `1px solid ${STATUS_COLORS[lead.status]?.border || "rgba(255,255,255,0.15)"}`, borderRadius: 5, color: STATUS_COLORS[lead.status]?.text || "#fff", fontSize: 11, fontWeight: 600, cursor: lead.status === "CONVERTED" ? "not-allowed" : "pointer", letterSpacing: '0.3px' }}>
                        <option value="NEW">NEW</option>
                        <option value="CONTACTED">CONTACTED</option>
                        <option value="QUALIFIED">QUALIFIED</option>
                        <option value="CONVERTED" disabled>CONVERTED</option>
                        <option value="LOST">LOST</option>
                      </select>
                    </td>
                    <td style={{ padding: "11px 13px", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{lead.assignedTo?.name || <span style={{ color: 'rgba(255,255,255,0.2)' }}>&mdash;</span>}</td>
                    <td style={{ padding: "11px 13px", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td style={{ padding: "11px 13px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {lead.status !== "CONVERTED" && lead.status !== "LOST" && (
                          <button onClick={() => handleConvert(lead)} style={{ padding: "5px 10px", background: "rgba(147,51,234,0.1)", border: "1px solid rgba(147,51,234,0.3)", borderRadius: 5, color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Convert</button>
                        )}
                        {lead.status === "CONVERTED" && lead.convertedToCustomer && (
                          <Link href={`/invoicing/customers/${lead.convertedToCustomer.id}`} onClick={e => e.stopPropagation()} style={{ padding: "5px 10px", background: "rgba(147,51,234,0.08)", border: "1px solid rgba(147,51,234,0.2)", borderRadius: 5, color: "#a78bfa", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>{lead.convertedToCustomer.customerNumber}</Link>
                        )}
                        <button onClick={() => handleDelete(lead)} disabled={lead.status === "CONVERTED"} style={{ padding: "5px 10px", background: lead.status === "CONVERTED" ? "rgba(255,255,255,0.02)" : "rgba(239,68,68,0.08)", border: `1px solid ${lead.status === "CONVERTED" ? "rgba(255,255,255,0.05)" : "rgba(239,68,68,0.25)"}`, borderRadius: 5, color: lead.status === "CONVERTED" ? "rgba(255,255,255,0.2)" : "#f87171", fontSize: 11, fontWeight: 600, cursor: lead.status === "CONVERTED" ? "not-allowed" : "pointer" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDeleteConfirm && pendingDelete && (
        <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setPendingDelete(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Delete Lead</h2>
            <p className="modal-confirm-text">Are you sure you want to delete <strong>{pendingDelete.firstName} {pendingDelete.lastName}</strong>?</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowDeleteConfirm(false); setPendingDelete(null); }}>Cancel</button>
              <button className="modal-btn danger" onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showConvertConfirm && pendingConvert && (
        <div className="modal-overlay" onClick={() => { setShowConvertConfirm(false); setPendingConvert(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Convert Lead to Customer</h2>
            <p className="modal-confirm-text">Convert <strong>{pendingConvert.firstName} {pendingConvert.lastName}</strong> to a new customer?</p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 8 }}>This will create a new customer record with the lead&rsquo;s information.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowConvertConfirm(false); setPendingConvert(null); }} disabled={converting}>Cancel</button>
              <button className="modal-btn primary" onClick={executeConvert} disabled={converting}>{converting ? "Converting..." : "Convert"}</button>
            </div>
          </div>
        </div>
      )}

      {notification.show && (
        <div style={{ position: "fixed", top: 80, right: 24, background: notification.type === "error" ? "#1a0505" : notification.type === "success" ? "#051a0a" : "#1a1a1a", border: `1px solid ${notification.type === "error" ? "rgba(239,68,68,0.4)" : notification.type === "success" ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 8, padding: "12px 18px", zIndex: 1200, maxWidth: 380, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          <span style={{ color: notification.type === "error" ? "#f87171" : notification.type === "success" ? "#34d399" : "#d1d5db", fontSize: 13 }}>{notification.message}</span>
        </div>
      )}
    </>
  );
}
