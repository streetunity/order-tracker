"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function ManageOrdersPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [activeCount, setActiveCount] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  function showNotif(message) {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  }

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  async function loadCounts() {
    if (!user) return;
    try {
      const activeRes = await fetch('/api/orders?includeArchived=false', { headers: getAuthHeaders(), cache: "no-store" });
      if (activeRes.ok) { const d = await activeRes.json(); setActiveCount(Array.isArray(d) ? d.length : 0); }
      const archivedRes = await fetch('/api/orders?includeArchived=true', { headers: getAuthHeaders(), cache: "no-store" });
      if (archivedRes.ok) { const d = await archivedRes.json(); setArchivedCount(Array.isArray(d) ? d.length : 0); }
    } catch (e) { console.error("Failed to load counts:", e); }
  }

  async function load() {
    if (!user) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      params.set('includeArchived', activeTab === 'archived' ? 'true' : 'false');
      const res = await fetch(`/api/orders?${params.toString()}`, { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(Array.isArray(await res.json() ) ? await fetch(`/api/orders?${params.toString()}`, { headers: getAuthHeaders(), cache: "no-store" }).then(r => r.json()) : []);
      setErr("");
      await loadCounts();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Simpler load — avoids double fetch
  async function loadOrders() {
    if (!user) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      params.set('includeArchived', activeTab === 'archived' ? 'true' : 'false');
      const res = await fetch(`/api/orders?${params.toString()}`, { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(Array.isArray(j) ? j : []);
      setErr("");
      await loadCounts();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) loadOrders(); }, [user, activeTab]);

  function onSubmit(e) { e.preventDefault(); loadOrders(); }

  function remove(id, label) { setPendingDelete({ id, label }); setShowDeleteConfirm(true); }

  async function executeDelete() {
    if (!pendingDelete) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showNotif(`Delete failed: ${body.error || `HTTP ${res.status}`}`); return; }
      setShowDeleteConfirm(false); setPendingDelete(null);
      await loadOrders();
    } catch (error) { showNotif(`Failed to delete order: ${error.message}`); }
    finally { setLoading(false); }
  }

  function cancelDelete() { setShowDeleteConfirm(false); setPendingDelete(null); }

  function handleArchiveClick(order) { setPendingArchive(order); setShowArchiveConfirm(true); }

  async function confirmArchiveToggle() {
    if (!pendingArchive) return;
    const action = pendingArchive.isArchived ? "unarchive" : "archive";
    try {
      setArchiveLoading(true);
      const response = await fetch(`/api/orders/${pendingArchive.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isArchived: !pendingArchive.isArchived })
      });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || `Failed to ${action} order`); }
      setShowArchiveConfirm(false); setPendingArchive(null);
      showNotif(`Order ${pendingArchive.isArchived ? 'unarchived' : 'archived'} successfully`);
      await loadOrders();
    } catch (e) { showNotif(`Failed to ${action} order: ${e.message}`); }
    finally { setArchiveLoading(false); }
  }

  function cancelArchive() { setShowArchiveConfirm(false); setPendingArchive(null); }

  if (!user) return null;

  // Shared outlined button style
  const tabBtn = (id, label, count) => {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        style={{
          padding: "6px 14px", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer",
          border: `1px solid ${active ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.08)"}`,
          background: active ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)",
          color: active ? "#dc2626" : "rgba(255,255,255,0.5)",
          borderRadius: 6, transition: "all 0.12s"
        }}
      >
        {label} <span style={{ opacity: 0.65, fontSize: 11 }}>({count})</span>
      </button>
    );
  };

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 24 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#fff", margin: 0, letterSpacing: "-0.3px" }}>Manage Orders</h1>
          <Link href="/admin/orders/new" style={{ padding: "7px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7, color: "#dc2626", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>+ New Order</Link>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {tabBtn("active", "Active Orders", activeCount)}
          {tabBtn("archived", "Archived Orders", archivedCount)}
        </div>

        {/* Search */}
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search Order Date / Sales Person / Account / Item"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.9)", fontSize: 13, outline: "none" }}
          />
          <button type="submit" style={{ padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}>Search</button>
        </form>

        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.3)", padding: "40px 0", textAlign: "center" }}>Loading&#8230;</div>
        ) : err ? (
          <div style={{ color: "#dc2626", padding: 12 }}>{err}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Order Date</th>
                <th>Sales Person</th>
                <th>Created</th>
                <th>Created By</th>
                <th>Items</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>{o.account?.name ?? "\u2014"}</td>
                  <td>{o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "\u2014"}</td>
                  <td>{o.sku ?? "\u2014"}</td>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                  <td>{o.createdBy?.name ?? "\u2014"}</td>
                  <td>{Array.isArray(o.items) ? o.items.length : 0}</td>
                  <td>
                    {o.isLocked ? (
                      <span style={{ color: "#dc2626", fontWeight: "bold" }}>&#128274; Locked</span>
                    ) : (
                      <span style={{ color: "#10b981" }}>Active</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/admin/orders/${o.id}`} className="miniBtn" title="Edit order items" style={{ marginRight: 4, textDecoration: "none" }}>&#9999;&#65039;</Link>
                    <button className="miniBtn" title={o.isArchived ? "Unarchive order" : "Archive order"} onClick={() => handleArchiveClick(o)} style={{ marginRight: 4, backgroundColor: o.isArchived ? "#10b981" : "#6b7280", color: "white", border: "none" }}>
                      {o.isArchived ? "&#128194;" : "&#128230;"}
                    </button>
                    <button className="miniBtn danger" title={o.isLocked ? "Cannot delete locked order" : "Delete order (permanent)"}
                      onClick={() => {
                        if (o.isLocked) { showNotif("Cannot delete a locked order. Please unlock it first."); return; }
                        remove(o.id, `Order Date:${o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "\u2014"} / Sales Person:${o.sku ?? "\u2014"}`);
                      }}
                      style={{ opacity: o.isLocked ? 0.5 : 1, cursor: o.isLocked ? "not-allowed" : "pointer" }}
                    >&#10005;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && pendingDelete && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={cancelDelete}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: 8, padding: "2rem", maxWidth: 500, width: "90%", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "1rem" }}>&#9888;&#65039; Delete Order Permanently?</h3>
              <p style={{ fontSize: 16, marginBottom: "1rem", color: "#d1d5db" }}>You are about to permanently delete order: <strong>{pendingDelete.label}</strong></p>
              <div style={{ padding: "1rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, marginBottom: "1rem" }}>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: 14, color: "#ef4444" }}><strong>Warning:</strong></p>
                <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: 14, color: "#d1d5db" }}>
                  <li>This action cannot be undone</li>
                  <li>All items and associated data will be permanently removed</li>
                  <li>Commission records will be marked as orphaned but preserved</li>
                </ul>
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "2rem" }}>
                <button onClick={cancelDelete} disabled={loading} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, opacity: loading ? 0.5 : 1 }}>Cancel</button>
                <button onClick={executeDelete} disabled={loading} style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, opacity: loading ? 0.5 : 1 }}>{loading ? "Deleting..." : "Yes, Delete Permanently"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Archive Confirmation Modal */}
        {showArchiveConfirm && pendingArchive && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => !archiveLoading && cancelArchive()}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: 8, padding: "2rem", maxWidth: 500, width: "90%", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                {pendingArchive.isArchived ? "&#128194; Unarchive Order?" : "&#128230; Archive Order?"}
              </h3>
              <p style={{ fontSize: 14, marginBottom: "1rem", color: "#d1d5db" }}>
                {pendingArchive.isArchived ? "Are you sure you want to unarchive this order? It will appear on the board and in active orders." : "Are you sure you want to archive this order? It will be hidden from the board and active orders."}
              </p>
              {!pendingArchive.isArchived && (
                <div style={{ padding: "1rem", backgroundColor: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 6, marginBottom: "1rem" }}>
                  <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: 13, color: "#9ca3af" }}>
                    <li>Order will be removed from the board view</li>
                    <li>Order will appear in the Archived Orders tab</li>
                    <li>You can unarchive the order at any time</li>
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button onClick={cancelArchive} disabled={archiveLoading} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: archiveLoading ? "not-allowed" : "pointer", fontSize: 14, opacity: archiveLoading ? 0.5 : 1 }}>Cancel</button>
                <button onClick={confirmArchiveToggle} disabled={archiveLoading} style={{ backgroundColor: pendingArchive.isArchived ? "#10b981" : "#6b7280", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: archiveLoading ? "not-allowed" : "pointer", fontSize: 14, opacity: archiveLoading ? 0.5 : 1 }}>
                  {archiveLoading ? (pendingArchive.isArchived ? "Unarchiving..." : "Archiving...") : (pendingArchive.isArchived ? "Unarchive Order" : "Archive Order")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {showNotification && (
          <div style={{ position: "fixed", top: 80, right: 24, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "12px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 1200, maxWidth: 380 }}>
            <span style={{ color: "#d1d5db", fontSize: 13 }}>{notificationMessage}</span>
          </div>
        )}
      </div>
    </>
  );
}
