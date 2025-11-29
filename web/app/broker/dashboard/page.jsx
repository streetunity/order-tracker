"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import "./broker.css";

export default function BrokerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, CRITICAL, HIGH, PENDING, IN_PROGRESS
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!user || (user.role !== 'BROKER' && user.role !== 'SUPER_ADMIN')) {
      router.push('/login');
      return;
    }

    loadData();

    // Auto-refresh every 5 minutes if enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadData();
      }, 5 * 60 * 1000); // 5 minutes
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user, autoRefresh, router]);

  async function loadData() {
    try {
      const token = localStorage.getItem('token');

      // Fetch items at sea
      // Note: Using Next.js API routes (/api/customs) which proxy to backend
      const itemsRes = await fetch(`/api/customs/items-at-sea`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: "no-store"
      });

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setItems(itemsData);
      }

      // Fetch statistics
      const statsRes = await fetch(`/api/customs/statistics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }

  // Filter items based on selected filter and search term
  const filteredItems = items.filter(item => {
    // Apply status filter
    if (filter !== 'ALL') {
      if (filter === 'CRITICAL' && item.priority !== 'CRITICAL') return false;
      if (filter === 'HIGH' && item.priority !== 'HIGH') return false;
      if (filter === 'PENDING' && item.customsDocumentStatus !== 'PENDING') return false;
      if (filter === 'IN_PROGRESS' && item.customsDocumentStatus !== 'IN_PROGRESS') return false;
    }

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        item.order.poNumber?.toLowerCase().includes(search) ||
        item.order.account.name?.toLowerCase().includes(search) ||
        item.productCode?.toLowerCase().includes(search) ||
        item.containers?.toLowerCase().includes(search)
      );
    }

    return true;
  });

  const getStatusCount = (status) => {
    if (!stats?.byStatus) return 0;
    const found = stats.byStatus.find(s => s.customsDocumentStatus === status);
    return found?._count || 0;
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="loading-state">
          <div>Loading broker dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="broker-container">
      <TopNav />
      <NotificationBar />

      <div className="broker-content">
        {/* Header */}
        <div className="broker-header">
          <div className="broker-header-top">
            <h1>Broker Portal</h1>
            <div className="broker-controls">
              <label className="broker-checkbox-label">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh (5 min)
              </label>
              <button
                onClick={loadData}
                className="broker-btn broker-btn-primary"
              >
                Refresh Now
              </button>
              <button
                onClick={() => router.push('/broker/history')}
                className="broker-btn broker-btn-secondary"
              >
                View History
              </button>
            </div>
          </div>

          {/* Statistics Cards */}
          {stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total At Sea</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Critical (≤3 days)</div>
                <div className="stat-value critical">{stats.critical}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Pending</div>
                <div className="stat-value warning">{getStatusCount('PENDING')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Filed</div>
                <div className="stat-value info">{getStatusCount('FILED')}</div>
              </div>
            </div>
          )}

          {/* Filters and Search */}
          <div className="filters-row">
            <input
              type="text"
              placeholder="Search by order #, customer, product code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Items ({items.length})</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Priority</option>
              <option value="PENDING">Pending Status</option>
              <option value="IN_PROGRESS">In Progress</option>
            </select>
          </div>
        </div>

        {/* Items Table */}
        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Order #</th>
                <th>Customer</th>
                <th>Product Code</th>
                <th>Arrival</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="empty-state">
                      No items found
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className={`priority-badge ${item.priority.toLowerCase()}`}>
                        {item.priority}
                        {item.daysUntilArrival !== null && (
                          <span> ({item.daysUntilArrival}d)</span>
                        )}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {item.order.poNumber || 'N/A'}
                    </td>
                    <td>{item.order.account.name}</td>
                    <td>{item.productCode || 'N/A'}</td>
                    <td>
                      {item.etaDate
                        ? new Date(item.etaDate).toLocaleDateString()
                        : 'TBD'
                      }
                    </td>
                    <td>
                      <span className={`status-text ${(item.customsDocumentStatus || 'pending').toLowerCase().replace('_', '-')}`}>
                        {item.customsDocumentStatus || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => router.push(`/broker/item/${item.id}`)}
                        className="broker-btn broker-btn-primary"
                        style={{ padding: '6px 16px', fontSize: '13px' }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
