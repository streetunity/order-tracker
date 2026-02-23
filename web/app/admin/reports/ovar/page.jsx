'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import '../reports.css';

export default function OVARPage() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const res = await fetch('/api/reports/ovar', {
        headers: getAuthHeaders(),
        cache: 'no-store'
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

  // Format currency for computed values
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (!user || !isAdmin) return null;

  // Combine critical + warning into "aging" for display
  const agingTotal = (data?.kpis?.criticalTotal || 0) + (data?.kpis?.warningTotal || 0);
  const agingCount = (data?.kpis?.criticalCount || 0) + (data?.kpis?.warningCount || 0);
  const agingRows = [
    ...(data?.rows?.critical || []).map(r => ({ ...r, severity: 'critical' })),
    ...(data?.rows?.warning || []).map(r => ({ ...r, severity: 'warning' }))
  ].sort((a, b) => b.value - a.value);

  return (
    <>
      <TopNav />
      <main className="reports-container">
        <div className="reports-header">
          <h1>Order Value at Risk</h1>
          <Link href="/admin/reports" className="btn-back">
            ← Back to Reports
          </Link>
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
                  {data.kpis.lateCount} order{data.kpis.lateCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="kpi-card" style={{ borderColor: '#f59e0b' }}>
                <h3>Critical Aging</h3>
                <div className="kpi-value" style={{ color: '#f59e0b' }}>
                  {data.kpis.criticalTotalFormatted}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                  {data.kpis.criticalCount} order{data.kpis.criticalCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="kpi-card" style={{ borderColor: '#eab308' }}>
                <h3>Warning Aging</h3>
                <div className="kpi-value" style={{ color: '#eab308' }}>
                  {data.kpis.warningTotalFormatted}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '5px' }}>
                  {data.kpis.warningCount} order{data.kpis.warningCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Late Orders - Past ETA */}
            <div className="report-section">
              <h2 style={{ color: '#dc2626' }}>Late Orders (Past ETA)</h2>
              {data.rows.late?.length > 0 ? (
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Value</th>
                        <th>ETA Date</th>
                        <th>Days Late</th>
                        <th>Stage</th>
                        <th>Days in Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.late.map((row, i) => (
                        <tr key={i}>
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
                          <td style={{ fontSize: '12px' }}>
                            {row.currentStage.replace(/_/g, ' ')}
                          </td>
                          <td>{row.timeInStageDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-dim)', padding: '10px 0' }}>No late orders — all within ETA.</p>
              )}
            </div>

            {/* Aging Orders - Critical + Warning */}
            <div className="report-section">
              <h2 style={{ color: '#f59e0b' }}>Aging Orders</h2>
              {agingRows.length > 0 ? (
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Value</th>
                        <th>Stage</th>
                        <th>Days in Stage</th>
                        <th>Severity</th>
                        <th>Last Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingRows.map((row, i) => (
                        <tr key={i}>
                          <td>{row.accountName}</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                            {row.valueFormatted}
                          </td>
                          <td>{row.currentStage.replace(/_/g, ' ')}</td>
                          <td style={{
                            fontWeight: 'bold',
                            color: row.severity === 'critical' ? '#dc2626' : '#f59e0b'
                          }}>
                            {row.timeInStageDays}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              backgroundColor: row.severity === 'critical' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: row.severity === 'critical' ? '#dc2626' : '#eab308'
                            }}>
                              {row.severity}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                            {row.lastUpdate ? new Date(row.lastUpdate).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-dim)', padding: '10px 0' }}>No aging orders detected.</p>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
