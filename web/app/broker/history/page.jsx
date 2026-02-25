"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import "./history.css";

export default function BrokerHistory() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!user || (user.role !== 'BROKER' && user.role !== 'SUPER_ADMIN')) {
      router.push('/login');
      return;
    }

    loadHistory();
  }, [user, pagination.page, statusFilter, router]);

  async function loadHistory() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `/api/customs/history?page=${pagination.page}&limit=20`;
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading history:', error);
      setLoading(false);
    }
  }

  function handlePageChange(newPage) {
    setPagination(prev => ({ ...prev, page: newPage }));
  }

  function handleStatusFilter(newStatus) {
    setStatusFilter(newStatus);
    setPagination(prev => ({ ...prev, page: 1 }));
  }

  if (!user) {
    return null;
  }

  return (
    <div className="broker-container">
      <TopNav />
      <NotificationBar />

      <div className="broker-content">
        <div className="history-header">
          <div className="history-header-left">
            <button
              onClick={() => router.push('/broker/dashboard')}
              className="back-button"
            >
              ← Back to Dashboard
            </button>
            <h1>Customs History</h1>
          </div>
          <div className="history-filters">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="FILED">Filed</option>
              <option value="RELEASED">Released</option>
              <option value="UNDER_EXAM">Under Exam</option>
            </select>
            {pagination.total > 0 && (
              <span className="history-count">{pagination.total} items</span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading history...</div>
        ) : (
          <>
            <div className="items-table-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Product Code</th>
                    <th>Container</th>
                    <th>Status</th>
                    <th>Cleared Date</th>
                    <th>Current Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan="8">
                        <div className="empty-state">
                          No processed items found
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map(item => (
                      <tr key={item.id}>
                        <td>{item.order?.poNumber || 'N/A'}</td>
                        <td>{item.order?.account?.name || 'N/A'}</td>
                        <td>{item.order?.account?.contactName || '-'}</td>
                        <td>{item.productCode || 'N/A'}</td>
                        <td>{item.shipment?.containerNumber || '-'}</td>
                        <td>
                          <span className={`status-text ${(item.customsDocumentStatus || 'pending').toLowerCase().replace('_', '-')}`}>
                            {item.customsDocumentStatus || 'PENDING'}
                          </span>
                        </td>
                        <td>
                          {item.customsClearedDate
                            ? new Date(item.customsClearedDate).toLocaleDateString()
                            : '-'
                          }
                        </td>
                        <td>{item.currentStage}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="pagination-btn"
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="pagination-btn"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
