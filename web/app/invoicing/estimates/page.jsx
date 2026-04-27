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
  const [estimates,    setEstimates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy,       setSortBy]       = useState("date");
  const [salesReps,    setSalesReps]    = useState([]);
  const [repFilter,    setRepFilter]    = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadEstimates(); loadSalesReps();
  }, [user, router]);

  async function loadSalesReps() {
    try { const r = await fetch("/api/users/sales-reps", { headers: getAuthHeaders() }); if (r.ok) setSalesReps(await r.json()); } catch {}
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
        return e.estimateNumber?.toLowerCase().includes(q) || e.customer?.firstName?.toLowerCase().includes(q) || e.customer?.lastName?.toLowerCase().includes(q) || e.customer?.companyName?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => sortBy === "amount" ? (b.total || 0) - (a.total || 0) : new Date(b.createdAt) - new Date(a.createdAt));

  // Shared button styles
  const btnOutlinedRed  = { padding: "7px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7, color: "#dc2626", textDecoration: "none", fontSize: 13, fontWeight: 600 };
  const btnOutlinedGray = { padding: "7px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 13, fontWeight: 500 };

  return (
    <>
      <InvoicingNav />
      <style>{`
        .esb-header{padding:16px 14px 12px;border-bottom:1px solid rgba(255,255,255,0.09);flex-shrink:0;background:radial-gradient(circle at top left,rgba(220,38,38,0.12),transparent 155px),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.08));box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 12px 26px rgba(0,0,0,0.24)}
        .esb-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .esb-title h2{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);margin:0;text-transform:uppercase;letter-spacing:0.8px}
        .esb-title h2::before{content:'';display:block;width:3px;height:13px;background:#dc2626;border-radius:2px;flex-shrink:0}
        .esb-new-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;background:linear-gradient(180deg,rgba(255,75,75,0.24),rgba(220,38,38,0.12));border:1px solid rgba(255,75,75,0.46);border-radius:6px;color:#ff5a5a;font-size:16px;text-decoration:none;line-height:1;cursor:pointer;transition:background 0.15s,box-shadow 0.15s,transform 0.15s;box-shadow:0 12px 26px rgba(0,0,0,0.36),0 0 18px rgba(220,38,38,0.08),inset 0 1px 0 rgba(255,255,255,0.12)}
        .esb-new-btn:hover{background:linear-gradient(180deg,rgba(255,75,75,0.32),rgba(220,38,38,0.18));box-shadow:0 14px 30px rgba(0,0,0,0.42),0 0 0 1px rgba(220,38,38,0.2),0 0 20px rgba(220,38,38,0.12);transform:translateY(-1px)}
        .esb-search{width:100%;padding:9px 12px;background:linear-gradient(180deg,rgba(255,255,255,0.11),rgba(255,255,255,0.055));border:1px solid rgba(255,255,255,0.16);border-radius:8px;color:rgba(255,255,255,0.92);font-size:13px;outline:none;box-sizing:border-box;margin-bottom:9px;transition:border-color 0.15s,box-shadow 0.15s;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 10px 20px rgba(0,0,0,0.2)}
        .esb-search:focus{border-color:rgba(255,75,75,0.62);box-shadow:0 0 0 3px rgba(220,38,38,0.13),inset 0 1px 0 rgba(255,255,255,0.08)}
        .esb-search::placeholder{color:rgba(255,255,255,0.28)}
        .esb-filters{display:flex;gap:6px}
        .esb-filter-sel{flex:1;padding:6px 8px;background:linear-gradient(180deg,rgba(255,255,255,0.095),rgba(255,255,255,0.055));border:1px solid rgba(255,255,255,0.14);border-radius:7px;color:rgba(255,255,255,0.8);font-size:12px;outline:none;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 8px 18px rgba(0,0,0,0.14)}
        .esb-filter-sel:focus{border-color:rgba(220,38,38,0.4)}
        .esb-sort-bar{display:flex;gap:4px;padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;background:linear-gradient(180deg,rgba(0,0,0,0.18),rgba(255,255,255,0.018))}
        .esb-sort-btn{flex:1;padding:5px 6px;background:transparent;border:1px solid transparent;border-radius:5px;color:rgba(255,255,255,0.35);font-size:11px;cursor:pointer;text-align:center;transition:all 0.12s;font-weight:500}
        .esb-sort-btn:hover{color:rgba(255,255,255,0.65);background:rgba(255,255,255,0.04)}
        .esb-sort-btn.active{background:linear-gradient(180deg,rgba(220,38,38,0.18),rgba(220,38,38,0.09));border-color:rgba(255,75,75,0.42);color:#ff4b4b;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06)}
        .esb-list{flex:1;overflow-y:auto;padding:9px 8px}
        .esb-list::-webkit-scrollbar{width:5px}
        .esb-list::-webkit-scrollbar-track{background:transparent}
        .esb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px}
        .esb-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.22)}
        .esb-item{padding:12px 12px;cursor:pointer;border-left:3px solid rgba(255,255,255,0.03);transition:background 0.14s,border-color 0.14s,box-shadow 0.14s,transform 0.14s;border-bottom:0;text-decoration:none;display:block;border-radius:9px;background:linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.024));border-top:1px solid rgba(255,255,255,0.075);border-right:1px solid rgba(255,255,255,0.035);margin-bottom:8px;box-shadow:0 8px 18px rgba(0,0,0,0.16)}
        .esb-item:hover{background:linear-gradient(180deg,rgba(255,255,255,0.105),rgba(255,255,255,0.052));border-left-color:rgba(255,75,75,0.86);box-shadow:0 16px 34px rgba(0,0,0,0.34),inset 0 1px 0 rgba(255,255,255,0.08),0 0 0 1px rgba(220,38,38,0.12);transform:translateY(-2px)}
        .esb-item-num{font-size:12px;font-weight:600;color:rgba(255,255,255,0.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace}
        .esb-item-cust{font-size:11px;color:rgba(255,255,255,0.38);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .esb-item-foot{display:flex;align-items:center;justify-content:space-between;margin-top:3px}
        .esb-item-amt{font-size:11px;color:rgba(255,255,255,0.5)}
        .esb-item-status{display:flex;align-items:center;gap:3px;font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.3px}
        .esb-count{padding:8px 14px;font-size:11px;color:rgba(255,255,255,0.34);text-align:center;border-top:1px solid rgba(255,255,255,0.08);flex-shrink:0;background:linear-gradient(180deg,rgba(255,255,255,0.025),rgba(0,0,0,0.28))}
        .est-right{flex:1;min-width:0;overflow-y:auto;padding:20px 22px 48px;background:radial-gradient(circle at 12% 8%,rgba(220,38,38,0.095),transparent 360px),radial-gradient(circle at 70% 0%,rgba(255,255,255,0.035),transparent 420px),#0f0f0f}
        .est-right::-webkit-scrollbar{width:8px}
        .est-right::-webkit-scrollbar-track{background:transparent}
        .est-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 280, minWidth: 280, flexShrink: 0, background: "linear-gradient(180deg,#1b1b1b 0%,#131313 46%,#101010 100%)", borderRight: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", overflowY: "hidden", boxShadow: "inset -1px 0 0 rgba(0,0,0,0.7), 18px 0 42px rgba(0,0,0,0.34)" }}>
          <div className="esb-header">
            <div className="esb-title">
              <h2>Estimates</h2>
              <Link href="/invoicing/estimates/new" className="esb-new-btn" title="New Estimate">+</Link>
            </div>
            <input type="text" placeholder="Search estimates..." value={search} onChange={e => setSearch(e.target.value)} className="esb-search" />
            <div className="esb-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="esb-filter-sel">
                <option value="all">All Status</option>
                <option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="VIEWED">Viewed</option>
                <option value="ACCEPTED">Accepted</option><option value="DECLINED">Declined</option>
                <option value="EXPIRED">Expired</option><option value="CONVERTED">Converted</option>
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
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Loading&#8230;</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>No estimates</div>
            ) : filtered.map(e => {
              const custName = e.customer?.companyName || [e.customer?.firstName, e.customer?.lastName].filter(Boolean).join(" ") || "No customer";
              const dot = STATUS_DOT[e.status] || "#9ca3af";
              return (
                <Link key={e.id} href={`/invoicing/estimates/${e.id}`} className="esb-item">
                  <div className="esb-item-num">{e.estimateNumber}</div>
                  <div className="esb-item-cust">{custName}</div>
                  <div className="esb-item-foot">
                    <span className="esb-item-amt">{fmt(e.total)}</span>
                    <span className="esb-item-status"><span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />{e.status}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="esb-count">{filtered.length} estimate{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Main content */}
        <div className="est-right">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0, marginBottom: 4, letterSpacing: "-0.3px" }}>Estimates</h1>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>{filtered.length} estimate{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/invoicing/estimate-templates" style={btnOutlinedGray}>Templates</Link>
              <Link href="/invoicing/estimates/new" style={btnOutlinedRed}>+ New Estimate</Link>
            </div>
          </div>
          {error && <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>{error}</div>}
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)" }}>Loading estimates&#8230;</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>&#128196;</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>{search || statusFilter !== "all" ? "No estimates match your filters" : "No estimates yet"}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginBottom: 20 }}>{search || statusFilter !== "all" ? "Try adjusting your search or filters" : "Create your first estimate to get started"}</div>
              {!search && statusFilter === "all" && <Link href="/invoicing/estimates/new" style={btnOutlinedRed}>+ Create First Estimate</Link>}
            </div>
          ) : (
            <div style={{ background: "linear-gradient(180deg,#1f1f1f,#151515 48%,#111)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, overflow: "hidden", boxShadow: "0 18px 42px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(180deg,rgba(255,255,255,0.07),rgba(0,0,0,0.22))" }}>
                    {["Estimate #","Customer","Date","Expires","Total","Items","Status",""].map(h => (
                      <th key={h} style={{ padding: "11px 14px", textAlign: h === "Total" ? "right" : h === "Items" ? "center" : h === "Status" ? "center" : "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(estimate => {
                    const sc = STATUS_COLORS[estimate.status] || STATUS_COLORS.DRAFT;
                    const expired = estimate.expiryDate && new Date(estimate.expiryDate) < new Date() && !['ACCEPTED','DECLINED','EXPIRED'].includes(estimate.status);
                    return (
                      <tr key={estimate.id} onClick={() => router.push(`/invoicing/estimates/${estimate.id}`)} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "background 0.14s, box-shadow 0.14s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))"; e.currentTarget.style.boxShadow = "inset 3px 0 0 rgba(255,75,75,0.72)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; }}>
                        <td style={{ padding: "11px 13px" }}><span style={{ fontFamily: "monospace", color: "#dc2626", fontWeight: 600, fontSize: 13 }}>{estimate.estimateNumber}</span></td>
                        <td style={{ padding: "13px 14px" }}>
                          <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{estimate.customer?.firstName} {estimate.customer?.lastName}</div>
                          {(estimate.customer?.company || estimate.customer?.companyName) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{estimate.customer?.company || estimate.customer?.companyName}</div>}
                        </td>
                        <td style={{ padding: "13px 14px", color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{fmtD(estimate.estimateDate)}</td>
                        <td style={{ padding: "13px 14px", fontSize: 12 }}><span style={{ color: expired ? "#ef4444" : "rgba(255,255,255,0.45)" }}>{fmtD(estimate.expiryDate)}{expired && <span style={{ fontSize: 10, marginLeft: 5, color: '#ef4444' }}>(Expired)</span>}</span></td>
                        <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 700, color: "rgba(255,255,255,0.88)", fontSize: 13 }}>{fmt(estimate.total)}</td>
                        <td style={{ padding: "13px 14px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{estimate._count?.items || 0}</td>
                        <td style={{ padding: "13px 14px", textAlign: "center" }}><span style={{ padding: "3px 9px", background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 5, color: sc.text, fontSize: 11, fontWeight: 600, letterSpacing: '0.3px' }}>{estimate.status}</span></td>
                        <td style={{ padding: "13px 14px", textAlign: "right" }}><button onClick={ev => { ev.stopPropagation(); router.push(`/invoicing/estimates/${estimate.id}`); }} style={{ padding: "5px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12 }}>View</button></td>
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
