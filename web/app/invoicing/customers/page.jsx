"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export default function CustomersPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [customers, setCustomers]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [salesRepFilter, setSalesRepFilter] = useState("all");
  const [salesReps, setSalesReps]       = useState([]);
  const [sortBy, setSortBy]             = useState("name");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadCustomers();
    loadSalesReps();
  }, [user, router]);

  async function loadSalesReps() {
    try {
      const res = await fetch("/api/users/sales-reps", { headers: getAuthHeaders() });
      if (res.ok) setSalesReps(await res.json());
    } catch {}
  }

  async function loadCustomers() {
    try {
      const res = await fetch("/api/customers", { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        throw new Error("Failed to load customers");
      }
      setCustomers(await res.json());
    } catch {
      setError("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  const filtered = customers
    .filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (salesRepFilter === "unassigned" && c.assignedToId) return false;
      if (salesRepFilter !== "all" && salesRepFilter !== "unassigned" && c.assignedToId !== salesRepFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          c.firstName?.toLowerCase().includes(q) ||
          c.lastName?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.companyName?.toLowerCase().includes(q) ||
          c.customerNumber?.toLowerCase().includes(q) ||
          c.assignedTo?.name?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const nameA = (a.companyName || `${a.firstName} ${a.lastName}`).toLowerCase();
      const nameB = (b.companyName || `${b.firstName} ${b.lastName}`).toLowerCase();
      if (sortBy === "name")    return nameA.localeCompare(nameB);
      if (sortBy === "number")  return (a.customerNumber || "").localeCompare(b.customerNumber || "");
      if (sortBy === "balance") return (b.openBalance || 0) - (a.openBalance || 0);
      return nameA.localeCompare(nameB);
    });

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />

      <style>{`
        .cust-panel { display: flex; height: calc(100vh - 60px); overflow: hidden; }

        .cust-left {
          width: 300px;
          min-width: 300px;
          display: flex;
          flex-direction: column;
          background: #141414;
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .cust-left-header {
          padding: 16px 14px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .cust-left-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .cust-left-title h2 { font-size: 18px; font-weight: 700; color: #dc2626; margin: 0; }
        .cust-new-btn {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.3);
          border-radius: 6px;
          color: #dc2626;
          font-size: 18px;
          text-decoration: none;
          line-height: 1;
          cursor: pointer;
          transition: background 0.15s;
        }
        .cust-new-btn:hover { background: rgba(220,38,38,0.22); }
        .cust-search {
          width: 100%;
          padding: 8px 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px;
          color: rgba(255,255,255,0.9);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
          margin-bottom: 8px;
        }
        .cust-search:focus { border-color: rgba(220,38,38,0.5); }
        .cust-search::placeholder { color: rgba(255,255,255,0.35); }
        .cust-filters { display: flex; gap: 6px; }
        .cust-filter-select {
          flex: 1;
          padding: 5px 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: rgba(255,255,255,0.8);
          font-size: 12px;
          outline: none;
          cursor: pointer;
        }
        .cust-filter-select:focus { border-color: rgba(220,38,38,0.4); }

        .cust-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0;
        }
        .cust-list::-webkit-scrollbar { width: 6px; }
        .cust-list::-webkit-scrollbar-track { background: transparent; }
        .cust-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
        .cust-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

        .cust-item {
          padding: 10px 14px;
          cursor: pointer;
          border-left: 3px solid transparent;
          transition: background 0.12s;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .cust-item:hover {
          background: rgba(255,255,255,0.05);
          border-left-color: rgba(220,38,38,0.4);
        }
        .cust-item-name {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cust-item-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.4);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cust-item-balance {
          font-size: 12px;
          color: rgba(255,255,255,0.45);
          margin-top: 2px;
        }
        .cust-item-balance.has-balance { color: #f59e0b; }
        .cust-count {
          padding: 6px 14px;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          text-align: center;
          border-top: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }

        /* Right empty state */
        .cust-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cust-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: rgba(255,255,255,0.3);
          text-align: center;
        }
        .cust-empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
        .cust-empty p { margin: 0 0 20px 0; font-size: 14px; }

        .cust-sort-bar {
          display: flex;
          gap: 4px;
          padding: 6px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }
        .cust-sort-btn {
          flex: 1;
          padding: 4px 6px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 5px;
          color: rgba(255,255,255,0.4);
          font-size: 11px;
          cursor: pointer;
          text-align: center;
          transition: all 0.12s;
        }
        .cust-sort-btn:hover { color: rgba(255,255,255,0.7); }
        .cust-sort-btn.active {
          background: rgba(220,38,38,0.1);
          border-color: rgba(220,38,38,0.25);
          color: #dc2626;
        }

        @media (max-width: 900px) {
          .cust-left { width: 240px; min-width: 240px; }
        }
      `}</style>

      <div className="cust-panel" style={{ marginTop: 60 }}>

        {/* Left Panel */}
        <div className="cust-left">
          <div className="cust-left-header">
            <div className="cust-left-title">
              <h2>Customers</h2>
              <Link href="/invoicing/customers/new" className="cust-new-btn" title="New Customer">+</Link>
            </div>
            <input
              type="text"
              placeholder="Search by name or details"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="cust-search"
            />
            <div className="cust-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="cust-filter-select">
                <option value="all">All</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <select value={salesRepFilter} onChange={e => setSalesRepFilter(e.target.value)} className="cust-filter-select">
                <option value="all">All Reps</option>
                <option value="unassigned">Unassigned</option>
                {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="cust-sort-bar">
            {[["name","Name"],["number","#"],["balance","Balance"]].map(([key, label]) => (
              <button key={key} className={`cust-sort-btn${sortBy === key ? ' active' : ''}`} onClick={() => setSortBy(key)}>{label}</button>
            ))}
          </div>

          <div className="cust-list">
            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                {searchTerm ? "No matches" : "No customers"}
              </div>
            ) : (
              filtered.map(c => {
                const name = c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'No Name';
                const sub  = c.companyName ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : (c.email || '');
                const bal  = c.openBalance || 0;
                return (
                  <div
                    key={c.id}
                    className="cust-item"
                    onClick={() => router.push(`/invoicing/customers/${c.id}`)}
                  >
                    <div className="cust-item-name">{name}</div>
                    {sub && <div className="cust-item-sub">{sub}</div>}
                    <div className={`cust-item-balance${bal > 0 ? ' has-balance' : ''}`}>{fmt(bal)}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="cust-count">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Right — empty state only (navigates away on click) */}
        <div className="cust-right">
          {error && (
            <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", marginBottom: 20 }}>
              {error}
            </div>
          )}
          <div className="cust-empty">
            <div className="cust-empty-icon">👥</div>
            {loading ? (
              <p>Loading customers...</p>
            ) : filtered.length === 0 && !searchTerm ? (
              <>
                <p>No customers yet</p>
                <Link href="/invoicing/customers/new" style={{ padding: "10px 20px", background: "linear-gradient(135deg,#ef4444,#dc2626)", borderRadius: 8, color: "white", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Create first customer</Link>
              </>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.25)" }}>← Select a customer</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
