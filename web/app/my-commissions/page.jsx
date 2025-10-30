"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import Link from "next/link";
import "./page.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function MyCommissionsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [filter, setFilter] = useState('all');
  const [year, setYear] = useState(new Date().getFullYear());

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
      const summaryRes = await fetch(`${API_BASE}/commissions/my/summary`, {
        headers: getAuthHeaders(),
      });
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }

      // Load commission history
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      params.set('year', year);
      
      const commissionsRes = await fetch(`${API_BASE}/commissions/my?${params}`, {
        headers: getAuthHeaders(),
      });
      if (commissionsRes.ok) {
        setCommissions(await commissionsRes.json());
      }

      // Load monthly breakdown
      const monthlyRes = await fetch(`${API_BASE}/commissions/my/monthly?year=${year}`, {
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

  // Get status badge class
  const getStatusClass = (status) => {
    switch(status) {
      case 'AWAITING_PRICES': return 'awaiting';
      case 'CALCULATED': return 'calculated';
      case 'PARTIAL_PAID': return 'partial';
      case 'FULLY_PAID': return 'paid';
      case 'FLAGGED': return 'flagged';
      default: return '';
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Order #', 'Customer', 'Order Date', 'Order Value', 'Rate', 'Commission', 'Status'];
    const rows = commissions.map(c => [
      c.order?.poNumber || '',
      c.order?.account?.name || '',
      formatDate(c.order?.orderDate),
      c.orderTotalAmount,
      c.commissionRate + '%',
      c.totalCommissionAmount,
      c.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-commissions-${year}.csv`;
    a.click();
  };

  if (!user) return null;

  return (
    <div className="my-commissions-container">
      <TopNav />
      <NotificationBar />

      <div className="page-content">
        <div className="page-header">
          <h1>My Commissions</h1>
          <button className="export-btn" onClick={exportToCSV}>
            Export to CSV
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Loading commission data...</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="summary-cards">
              <div className="summary-card">
                <div className="card-label">YTD Earnings</div>
                <div className="card-value">{formatCurrency(summary?.ytdTotal || 0)}</div>
                {summary?.ytdChange && (
                  <div className={`card-change ${summary.ytdChange > 0 ? 'positive' : 'negative'}`}>
                    {summary.ytdChange > 0 ? '+' : ''}{summary.ytdChange}%
                  </div>
                )}
              </div>

              <div className="summary-card">
                <div className="card-label">Pending Approval</div>
                <div className="card-value">{formatCurrency(summary?.ytdPending || 0)}</div>
                <div className="card-sublabel">{summary?.pendingCount || 0} orders</div>
              </div>

              <div className="summary-card">
                <div className="card-label">Approved</div>
                <div className="card-value">{formatCurrency(summary?.ytdApproved || 0)}</div>
                <div className="card-sublabel">Ready for payment</div>
              </div>

              <div className="summary-card">
                <div className="card-label">This Month</div>
                <div className="card-value">{formatCurrency(summary?.monthlyTotal || 0)}</div>
                {summary?.monthlyChange && (
                  <div className={`card-change ${summary.monthlyChange > 0 ? 'positive' : 'negative'}`}>
                    {summary.monthlyChange > 0 ? '+' : ''}{summary.monthlyChange}% vs last month
                  </div>
                )}
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
                      <th>Order Date</th>
                      <th>Stage</th>
                      <th>Order Value</th>
                      <th>Rate</th>
                      <th>Commission</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="empty-row">No commissions found</td>
                      </tr>
                    ) : (
                      commissions.map((commission) => (
                        <tr key={commission.id}>
                          <td>
                            <Link href={`/admin/orders/${commission.orderId}`} className="order-link">
                              #{commission.order?.poNumber || '-'}
                            </Link>
                          </td>
                          <td>{commission.order?.account?.name || '-'}</td>
                          <td>{formatDate(commission.order?.orderDate)}</td>
                          <td>{commission.order?.currentStage || '-'}</td>
                          <td>{formatCurrency(commission.orderTotalAmount)}</td>
                          <td>{commission.commissionRate}%</td>
                          <td className="commission-amount">{formatCurrency(commission.totalCommissionAmount)}</td>
                          <td>
                            <span className={`status-badge ${getStatusClass(commission.status)}`}>
                              {commission.status.replace(/_/g, ' ')}
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
    </div>
  );
}
