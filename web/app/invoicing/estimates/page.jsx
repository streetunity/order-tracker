"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const STATUS_COLORS = {
  DRAFT:     { bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af' },
  SENT:      { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  text: '#3b82f6' },
  VIEWED:    { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  text: '#a855f7' },
  ACCEPTED:  { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e' },
  DECLINED:  { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444' },
  EXPIRED:   { bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.3)',   text: '#eab308' },
  CONVERTED: { bg: 'rgba(20,184,166,0.1)',  border: 'rgba(20,184,166,0.3)',  text: '#14b8a6' },
};

const STATUS_DOT = {
  DRAFT: '#9ca3af', SENT: '#3b82f6', VIEWED: '#a855f7',
  ACCEPTED: '#22c55e', DECLINED: '#ef4444', EXPIRED: '#eab308', CONVERTED: '#14b8a6',
};

const fmt  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';

export default function EstimatesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();

  const [estimates,   setEstimates]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("all");
  const [sortBy,      setSortBy]      = useState("date");
  const [salesReps,   setSalesReps]   = useState([]);
  const [repFilter,   setRepFilter]   = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadEstimates();
    loadSalesReps();
  }, [user, router]);

  async function loadSalesReps() {
    try {
      const r = await fetch("/api/users/sales-reps", { headers: getAuthHeaders() });
      if (r.ok) setSalesReps(await r.json());
    } catch {}
  }

  async function loadEstimates() {
    try {
      const r = await fetch("/api/estimates", { headers: getAuthHeaders() });
      if (!r.ok) { if (r.status === 401) { router.push("/login"); return; } throw new Error(); }
      const d = await r.json();
      setEstimates(Array.isArray(d) ? d : (d.estimates || []));
    } catch { setError("Failed to load estimates"); }
    finally { setLoading(false); }
  }

  if (authLoading || !user) return null;

  const filtered = estimates
    .filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (repFilter && e.createdById !== repFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.estimateNumber?.toLowerCase().includes(q) ||
          e.customer?.firstName?.toLowerCase().includes(q) ||
          e.customer?.lastName?.toLowerCase().includes(q) ||
          e.customer?.companyName?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) =>
      sortBy === "amount" ? (b.total || 0) - (a.total || 0)
      : new Date(b.createdAt) - new Date(a.createdAt)
    );

  return (
    <>
      <InvoicingNav />
      <style>{`
        .esb-header{padding:16px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0}
        .esb-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .esb-title h2{font-size:18px;font-weight:700;color:#dc2626;margin:0}
        .esb-new-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);border-radius:6px;color:#dc2626;font-size:18px;text-decoration:none;line-height:1;cursor:pointer;transition:background 0.15s}
        .esb-new-btn:hover{background:rgba(220,38,38,0.22)}
        .esb-search{width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:rgba(255,255,255,0.9);font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px}
        .esb-search:focus{border-color:rgba(220,38,38,0.5)}
        .esb-search::placeholder{color:rgba(255,255,255,0.35)}
        .esb-filters{display:flex;gap:6px}
        .esb-filter-sel{flex:1;padding:5px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.8);font-size:12px;outline:none;cursor:pointer}
        .esb-filter-sel:focus{border-color:rgba(220,38,38,0.4)}
        .esb-sort-bar{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0}
        .esb-sort-btn{flex:1;padding:4px 6px;background:transparent;border:1px solid transparent;border-radius:5px;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;text-align:center;transition:all 0.12s}
        .esb-sort-btn:hover{color:rgba(255,255,255,0.7)}
        .esb-sort-btn.active{background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.25);color:#dc2626}
        .esb-list{flex:1;overflow-y:auto;padding:6px 0}
        .esb-list::-webkit-scrollbar{width:6px}
        .esb-list::-webkit-scrollbar-track{background:transparent}
        .esb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}
        .esb-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.25)}
        .esb-item{padding:10px 14px;cursor:pointer;border-left:3px solid transparent;transition:background 0.12s;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;display:block}
        .esb-item:hover{background:rgba(255,255,255,0.04);border-left-color:rgba(220,38,38,0.4)}
        .esb-item-num{font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace}
        .esb-item-cust{font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .esb-item-foot{display:flex;align-items:center;justify-content:space-between;margin-top:3px}
        .esb-item-amt{font-size:11px;color:rgba(255,255,255,0.5)}
        .esb-item-status{display:flex;align-items:center;gap:3px;font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.3px}
        .esb-count{padding:6px 14px;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0}
        .est-right{flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px}
        .est-right::-webkit-scrollbar{width:8px}
        .est-right::-webkit-scrollbar-track{background:transparent}
        .est-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 60px)", marginTop: 60, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 300, minWidth: 300, flexShrink: 0, background: "#141414", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflowY: "hidden" }}>
          <div className="esb-header">
            <div className="esb-title">
              <h2>Estimates</h2>
              <Link href="/invoicing/estimates/new" className="esb-new-btn" title="New Estimate">+</Link>
            </div>
            <input type="text" placeholder="Search estimates..." value={search} onChange={e => setSearch(e.target.value)} className="esb-search" />
            <div className="esb-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="esb-filter-sel">
                <option value="all">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="VIEWED">Viewed</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="DECLINED">Declined</option>
                <option value="EXPIRED">Expired</option>
                <option value="CONVERTED">Converted</option>
              </select>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="esb-filter-sel">
                <option value="">All Reps</option>
                {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="esb-sort-bar">
            {[["date","Date"],["amount","Amount"]].map(([key,label]) => (
              <button key={key} className={`esb-sort-btn${sortBy === key ? ' active' : ''}`} onClick={() => setSortBy(key)}>{label}</button>
            ))}
          </div>

          <div className="esb-list">
            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No estimates</div>
            ) : filtered.map(e => {
              const custName = e.customer?.companyName || [e.customer?.firstName, e.customer?.lastName].filter(Boolean).join(" ") || "No customer";
              const dot = STATUS_DOT[e.status] || "#9ca3af";
              return (
                <Link key={e.id} href={`/invoicing/estimates/${e.id}`} className="esb-item">
                  <div className="esb-item-num">{e.estimateNumber}</div>
                  <div className="esb-item-cust">{custName}</div>
                  <div className="esb-item-foot">
                    <span className="esb-item-amt">{fmt(e.total)}</span>
                    <span className="esb-item-status">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />
                      {e.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="esb-count">{filtered.length} estimate{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Main content */}
        <div className="est-right">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: "#dc2626", margin: 0, marginBottom: 4 }}>Estimates</h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>{filtered.length} estimate{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Link href="/invoicing/estimate-templates" style={{ padding: "9px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.8)", textDecoration: "none", fontSize: 13 }}>Templates</Link>
              <Link href="/invoicing/estimates/new" style={{ padding: "9px 16px", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 8, color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>+ New Estimate</Link>
            </div>
          </div>

          {error && <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>{error}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.4)" }}>Loading estimates...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>\ud83d\udcc4</div>
              <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{search || statusFilter !== "all" ? "No estimates match your filters" : "No estimates yet"}</p>
              {!search && statusFilter === "all" && <Link href="/invoicing/estimates/new" style={{ padding: "10px 20px", background: "linear-gradient(135deg,#ef4444,#dc2626)", borderRadius: 8, color: "white", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Create your first estimate</Link>}
            </div>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.12)" }}>
                    {["Estimate #","Customer","Date","Expires","Total","Items","Status",""].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: h === "Total" ? "right" : h === "Items" ? "center" : h === "Status" ? "center" : "left", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(estimate => {
                    const sc = STATUS_COLORS[estimate.status] || STATUS_COLORS.DRAFT;
                    const expired = estimate.expiryDate && new Date(estimate.expiryDate) < new Date() && !['ACCEPTED','DECLINED','EXPIRED'].includes(estimate.status);
                    return (
                      <tr key={estimate.id} onClick={() => router.push(`/invoicing/estimates/${estimate.id}`)} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "13px 14px" }}><span style={{ fontFamily: "monospace", color: "#dc2626", fontWeight: 500 }}>{estimate.estimateNumber}</span></td>
                        <td style={{ padding: "13px 14px" }}>
                          <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>{estimate.customer?.firstName} {estimate.customer?.lastName}</div>
                          {(estimate.customer?.company || estimate.customer?.companyName) && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{estimate.customer?.company || estimate.customer?.companyName}</div>}
                        </td>
                        <td style={{ padding: "13px 14px", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{fmtD(estimate.estimateDate)}</td>
                        <td style={{ padding: "13px 14px", fontSize: 13 }}>
                          <span style={{ color: expired ? "#ef4444" : "rgba(255,255,255,0.55)" }}>{fmtD(estimate.expiryDate)}{expired && <span style={{ fontSize: 10, marginLeft: 5 }}>(Expired)</span>}</span>
                        </td>
                        <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.total)}</td>
                        <td style={{ padding: "13px 14px", textAlign: "center", color: "rgba(255,255,255,0.45)" }}>{estimate._count?.items || 0}</td>
                        <td style={{ padding: "13px 14px", textAlign: "center" }}>
                          <span style={{ padding: "3px 9px", background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 6, color: sc.text, fontSize: 11, fontWeight: 500 }}>{estimate.status}</span>
                        </td>
                        <td style={{ padding: "13px 14px", textAlign: "right" }}>
                          <button onClick={ev => { ev.stopPropagation(); router.push(`/invoicing/estimates/${estimate.id}`); }} style={{ padding: "5px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 12 }}>View</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
