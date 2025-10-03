'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function FirstPassYieldPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('2025-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

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
        date_to: dateTo
      });
      const res = await fetch(`/api/reports/first-pass-yield?${params}`, {
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
  }, [user]);

  if (!user) return null;

  return (
    <main className="reports-container">
      <div className="reports-header">
        <h1>First-Pass Yield</h1>
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
        <button className="btn-filter" onClick={loadData}>
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
              <h3>First-Pass Yield Rate</h3>
              <div className="kpi-value">{data.kpis.yieldRateFormatted}</div>
            </div>
            <div className="kpi-card" style={{ borderColor: '#16a34a' }}>
              <h3>Clean Items</h3>
              <div className="kpi-value" style={{ color: '#16a34a' }}>
                {data.kpis.cleanCount}
              </div>
            </div>
            <div className="kpi-card" style={{ borderColor: '#dc2626' }}>
              <h3>Rework Items</h3>
              <div className="kpi-value" style={{ color: '#dc2626' }}>
                {data.kpis.reworkCount}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="report-section">
            <h2>Items Requiring Rework</h2>
            {data.rows.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', padding: '20px' }}>
                No rework items found in this date range. Excellent work!
              </p>
            ) : (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>PO Number</th>
                      <th>Customer</th>
                      <th>Regressions</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.productCode}</td>
                        <td>{row.poNumber || 'N/A'}</td>
                        <td>{row.accountName}</td>
                        <td style={{ fontWeight: 'bold', color: '#dc2626' }}>
                          {row.regressionCount}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          {row.regressions.map((r, j) => (
                            <div key={j}>
                              {r.from} → {r.to}
                              {r.note && ` (${r.note})`}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
