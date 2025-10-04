'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function SalesByMonthPage() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
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
    if (!isAdmin) {
      router.push('/admin/reports');
      return;
    }
  }, [user, isAdmin, router]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo
      });
      const res = await fetch(`/api/reports/sales-by-month?${params}`, {
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
    if (user && isAdmin) {
      loadData();
    }
  }, [user, isAdmin]);

  if (!user || !isAdmin) return null;

  return (
    <main className="reports-container">
      <div className="reports-header">
        <h1>Sales by Month</h1>
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
              <h3>Grand Total</h3>
              <div className="kpi-value">{data.kpis.grandTotalFormatted}</div>
            </div>
            <div className="kpi-card">
              <h3>Months</h3>
              <div className="kpi-value">{data.kpis.monthCount}</div>
            </div>
          </div>

          <div className="report-section">
            <h2>Monthly Sales Trends</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total Sales</th>
                    <th>MoM Change</th>
                    <th>% Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row, i) => (
                    <tr key={i}>
                      <td>{row.month}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                        {row.totalFormatted}
                      </td>
                      <td style={{ color: row.mom?.direction === 'up' ? '#16a34a' : row.mom?.direction === 'down' ? '#dc2626' : 'var(--text)' }}>
                        {row.mom?.changeFormatted || 'N/A'}
                      </td>
                      <td style={{ color: row.mom?.direction === 'up' ? '#16a34a' : row.mom?.direction === 'down' ? '#dc2626' : 'var(--text)' }}>
                        {row.mom?.changePercent ? `${row.mom.changePercent}%` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
