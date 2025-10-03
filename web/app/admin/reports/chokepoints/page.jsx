'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

const STAGES = [
  'MANUFACTURING', 'TESTING', 'SHIPPING', 'AT_SEA', 
  'SMT', 'QC', 'DELIVERED', 'ONSITE', 'COMPLETED', 'FOLLOW_UP'
];

export default function ChokepointsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetStage, setTargetStage] = useState('MANUFACTURING');
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
        targetStage,
        page: page.toString(),
        pageSize: '20'
      });
      const res = await fetch(`/api/reports/chokepoints?${params}`, {
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
        <h1>Chokepoints Analysis</h1>
        <Link href="/admin/reports" className="btn-back">
          ← Back to Reports
        </Link>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Target Stage</label>
          <select
            className="filter-input"
            value={targetStage}
            onChange={(e) => setTargetStage(e.target.value)}
          >
            {STAGES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
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
              <h3>Items in {targetStage.replace(/_/g, ' ')}</h3>
              <div className="kpi-value">{data.kpis.itemsInStage}</div>
            </div>
            <div className="kpi-card">
              <h3>Median Time</h3>
              <div className="kpi-value">{data.kpis.medianTimeDays}d</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.medianFormatted}
              </div>
            </div>
            <div className="kpi-card accent">
              <h3>Longest Time</h3>
              <div className="kpi-value">{(data.kpis.maxTimeSec / 86400).toFixed(0)}d</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.maxFormatted}
              </div>
            </div>
            <div className="kpi-card">
              <h3>P90 Time</h3>
              <div className="kpi-value">{data.kpis.p90TimeDays}d</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.p90Formatted}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="report-section">
            <h2>Items Stuck Longest</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>PO Number</th>
                    <th>Customer</th>
                    <th>Entered Stage</th>
                    <th>Days in Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.data.map((row, i) => (
                    <tr key={i}>
                      <td>{row.productCode}</td>
                      <td>{row.poNumber || 'N/A'}</td>
                      <td>{row.accountName}</td>
                      <td style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                        {new Date(row.enteredAt).toLocaleDateString()}
                      </td>
                      <td style={{ 
                        fontWeight: 'bold', 
                        color: parseFloat(row.timeInStageDays) > 14 ? '#dc2626' : 'var(--text)'
                      }}>
                        {row.timeInStageDays} days
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
