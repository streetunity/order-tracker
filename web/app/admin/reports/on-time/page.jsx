'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function OnTimePage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('2025-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
  }, [user, router]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        page: page.toString(),
        pageSize: '20'
      });
      const res = await fetch(`/api/reports/on-time?${params}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const result = await res.json();
      setData(result);
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, page]);

  if (!user) return null;

  const getStatusColor = (status) => {
    switch(status) {
      case 'early': return '#16a34a';
      case 'on-time': return '#16a34a';
      case 'late': return '#dc2626';
      default: return 'var(--text)';
    }
  };

  return (
    <main className="reports-container">
      <div className="reports-header">
        <h1>On-Time Delivery</h1>
        <Link href="/admin/reports" className="btn-back">
          ← Back to Reports
        </Link>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>From Date</label>
          <input
            type="date"
            className="filter-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>To Date</label>
          <input
            type="date"
            className="filter-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <button className="btn-filter" onClick={() => { setPage(1); loadData(); }}>
          Apply Filters
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="loading">Loading...</div>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card accent">
              <h3>On-Time Rate</h3>
              <div className="kpi-value">{data.kpis.onTimeRateFormatted}</div>
            </div>
            <div className="kpi-card" style={{ borderColor: '#16a34a' }}>
              <h3>On-Time Orders</h3>
              <div className="kpi-value" style={{ color: '#16a34a' }}>
                {data.kpis.onTimeCount}
              </div>
            </div>
            <div className="kpi-card" style={{ borderColor: '#dc2626' }}>
              <h3>Late Orders</h3>
              <div className="kpi-value" style={{ color: '#dc2626' }}>
                {data.kpis.lateCount}
              </div>
            </div>
          </div>

          {/* Stats */}
          {data.kpis.avgSlippageDays && (
            <div className="report-section">
              <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>
                Average slippage: {data.kpis.avgSlippageDays} days | 
                Median slippage: {data.kpis.medianSlippageDays} days
              </p>
            </div>
          )}

          {/* Data Table */}
          <div className="report-section">
            <h2>Order Details</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Customer</th>
                    <th>ETA Date</th>
                    <th>Completed Date</th>
                    <th>Status</th>
                    <th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.data.map((row, i) => (
                    <tr key={i}>
                      <td>{row.poNumber || 'N/A'}</td>
                      <td>{row.accountName}</td>
                      <td style={{ fontSize: '13px' }}>
                        {new Date(row.etaDate).toLocaleDateString()}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {new Date(row.completedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <span style={{ 
                          color: getStatusColor(row.status),
                          fontWeight: 'bold',
                          textTransform: 'capitalize'
                        }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold', color: getStatusColor(row.status) }}>
                        {row.slippageDays > 0 ? '+' : ''}{row.slippageDays}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {data.rows.pagination && data.rows.pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {data.rows.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.rows.pagination.hasMore}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
