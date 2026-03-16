"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import InvoicingNav from "@/components/InvoicingNav";
import { hasInvoicingPermission } from "@/lib/roleUtils";

const REPORT_TYPES = [
  { id: "pipeline",             name: "Sales Pipeline",        description: "Estimates by status with values" },
  { id: "win-loss",             name: "Win/Loss Analysis",      description: "Conversion rates and loss reasons" },
  { id: "time-to-close",        name: "Time to Close",          description: "Average sales cycle duration" },
  { id: "ar-aging",             name: "AR Aging",               description: "Receivables by age bucket" },
  { id: "sales-summary",        name: "Sales Summary",          description: "Revenue by rep and period" },
  { id: "revenue-projections",  name: "Revenue Projections",    description: "Weighted pipeline forecast" },
];

const fmt  = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtP = (v) => `${(v || 0).toFixed(1)}%`;

const STAT = ({ label, value, color }) => (
  <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "16px 20px", flex: 1 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: color || "rgba(255,255,255,0.88)", letterSpacing: "-0.3px" }}>{value}</div>
  </div>
);

const TH = (label, align = "left") => (
  <th style={{ padding: "10px 14px", textAlign: align, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{label}</th>
);

const TD = (children, align = "left", extra = {}) => (
  <td style={{ padding: "12px 14px", textAlign: align, color: "rgba(255,255,255,0.7)", fontSize: 13, ...extra }}>{children}</td>
);

export default function ReportsPage() {
  const [user, setUser]               = useState(null);
  const [activeReport, setActiveReport] = useState("pipeline");
  const [reportData, setReportData]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [dateRange, setDateRange]     = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split("T")[0],
    endDate:   new Date().toISOString().split("T")[0],
  });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) { router.push("/login"); return; }
    try {
      const u = JSON.parse(storedUser);
      setUser(u);
      if (!hasInvoicingPermission(u.role, "VIEW_ALL_INVOICES")) router.push("/invoicing");
    } catch { router.push("/login"); }
  }, [router]);

  const fetchReport = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    const token = localStorage.getItem("token");
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate)   params.append("endDate",   dateRange.endDate);
      const res = await fetch(`/api/invoicing-reports/${activeReport}${params.toString() ? `?${params.toString()}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch report");
      setReportData(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [user, activeReport, dateRange]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleExport = async () => {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams();
    if (dateRange.startDate) params.append("startDate", dateRange.startDate);
    if (dateRange.endDate)   params.append("endDate",   dateRange.endDate);
    try {
      const res = await fetch(`/api/invoicing-reports/export/${activeReport}${params.toString() ? `?${params.toString()}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${activeReport}-report.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) { setError("Failed to export report."); }
  };

  const TABLE = ({ headers, rows }) => (
    <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden", marginTop: 20 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
            {headers.map((h, i) => <th key={i} style={{ padding: "10px 14px", textAlign: i > 0 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {row.map((cell, j) => <td key={j} style={{ padding: "12px 14px", textAlign: j > 0 ? "right" : "left", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderContent = () => {
    if (loading) return <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading report&#8230;</div>;
    if (error)   return <div style={{ padding: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>;
    if (!reportData) return null;

    switch (activeReport) {
      case "pipeline": {
        const { pipeline = [], summary = {} } = reportData;
        return (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Total Pipeline"  value={fmt(summary.totalValue)} color="#dc2626" />
              <STAT label="Total Estimates" value={summary.totalCount || 0} />
              <STAT label="Avg Deal Size"   value={fmt(summary.avgValue)} />
            </div>
            {pipeline.map(stage => (
              <div key={stage.status} style={{ marginBottom: 14, background: "#141414", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{stage.status}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{fmt(stage.totalValue)}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>{stage.count} estimate{stage.count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#dc2626", borderRadius: 3, width: `${summary.totalValue ? Math.min(100, (stage.totalValue / summary.totalValue) * 100) : 0}%`, transition: "width 0.4s" }} />
                </div>
              </div>
            ))}
          </>
        );
      }
      case "win-loss": {
        const { summary = {}, lossReasons = [] } = reportData;
        return (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Win Rate"   value={fmtP(summary.winRate)}     color="#22c55e" />
              <STAT label="Deals Won"  value={summary.totalWon || 0}     color="#22c55e" />
              <STAT label="Deals Lost" value={summary.totalLost || 0}    color="#f87171" />
              <STAT label="Won Value"  value={fmt(summary.totalWonValue)} />
            </div>
            {lossReasons.length > 0 && (
              <TABLE headers={["Loss Reason", "Count"]} rows={lossReasons.map(r => [r.reason || "No reason given", r.count])} />
            )}
          </>
        );
      }
      case "time-to-close": {
        const { overall = {}, byMonth = [] } = reportData;
        return (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Avg Days to Close" value={`${(overall.avgDays || 0).toFixed(1)} days`} />
              <STAT label="Fastest Close"      value={`${overall.minDays || 0} days`} color="#22c55e" />
              <STAT label="Slowest Close"      value={`${overall.maxDays || 0} days`} color="#f87171" />
              <STAT label="Deals Closed"       value={overall.count || 0} />
            </div>
            {byMonth.length > 0 && <TABLE headers={["Month", "Deals Closed", "Avg Days"]} rows={byMonth.map(m => [m.month, m.count, `${m.avgDays?.toFixed(1)} days`])} />}
          </>
        );
      }
      case "ar-aging": {
        const { summary = {}, buckets = {}, invoices = [] } = reportData;
        return (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Total Outstanding" value={fmt(summary.totalOutstanding)} color="#f59e0b" />
              <STAT label="Current"           value={fmt(buckets.current)} color="#22c55e" />
              <STAT label="30+ Days"          value={fmt(buckets.over30)} color="#f59e0b" />
              <STAT label="90+ Days"          value={fmt(buckets.over90)} color="#f87171" />
            </div>
            {invoices.length > 0 && (
              <TABLE
                headers={["Invoice #", "Customer", "Due Date", "Days Overdue", "Balance"]}
                rows={invoices.slice(0, 20).map(inv => [
                  <span style={{ fontFamily: "monospace", color: "#dc2626" }}>{inv.invoiceNumber}</span>,
                  inv.customerName,
                  inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "&#8212;",
                  <span style={{ color: inv.daysOverdue > 90 ? "#f87171" : inv.daysOverdue > 30 ? "#f59e0b" : "rgba(255,255,255,0.6)" }}>{inv.daysOverdue}</span>,
                  fmt(inv.balanceDue)
                ])}
              />
            )}
          </>
        );
      }
      case "sales-summary": {
        const { summary = {}, byRep = [], byPeriod = [] } = reportData;
        return (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Total Revenue"  value={fmt(summary.totalRevenue)} color="#22c55e" />
              <STAT label="Invoices Paid"  value={summary.paidCount || 0} />
              <STAT label="Avg Invoice"    value={fmt(summary.avgInvoice)} />
            </div>
            {byRep.length > 0 && <TABLE headers={["Sales Rep", "Invoices", "Revenue", "% of Total"]} rows={byRep.map(r => [r.name || "Unassigned", r.count, fmt(r.revenue), fmtP((r.revenue / (summary.totalRevenue || 1)) * 100)])} />}
            {byPeriod.length > 0 && <TABLE headers={["Period", "Invoices", "Revenue"]} rows={byPeriod.map(p => [p.period, p.count, fmt(p.revenue)])} />}
          </>
        );
      }
      case "revenue-projections": {
        const { summary = {}, byStatus = [] } = reportData;
        return (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Total Pipeline"      value={fmt(summary.totalPipeline)} color="#dc2626" />
              <STAT label="Weighted Projection" value={fmt(summary.weightedTotal)} color="#22c55e" />
              <STAT label="Open Estimates"      value={summary.estimateCount || 0} />
            </div>
            {byStatus.length > 0 && <TABLE headers={["Status", "Count", "Total Value", "Probability", "Weighted Value"]} rows={byStatus.map(s => [s.status, s.count, fmt(s.totalValue), fmtP(s.probability * 100), fmt(s.weightedValue)])} />}
          </>
        );
      }
      default: return null;
    }
  };

  if (!user) return null;

  const activeReportInfo = REPORT_TYPES.find(r => r.id === activeReport);

  return (
    <>
      <InvoicingNav />

      <style>{`
        .rpt-sidebar-item { display: block; width: 100%; text-align: left; padding: 10px 14px; background: transparent; border: none; border-left: 3px solid transparent; cursor: pointer; transition: all 0.12s; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .rpt-sidebar-item:hover { background: rgba(255,255,255,0.04); border-left-color: rgba(220,38,38,0.35); }
        .rpt-sidebar-item.active { background: rgba(220,38,38,0.07); border-left-color: #dc2626; }
        .rpt-date-input { width: 100%; padding: 8px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 7px; color: rgba(255,255,255,0.85); font-size: 12px; outline: none; box-sizing: border-box; color-scheme: dark; }
        .rpt-date-input:focus { border-color: rgba(220,38,38,0.4); }
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 60px)", marginTop: 60, background: "#0f0f0f", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 260, minWidth: 260, flexShrink: 0, background: "#141414", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

          {/* Reports list */}
          <div style={{ padding: "16px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 3, height: 13, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Reports</span>
            </div>
          </div>
          <div style={{ padding: "4px 0" }}>
            {REPORT_TYPES.map(r => (
              <button key={r.id} className={`rpt-sidebar-item${activeReport === r.id ? ' active' : ''}`} onClick={() => setActiveReport(r.id)}>
                <div style={{ fontSize: 13, fontWeight: 500, color: activeReport === r.id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.65)", marginBottom: 2 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{r.description}</div>
              </button>
            ))}
          </div>

          {/* Date range */}
          <div style={{ padding: "14px", borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 3, height: 13, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Date Range</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Start Date</label>
              <input type="date" className="rpt-date-input" value={dateRange.startDate} onChange={e => setDateRange({ ...dateRange, startDate: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>End Date</label>
              <input type="date" className="rpt-date-input" value={dateRange.endDate} onChange={e => setDateRange({ ...dateRange, endDate: e.target.value })} />
            </div>
            <button onClick={handleExport} style={{ width: "100%", padding: "9px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.1)"} onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.06)"}>
              &#8595; Export CSV
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 60px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.3px" }}>{activeReportInfo?.name}</h1>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>{activeReportInfo?.description}</p>
            </div>
            <Link href="/invoicing" style={{ padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 12, fontWeight: 500 }}>&#8592; Invoicing</Link>
          </div>

          {renderContent()}
        </div>
      </div>
    </>
  );
}
