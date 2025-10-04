'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function StageDurationsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookbackDays, setLookbackDays] = useState('90');

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
        lookbackDays: lookbackDays
      });
      const res = await fetch(`/api/reports/stage-durations/leaderboard?${params}`, {
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
        <h1>Stage Durations</h1>
        <Link href="/admin/reports" className="btn-back">
          ← Back to Reports
        </Link>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Lookback Period (days)</label>
          <input
            type="number"
            className="filter-input"
            value={lookbackDays}
            onChange={(e) => setLookbackDays(e.target.value)}
            min="1"
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
          <div className="kpi-grid">
            <div className="kpi-card">
              <h3>Items Analyzed</h3>
              <div className="kpi-value">{data.kpis.itemsAnalyzed}</div>
            </div>
            <div className="kpi-card accent">
              <h3>Stages Tracked</h3>
              <div className="kpi-value">{data.kpis.stagesTracked}</div>
            </div>
          </div>

          <div className="report-section">
            <h2>Duration Statistics by Stage</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Items</th>
                    <th>Median</th>
                    <th>P90</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 'bold' }}>{row.stage.replace(/_/g, ' ')}</td>
                      <td>{row.count}</td>
                      <td>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                          {row.medianDays}d
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          {row.medianFormatted}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 'bold' }}>
                          {row.p90Days}d
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          {row.p90Formatted}
                        </div>
                      </td>
                      <td style={{ color: parseFloat(row.maxFormatted.split('d')[0]) > 30 ? '#dc2626' : 'var(--text)' }}>
                        {row.maxFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.rows.slowest && data.rows.slowest.length > 0 && (
            <div className="report-section">
              <h2>Slowest Items (Top 10)</h2>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>PO Number</th>
                      <th>Customer</th>
                      <th>Stage</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slowest.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        <td>{row.productCode}</td>
                        <td>{row.poNumber || 'N/A'}</td>
                        <td>{row.accountName}</td>
                        <td style={{ fontSize: '12px' }}>{row.stage.replace(/_/g, ' ')}</td>
                        <td style={{ fontWeight: 'bold', color: '#dc2626' }}>
                          {row.durationFormatted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
