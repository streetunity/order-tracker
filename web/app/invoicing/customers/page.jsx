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
        .cust-panel { display: flex; height: calc(100vh - 64px); overflow: hidden; }
        .cust-left { width: 280px; min-width: 280px; display: flex; flex-direction: column; background: #141414; border-right: 1px solid rgba(255,255,255,0.07); }
        .cust-left-header { padding: 16px 14px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
        .cust-left-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .cust-left-title h2 { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); margin: 0; text-transform: uppercase; letter-spacing: 0.8px; }
        .cust-left-title h2::before { content: ''; display: block; width: 3px; height: 13px; background: #dc2626; border-radius: 2px; flex-shrink: 0; }
        .cust-new-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.25); border-radius: 6px; color: #dc2626; font-size: 16px; text-decoration: none; line-height: 1; cursor: pointer; transition: background 0.15s; }
        .cust-new-btn:hover { background: rgba(220,38,38,0.2); }
        .cust-search { width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 7px; color: rgba(255,255,255,0.9); font-size: 13px; outline: none; box-sizing: border-box; margin-bottom: 8px; transition: border-color 0.15s; }
        .cust-search:focus { border-color: rgba(220,38,38,0.45); }
        .cust-search::placeholder { color: rgba(255,255,255,0.28); }
        .cust-filters { display: flex; gap: 6px; }
        .cust-filter-select { flex: 1; padding: 5px 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 6px; color: rgba(255,255,255,0.7); font-size: 12px; outline: none; cursor: pointer; }
        .cust-filter-select:focus { border-color: rgba(220,38,38,0.4); }
        .cust-list { flex: 1; overflow-y: auto; padding: 4px 0; }
        .cust-list::-webkit-scrollbar { width: 5px; }
        .cust-list::-webkit-scrollbar-track { background: transparent; }
        .cust-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        .cust-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
        .cust-item { padding: 11px 14px; cursor: pointer; border-left: 3px solid transparent; transition: background 0.12s, border-color 0.12s; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .cust-item:hover { background: rgba(255,255,255,0.04); border-left-color: rgba(220,38,38,0.45); }
        .cust-item-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cust-item-sub { font-size: 11px; color: rgba(255,255,255,0.38); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cust-item-balance { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 3px; }
        .cust-item-balance.has-balance { color: #f59e0b; font-weight: 600; }
        .cust-count { padding: 7px 14px; font-size: 11px; color: rgba(255,255,255,0.25); text-align: center; border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
        .cust-right { flex: 1; display: flex; align-items: center; justify-content: center; background: #0f0f0f; }
        .cust-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
        .cust-sort-bar { display: flex; gap: 3px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
        .cust-sort-btn { flex: 1; padding: 5px 6px; background: transparent; border: 1px solid transparent; border-radius: 5px; color: rgba(255,255,255,0.35); font-size: 11px; cursor: pointer; text-align: center; transition: all 0.12s; font-weight: 500; }
        .cust-sort-btn:hover { color: rgba(255,255,255,0.65); background: rgba(255,255,255,0.04); }
        .cust-sort-btn.active { background: rgba(220,38,38,0.1); border-color: rgba(220,38,38,0.22); color: #dc2626; }
      `}</style>

      <div className="cust-panel">
        {/* Left Panel */}
        <div className="cust-left">
          <div className="cust-left-header">
            <div className="cust-left-title">
              <h2>Customers</h2>
              <Link href="/invoicing/customers/new" className="cust-new-btn" title="New Customer">+</Link>
            </div>
            <input type="text" placeholder="Search by name or details" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="cust-search" />
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
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Loading&#8230;</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                {searchTerm ? "No matches" : "No customers"}
              </div>
            ) : filtered.map(c => {
              const name = c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'No Name';
              const sub  = c.companyName ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : (c.email || '');
              const bal  = c.openBalance || 0;
              return (
                <div key={c.id} className="cust-item" onClick={() => router.push(`/invoicing/customers/${c.id}`)}>
                  <div className="cust-item-name">{name}</div>
                  {sub && <div className="cust-item-sub">{sub}</div>}
                  <div className={`cust-item-balance${bal > 0 ? ' has-balance' : ''}`}>{fmt(bal)}</div>
                </div>
              );
            })}
          </div>

          <div className="cust-count">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Right — empty state */}
        <div className="cust-right">
          {error && (
            <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>
              {error}
            </div>
          )}
          <div className="cust-empty">
            {loading ? (
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>Loading customers&#8230;</div>
            ) : filtered.length === 0 && !searchTerm ? (
              <>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 4 }}>&#128101;</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>No customers yet</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', maxWidth: 220, lineHeight: 1.6 }}>Add your first customer to start creating estimates and invoices.</div>
                <Link href="/invoicing/customers/new" style={{ marginTop: 6, padding: '8px 18px', background: '#dc2626', borderRadius: 7, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>+ New Customer</Link>
              </>
            ) : (
              <>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 4 }}>&#128101;</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>Select a customer</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', maxWidth: 200, lineHeight: 1.6 }}>Choose a customer from the list to view their details and activity</div>
                <Link href="/invoicing/customers/new" style={{ marginTop: 6, padding: '7px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 7, color: '#dc2626', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>+ New Customer</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
