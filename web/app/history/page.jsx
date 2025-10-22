'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import './history.css';

export default function AuditHistoryViewer() {
  // State for all entities
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  
  // State for logs
  const [universalLogs, setUniversalLogs] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityLogs, setEntityLogs] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('universal'); // 'universal', 'orders', 'customers'
  const [searchQuery, setSearchQuery] = useState('');
  
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

  async function loadData() {
    if (!user || !isAdmin) return;
    
    try {
      // Load orders
      const ordersRes = await fetch('/api/orders', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      }

      // Load accounts
      const accountsRes = await fetch('/api/accounts', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }

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

  async function loadEntityLogs(entityId) {
    if (!user || !isAdmin) return;
    
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/audit/${entityId}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (res.ok) {
        const data = await res.json();
        setEntityLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load entity logs:', e);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (user && isAdmin) {
      setLoading(true);
      Promise.all([loadData(), loadUniversalChanges()]).finally(() => setLoading(false));
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (selectedEntity && user && isAdmin) {
      loadEntityLogs(selectedEntity.id);
    }
  }, [selectedEntity, user, isAdmin]);

  async function handleRestore(log) {
    // Check if this is an archive action for an OrderItem
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    if (!archiveChange || archiveChange.newValue === 'null' || log.entityType !== 'OrderItem') {
      console.log('Not an archive action or wrong entity type');
      return;
    }

    const confirmRestore = window.confirm('Restore this item to the board?');
    if (!confirmRestore) return;

    try {
      const itemId = log.entityId;
      const orderId = log.parentEntityId;
      
      console.log('Restoring item:', { itemId, orderId });
      
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
        // Reload the appropriate logs
        if (activeTab === 'universal') {
          loadUniversalChanges();
        } else if (selectedEntity) {
          loadEntityLogs(selectedEntity.id);
        }
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
    if (log.entityType !== 'OrderItem') return false;
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    return archiveChange && archiveChange.oldValue === 'null' && archiveChange.newValue !== 'null';
  }

  function getEntityName(log) {
    // For Order logs, try to find the order
    if (log.entityType === 'Order' || log.parentEntityId) {
      const orderId = log.entityType === 'Order' ? log.entityId : log.parentEntityId;
      const order = orders.find(o => o.id === orderId);
      if (order) {
        return `Order: ${order.poNumber || order.id.slice(0, 8)} - ${order.account?.name || 'Unknown'}`;
      }
    }
    
    // For Account logs
    if (log.entityType === 'Account') {
      const account = accounts.find(a => a.id === log.entityId);
      if (account) {
        return `Customer: ${account.name}`;
      }
    }
    
    // For OrderItem logs, get product code from metadata
    if (log.entityType === 'OrderItem' && log.metadata?.items) {
      const items = log.metadata.items;
      if (Array.isArray(items) && items.length > 0) {
        return `Item: ${items[0].productCode}`;
      }
    }
    
    // Fallback - try to get from changes
    if (log.changes) {
      const productCodeChange = log.changes.find(c => c.field === 'productCode');
      if (productCodeChange) {
        return `Item: ${productCodeChange.newValue || productCodeChange.oldValue}`;
      }
    }
    
    return null;
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
    const entityName = getEntityName(log);
    
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
        
        {entityName && (
          <div className="log-entity-name">
            {entityName}
          </div>
        )}
        
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

  // Filter entities based on search
  const filteredAccounts = accounts.filter(acc => 
    acc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOrders = orders.filter(order => 
    order.poNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.account?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  // Render for universal tab
  if (activeTab === 'universal') {
    return (
      <>
        <TopNav />
        <div className="history-container">
          <div className="history-content">
            <div className="history-header">
              <h1>Audit History</h1>
              <p className="history-subtitle">
                Track all changes and actions across the system
              </p>
            </div>

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

            <div className="logs-container">
              {universalLogs.length === 0 ? (
                <div className="no-logs">
                  <p>No audit logs found.</p>
                </div>
              ) : (
                universalLogs.map(log => renderLogEntry(log))
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Render for orders/customers tabs with sidebar
  const currentEntities = activeTab === 'orders' ? filteredOrders : filteredAccounts;
  const currentLogs = logsLoading ? [] : entityLogs;

  return (
    <>
      <TopNav />
      <div className="history-container">
        <div className="history-content">
          <div className="history-header">
            <h1>Audit History</h1>
            <p className="history-subtitle">
              Track all changes and actions across the system
            </p>
          </div>

          <div className="history-tabs">
            <button
              className={`tab ${activeTab === 'universal' ? 'active' : ''}`}
              onClick={() => { setActiveTab('universal'); setSelectedEntity(null); }}
            >
              Recent Changes (20)
            </button>
            <button
              className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('orders'); setSelectedEntity(null); }}
            >
              Orders
            </button>
            <button
              className={`tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => { setActiveTab('customers'); setSelectedEntity(null); }}
            >
              Customers
            </button>
          </div>

          <div className="history-grid">
            {/* Left Sidebar - Entity List */}
            <div className="entity-list-sidebar">
              <div className="entity-search">
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="entity-list">
                {currentEntities.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#a0a0a0', padding: '20px' }}>
                    No {activeTab} found
                  </div>
                ) : (
                  currentEntities.map(entity => (
                    <div
                      key={entity.id}
                      className={`entity-card ${selectedEntity?.id === entity.id ? 'selected' : ''}`}
                      onClick={() => setSelectedEntity(entity)}
                    >
                      <div className="entity-name">
                        {activeTab === 'orders' 
                          ? `${entity.poNumber || entity.id.slice(0, 8)}`
                          : entity.name
                        }
                      </div>
                      <div className="entity-details">
                        {activeTab === 'orders' 
                          ? entity.account?.name || 'No customer'
                          : entity.email || 'No email'
                        }
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Panel - Audit Logs */}
            <div className="audit-log-panel">
              {!selectedEntity ? (
                <div className="no-selection">
                  <p>Select {activeTab === 'orders' ? 'an order' : 'a customer'} to view audit history</p>
                </div>
              ) : logsLoading ? (
                <div className="logs-loading">
                  Loading logs...
                </div>
              ) : currentLogs.length === 0 ? (
                <div className="no-logs">
                  <p>No audit logs found for this {activeTab === 'orders' ? 'order' : 'customer'}.</p>
                </div>
              ) : (
                <>
                  <div className="audit-header">
                    <h2>
                      {activeTab === 'orders' 
                        ? `Order: ${selectedEntity.poNumber || selectedEntity.id.slice(0, 8)}`
                        : `Customer: ${selectedEntity.name}`
                      }
                    </h2>
                    {activeTab === 'orders' && selectedEntity.account && (
                      <p style={{ fontSize: '14px', color: '#a0a0a0', margin: '5px 0 0 0' }}>
                        {selectedEntity.account.name}
                      </p>
                    )}
                  </div>
                  {currentLogs.map(log => renderLogEntry(log))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
