'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
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
    if (user) {
      loadData();
    }
  }, [user]);

  // Tooltip helper component
  const ThWithTooltip = ({ children, tooltip }) => (
    <th
      title={tooltip}
      style={{ cursor: 'help', borderBottom: '1px dashed var(--text-dim)' }}
    >
      {children}
    </th>
  );

  if (!user) return null;

  return (
    <>
      <TopNav />
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
                      <ThWithTooltip tooltip="The manufacturing/order stage (e.g. Manufacturing, Testing, Shipping). Each item progresses through these stages sequentially.">
                        Stage
                      </ThWithTooltip>
                      <ThWithTooltip tooltip="Number of items that have entered and exited this stage within the lookback period. Only items with recorded stage transitions are counted.">
                        Items
                      </ThWithTooltip>
                      <ThWithTooltip tooltip="Median duration — the middle value when all item durations are sorted. 50% of items completed this stage faster, 50% slower. More reliable than averages because it isn't skewed by outliers.">
                        Median
                      </ThWithTooltip>
                      <ThWithTooltip tooltip="90th percentile — 90% of items completed this stage within this time. Useful for identifying realistic worst-case timelines and setting customer expectations.">
                        P90
                      </ThWithTooltip>
                      <ThWithTooltip tooltip="The longest time any single item spent in this stage during the lookback period. Values over 30 days are highlighted in red as potential issues.">
                        Max
                      </ThWithTooltip>
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
                        <ThWithTooltip tooltip="The product code / SKU identifying this item.">
                          Product
                        </ThWithTooltip>
                        <ThWithTooltip tooltip="The customer's purchase order number for this order.">
                          PO Number
                        </ThWithTooltip>
                        <ThWithTooltip tooltip="The customer / account name associated with this order.">
                          Customer
                        </ThWithTooltip>
                        <ThWithTooltip tooltip="The stage where this item spent the most time. This is the bottleneck stage for this particular item.">
                          Stage
                        </ThWithTooltip>
                        <ThWithTooltip tooltip="Total time this item spent in the indicated stage, calculated from the stage entry event to the stage exit event in the status history.">
                          Duration
                        </ThWithTooltip>
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
    </>
  );
}
