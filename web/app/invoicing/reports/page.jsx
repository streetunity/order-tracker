"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import InvoicingNav from "@/components/InvoicingNav";
import { hasInvoicingPermission } from "@/lib/roleUtils";
import "../invoicing.css";
import "./reports.css";

const REPORT_TYPES = [
  { id: "pipeline", name: "Sales Pipeline", description: "Estimates by status with values" },
  { id: "win-loss", name: "Win/Loss Analysis", description: "Conversion rates and loss reasons" },
  { id: "time-to-close", name: "Time to Close", description: "Average sales cycle duration" },
  { id: "ar-aging", name: "AR Aging", description: "Receivables by age bucket" },
  { id: "sales-summary", name: "Sales Summary", description: "Revenue by rep and period" },
  { id: "revenue-projections", name: "Revenue Projections", description: "Weighted pipeline forecast" },
];

export default function ReportsPage() {
  const [user, setUser] = useState(null);
  const [activeReport, setActiveReport] = useState("pipeline");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      router.push("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);

      const hasAccess = hasInvoicingPermission(parsedUser.role, "VIEW_ALL_INVOICES");
      if (!hasAccess) {
        router.push("/invoicing");
        return;
      }
    } catch (e) {
      console.error("Failed to parse user:", e);
      router.push("/login");
    }
  }, [router]);

  const fetchReport = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const token = localStorage.getItem("token");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);

      const url = `/api/invoicing-reports/${activeReport}${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new Error("Failed to fetch report");
      }

      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("Report fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, activeReport, dateRange]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async () => {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams();
    if (dateRange.startDate) params.append("startDate", dateRange.startDate);
    if (dateRange.endDate) params.append("endDate", dateRange.endDate);

    const url = `/api/invoicing-reports/export/${activeReport}${params.toString() ? `?${params.toString()}` : ""}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${activeReport}-report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export report. Please try again.");
    }
  };

  if (!user) {
    return null;
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  const renderPipelineReport = () => {
    if (!reportData?.pipeline) return null;
    const { pipeline, summary } = reportData;

    return (
      <div className="report-content">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Pipeline</div>
            <div className="summary-value">{formatCurrency(summary?.totalValue)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Estimates</div>
            <div className="summary-value">{summary?.totalCount || 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Avg Deal Size</div>
            <div className="summary-value">{formatCurrency(summary?.avgValue)}</div>
          </div>
        </div>

        <div className="pipeline-chart">
          {pipeline.map((stage) => (
            <div key={stage.status} className="pipeline-stage">
              <div className="stage-header">
                <span className={`status-badge ${stage.status.toLowerCase()}`}>{stage.status}</span>
                <span className="stage-count">{stage.count} estimates</span>
              </div>
              <div className="stage-value">{formatCurrency(stage.totalValue)}</div>
              <div className="stage-bar">
                <div
                  className="stage-bar-fill"
                  style={{
                    width: `${summary?.totalValue ? (stage.totalValue / summary.totalValue) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderWinLossReport = () => {
    if (!reportData) return null;
    const { summary, wonDeals, lostDeals, lossReasons } = reportData;

    return (
      <div className="report-content">
        <div className="summary-cards">
          <div className="summary-card success">
            <div className="summary-label">Win Rate</div>
            <div className="summary-value">{formatPercent(summary?.winRate)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Deals Won</div>
            <div className="summary-value">{summary?.totalWon || 0}</div>
          </div>
          <div className="summary-card danger">
            <div className="summary-label">Deals Lost</div>
            <div className="summary-value">{summary?.totalLost || 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Won Value</div>
            <div className="summary-value">{formatCurrency(summary?.totalWonValue)}</div>
          </div>
        </div>

        {lossReasons && lossReasons.length > 0 && (
          <div className="section">
            <h3>Loss Reasons</h3>
            <div className="loss-reasons">
              {lossReasons.map((reason, idx) => (
                <div key={idx} className="reason-item">
                  <span className="reason-label">{reason.reason || "No reason given"}</span>
                  <span className="reason-count">{reason.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTimeToCloseReport = () => {
    if (!reportData) return null;
    const { overall, byMonth } = reportData;

    return (
      <div className="report-content">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Avg Time to Close</div>
            <div className="summary-value">{overall?.avgDays?.toFixed(1) || 0} days</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Fastest Close</div>
            <div className="summary-value">{overall?.minDays || 0} days</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Slowest Close</div>
            <div className="summary-value">{overall?.maxDays || 0} days</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Deals Closed</div>
            <div className="summary-value">{overall?.count || 0}</div>
          </div>
        </div>

        {byMonth && byMonth.length > 0 && (
          <div className="section">
            <h3>Monthly Trend</h3>
            <table className="invoicing-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Deals Closed</th>
                  <th>Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map((month, idx) => (
                  <tr key={idx}>
                    <td>{month.month}</td>
                    <td>{month.count}</td>
                    <td>{month.avgDays?.toFixed(1)} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderARAgingReport = () => {
    if (!reportData) return null;
    const { summary, buckets, invoices } = reportData;

    return (
      <div className="report-content">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Outstanding</div>
            <div className="summary-value">{formatCurrency(summary?.totalOutstanding)}</div>
          </div>
          <div className="summary-card success">
            <div className="summary-label">Current</div>
            <div className="summary-value">{formatCurrency(buckets?.current)}</div>
          </div>
          <div className="summary-card warning">
            <div className="summary-label">30+ Days</div>
            <div className="summary-value">{formatCurrency(buckets?.over30)}</div>
          </div>
          <div className="summary-card danger">
            <div className="summary-label">90+ Days</div>
            <div className="summary-value">{formatCurrency(buckets?.over90)}</div>
          </div>
        </div>

        <div className="aging-buckets">
          {buckets && (
            <div className="bucket-chart">
              <div className="bucket current" style={{ flex: buckets.current || 1 }}>
                <span>Current</span>
              </div>
              <div className="bucket over30" style={{ flex: buckets.over30 || 1 }}>
                <span>30+</span>
              </div>
              <div className="bucket over60" style={{ flex: buckets.over60 || 1 }}>
                <span>60+</span>
              </div>
              <div className="bucket over90" style={{ flex: buckets.over90 || 1 }}>
                <span>90+</span>
              </div>
            </div>
          )}
        </div>

        {invoices && invoices.length > 0 && (
          <div className="section">
            <h3>Outstanding Invoices</h3>
            <table className="invoicing-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 20).map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.invoiceNumber}</td>
                    <td>{inv.customerName}</td>
                    <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "-"}</td>
                    <td>
                      <span className={`age-badge ${inv.ageBucket}`}>{inv.daysOverdue}</span>
                    </td>
                    <td>{formatCurrency(inv.balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderSalesSummaryReport = () => {
    if (!reportData) return null;
    const { summary, byRep, byPeriod } = reportData;

    return (
      <div className="report-content">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Revenue</div>
            <div className="summary-value">{formatCurrency(summary?.totalRevenue)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Invoices Paid</div>
            <div className="summary-value">{summary?.paidCount || 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Avg Invoice</div>
            <div className="summary-value">{formatCurrency(summary?.avgInvoice)}</div>
          </div>
        </div>

        {byRep && byRep.length > 0 && (
          <div className="section">
            <h3>Sales by Rep</h3>
            <table className="invoicing-table">
              <thead>
                <tr>
                  <th>Sales Rep</th>
                  <th>Invoices</th>
                  <th>Revenue</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {byRep.map((rep, idx) => (
                  <tr key={idx}>
                    <td>{rep.name || "Unassigned"}</td>
                    <td>{rep.count}</td>
                    <td>{formatCurrency(rep.revenue)}</td>
                    <td>{formatPercent((rep.revenue / (summary?.totalRevenue || 1)) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {byPeriod && byPeriod.length > 0 && (
          <div className="section">
            <h3>Revenue by Period</h3>
            <table className="invoicing-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Invoices</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {byPeriod.map((period, idx) => (
                  <tr key={idx}>
                    <td>{period.period}</td>
                    <td>{period.count}</td>
                    <td>{formatCurrency(period.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderRevenueProjectionsReport = () => {
    if (!reportData) return null;
    const { summary, byStatus, byMonth } = reportData;

    return (
      <div className="report-content">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Pipeline</div>
            <div className="summary-value">{formatCurrency(summary?.totalPipeline)}</div>
          </div>
          <div className="summary-card success">
            <div className="summary-label">Weighted Projection</div>
            <div className="summary-value">{formatCurrency(summary?.weightedTotal)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Open Estimates</div>
            <div className="summary-value">{summary?.estimateCount || 0}</div>
          </div>
        </div>

        {byStatus && byStatus.length > 0 && (
          <div className="section">
            <h3>Projections by Status</h3>
            <table className="invoicing-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Total Value</th>
                  <th>Probability</th>
                  <th>Weighted Value</th>
                </tr>
              </thead>
              <tbody>
                {byStatus.map((status, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className={`status-badge ${status.status?.toLowerCase()}`}>
                        {status.status}
                      </span>
                    </td>
                    <td>{status.count}</td>
                    <td>{formatCurrency(status.totalValue)}</td>
                    <td>{formatPercent(status.probability * 100)}</td>
                    <td>{formatCurrency(status.weightedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderReportContent = () => {
    if (loading) {
      return <div className="loading-state">Loading report...</div>;
    }

    if (error) {
      return <div className="error-message">{error}</div>;
    }

    switch (activeReport) {
      case "pipeline":
        return renderPipelineReport();
      case "win-loss":
        return renderWinLossReport();
      case "time-to-close":
        return renderTimeToCloseReport();
      case "ar-aging":
        return renderARAgingReport();
      case "sales-summary":
        return renderSalesSummaryReport();
      case "revenue-projections":
        return renderRevenueProjectionsReport();
      default:
        return <div className="empty-state">Select a report to view</div>;
    }
  };

  return (
    <div className="invoicing-container">
      <InvoicingNav />

      <div className="invoicing-content">
        <div className="invoicing-header">
          <div className="header-row">
            <div>
              <h1>Invoicing Reports</h1>
              <p>Analytics and insights for your invoicing data</p>
            </div>
            <button className="btn-secondary" onClick={() => router.push("/invoicing")}>
              Back to Invoicing
            </button>
          </div>
        </div>

        <div className="reports-layout">
          <div className="reports-sidebar">
            <div className="sidebar-section">
              <h3>Reports</h3>
              <div className="report-list">
                {REPORT_TYPES.map((report) => (
                  <button
                    key={report.id}
                    className={`report-item ${activeReport === report.id ? "active" : ""}`}
                    onClick={() => setActiveReport(report.id)}
                  >
                    <div className="report-item-name">{report.name}</div>
                    <div className="report-item-desc">{report.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h3>Date Range</h3>
              <div className="date-filters">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <button className="btn-primary export-btn" onClick={handleExport}>
                Export CSV
              </button>
            </div>
          </div>

          <div className="reports-main">
            <div className="report-header">
              <h2>{REPORT_TYPES.find((r) => r.id === activeReport)?.name}</h2>
            </div>
            {renderReportContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
