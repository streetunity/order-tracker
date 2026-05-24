"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import InvoicingNav from "@/components/InvoicingNav";
import { useAuth } from "@/contexts/AuthContext";

export default function InvoicingDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentEstimates, setRecentEstimates] = useState([]);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    fetchDashboardData();
  }, [user, authLoading, router]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [pipelineRes, estimatesRes, invoicesRes, leadsRes] = await Promise.all([
        fetch("/api/invoicing-reports/pipeline", { headers }),
        fetch("/api/estimates?limit=5&sort=createdAt&order=desc", { headers }),
        fetch("/api/invoices?limit=20", { headers }),
        fetch("/api/leads?limit=5&sort=createdAt&order=desc", { headers })
      ]);
      if (pipelineRes.ok) {
        const d = await pipelineRes.json();
        setStats({ totalPipeline: d.summary?.totalValue || 0, totalEstimates: d.summary?.totalCount || 0, avgDealSize: d.summary?.avgValue || 0 });
      }
      if (estimatesRes.ok) {
        const d = await estimatesRes.json();
        setRecentEstimates(d.estimates || d.slice?.(0, 5) || []);
      }
      if (invoicesRes.ok) {
        const d = await invoicesRes.json();
        const invoices = d.invoices || d || [];
        setPendingInvoices(invoices.filter(inv => ["SENT","VIEWED","PARTIAL"].includes(inv.status)).slice(0, 5));
        setOverdueInvoices(invoices.filter(inv => {
          if (["PAID","VOID"].includes(inv.status)) return false;
          if (!inv.dueDate) return false;
          return new Date(inv.dueDate) < new Date();
        }));
      }
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setRecentLeads(d.leads || d.slice?.(0, 5) || []);
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders]);

  const fmt = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014";

  const STATUS_COLORS = {
    DRAFT:     { bg: "rgba(107,114,128,0.12)", text: "#9ca3af",  border: "rgba(107,114,128,0.25)" },
    SENT:      { bg: "rgba(59,130,246,0.12)",  text: "#60a5fa",  border: "rgba(59,130,246,0.25)" },
    VIEWED:    { bg: "rgba(99,102,241,0.12)",  text: "#818cf8",  border: "rgba(99,102,241,0.25)" },
    ACCEPTED:  { bg: "rgba(16,185,129,0.12)",  text: "#34d399",  border: "rgba(16,185,129,0.25)" },
    DECLINED:  { bg: "rgba(239,68,68,0.12)",   text: "#f87171",  border: "rgba(239,68,68,0.25)" },
    EXPIRED:   { bg: "rgba(249,115,22,0.12)",  text: "#fb923c",  border: "rgba(249,115,22,0.25)" },
    PAID:      { bg: "rgba(16,185,129,0.12)",  text: "#34d399",  border: "rgba(16,185,129,0.25)" },
    PARTIAL:   { bg: "rgba(245,158,11,0.12)",  text: "#fbbf24",  border: "rgba(245,158,11,0.25)" },
    OVERDUE:   { bg: "rgba(239,68,68,0.12)",   text: "#f87171",  border: "rgba(239,68,68,0.25)" },
    NEW:       { bg: "rgba(59,130,246,0.12)",  text: "#60a5fa",  border: "rgba(59,130,246,0.25)" },
    CONTACTED: { bg: "rgba(168,85,247,0.12)",  text: "#c084fc",  border: "rgba(168,85,247,0.25)" },
    QUALIFIED: { bg: "rgba(16,185,129,0.12)",  text: "#34d399",  border: "rgba(16,185,129,0.25)" },
    CONVERTED: { bg: "rgba(20,184,166,0.12)",  text: "#2dd4bf",  border: "rgba(20,184,166,0.25)" },
    LOST:      { bg: "rgba(239,68,68,0.12)",   text: "#f87171",  border: "rgba(239,68,68,0.25)" },
  };
  const sc = (s) => STATUS_COLORS[s] || STATUS_COLORS.DRAFT;

  if (authLoading || !user) return null;

  const greeting = () => { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 17) return "Good afternoon"; return "Good evening"; };
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const actionBtn = { padding: "8px 15px", background: "linear-gradient(180deg,rgba(255,75,75,0.18),rgba(220,38,38,0.08))", border: "1px solid rgba(255,75,75,0.38)", borderRadius: 7, color: "#ff5a5a", textDecoration: "none", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 10px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.09)" };

  return (
    <>
      <InvoicingNav />
      <style>{`
        .dash-shell { min-height: calc(100vh - 64px); background: radial-gradient(circle at 12% 4%,rgba(220,38,38,0.12),transparent 390px),radial-gradient(circle at 74% 0%,rgba(255,255,255,0.045),transparent 520px),#0f0f0f; }
        .dash-hero { background: linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025) 45%,rgba(220,38,38,0.055)); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 22px 52px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.08); position: relative; overflow: hidden; }
        .dash-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg,rgba(220,38,38,0.22),transparent 34%); opacity: 0.32; pointer-events: none; }
        .dash-hero-content { position: relative; z-index: 1; }
        .dash-stat-card { transition: transform 0.16s, box-shadow 0.16s, border-color 0.16s; background: linear-gradient(180deg,#1f1f1f,#151515); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 16px 36px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08); }
        .dash-stat-card:hover { transform: translateY(-3px); box-shadow: 0 28px 58px rgba(0,0,0,0.5), 0 0 0 1px rgba(220,38,38,0.16), inset 0 1px 0 rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.18); }
        .dash-panel { background: linear-gradient(180deg,#1f1f1f,#151515 48%,#111); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; overflow: hidden; box-shadow: 0 18px 42px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08); }
        .dash-panel-head { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.09); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(180deg,rgba(255,255,255,0.055),rgba(0,0,0,0.12)); }
        .dash-row-link { transition: background 0.14s, box-shadow 0.14s; }
        .dash-row-link:hover { background: linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032)) !important; box-shadow: inset 3px 0 0 rgba(255,75,75,0.72); }
        .dash-nav-card { transition: all 0.15s; }
        .dash-nav-card:hover { background: linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04)) !important; border-color: rgba(255,75,75,0.42) !important; box-shadow: 0 16px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08); transform: translateY(-2px); }
      `}</style>

      <div className="dash-shell">
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 48px" }}>

          <div className="dash-hero">
            <div className="dash-hero-content">
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 8 }}>{todayStr}</div>
                  <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 5px", letterSpacing: "-0.3px" }}>{greeting()}, {user.name?.split(" ")[0]}</h1>
                  <p style={{ color: "rgba(255,255,255,0.48)", fontSize: 14, margin: 0 }}>Pipeline, estimates, invoices, and new leads at a glance.</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Link href="/invoicing/leads/new"     style={actionBtn}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New Lead</Link>
                  <Link href="/invoicing/estimates/new" style={actionBtn}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Estimate</Link>
                  <Link href="/invoicing/invoices/new"  style={actionBtn}><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Invoice</Link>
                </div>
              </div>

              {/* Stat Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Total Pipeline",   value: fmt(stats?.totalPipeline),  sub: "Active estimate value",   color: "#ff4b4b", icon: "📈", accent: "linear-gradient(180deg,rgba(220,38,38,0.18),rgba(220,38,38,0.065))" },
                  { label: "Open Estimates",   value: stats?.totalEstimates ?? 0, sub: "Awaiting response",        color: "rgba(255,255,255,0.94)", icon: "📋", accent: "linear-gradient(180deg,#202020,#151515)" },
                  { label: "Pending Invoices", value: loading ? "\u2014" : pendingInvoices.length, sub: "Sent & awaiting payment", color: "#f59e0b", icon: "💳", accent: "linear-gradient(180deg,rgba(245,158,11,0.12),rgba(245,158,11,0.045))" },
                  { label: "Avg Deal Size",    value: fmt(stats?.avgDealSize),    sub: "Per estimate",             color: "rgba(255,255,255,0.94)", icon: "🎯", accent: "linear-gradient(180deg,#202020,#151515)" },
                ].map((s) => (
                  <div key={s.label} className="dash-stat-card" style={{ background: s.accent, borderRadius: 10, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 16, right: 18, fontSize: 22, opacity: 0.34 }} dangerouslySetInnerHTML={{ __html: s.icon }} />
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>{s.label}</div>
                    <div style={{ fontSize: s.label === "Total Pipeline" ? 32 : 27, fontWeight: 800, color: s.color, letterSpacing: "-0.4px", lineHeight: 1 }}>{loading ? <span style={{ opacity: 0.3 }}>—</span> : s.value}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.34)", marginTop: 8 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Overdue Alert */}
          {overdueInvoices.length > 0 && (
            <div style={{ padding: "14px 20px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>&#9888;&#65039;</div>
                <div>
                  <div style={{ fontWeight: 600, color: "#f87171", fontSize: 14 }}>{overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? "s" : ""} requiring attention</div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 1 }}>Total outstanding: {fmt(overdueInvoices.reduce((s, inv) => s + (inv.balanceDue || 0), 0))}</div>
                </div>
              </div>
              <Link href="/invoicing/invoices" style={{ padding: "7px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#f87171", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>View Invoices &#8594;</Link>
            </div>
          )}

          {/* Main Content Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {/* Recent Leads */}
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Recent Leads</span>
                </div>
                <Link href="/invoicing/leads" style={{ color: "#dc2626", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>View all &#8594;</Link>
              </div>
              <div style={{ padding: "8px 0" }}>
                {loading ? (
                  <div style={{ padding: "24px 20px", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Loading&#8230;</div>
                ) : recentLeads.length === 0 ? (
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>&#128196;</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No leads yet</div>
                    <Link href="/invoicing/leads/new" style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "#dc2626", textDecoration: "none", fontWeight: 600 }}>+ Add first lead</Link>
                  </div>
                ) : recentLeads.map((lead) => (
                  <Link key={lead.id} href={`/invoicing/leads/${lead.id}`} className="dash-row-link" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.firstName} {lead.lastName}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company || lead.email || "\u2014"}</div>
                    </div>
                    <span style={{ padding: "2px 8px", background: sc(lead.status).bg, border: `1px solid ${sc(lead.status).border}`, borderRadius: 4, color: sc(lead.status).text, fontSize: 10, fontWeight: 700, letterSpacing: "0.4px", flexShrink: 0, marginLeft: 10 }}>{lead.status}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent Estimates */}
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Recent Estimates</span>
                </div>
                <Link href="/invoicing/estimates" style={{ color: "#dc2626", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>View all &#8594;</Link>
              </div>
              <div style={{ padding: "8px 0" }}>
                {loading ? (
                  <div style={{ padding: "24px 20px", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Loading&#8230;</div>
                ) : recentEstimates.length === 0 ? (
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No estimates yet</div>
                    <Link href="/invoicing/estimates/new" style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "#dc2626", textDecoration: "none", fontWeight: 600 }}>+ Create estimate</Link>
                  </div>
                ) : recentEstimates.map((est) => (
                  <Link key={est.id} href={`/invoicing/estimates/${est.id}`} className="dash-row-link" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 13, fontFamily: "monospace", letterSpacing: "0.3px" }}>{est.estimateNumber}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{est.customer?.companyName || `${est.customer?.firstName || ""} ${est.customer?.lastName || ""}`.trim() || "\u2014"}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                      <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize: 13 }}>{fmt(est.total)}</div>
                      <span style={{ padding: "2px 7px", background: sc(est.status).bg, border: `1px solid ${sc(est.status).border}`, borderRadius: 4, color: sc(est.status).text, fontSize: 10, fontWeight: 700, letterSpacing: "0.4px" }}>{est.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Pending Invoices */}
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Pending Invoices</span>
                </div>
                <Link href="/invoicing/invoices" style={{ color: "#dc2626", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>View all &#8594;</Link>
              </div>
              <div style={{ padding: "8px 0" }}>
                {loading ? (
                  <div style={{ padding: "24px 20px", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Loading&#8230;</div>
                ) : pendingInvoices.length === 0 ? (
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>&#9989;</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>All invoices settled</div>
                  </div>
                ) : pendingInvoices.map((inv) => {
                  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
                  return (
                    <Link key={inv.id} href={`/invoicing/invoices/${inv.id}`} className="dash-row-link" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.03)", background: isOverdue ? "rgba(239,68,68,0.04)" : "transparent" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 13, fontFamily: "monospace", letterSpacing: "0.3px" }}>{inv.invoiceNumber}</div>
                        <div style={{ fontSize: 11, marginTop: 2, color: isOverdue ? "#f87171" : "rgba(255,255,255,0.35)" }}>{isOverdue ? "\u26a0 Overdue \u00b7 " : "Due "}{fmtDate(inv.dueDate)}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                        <div style={{ color: isOverdue ? "#f87171" : "rgba(255,255,255,0.85)", fontWeight: 700, fontSize: 13 }}>{fmt(inv.balanceDue)}</div>
                        <span style={{ padding: "2px 7px", background: sc(inv.status).bg, border: `1px solid ${sc(inv.status).border}`, borderRadius: 4, color: sc(inv.status).text, fontSize: 10, fontWeight: 700, letterSpacing: "0.4px" }}>{inv.status}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Nav Strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 16 }}>
            {[
              { href: "/invoicing/leads",     label: "Leads",     icon: "📥" },
              { href: "/invoicing/customers", label: "Customers", icon: "👤" },
              { href: "/invoicing/estimates", label: "Estimates", icon: "📋" },
              { href: "/invoicing/invoices",  label: "Invoices",  icon: "💳" },
              { href: "/invoicing/products",  label: "Products",  icon: "📦" },
            ].map(({ href, label, icon }) => (
              <Link key={href} href={href} className="dash-nav-card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.024))", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 10, textDecoration: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, boxShadow: "0 10px 24px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 18 }} dangerouslySetInnerHTML={{ __html: icon }} />
                <span>{label} &#8594;</span>
              </Link>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
