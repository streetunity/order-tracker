"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const STATUS_COLORS = {
  DRAFT:   { bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af' },
  SENT:    { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  text: '#3b82f6' },
  VIEWED:  { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  text: '#a855f7' },
  PARTIAL: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  text: '#f59e0b' },
  PAID:    { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e' },
  OVERDUE: { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444' },
  VOID:    { bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.3)', text: '#6b7280' },
};
const STATUS_DOT = { DRAFT: '#9ca3af', SENT: '#3b82f6', VIEWED: '#a855f7', PARTIAL: '#f59e0b', PAID: '#22c55e', OVERDUE: '#ef4444', VOID: '#6b7280' };
const fmt  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';

export default function InvoicesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [invoices,     setInvoices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy,       setSortBy]       = useState("date");
  const [salesReps,    setSalesReps]    = useState([]);
  const [repFilter,    setRepFilter]    = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadInvoices(); loadSalesReps();
  }, [user, router]);

  async function loadSalesReps() {
    try { const r = await fetch("/api/users/sales-reps", { headers: getAuthHeaders() }); if (r.ok) setSalesReps(await r.json()); } catch {}
  }
  async function loadInvoices() {
    try {
      const r = await fetch("/api/invoices", { headers: getAuthHeaders() });
      if (!r.ok) { if (r.status === 401) { router.push("/login"); return; } throw new Error(); }
      const d = await r.json();
      setInvoices(Array.isArray(d) ? d : (d.invoices || []));
    } catch {}
    finally { setLoading(false); }
  }

  if (authLoading || !user) return null;

  const filtered = invoices
    .filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (repFilter && inv.createdById !== repFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return inv.invoiceNumber?.toLowerCase().includes(q) || inv.customer?.firstName?.toLowerCase().includes(q) || inv.customer?.lastName?.toLowerCase().includes(q) || inv.customer?.companyName?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "amount")  return (b.total || 0) - (a.total || 0);
      if (sortBy === "balance") return (b.balanceDue || 0) - (a.balanceDue || 0);
      if (sortBy === "due")     return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const totalOutstanding = invoices.filter(i => !['PAID','VOID'].includes(i.status)).reduce((s,i) => s + (i.balanceDue||0), 0);
  const totalOverdue     = invoices.filter(i => i.status === 'OVERDUE' || (new Date(i.dueDate) < new Date() && !['PAID','VOID'].includes(i.status))).reduce((s,i) => s + (i.balanceDue||0), 0);
  const paidThisMonth    = invoices.filter(i => { if (i.status !== 'PAID') return false; const p = new Date(i.updatedAt), n = new Date(); return p.getMonth() === n.getMonth() && p.getFullYear() === n.getFullYear(); }).reduce((s,i) => s + (i.total||0), 0);

  const btnOutlinedRed = { padding: "7px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7, color: "#dc2626", textDecoration: "none", fontSize: 13, fontWeight: 600 };

  return (
    <>
      <InvoicingNav />
      <style>{`
        .isb-header{padding:16px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;background:linear-gradient(180deg,rgba(255,255,255,0.025),rgba(0,0,0,0));box-shadow:inset 0 1px 0 rgba(255,255,255,0.035)}
        .isb-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .isb-title h2{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);margin:0;text-transform:uppercase;letter-spacing:0.8px}
        .isb-title h2::before{content:'';display:block;width:3px;height:13px;background:#dc2626;border-radius:2px;flex-shrink:0}
        .isb-new-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;background:linear-gradient(180deg,rgba(220,38,38,0.16),rgba(220,38,38,0.08));border:1px solid rgba(220,38,38,0.32);border-radius:6px;color:#ff4b4b;font-size:16px;text-decoration:none;line-height:1;cursor:pointer;transition:background 0.15s,box-shadow 0.15s,transform 0.15s;box-shadow:0 8px 18px rgba(0,0,0,0.22),inset 0 1px 0 rgba(255,255,255,0.05)}
        .isb-new-btn:hover{background:rgba(220,38,38,0.2);box-shadow:0 10px 22px rgba(0,0,0,0.28),0 0 0 1px rgba(220,38,38,0.12);transform:translateY(-1px)}
        .isb-search{width:100%;padding:8px 12px;background:linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.045));border:1px solid rgba(255,255,255,0.11);border-radius:7px;color:rgba(255,255,255,0.9);font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;transition:border-color 0.15s,box-shadow 0.15s;box-shadow:inset 0 1px 0 rgba(255,255,255,0.035)}
        .isb-search:focus{border-color:rgba(220,38,38,0.48);box-shadow:0 0 0 3px rgba(220,38,38,0.08),inset 0 1px 0 rgba(255,255,255,0.04)}
        .isb-search::placeholder{color:rgba(255,255,255,0.28)}
        .isb-filters{display:flex;gap:6px}
        .isb-filter-sel{flex:1;padding:5px 8px;background:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.045));border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.74);font-size:12px;outline:none;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03)}
        .isb-filter-sel:focus{border-color:rgba(220,38,38,0.4)}
        .isb-sort-bar{display:flex;gap:3px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;background:rgba(0,0,0,0.12)}
        .isb-sort-btn{flex:1;padding:5px 6px;background:transparent;border:1px solid transparent;border-radius:5px;color:rgba(255,255,255,0.35);font-size:11px;cursor:pointer;text-align:center;transition:all 0.12s;font-weight:500}
        .isb-sort-btn:hover{color:rgba(255,255,255,0.65);background:rgba(255,255,255,0.04)}
        .isb-sort-btn.active{background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.22);color:#dc2626}
        .isb-list{flex:1;overflow-y:auto;padding:6px 7px}
        .isb-list::-webkit-scrollbar{width:5px}
        .isb-list::-webkit-scrollbar-track{background:transparent}
        .isb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px}
        .isb-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.22)}
        .isb-item{padding:11px 12px;cursor:pointer;border-left:3px solid transparent;transition:background 0.12s,border-color 0.12s,box-shadow 0.12s,transform 0.12s;border-bottom:0;text-decoration:none;display:block;border-radius:8px;background:rgba(255,255,255,0.018);border-top:1px solid rgba(255,255,255,0.025);margin-bottom:6px}
        .isb-item:hover{background:linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.032));border-left-color:rgba(220,38,38,0.62);box-shadow:0 10px 22px rgba(0,0,0,0.22),inset 0 1px 0 rgba(255,255,255,0.035);transform:translateY(-1px)}
        .isb-item-num{font-size:12px;font-weight:600;color:rgba(255,255,255,0.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace}
        .isb-item-cust{font-size:11px;color:rgba(255,255,255,0.38);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .isb-item-foot{display:flex;align-items:center;justify-content:space-between;margin-top:3px}
        .isb-item-bal{font-size:11px;color:rgba(255,255,255,0.45)}
        .isb-item-bal.owed{color:#f59e0b;font-weight:600}
        .isb-item-status{display:flex;align-items:center;gap:3px;font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.3px}
        .isb-count{padding:7px 14px;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0;background:rgba(0,0,0,0.16)}
        .inv-right{flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px;background:radial-gradient(circle at top left,rgba(220,38,38,0.035),transparent 320px),#0f0f0f}
        .inv-right::-webkit-scrollbar{width:8px}
        .inv-right::-webkit-scrollbar-track{background:transparent}
        .inv-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 280, minWidth: 280, flexShrink: 0, background: "#141414", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflowY: "hidden", boxShadow: "inset -1px 0 0 rgba(0,0,0,0.45), 8px 0 30px rgba(0,0,0,0.12)" }}>
          <div className="isb-header">
            <div className="isb-title">
              <h2>Invoices</h2>
              <Link href="/invoicing/invoices/new" className="isb-new-btn" title="New Invoice">+</Link>
            </div>
            <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} className="isb-search" />
            <div className="isb-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="isb-filter-sel">
                <option value="all">All Status</option>
                <option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="VIEWED">Viewed</option>
                <option value="PARTIAL">Partial</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option><option value="VOID">Void</option>
              </select>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="isb-filter-sel">
                <option value="">All Reps</option>
                {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="isb-sort-bar">
            {[["date","Date"],["amount","Amount"],["balance","Balance"],["due","Due"]].map(([key,label]) => (
              <button key={key} className={`isb-sort-btn${sortBy === key ? ' active' : ''}`} onClick={() => setSortBy(key)}>{label}</button>
            ))}
          </div>
          <div className="isb-list">
            {loading ? (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Loading&#8230;</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>No invoices</div>
            ) : filtered.map(inv => {
              const custName = inv.customer?.companyName || [inv.customer?.firstName, inv.customer?.lastName].filter(Boolean).join(" ") || "No customer";
              const dot = STATUS_DOT[inv.status] || "#9ca3af";
              const balOwed = (inv.balanceDue || 0) > 0;
              return (
                <Link key={inv.id} href={`/invoicing/invoices/${inv.id}`} className="isb-item">
                  <div className="isb-item-num">{inv.invoiceNumber}</div>
                  <div className="isb-item-cust">{custName}</div>
                  <div className="isb-item-foot">
                    <span className={`isb-item-bal${balOwed ? ' owed' : ''}`}>{balOwed ? `${fmt(inv.balanceDue)} due` : fmt(inv.total)}</span>
                    <span className="isb-item-status"><span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />{inv.status}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="isb-count">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Main content */}
        <div className="inv-right">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0, marginBottom: 4, letterSpacing: "-0.3px" }}>Invoices</h1>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>Manage invoices and track payments</p>
            </div>
            <Link href="/invoicing/invoices/new" style={btnOutlinedRed}>+ New Invoice</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Invoices",  value: invoices.length,       color: "rgba(255,255,255,0.85)" },
              { label: "Outstanding",     value: fmt(totalOutstanding), color: "#f59e0b" },
              { label: "Overdue",         value: fmt(totalOverdue),     color: "#ef4444" },
              { label: "Paid This Month", value: fmt(paidThisMonth),    color: "#22c55e" },
            ].map(s => (
              <div key={s.label} style={{ background: "linear-gradient(180deg,#171717,#131313)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 18px", boxShadow: "0 12px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.035)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, letterSpacing: "-0.3px" }}>{s.value}</div>
              </div>
            ))}
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)" }}>Loading invoices&#8230;</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>&#128202;</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>{search || statusFilter !== "all" ? "No invoices match your filters" : "No invoices yet"}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginBottom: 20 }}>{search || statusFilter !== "all" ? "Try adjusting your search or filters" : "Create your first invoice to get started"}</div>
              {!search && statusFilter === "all" && <Link href="/invoicing/invoices/new" style={btnOutlinedRed}>+ Create First Invoice</Link>}
            </div>
          ) : (
            <div style={{ background: "linear-gradient(180deg,#171717,#131313)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", boxShadow: "0 16px 38px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.035)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
                    {["Invoice #","Customer","Date","Due Date","Total","Balance","Status",""].map((h,i) => (
                      <th key={i} style={{ padding: "11px 14px", textAlign: ["Total","Balance"].includes(h) ? "right" : h === "Status" ? "center" : "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(invoice => {
                    const sc = STATUS_COLORS[invoice.status] || STATUS_COLORS.DRAFT;
                    const overdue = new Date(invoice.dueDate) < new Date() && !['PAID','VOID'].includes(invoice.status);
                    return (
                      <tr key={invoice.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        onClick={() => router.push(`/invoicing/invoices/${invoice.id}`)}
                      >
                        <td style={{ padding: "13px 14px" }}><span style={{ fontFamily: "monospace", color: "#dc2626", fontWeight: 600, fontSize: 13 }}>{invoice.invoiceNumber}</span></td>
                        <td style={{ padding: "13px 14px" }}>
                          {invoice.customer ? (
                            <div>
                              <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{invoice.customer.firstName} {invoice.customer.lastName}</div>
                              {(invoice.customer.company || invoice.customer.companyName) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{invoice.customer.company || invoice.customer.companyName}</div>}
                            </div>
                          ) : <span style={{ color: "rgba(255,255,255,0.25)" }}>&#8212;</span>}
                        </td>
                        <td style={{ padding: "13px 14px", color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{fmtD(invoice.invoiceDate)}</td>
                        <td style={{ padding: "13px 14px", fontSize: 12, color: overdue ? "#ef4444" : "rgba(255,255,255,0.45)" }}>{fmtD(invoice.dueDate)}{overdue && <span style={{ fontSize: 10, marginLeft: 4 }}>&#9888;</span>}</td>
                        <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 500, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{fmt(invoice.total)}</td>
                        <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 700, fontSize: 13, color: invoice.balanceDue > 0 ? "#f59e0b" : "#22c55e" }}>{fmt(invoice.balanceDue)}</td>
                        <td style={{ padding: "13px 14px", textAlign: "center" }}><span style={{ padding: "3px 9px", background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 5, color: sc.text, fontSize: 11, fontWeight: 600, letterSpacing: '0.3px' }}>{invoice.status}</span></td>
                        <td style={{ padding: "13px 14px", textAlign: "right" }}><button onClick={e => { e.stopPropagation(); router.push(`/invoicing/invoices/${invoice.id}`); }} style={{ padding: "5px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12 }}>View</button></td>
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
