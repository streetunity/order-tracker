'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function CycleTimesPage() {
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
      const res = await fetch(`/api/reports/cycle-times?${params}`, {
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

  return (
    <main className="reports-container">
      <div className="reports-header">
        <h1>Cycle Times</h1>
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
            <div className="kpi-card">
              <h3>Completed Orders</h3>
              <div className="kpi-value">{data.kpis.completedOrders}</div>
            </div>
            <div className="kpi-card accent">
              <h3>Median Cycle Time</h3>
              <div className="kpi-value">{data.kpis.medianCycleTimeDays}d</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.medianFormatted}
              </div>
            </div>
            <div className="kpi-card">
              <h3>P90 Cycle Time</h3>
              <div className="kpi-value">{data.kpis.p90CycleTimeDays}d</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.p90Formatted}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="report-section">
            <h2>Completed Orders</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Customer</th>
                    <th>Created By</th>
                    <th>Completed</th>
                    <th>Cycle Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.data.map((row, i) => (
                    <tr key={i}>
                      <td>{row.poNumber || 'N/A'}</td>
                      <td>{row.accountName}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{row.createdBy}</td>
                      <td style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                        {new Date(row.completedAt).toLocaleDateString()}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{row.cycleTimeFormatted}</td>
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
