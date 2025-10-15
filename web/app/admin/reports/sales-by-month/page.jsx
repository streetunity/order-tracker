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
  
  // Get current month and year
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
  
  // Month selector state
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  
  // Generate list of years (last 3 years)
  const years = [];
  for (let i = currentYear; i >= currentYear - 2; i--) {
    years.push(i);
  }
  
  // Month names for dropdown
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

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
      
      // Create date range for the selected month
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0); // Last day of the month
      
      const params = new URLSearchParams({
        year: selectedYear.toString(),
        month: selectedMonth.toString(),
        date_from: startDate.toISOString().split('T')[0],
        date_to: endDate.toISOString().split('T')[0]
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
  }, [user, isAdmin, selectedYear, selectedMonth]);

  if (!user || !isAdmin) return null;

  // Get the selected month name
  const selectedMonthName = months.find(m => m.value === selectedMonth)?.label || '';

  return (
    <main className="reports-container">
      <div className="reports-header">
        <h1>Orders by Month</h1>
        <Link href="/admin/reports" className="btn-back">
          ← Back to Reports
        </Link>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Month</label>
          <select
            className="filter-input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text)',
              cursor: 'pointer'
            }}
          >
            {months.map(month => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Year</label>
          <select
            className="filter-input"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text)',
              cursor: 'pointer'
            }}
          >
            {years.map(year => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <button className="btn-filter" onClick={loadData}>
            Refresh Data
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="loading">Loading...</div>}

      {!loading && data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card accent">
              <h3>Total Orders - {selectedMonthName} {selectedYear}</h3>
              <div className="kpi-value">{data.kpis?.orderCount || 0}</div>
            </div>
            <div className="kpi-card accent">
              <h3>Total Revenue</h3>
              <div className="kpi-value">{data.kpis?.totalRevenue || data.kpis?.grandTotalFormatted || '$0.00'}</div>
            </div>
            <div className="kpi-card">
              <h3>Average Order Value</h3>
              <div className="kpi-value">{data.kpis?.averageOrderValue || '$0.00'}</div>
            </div>
          </div>

          {data.orders && data.orders.length > 0 ? (
            <div className="report-section">
              <h2>Orders in {selectedMonthName} {selectedYear}</h2>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Order Date</th>
                      <th>Customer</th>
                      <th>PO Number</th>
                      <th>Sales Person</th>
                      <th>Items</th>
                      <th>Total Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order, i) => (
                      <tr key={i}>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td>{order.customerName}</td>
                        <td>{order.poNumber || 'N/A'}</td>
                        <td>{order.salesPerson || 'N/A'}</td>
                        <td>{order.itemCount}</td>
                        <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                          {order.totalFormatted}
                        </td>
                        <td>{order.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : data.series && data.series.length > 0 ? (
            // Fallback to existing series format if available
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
          ) : (
            <div className="report-section">
              <h2>No Orders Found</h2>
              <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                No orders were placed in {selectedMonthName} {selectedYear}
              </p>
            </div>
          )}

          {/* Month-over-Month Comparison */}
          {data.comparison && (
            <div className="report-section">
              <h2>Month-over-Month Comparison</h2>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Current Month</th>
                      <th>Previous Month</th>
                      <th>Change</th>
                      <th>% Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Orders</td>
                      <td>{data.comparison.currentOrders}</td>
                      <td>{data.comparison.previousOrders}</td>
                      <td style={{ 
                        color: data.comparison.ordersChange >= 0 ? '#16a34a' : '#dc2626' 
                      }}>
                        {data.comparison.ordersChange >= 0 ? '+' : ''}{data.comparison.ordersChange}
                      </td>
                      <td style={{ 
                        color: parseFloat(data.comparison.ordersChangePercent) >= 0 ? '#16a34a' : '#dc2626' 
                      }}>
                        {data.comparison.ordersChangePercent}%
                      </td>
                    </tr>
                    <tr>
                      <td>Revenue</td>
                      <td>{data.comparison.currentRevenue}</td>
                      <td>{data.comparison.previousRevenue}</td>
                      <td style={{ 
                        color: data.comparison.revenueChange >= 0 ? '#16a34a' : '#dc2626' 
                      }}>
                        {data.comparison.revenueChangeFormatted}
                      </td>
                      <td style={{ 
                        color: parseFloat(data.comparison.revenueChangePercent) >= 0 ? '#16a34a' : '#dc2626' 
                      }}>
                        {data.comparison.revenueChangePercent}%
                      </td>
                    </tr>
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
