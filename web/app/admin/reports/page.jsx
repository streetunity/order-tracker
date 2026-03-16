'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import './reports.css';

export default function ReportsPage() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    async function loadSummary() {
      try {
        const res = await fetch('/api/reports/summary', { headers: getAuthHeaders() });
        if (res.ok) setSummary(await res.json());
      } catch (e) { console.error('Failed to load summary:', e); }
      finally { setLoading(false); }
    }
    loadSummary();
  }, [user, router, getAuthHeaders]);

  if (!user) return null;

  return (
    <>
      <TopNav />
      <main className="reports-container">
        <div className="reports-header">
          <h1>Reports &amp; Analytics</h1>
          {/* Outlined style overrides the CSS class */}
          <Link
            href="/admin/settings"
            className="settings-button"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7, color: "#dc2626", textDecoration: "none", fontWeight: 600, fontSize: 13 }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            Report Settings
          </Link>
        </div>

        {loading && <div className="loading">Loading reports...</div>}

        {!loading && summary && (
          <>
            <div className="kpi-grid">
              <div className="kpi-card">
                <h3>Active Orders</h3>
                <div className="kpi-value">{summary.kpis.activeOrders}</div>
              </div>
              <div className="kpi-card">
                <h3>Completed Orders</h3>
                <div className="kpi-value">{summary.kpis.completedOrders}</div>
              </div>
              {isAdmin && summary.kpis.totalRevenue !== 'N/A' && (
                <div className="kpi-card accent">
                  <h3>Total Revenue</h3>
                  <div className="kpi-value">{summary.kpis.totalRevenue}</div>
                </div>
              )}
            </div>
            <div className="report-section">
              <h2>Items by Stage</h2>
              <div className="stage-grid">
                {summary.kpis.ordersByStage.map(item => (
                  <div key={item.stage} className="stage-card">
                    <div className="stage-name">{item.stage.replace(/_/g, ' ')}</div>
                    <div className="stage-count">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="report-categories">
          {isAdmin && (
            <div className="category-section">
              <h2>Sales &amp; Revenue Reports (Admin Only)</h2>
              <div className="report-links">
                <Link href="/admin/reports/sales-by-rep" className="report-link">
                  <div className="report-icon">&#128101;</div>
                  <div><h3>Sales by Rep</h3><p>Revenue breakdown by sales representative</p></div>
                </Link>
                <Link href="/admin/reports/sales-by-month" className="report-link">
                  <div className="report-icon">&#128197;</div>
                  <div><h3>Sales by Month</h3><p>Monthly sales trends with MoM changes</p></div>
                </Link>
                <Link href="/admin/reports/sales-by-item" className="report-link">
                  <div className="report-icon">&#128230;</div>
                  <div><h3>Sales by Product</h3><p>Top products ranked by revenue</p></div>
                </Link>
                <Link href="/admin/reports/ovar" className="report-link">
                  <div className="report-icon">&#9888;&#65039;</div>
                  <div><h3>Order Value at Risk</h3><p>Money tied up in late or aging orders</p></div>
                </Link>
              </div>
            </div>
          )}
          <div className="category-section">
            <h2>Operational Reports</h2>
            <div className="report-links">
              <Link href="/admin/reports/cycle-times" className="report-link">
                <div className="report-icon">&#9201;&#65039;</div>
                <div><h3>Cycle Times</h3><p>Order completion time metrics</p></div>
              </Link>
              <Link href="/admin/reports/throughput" className="report-link">
                <div className="report-icon">&#128202;</div>
                <div><h3>Throughput</h3><p>Items entering each stage per week</p></div>
              </Link>
              <Link href="/admin/reports/stage-durations" className="report-link">
                <div className="report-icon">&#128200;</div>
                <div><h3>Stage Durations</h3><p>Time spent in each stage</p></div>
              </Link>
              <Link href="/admin/reports/on-time" className="report-link">
                <div className="report-icon">&#9989;</div>
                <div><h3>On-Time Delivery</h3><p>ETA accuracy and slippage analysis</p></div>
              </Link>
              <Link href="/admin/reports/chokepoints" className="report-link">
                <div className="report-icon">&#128683;</div>
                <div><h3>Chokepoints</h3><p>Items stuck in stages</p></div>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
