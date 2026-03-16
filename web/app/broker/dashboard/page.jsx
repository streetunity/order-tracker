"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import { Package } from "lucide-react";
import "./broker.css";

const ALLOWED_ROLES = ['BROKER', 'SUPER_ADMIN', 'ACCOUNTANT'];

export default function BrokerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!user || !ALLOWED_ROLES.includes(user.role)) {
      router.push('/login');
      return;
    }

    loadData();

    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadData();
      }, 5 * 60 * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user, autoRefresh, router]);

  async function loadData() {
    try {
      const token = localStorage.getItem('token');

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

  // Group items: shipment rows + standalone items
  const displayRows = useMemo(() => {
    const shipmentGroups = {};
    const standaloneItems = [];

    items.forEach(item => {
      if (item.shipmentId && item.shipment) {
        if (!shipmentGroups[item.shipmentId]) {
          shipmentGroups[item.shipmentId] = {
            type: 'shipment',
            shipmentId: item.shipmentId,
            containerNumber: item.shipment.containerNumber || item.shipment.billOfLading || 'Unnamed Shipment',
            items: []
          };
        }
        shipmentGroups[item.shipmentId].items.push(item);
      } else {
        standaloneItems.push({ type: 'item', ...item });
      }
    });

    const shipmentRows = Object.values(shipmentGroups).map(group => {
      const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'NORMAL': 3 };
      const highestPriority = group.items.reduce((best, item) => {
        return (priorityOrder[item.priority] < priorityOrder[best]) ? item.priority : best;
      }, 'NORMAL');

      const highestPriorityItem = group.items.reduce((best, item) => {
        return (priorityOrder[item.priority] < priorityOrder[best.priority]) ? item : best;
      }, group.items[0]);

      const contactNames = [...new Set(group.items.map(i => i.order?.account?.contactName).filter(Boolean))];
      const productCodes = group.items.map(i => i.productCode || 'N/A');
      const customsStatus = group.items[0]?.customsDocumentStatus || 'PENDING';

      return {
        type: 'shipment',
        shipmentId: group.shipmentId,
        containerNumber: group.containerNumber,
        items: group.items,
        priority: highestPriority,
        daysUntilArrival: highestPriorityItem.daysUntilArrival,
        daysAtSea: highestPriorityItem.daysAtSea,
        contactNames,
        productCodes,
        customsDocumentStatus: customsStatus,
        _searchText: [
          group.containerNumber,
          ...contactNames,
          ...group.items.map(i => i.order?.account?.name),
          ...productCodes
        ].filter(Boolean).join(' ').toLowerCase()
      };
    });

    const allRows = [...shipmentRows, ...standaloneItems.map(item => ({
      ...item,
      _searchText: [
        item.order?.poNumber,
        item.order?.account?.name,
        item.order?.account?.contactName,
        item.productCode,
        item.containers
      ].filter(Boolean).join(' ').toLowerCase()
    }))];

    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'NORMAL': 3 };
    allRows.sort((a, b) => {
      const pA = priorityOrder[a.priority] ?? 3;
      const pB = priorityOrder[b.priority] ?? 3;
      if (pA !== pB) return pA - pB;
      return (b.daysAtSea || 0) - (a.daysAtSea || 0);
    });

    return allRows;
  }, [items]);

  const filteredRows = displayRows.filter(row => {
    if (filter !== 'ALL') {
      if (filter === 'CRITICAL' && row.priority !== 'CRITICAL') return false;
      if (filter === 'HIGH' && row.priority !== 'HIGH') return false;
      if (filter === 'PENDING' && row.customsDocumentStatus !== 'PENDING') return false;
      if (filter === 'IN_PROGRESS' && row.customsDocumentStatus !== 'IN_PROGRESS') return false;
    }
    if (searchTerm) return row._searchText.includes(searchTerm.toLowerCase());
    return true;
  });

  const getStatusCount = (status) => {
    if (!stats?.byStatus) return 0;
    const found = stats.byStatus.find(s => s.customsDocumentStatus === status);
    return found?._count || 0;
  };

  function renderProductCodes(codes) {
    if (!codes || codes.length === 0) return 'N/A';
    const MAX_SHOW = 4;
    const visible = codes.slice(0, MAX_SHOW);
    const remaining = codes.length - MAX_SHOW;
    return (
      <span className="product-codes-aggregated">
        {visible.join(', ')}
        {remaining > 0 && <span className="product-codes-more"> + {remaining} more</span>}
      </span>
    );
  }

  if (!user) return null;

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
              <button onClick={loadData} className="broker-btn broker-btn-primary">Refresh Now</button>
              <button onClick={() => router.push('/broker/history')} className="broker-btn broker-btn-secondary">View History</button>
            </div>
          </div>

          {stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total At Sea</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Critical (&le;3 days)</div>
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

          <div className="filters-row">
            <input
              type="text"
              placeholder="Search by contact name, customer, product code, container..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
              <option value="ALL">All Items ({items.length})</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Priority</option>
              <option value="PENDING">Pending Status</option>
              <option value="IN_PROGRESS">In Progress</option>
            </select>
          </div>
        </div>

        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Contact Name</th>
                <th>Customer</th>
                <th>Product Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">No items found</div>
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  if (row.type === 'shipment') {
                    return (
                      <tr key={`shipment-${row.shipmentId}`} className="shipment-row">
                        <td>
                          <span className={`priority-badge ${row.priority.toLowerCase()}`}>
                            {row.priority}
                            {row.daysUntilArrival !== null && <span> ({row.daysUntilArrival}d)</span>}
                          </span>
                        </td>
                        <td>
                          {row.contactNames.length === 1
                            ? row.contactNames[0]
                            : row.contactNames.length > 1
                              ? <span>Multiple ({row.contactNames.length})</span>
                              : '-'
                          }
                        </td>
                        <td>
                          <span className="shipment-customer">
                            <Package size={14} className="shipment-icon" />
                            {row.containerNumber}
                            <span className="shipment-item-count">({row.items.length} items)</span>
                          </span>
                        </td>
                        <td>{renderProductCodes(row.productCodes)}</td>
                        <td>
                          <span className={`status-text ${(row.customsDocumentStatus || 'pending').toLowerCase().replace('_', '-')}`}>
                            {row.customsDocumentStatus || 'PENDING'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => router.push(`/broker/shipment/${row.shipmentId}`)}
                            className="broker-btn broker-btn-primary"
                            style={{ padding: '6px 16px', fontSize: '13px' }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  } else {
                    return (
                      <tr key={row.id}>
                        <td>
                          <span className={`priority-badge ${row.priority.toLowerCase()}`}>
                            {row.priority}
                            {row.daysUntilArrival !== null && <span> ({row.daysUntilArrival}d)</span>}
                          </span>
                        </td>
                        <td>{row.order?.account?.contactName || '-'}</td>
                        <td>{row.order?.account?.name}</td>
                        <td>{row.productCode || 'N/A'}</td>
                        <td>
                          <span className={`status-text ${(row.customsDocumentStatus || 'pending').toLowerCase().replace('_', '-')}`}>
                            {row.customsDocumentStatus || 'PENDING'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => router.push(`/broker/item/${row.id}`)}
                            className="broker-btn broker-btn-primary"
                            style={{ padding: '6px 16px', fontSize: '13px' }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  }
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
