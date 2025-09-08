"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function ManageOrdersPage() {
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function load() {
    if (!user) return; // Don't try to load if not authenticated
    
    try {
      setLoading(true);
      const url = q
        ? `/api/orders?search=${encodeURIComponent(q)}&includeArchived=1`
        : `/api/orders?includeArchived=1`;
      const res = await fetch(url, { 
        headers: getAuthHeaders(),
        cache: "no-store" 
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows(Array.isArray(j) ? j : []);
      setErr("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function onSubmit(e) {
    e.preventDefault();
    load();
  }

  async function remove(id, label) {
    if (!confirm(`Permanently delete order ${label}? This will remove all items and events.`)) return;
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { 
      method: "DELETE",
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(`Delete failed: ${body.error || `HTTP ${res.status}`}`);
      return;
    }
    load();
  }

  // Don't render content until authentication is checked
  if (!user) {
    return null;
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 16 }}>
      {/* Header with user navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 className="h1" style={{ margin: 0 }}>Manage Orders</h1>
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            Welcome, {user?.name} ({user?.role})
          </span>
          {isAdmin && (
            <Link href="/admin/users" className="btn">
              Manage Users
            </Link>
          )}
          <button 
            onClick={logout} 
            className="btn"
            style={{ backgroundColor: '#dc2626', color: 'white' }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/orders/new" className="btn primary">New Order</Link>
        <Link href="/admin/customers" className="btn" style={{ marginLeft: 8 }}>Manage Customers</Link>
        <Link href="/admin/board" className="btn" style={{ marginLeft: 8 }}>Back to Board</Link>
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search Order Date / Sales Person / Account / Item"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
        />
        <button className="btn">Search</button>
      </form>

      {loading ? (
        <div>Loading…</div>
      ) : err ? (
        <div style={{ color: "#dc2626" }}>{err}</div>
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
                <td>{o.account?.name ?? "—"}</td>
                <td>{o.poNumber ?? "—"}</td>
                <td>{o.sku ?? "—"}</td>
                <td>{new Date(o.createdAt).toLocaleString()}</td>
                <td>{o.createdBy?.name ?? "—"}</td>
                <td>{Array.isArray(o.items) ? o.items.length : 0}</td>
                <td>
                  {o.isLocked ? (
                    <span style={{ color: "#dc2626", fontWeight: "bold" }}>
                      🔒 Locked
                    </span>
                  ) : (
                    <span style={{ color: "#10b981" }}>Active</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="miniBtn"
                    title="Edit order items"
                    style={{ marginRight: 4, textDecoration: "none" }}
                  >
                    ✏️
                  </Link>
                  <button
                    className="miniBtn danger"
                    title={o.isLocked ? "Cannot delete locked order" : "Delete order (permanent)"}
                    onClick={() => {
                      if (o.isLocked) {
                        alert("Cannot delete a locked order. Please unlock it first.");
                        return;
                      }
                      remove(o.id, `Order Date:${o.poNumber ?? "—"} / Sales Person:${o.sku ?? "—"}`);
                    }}
                    style={{
                      opacity: o.isLocked ? 0.5 : 1,
                      cursor: o.isLocked ? "not-allowed" : "pointer"
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}