'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import './reports.css';

export default function ReportsPage() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    async function loadSummary() {
      try {
        const res = await fetch('/api/reports/summary', {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } catch (e) {
        console.error('Failed to load summary:', e);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, [user, router, getAuthHeaders]);

  if (!user) return null;

  return (
    <main className="reports-container">
      <div className="reports-header">
        <h1>Reports & Analytics</h1>
        <Link href="/admin/board" className="btn-back">
          ← Back to Board
        </Link>
      </div>

      {loading && <div className="loading">Loading reports...</div>}

      {!loading && summary && (
        <>
          {/* KPI Cards */}
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

          {/* Orders by Stage */}
          <div className="report-section">
            <h2>Orders by Stage</h2>
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

      {/* Report Categories */}
      <div className="report-categories">
        {isAdmin && (
          <div className="category-section">
            <h2>Sales & Revenue Reports (Admin Only)</h2>
            <div className="report-links">
              <Link href="/admin/reports/sales-by-rep" className="report-link">
                <div className="report-icon">👥</div>
                <div>
                  <h3>Sales by Rep</h3>
                  <p>Revenue breakdown by sales representative</p>
                </div>
              </Link>
              <Link href="/admin/reports/sales-by-month" className="report-link">
                <div className="report-icon">📅</div>
                <div>
                  <h3>Sales by Month</h3>
                  <p>Monthly sales trends with MoM changes</p>
                </div>
              </Link>
              <Link href="/admin/reports/sales-by-item" className="report-link">
                <div className="report-icon">📦</div>
                <div>
                  <h3>Sales by Product</h3>
                  <p>Top products ranked by revenue</p>
                </div>
              </Link>
              <Link href="/admin/reports/ovar" className="report-link">
                <div className="report-icon">⚠️</div>
                <div>
                  <h3>Order Value at Risk</h3>
                  <p>Money tied up in late or aging orders</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        <div className="category-section">
          <h2>Operational Reports</h2>
          <div className="report-links">
            <Link href="/admin/reports/cycle-times" className="report-link">
              <div className="report-icon">⏱️</div>
              <div>
                <h3>Cycle Times</h3>
                <p>Order completion time metrics</p>
              </div>
            </Link>
            <Link href="/admin/reports/throughput" className="report-link">
              <div className="report-icon">📊</div>
              <div>
                <h3>Throughput</h3>
                <p>Items entering each stage per week</p>
              </div>
            </Link>
            <Link href="/admin/reports/stage-durations" className="report-link">
              <div className="report-icon">📈</div>
              <div>
                <h3>Stage Durations</h3>
                <p>Time spent in each stage</p>
              </div>
            </Link>
            <Link href="/admin/reports/on-time" className="report-link">
              <div className="report-icon">✅</div>
              <div>
                <h3>On-Time Delivery</h3>
                <p>ETA accuracy and slippage analysis</p>
              </div>
            </Link>
            <Link href="/admin/reports/chokepoints" className="report-link">
              <div className="report-icon">🚧</div>
              <div>
                <h3>Chokepoints</h3>
                <p>Items stuck in stages</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
