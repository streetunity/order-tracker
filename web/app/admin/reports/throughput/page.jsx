'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function ThroughputPage() {
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
      const res = await fetch(`/api/reports/throughput?${params}`, {
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
        <h1>Throughput Analysis</h1>
        <Link href="/admin/reports" className="btn-back">
          ← Back to Reports
        </Link>
      </div>

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
          <div className="kpi-grid">
            <div className="kpi-card accent">
              <h3>Total Transitions</h3>
              <div className="kpi-value">{data.kpis.totalTransitions}</div>
            </div>
            <div className="kpi-card">
              <h3>Weeks Analyzed</h3>
              <div className="kpi-value">{data.kpis.weekCount}</div>
            </div>
          </div>

          <div className="report-section">
            <h2>Stage Throughput Summary</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Total Items</th>
                    <th>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 'bold' }}>{row.stage.replace(/_/g, ' ')}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{row.count}</td>
                      <td>{row.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.series && data.series.length > 0 && (
            <div className="report-section">
              <h2>Weekly Throughput Trends</h2>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Week</th>
                      {Object.keys(data.series[0]).filter(k => k !== 'week').map(stage => (
                        <th key={stage}>{stage.replace(/_/g, ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.series.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold' }}>{row.week}</td>
                        {Object.keys(row).filter(k => k !== 'week').map(stage => (
                          <td key={stage}>{row[stage] || 0}</td>
                        ))}
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
