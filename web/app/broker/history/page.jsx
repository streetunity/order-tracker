"use client";

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

  useEffect(() => {
    if (!user || (user.role !== 'BROKER' && user.role !== 'SUPER_ADMIN')) {
      router.push('/login');
      return;
    }

    loadHistory();
  }, [user, pagination.page, router]);

  async function loadHistory() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/broker/history?page=${pagination.page}&limit=20`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          cache: 'no-store'
        }
      );

      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setPagination(data.pagination);
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

  if (!user) {
    return null;
  }

  return (
    <div className="broker-container">
      <TopNav />
      <NotificationBar />

      <div className="broker-content">
        <div className="history-header">
          <button
            onClick={() => router.push('/broker/dashboard')}
            className="back-button"
          >
            ← Back to Dashboard
          </button>
          <h1>Cleared Shipments History</h1>
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
                    <th>Product Code</th>
                    <th>Serial Number</th>
                    <th>Cleared Date</th>
                    <th>Current Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-state">
                          No cleared shipments found
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace' }}>
                          {item.order.poNumber || 'N/A'}
                        </td>
                        <td>{item.order.account.name}</td>
                        <td>{item.productCode || 'N/A'}</td>
                        <td style={{ fontFamily: 'monospace' }}>
                          {item.serialNumber || 'N/A'}
                        </td>
                        <td>
                          {item.customsClearedDate
                            ? new Date(item.customsClearedDate).toLocaleDateString()
                            : 'N/A'
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
