"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import InvoicingNav from "@/components/InvoicingNav";
import { hasInvoicingPermission } from "@/lib/roleUtils";

const REPORT_TYPES = [
  { id: "pipeline",            name: "Sales Pipeline",       description: "Estimates by status with values" },
  { id: "win-loss",            name: "Win/Loss Analysis",     description: "Conversion rates and loss reasons" },
  { id: "time-to-close",       name: "Time to Close",         description: "Average sales cycle duration" },
  { id: "ar-aging",            name: "AR Aging",              description: "Receivables by age bucket" },
  { id: "sales-summary",       name: "Sales Summary",         description: "Revenue by rep and period" },
  { id: "revenue-projections", name: "Revenue Projections",   description: "Weighted pipeline forecast" },
];

const fmt  = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtP = (v) => `${(v || 0).toFixed(1)}%`;

const STAT = ({ label, value, color }) => (
  <div style={{ background: "linear-gradient(180deg,#1f1f1f,#151515)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "15px 18px", flex: 1, boxShadow: "0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 700, color: color || "rgba(255,255,255,0.88)", letterSpacing: "-0.3px" }}>{value}</div>
  </div>
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
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${activeReport}-report.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { setError("Failed to export report."); }
  };

  const TABLE = ({ headers, rows }) => (
    <div style={{ background: "linear-gradient(180deg,#1f1f1f,#151515 48%,#111)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, overflow: "hidden", marginTop: 16, boxShadow: "0 18px 42px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(180deg,rgba(255,255,255,0.07),rgba(0,0,0,0.22))" }}>
            {headers.map((h, i) => <th key={i} style={{ padding: "10px 13px", textAlign: i > 0 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {row.map((cell, j) => <td key={j} style={{ padding: "11px 13px", textAlign: j > 0 ? "right" : "left", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{cell}</td>)}
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
            <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
              <STAT label="Total Pipeline"  value={fmt(summary.totalValue)} color="#dc2626" />
              <STAT label="Total Estimates" value={summary.totalCount || 0} />
              <STAT label="Avg Deal Size"   value={fmt(summary.avgValue)} />
            </div>
            {pipeline.filter(s => s.count > 0).map(stage => (
              <div key={stage.status} style={{ marginBottom: 12, background: "linear-gradient(180deg,#1f1f1f,#151515)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "13px 16px", boxShadow: "0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{stage.status}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{fmt(stage.totalValue)}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>{stage.count} estimate{stage.count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#dc2626", borderRadius: 3, width: `${summary.totalValue ? Math.min(100, (stage.totalValue / summary.totalValue) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </>
        );
      }
      case "win-loss": {
        const { summary = {}, lossReasons = [] } = reportData;
        return (<><div style={{ display: "flex", gap: 14, marginBottom: 24 }}><STAT label="Win Rate" value={fmtP(summary.winRate)} color="#22c55e" /><STAT label="Deals Won" value={summary.totalWon || 0} color="#22c55e" /><STAT label="Deals Lost" value={summary.totalLost || 0} color="#f87171" /><STAT label="Won Value" value={fmt(summary.totalWonValue)} /></div>{lossReasons.length > 0 && <TABLE headers={["Loss Reason", "Count"]} rows={lossReasons.map(r => [r.reason || "No reason given", r.count])} />}</>);
      }
      case "time-to-close": {
        const { overall = {}, byMonth = [] } = reportData;
        return (<><div style={{ display: "flex", gap: 14, marginBottom: 24 }}><STAT label="Avg Days to Close" value={`${(overall.avgDays || 0).toFixed(1)} days`} /><STAT label="Fastest Close" value={`${overall.minDays || 0} days`} color="#22c55e" /><STAT label="Slowest Close" value={`${overall.maxDays || 0} days`} color="#f87171" /><STAT label="Deals Closed" value={overall.count || 0} /></div>{byMonth.length > 0 && <TABLE headers={["Month", "Deals Closed", "Avg Days"]} rows={byMonth.map(m => [m.month, m.count, `${m.avgDays?.toFixed(1)} days`])} />}</>);
      }
      case "ar-aging": {
        const { summary = {}, buckets = {}, invoices = [] } = reportData;
        return (<><div style={{ display: "flex", gap: 14, marginBottom: 24 }}><STAT label="Total Outstanding" value={fmt(summary.totalOutstanding)} color="#f59e0b" /><STAT label="Current" value={fmt(buckets.current)} color="#22c55e" /><STAT label="30+ Days" value={fmt(buckets.over30)} color="#f59e0b" /><STAT label="90+ Days" value={fmt(buckets.over90)} color="#f87171" /></div>{invoices.length > 0 && <TABLE headers={["Invoice #", "Customer", "Due Date", "Days Overdue", "Balance"]} rows={invoices.slice(0,20).map(inv => [<span style={{fontFamily:"monospace",color:"#dc2626"}}>{inv.invoiceNumber}</span>, inv.customerName, inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "\u2014", <span style={{color:inv.daysOverdue>90?"#f87171":inv.daysOverdue>30?"#f59e0b":"rgba(255,255,255,0.6)"}}>{inv.daysOverdue}</span>, fmt(inv.balanceDue)])} />}</>);
      }
      case "sales-summary": {
        const { summary = {}, byRep = [], byPeriod = [] } = reportData;
        return (<><div style={{ display: "flex", gap: 14, marginBottom: 24 }}><STAT label="Total Revenue" value={fmt(summary.totalRevenue)} color="#22c55e" /><STAT label="Invoices Paid" value={summary.paidCount || 0} /><STAT label="Avg Invoice" value={fmt(summary.avgInvoice)} /></div>{byRep.length > 0 && <TABLE headers={["Sales Rep", "Invoices", "Revenue", "% of Total"]} rows={byRep.map(r => [r.name||"Unassigned", r.count, fmt(r.revenue), fmtP((r.revenue/(summary.totalRevenue||1))*100)])} />}{byPeriod.length > 0 && <TABLE headers={["Period", "Invoices", "Revenue"]} rows={byPeriod.map(p => [p.period, p.count, fmt(p.revenue)])} />}</>);
      }
      case "revenue-projections": {
        const { summary = {}, byStatus = [], calibration = {} } = reportData;
        const { usingHistorical, totalClosed, wonCount, baseWinRate, minSamplesNeeded, probabilities = {} } = calibration;
        const samplesNeeded = Math.max(0, minSamplesNeeded - totalClosed);

        return (
          <>
            {/* Calibration status banner */}
            <div style={{ padding: "12px 16px", borderRadius: 9, marginBottom: 20, background: usingHistorical ? "rgba(16,185,129,0.07)" : "rgba(245,158,11,0.07)", border: `1px solid ${usingHistorical ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 16, marginTop: 1 }}>{usingHistorical ? "\u2705" : "\u26a0\ufe0f"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: usingHistorical ? "#34d399" : "#fbbf24", marginBottom: 4 }}>
                    {usingHistorical
                      ? `Calibrated from your data \u2014 based on ${totalClosed} closed estimates (${wonCount} won)`
                      : `Using default rates \u2014 ${samplesNeeded} more closed estimate${samplesNeeded !== 1 ? 's' : ''} needed to self-calibrate`
                    }
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>Base win rate: <strong style={{ color: "rgba(255,255,255,0.7)" }}>{fmtP((baseWinRate || 0) * 100)}</strong></span>
                    {Object.entries(probabilities).map(([status, prob]) => (
                      <span key={status}>{status}: <strong style={{ color: "rgba(255,255,255,0.7)" }}>{fmtP(prob * 100)}</strong></span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <STAT label="Total Pipeline"      value={fmt(summary.totalPipeline)} color="#dc2626" />
              <STAT label="Weighted Projection" value={fmt(summary.weightedTotal)} color="#22c55e" />
              <STAT label="Open Estimates"      value={summary.estimateCount || 0} />
            </div>

            {byStatus.length > 0 && (
              <TABLE
                headers={["Status", "Count", "Total Value", "Probability", "Weighted Value"]}
                rows={byStatus.map(s => [
                  s.status,
                  s.count,
                  fmt(s.totalValue),
                  <span style={{ color: s.probability > 0.5 ? '#22c55e' : s.probability > 0.3 ? '#f59e0b' : '#9ca3af', fontWeight: 600 }}>{fmtP(s.probability * 100)}</span>,
                  fmt(s.weightedValue)
                ])}
              />
            )}

            {byStatus.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                No open estimates in the pipeline
              </div>
            )}
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
        .rpt-sidebar-item { display: block; width: calc(100% - 12px); margin: 6px; text-align: left; padding: 11px 12px; background: linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.024)); border: none; border-left: 3px solid rgba(255,255,255,0.03); border-radius: 9px; cursor: pointer; transition: all 0.14s; border-top: 1px solid rgba(255,255,255,0.075); border-right: 1px solid rgba(255,255,255,0.035); box-shadow: 0 8px 18px rgba(0,0,0,0.16); }
        .rpt-sidebar-item:hover { background: linear-gradient(180deg,rgba(255,255,255,0.105),rgba(255,255,255,0.052)); border-left-color: rgba(255,75,75,0.72); box-shadow: 0 16px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(220,38,38,0.12); transform: translateY(-2px); }
        .rpt-sidebar-item.active { background: linear-gradient(180deg,rgba(220,38,38,0.18),rgba(220,38,38,0.08)); border-left-color: #ff4b4b; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 34px rgba(0,0,0,0.32), 0 0 0 1px rgba(220,38,38,0.15); }
        .rpt-date-input { width: 100%; padding: 9px 10px; background: linear-gradient(180deg,rgba(255,255,255,0.11),rgba(255,255,255,0.055)); border: 1px solid rgba(255,255,255,0.16); border-radius: 8px; color: rgba(255,255,255,0.88); font-size: 12px; outline: none; box-sizing: border-box; color-scheme: dark; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 20px rgba(0,0,0,0.2); }
        .rpt-date-input:focus { border-color: rgba(255,75,75,0.62); box-shadow: 0 0 0 3px rgba(220,38,38,0.13), inset 0 1px 0 rgba(255,255,255,0.08); }
        .rpt-main::-webkit-scrollbar { width: 8px; }
        .rpt-main::-webkit-scrollbar-track { background: transparent; }
        .rpt-main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 64px)", background: "radial-gradient(circle at 12% 8%,rgba(220,38,38,0.095),transparent 360px),radial-gradient(circle at 70% 0%,rgba(255,255,255,0.035),transparent 420px),#0f0f0f", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 260, minWidth: 260, flexShrink: 0, background: "linear-gradient(180deg,#1b1b1b 0%,#131313 46%,#101010 100%)", borderRight: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", overflowY: "auto", boxShadow: "inset -1px 0 0 rgba(0,0,0,0.7), 18px 0 42px rgba(0,0,0,0.34)" }}>
          <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.09)", background: "radial-gradient(circle at top left,rgba(220,38,38,0.12),transparent 155px),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.08))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 26px rgba(0,0,0,0.24)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 3, height: 13, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Reports</span>
            </div>
          </div>
          <div style={{ padding: "4px 0", flex: 1 }}>
            {REPORT_TYPES.map(r => (
              <button key={r.id} className={`rpt-sidebar-item${activeReport === r.id ? ' active' : ''}`} onClick={() => setActiveReport(r.id)}>
                <div style={{ fontSize: 13, fontWeight: 500, color: activeReport === r.id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.65)", marginBottom: 2 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{r.description}</div>
              </button>
            ))}
          </div>
          <div style={{ padding: "14px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.16)" }}>
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
            <button onClick={handleExport} style={{ width: "100%", padding: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.09)"}
              onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.05)"}
            >
              &#8595; Export CSV
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="rpt-main" style={{ flex: 1, overflowY: "auto", padding: "24px 24px 48px" }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.3px" }}>{activeReportInfo?.name}</h1>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>{activeReportInfo?.description}</p>
          </div>
          {renderContent()}
        </div>
      </div>
    </>
  );
}
