'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import '../reports.css';

export default function OVARPage() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agingThreshold, setAgingThreshold] = useState('7');

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
        agingThreshold: String(parseInt(agingThreshold) * 86400)
      });
      const res = await fetch(`/api/reports/ovar?${params}`, {
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
        <h1>Order Value at Risk</h1>
        <Link href="/admin/reports" className="btn-back">
          ← Back to Reports
        </Link>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Aging Threshold (days)</label>
          <input
            type="number"
            className="filter-input"
            value={agingThreshold}
            onChange={(e) => setAgingThreshold(e.target.value)}
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
            <div className="kpi-card accent">
              <h3>Total at Risk</h3>
              <div className="kpi-value">{data.kpis.totalAtRiskFormatted}</div>
            </div>
            <div className="kpi-card" style={{ borderColor: '#dc2626' }}>
              <h3>Late Orders</h3>
              <div className="kpi-value" style={{ color: '#dc2626' }}>
                {data.kpis.lateTotalFormatted}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.lateCount} orders
              </div>
            </div>
            <div className="kpi-card" style={{ borderColor: '#f59e0b' }}>
              <h3>Aging Orders</h3>
              <div className="kpi-value" style={{ color: '#f59e0b' }}>
                {data.kpis.agingTotalFormatted}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                {data.kpis.agingCount} orders
              </div>
            </div>
          </div>

          <div className="report-section">
            <h2>Late Orders (Past ETA)</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Customer</th>
                    <th>Value</th>
                    <th>ETA Date</th>
                    <th>Days Late</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.late?.map((row, i) => (
                    <tr key={i}>
                      <td>{row.poNumber || 'N/A'}</td>
                      <td>{row.accountName}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                        {row.valueFormatted}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {new Date(row.etaDate).toLocaleDateString()}
                      </td>
                      <td style={{ fontWeight: 'bold', color: '#dc2626' }}>
                        {row.daysLate}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                        {row.currentStage.replace(/_/g, ' ')}
                      </td>
                    </tr>
                  )) || []}
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <h2>Aging Orders ({agingThreshold}+ days in stage)</h2>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Customer</th>
                    <th>Value</th>
                    <th>Stage</th>
                    <th>Days in Stage</th>
                    <th>Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.aging?.map((row, i) => (
                    <tr key={i}>
                      <td>{row.poNumber || 'N/A'}</td>
                      <td>{row.accountName}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                        {row.valueFormatted}
                      </td>
                      <td>{row.currentStage.replace(/_/g, ' ')}</td>
                      <td style={{ fontWeight: 'bold', color: '#f59e0b' }}>
                        {row.timeInStageDays}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                        {new Date(row.lastUpdate).toLocaleDateString()}
                      </td>
                    </tr>
                  )) || []}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
