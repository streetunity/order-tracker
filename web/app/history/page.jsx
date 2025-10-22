'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import './history.css';

export default function AuditHistoryViewer() {
  const [universalLogs, setUniversalLogs] = useState([]);
  const [ordersLogs, setOrdersLogs] = useState([]);
  const [accountsLogs, setAccountsLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('universal'); // 'universal', 'orders', 'customers'
  
  const router = useRouter();
  const { user, getAuthHeaders, isAdmin } = useAuth();

  // Redirect to login if not authenticated or not admin
  useEffect(() => {
    if (!user) {
      router.push('/login');
    } else if (!isAdmin) {
      router.push('/admin/board');
    }
  }, [user, isAdmin, router]);

  async function loadUniversalChanges() {
    try {
      const res = await fetch('/api/audit/recent?limit=20', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (res.ok) {
        const data = await res.json();
        setUniversalLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load universal changes:', e);
    }
  }

  async function loadOrdersChanges() {
    try {
      const res = await fetch('/api/audit/by-type/Order?limit=50', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (res.ok) {
        const data = await res.json();
        setOrdersLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load orders changes:', e);
    }
  }

  async function loadAccountsChanges() {
    try {
      const res = await fetch('/api/audit/by-type/Account?limit=50', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (res.ok) {
        const data = await res.json();
        setAccountsLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load accounts changes:', e);
    }
  }

  useEffect(() => {
    if (user && isAdmin) {
      setLoading(true);
      loadUniversalChanges().then(() => {
        loadOrdersChanges();
        loadAccountsChanges();
      }).finally(() => setLoading(false));
    }
  }, [user, isAdmin]);

  async function handleRestore(log) {
    if (!log.metadata?.entity || log.action !== 'ORDERITEM_UPDATED') return;
    
    // Check if this is an archive action
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    if (!archiveChange || archiveChange.newValue === 'null') return;

    const confirm = window.confirm('Restore this item to the board?');
    if (!confirm) return;

    try {
      const itemId = log.entityId;
      const orderId = log.parentEntityId;
      
      const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archivedAt: null
        })
      });

      if (res.ok) {
        alert('Item restored successfully!');
        // Reload the logs
        loadUniversalChanges();
        loadOrdersChanges();
      } else {
        const error = await res.json();
        alert(`Failed to restore: ${error.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Restore error:', e);
      alert('Failed to restore item');
    }
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function getActionLabel(action) {
    const labels = {
      'ORDER_CREATED': 'Order Created',
      'ORDER_UPDATED': 'Order Updated',
      'ORDER_DELETED': 'Order Deleted',
      'ORDERITEM_UPDATED': 'Item Updated',
      'ITEMS_ADDED': 'Items Added',
      'ITEM_DELETED': 'Item Deleted',
      'ITEM_ORDERED': 'Item Ordered',
      'ITEM_UNORDERED': 'Item Unordered',
      'STAGE_CHANGED': 'Stage Changed',
      'ORDER_LOCKED': 'Order Locked',
      'ORDER_UNLOCKED': 'Order Unlocked',
      'ACCOUNT_CREATED': 'Customer Created',
      'ACCOUNT_UPDATED': 'Customer Updated',
      'ACCOUNT_DELETED': 'Customer Deleted',
      'EDIT_ATTEMPTED_WHILE_LOCKED': 'Edit Blocked (Locked)',
      'DELETE_ATTEMPTED_WHILE_LOCKED': 'Delete Blocked (Locked)',
      'MEASUREMENTS_UPDATED': 'Measurements Updated',
      'CONTAINERS_UPDATED': 'Containers Updated',
      'INTERNAL_NOTES_UPDATED': 'Internal Notes Updated'
    };
    return labels[action] || action;
  }

  function getActionBadgeClass(action) {
    if (action.includes('CREATED')) return 'badge-created';
    if (action.includes('UPDATED')) return 'badge-updated';
    if (action.includes('DELETED')) return 'badge-deleted';
    if (action.includes('LOCKED') || action.includes('BLOCKED')) return 'badge-locked';
    if (action.includes('UNLOCKED')) return 'badge-unlocked';
    if (action.includes('ORDERED')) return 'badge-ordered';
    return 'badge-default';
  }

  function isArchiveAction(log) {
    if (log.action !== 'ORDERITEM_UPDATED') return false;
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    return archiveChange && archiveChange.newValue !== 'null';
  }

  function renderChanges(changes) {
    if (!changes || changes.length === 0) return null;
    
    return (
      <div className="log-changes">
        {changes.map((change, idx) => (
          <div key={idx} className="change-item">
            <span className="change-field">{change.field}:</span>
            <span className="change-old">{change.oldValue}</span>
            <span className="change-arrow">→</span>
            <span className="change-new">{change.newValue}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderLogEntry(log) {
    const showRestore = isArchiveAction(log);
    
    return (
      <div key={log.id} className="log-entry">
        <div className="log-header">
          <div className="log-meta">
            <span className={`log-badge ${getActionBadgeClass(log.action)}`}>
              {getActionLabel(log.action)}
            </span>
            <span className="log-entity-type">{log.entityType}</span>
            <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
          </div>
          <div className="log-user">
            {log.performedByName || 'System'}
          </div>
        </div>
        
        {renderChanges(log.changes)}
        
        {log.metadata?.message && (
          <div className="log-metadata">
            {log.metadata.message}
          </div>
        )}
        
        {showRestore && (
          <div className="log-actions">
            <button 
              className="btn-restore"
              onClick={() => handleRestore(log)}
            >
              🔄 Restore Item
            </button>
          </div>
        )}
      </div>
    );
  }

  // Don't render until authentication is checked
  if (!user || !isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="history-loading">
        <div>Loading audit history...</div>
      </div>
    );
  }

  const currentLogs = activeTab === 'universal' ? universalLogs : 
                      activeTab === 'orders' ? ordersLogs : accountsLogs;

  return (
    <>
      <TopNav />
      <div className="history-container">
        <div className="history-content">
          {/* Header */}
          <div className="history-header">
            <h1>Audit History</h1>
            <p className="history-subtitle">
              Track all changes and actions across the system
            </p>
          </div>

          {/* Tabs */}
          <div className="history-tabs">
            <button
              className={`tab ${activeTab === 'universal' ? 'active' : ''}`}
              onClick={() => setActiveTab('universal')}
            >
              Recent Changes (20)
            </button>
            <button
              className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              Orders
            </button>
            <button
              className={`tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              Customers
            </button>
          </div>

          {/* Logs Display */}
          <div className="logs-container">
            {currentLogs.length === 0 ? (
              <div className="no-logs">
                <p>No audit logs found for this category.</p>
              </div>
            ) : (
              currentLogs.map(log => renderLogEntry(log))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
