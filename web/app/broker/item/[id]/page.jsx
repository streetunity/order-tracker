"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import "./item.css";

export default function BrokerItemDetail() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const itemId = params.id;

  const [item, setItem] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'activity'

  useEffect(() => {
    if (!user || (user.role !== 'BROKER' && user.role !== 'SUPER_ADMIN')) {
      router.push('/login');
      return;
    }

    loadItem();
    loadActivityLog();
  }, [user, itemId, router]);

  async function loadItem() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/broker/item/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setItem(data);
        setNewStatus(data.customsDocumentStatus || 'PENDING');
        setNotes(data.customsNotes || '');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading item:', error);
      setLoading(false);
    }
  }

  async function loadActivityLog() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/broker/activity-log/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setActivityLog(data);
      }
    } catch (error) {
      console.error('Error loading activity log:', error);
    }
  }

  async function handleUpdateStatus() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/broker/update-status/${itemId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus,
          notes: notes
        })
      });

      if (res.ok) {
        await loadItem();
        await loadActivityLog();
        alert('Status updated successfully');
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error updating status');
    }
    setSaving(false);
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="loading-state">
          <div>Loading item details...</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="empty-state">
          <div>Item not found</div>
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
        <div className="item-header">
          <button
            onClick={() => router.push('/broker/dashboard')}
            className="back-button"
          >
            ← Back to Dashboard
          </button>
          <div className="header-row">
            <h1 className="item-title">
              {item.order.poNumber || 'N/A'} - {item.productCode}
            </h1>
            {item.order.brokerDocsLink && item.order.brokerDocsLink.trim() !== '' && (
              <a
                href={
                  item.order.brokerDocsLink.startsWith('http://') ||
                  item.order.brokerDocsLink.startsWith('https://')
                    ? item.order.brokerDocsLink
                    : `https://${item.order.brokerDocsLink}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="docs-button-header"
              >
                Open Documents →
              </a>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`tab-button ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Activity Log
          </button>
        </div>

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="item-grid">
          {/* Left Column - Item Details */}
          <div className="item-column">
            {/* Order Information */}
            <div className="info-card">
              <h2>Order Information</h2>
              <div className="info-row">
                <span className="info-label">Order Number:</span>
                <span className="info-value mono">{item.order.poNumber || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Customer:</span>
                <span className="info-value">{item.order.account.name}</span>
              </div>
              {item.order.account.email && (
                <div className="info-row">
                  <span className="info-label">Email:</span>
                  <a href={`mailto:${item.order.account.email}`} className="info-link">
                    {item.order.account.email}
                  </a>
                </div>
              )}
              {item.order.account.phone && (
                <div className="info-row">
                  <span className="info-label">Phone:</span>
                  <a href={`tel:${item.order.account.phone}`} className="info-link">
                    {item.order.account.phone}
                  </a>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Sales Person:</span>
                <span className="info-value">{item.order.sku || 'N/A'}</span>
              </div>
            </div>

            {/* Shipment Details */}
            <div className="info-card">
              <h2>Shipment Details</h2>
              <div className="info-row">
                <span className="info-label">Product Code:</span>
                <span className="info-value">{item.productCode || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Serial Number:</span>
                <span className="info-value mono">{item.serialNumber || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Bill of Lading:</span>
                <span className="info-value mono">{item.billOfLading || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Expected Arrival:</span>
                <span className="info-value">
                  {item.order.etaDate
                    ? new Date(item.order.etaDate).toLocaleDateString()
                    : 'TBD'
                  }
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Current Stage:</span>
                <span className="info-value">{item.currentStage}</span>
              </div>
            </div>
          </div>

          {/* Right Column - Status Management */}
          <div className="item-column">
            {/* Status Update */}
            <div className="info-card customs-card">
              <h2>Customs Status</h2>

              <div className="form-group">
                <label className="form-label">Current Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="form-select"
                >
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="FILED">Filed</option>
                  <option value="CLEARED">Cleared</option>
                  <option value="ISSUES">Issues</option>
                </select>
              </div>

              <div className="form-group notes-group">
                <label className="form-label">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about customs processing, issues, or special instructions..."
                  className="form-textarea notes-textarea"
                />
              </div>

              <button
                onClick={handleUpdateStatus}
                disabled={saving}
                className="broker-btn broker-btn-primary full-width"
              >
                {saving ? 'Saving...' : 'Update Status'}
              </button>

              {/* Status Dates */}
              <div className="status-dates">
                {item.customsFiledDate && (
                  <div className="info-row-small">
                    <span>Filed Date:</span>
                    <span>{new Date(item.customsFiledDate).toLocaleDateString()}</span>
                  </div>
                )}
                {item.customsClearedDate && (
                  <div className="info-row-small">
                    <span>Cleared Date:</span>
                    <span>{new Date(item.customsClearedDate).toLocaleDateString()}</span>
                  </div>
                )}
                {item.brokerLastViewedDate && (
                  <div className="info-row-small">
                    <span>Last Viewed:</span>
                    <span>{new Date(item.brokerLastViewedDate).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="activity-tab-content">
            <div className="info-card">
              <h2>Activity Log</h2>

              {activityLog.length === 0 ? (
                <div className="no-activity">No activity recorded yet</div>
              ) : (
                <div className="activity-log">
                  {activityLog.map(log => (
                    <div key={log.id} className="activity-item">
                      <div className="activity-header">
                        <span className="activity-action">{log.action}</span>
                        <span className="activity-time">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="activity-user">
                        by {log.user.name}
                      </div>
                      {log.oldStatus && log.newStatus && (
                        <div className="activity-status-change">
                          <span className="old-status">{log.oldStatus}</span>
                          <span className="arrow">→</span>
                          <span className="new-status">{log.newStatus}</span>
                        </div>
                      )}
                      {log.notes && (
                        <div className="activity-notes">
                          "{log.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
