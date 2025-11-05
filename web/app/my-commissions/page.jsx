"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./page.css";

export default function MyCommissionsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [stageSettings, setStageSettings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [year, setYear] = useState(new Date().getFullYear());

  // PDF Modal state
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfPeriod, setPdfPeriod] = useState('ytd');
  const [pdfMonth, setPdfMonth] = useState(new Date().getMonth() + 1);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Load commission data
  useEffect(() => {
    if (user) {
      loadCommissionData();
    }
  }, [user, year, filter]);

  async function loadCommissionData() {
    try {
      setLoading(true);

      // Load summary
      const summaryRes = await fetch(`/api/commissions/my/summary`, {
        headers: getAuthHeaders(),
      });
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }

      // Load stage settings for commission percentage calculation
      const stageRes = await fetch('/api/commission-settings/stages', {
        headers: getAuthHeaders(),
      });
      if (stageRes.ok) {
        const stages = await stageRes.json();
        setStageSettings(stages);
      }

      // Load commission history
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      params.set('year', year);

      const commissionsRes = await fetch(`/api/commissions/my?${params}`, {
        headers: getAuthHeaders(),
      });
      if (commissionsRes.ok) {
        const commissionsData = await commissionsRes.json();

        // Flatten commissions into individual payout rows for the history table
        const payoutRows = [];
        commissionsData.forEach(commission => {
          commission.itemCommissions?.forEach(itemComm => {
            itemComm.payouts?.forEach(payout => {
              payoutRows.push({
                ...payout,
                orderId: commission.orderId,
                orderNumber: commission.order?.poNumber,
                orderDate: commission.order?.orderDate,
                customerName: commission.order?.account?.name,
                commissionRate: commission.commissionRate,
                productCode: itemComm.productCode || itemComm.item?.productCode
              });
            });
          });
        });

        // Sort by created date descending
        payoutRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        setCommissions(payoutRows);
      }

      // Load monthly breakdown
      const monthlyRes = await fetch(`/api/commissions/my/monthly?year=${year}`, {
        headers: getAuthHeaders(),
      });
      if (monthlyRes.ok) {
        setMonthlyData(await monthlyRes.json());
      }
    } catch (e) {
      console.error("Failed to load commission data:", e);
    } finally {
      setLoading(false);
    }
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Helper to convert number to ordinal (1st, 2nd, 3rd, etc.)
  const toOrdinal = (num) => {
    const suffixes = ["th", "st", "nd", "rd"];
    const v = num % 100;
    return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  // Get stage number from stage name
  const getStageNumber = (stageName) => {
    if (!stageName || stageSettings.length === 0) return '-';
    const stageIndex = stageSettings.findIndex(s => s.stage === stageName);
    return stageIndex >= 0 ? toOrdinal(stageIndex + 1) : stageName;
  };

  // Calculate applied commission percentage per stage
  const getAppliedCommissionPercent = (commissionRate) => {
    if (stageSettings.length === 0) return commissionRate.toFixed(2);
    return (commissionRate / stageSettings.length).toFixed(2);
  };

  // Get status badge class
  const getStatusClass = (status) => {
    switch(status) {
      case 'WAITING': return 'awaiting';
      case 'PENDING': return 'calculated';
      case 'APPROVED': return 'partial';
      case 'PAID': return 'paid';
      case 'FLAGGED': return 'flagged';
      default: return '';
    }
  };

  // Generate PDF Report
  const generatePdfReport = async () => {
    try {
      // Determine date range
      let startDate, endDate, periodLabel;
      if (pdfPeriod === 'ytd') {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        periodLabel = `Year-to-Date ${year}`;
      } else {
        // Specific month
        const monthStr = String(pdfMonth).padStart(2, '0');
        startDate = `${year}-${monthStr}-01`;
        const lastDay = new Date(year, pdfMonth, 0).getDate();
        endDate = `${year}-${monthStr}-${lastDay}`;
        const monthName = new Date(year, pdfMonth - 1).toLocaleString('default', { month: 'long' });
        periodLabel = `${monthName} ${year}`;
      }

      // Fetch stage settings for commission percentage calculation
      const stageRes = await fetch('/api/commission-settings/stages', {
        headers: getAuthHeaders(),
      });
      const stageSettings = stageRes.ok ? await stageRes.json() : [];

      // Fetch paid commissions for the period
      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const res = await fetch(`/api/commissions/my/paid?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        alert("Failed to fetch commission data");
        return;
      }

      const payouts = await res.json();

      if (payouts.length === 0) {
        alert("No paid commissions found for selected period");
        return;
      }

      // Load logo
      const logoImg = new Image();
      logoImg.src = "/smt-logo.png";

      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });

      // Generate PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Add logo in top right corner
      const logoWidth = 30;
      const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
      doc.addImage(logoImg, "PNG", pageWidth - logoWidth - 14, 10, logoWidth, logoHeight);

      // Header
      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.text("Commission Statement", 14, 20);

      // Agent and period info
      doc.setFontSize(12);
      doc.setFont(undefined, "normal");
      doc.text(`Sales Agent: ${user.name}`, 14, 35);
      doc.text(`Period: ${periodLabel}`, 14, 42);
      doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, 49);

      // Calculate total
      const totalPaid = payouts.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      // Table data
      const tableData = payouts.map((payout) => {
        const commissionRate = payout.itemCommission?.commission?.commissionRate || 0;
        const appliedCommissionPercent = stageSettings.length > 0
          ? (commissionRate / stageSettings.length).toFixed(2)
          : commissionRate.toFixed(2);

        return [
          payout.itemCommission?.commission?.order?.account?.name || "N/A",
          payout.itemCommission?.productCode || "N/A",
          `$${parseFloat(payout.amount || 0).toFixed(2)}`,
          `${appliedCommissionPercent}%`,
          payout.approvedAt ? new Date(payout.approvedAt).toLocaleDateString() : "-",
          payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : "-",
        ];
      });

      // Add table
      autoTable(doc, {
        startY: 55,
        head: [["Customer", "Item", "Amount", "Commission %", "Approved Date", "Paid Date"]],
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [60, 60, 60], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "center" },
        },
      });

      // Get final Y position after table
      const finalY = doc.lastAutoTable.finalY;

      // Add total
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, pageWidth - 14, finalY + 10, { align: "right" });

      // Save PDF
      const fileName = `Commission_Statement_${user.name.replace(/\s+/g, "_")}_${periodLabel.replace(/\s+/g, "_")}.pdf`;
      doc.save(fileName);

      setShowPdfModal(false);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF report");
    }
  };

  if (!user) return null;

  return (
    <div className="my-commissions-container">
      <TopNav />
      <NotificationBar />

      <div className="page-content">
        <div className="page-header">
          <h1>My Commissions</h1>
          <button className="export-btn" onClick={() => setShowPdfModal(true)}>
            📄 Generate Report
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Loading commission data...</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="summary-cards">
              <div className="summary-card">
                <div className="card-label">Total Paid (YTD)</div>
                <div className="card-value">{formatCurrency(summary?.totalPaid || 0)}</div>
                <div className="card-sublabel">Commissions received</div>
              </div>

              <div className="summary-card">
                <div className="card-label">Pending Approval</div>
                <div className="card-value">{formatCurrency(summary?.totalPending || 0)}</div>
                <div className="card-sublabel">Awaiting approval</div>
              </div>

              <div className="summary-card">
                <div className="card-label">Approved</div>
                <div className="card-value">{formatCurrency(summary?.totalApproved || 0)}</div>
                <div className="card-sublabel">Ready for payment</div>
              </div>

              <div className="summary-card">
                <div className="card-label">Projected</div>
                <div className="card-value">{formatCurrency(summary?.totalProjected || 0)}</div>
                <div className="card-sublabel">Future earnings</div>
              </div>
            </div>

            {/* Projected Earnings Section */}
            {summary?.projected && summary.projected.length > 0 && (
              <div className="section">
                <h2>⭐ Projected Earnings</h2>
                <div className="projected-list">
                  {summary.projected.map((item, index) => (
                    <div key={index} className="projected-item">
                      <div className="projected-info">
                        <div className="projected-order">Order #{item.orderNumber} - {item.customerName}</div>
                        <div className="projected-amount">{formatCurrency(item.amount)}</div>
                      </div>
                      <div className="projected-stage">Expected when order reaches {item.nextStage}</div>
                      {item.orderId && (
                        <Link href={`/admin/orders/${item.orderId}`} className="view-order-link">
                          View Order →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flagged Commissions */}
            {summary?.flagged && summary.flagged.length > 0 && (
              <div className="section">
                <h2>⚠️ Incomplete Commissions ({summary.flagged.length})</h2>
                <div className="flagged-list">
                  {summary.flagged.map((item, index) => (
                    <div key={index} className="flagged-item">
                      <div className="flagged-info">
                        <div className="flagged-order">Order #{item.orderNumber} - {item.customerName}</div>
                        <div className="flagged-reason">{item.reason}</div>
                      </div>
                      {item.orderId && (
                        <Link href={`/admin/orders/${item.orderId}`} className="action-link">
                          {item.reason.includes('price') ? 'Add Prices' : 'Review'} →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Chart */}
            <div className="section">
              <div className="section-header">
                <h2>📊 Monthly Commissions ({year})</h2>
                <select 
                  value={year} 
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="year-select"
                >
                  {[2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="chart-container">
                <div className="chart-bars">
                  {monthlyData.map((month, index) => {
                    const maxValue = Math.max(...monthlyData.map(m => m.total || 0));
                    const height = maxValue > 0 ? (month.total / maxValue) * 100 : 0;
                    return (
                      <div key={index} className="chart-bar-wrapper">
                        <div 
                          className="chart-bar" 
                          style={{ height: `${height}%` }}
                          title={`${month.name}: ${formatCurrency(month.total)}`}
                        >
                          <span className="bar-value">{formatCurrency(month.total)}</span>
                        </div>
                        <div className="bar-label">{month.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Commission History */}
            <div className="section">
              <div className="section-header">
                <h2>💰 Commission History</h2>
                <select 
                  value={filter} 
                  onChange={(e) => setFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>

              <div className="table-container">
                <table className="commissions-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th>Item</th>
                      <th>Order Date</th>
                      <th>Stage</th>
                      <th>Applied %</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="empty-row">No commission payouts found</td>
                      </tr>
                    ) : (
                      commissions.map((payout) => (
                        <tr key={payout.id}>
                          <td>
                            <Link href={`/admin/orders/${payout.orderId}`} className="order-link">
                              #{payout.orderNumber || '-'}
                            </Link>
                          </td>
                          <td>{payout.customerName || '-'}</td>
                          <td>{payout.productCode || '-'}</td>
                          <td>{formatDate(payout.orderDate)}</td>
                          <td>{getStageNumber(payout.stage)}</td>
                          <td>{getAppliedCommissionPercent(payout.commissionRate)}%</td>
                          <td className="commission-amount">{formatCurrency(payout.amount)}</td>
                          <td>
                            <span className={`status-badge ${getStatusClass(payout.status)}`}>
                              {payout.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Generate PDF Report Modal */}
      {showPdfModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowPdfModal(false)}
        >
          <div
            style={{
              background: "#1a1a1a",
              padding: "30px",
              borderRadius: "12px",
              maxWidth: "500px",
              width: "90%",
              border: "1px solid #333",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "24px", color: "#dc2626", fontSize: "20px" }}>
              Generate Commission Statement
            </h2>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>
                Report Period
              </label>
              <select
                value={pdfPeriod}
                onChange={(e) => setPdfPeriod(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "4px",
                  color: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="ytd">Year to Date ({year})</option>
                <option value="month">Specific Month</option>
              </select>
            </div>

            {pdfPeriod === 'month' && (
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>
                  Select Month
                </label>
                <select
                  value={pdfMonth}
                  onChange={(e) => setPdfMonth(parseInt(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#2a2a2a",
                    border: "1px solid #444",
                    borderRadius: "4px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    const monthName = new Date(year, i).toLocaleString('default', { month: 'long' });
                    return (
                      <option key={month} value={month}>
                        {monthName}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowPdfModal(false);
                  setPdfPeriod('ytd');
                }}
                style={{
                  background: "#2a2a2a",
                  color: "#999",
                  border: "1px solid #444",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={generatePdfReport}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
