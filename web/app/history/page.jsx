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
  
  // Restore confirmation modal
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [performingRestore, setPerformingRestore] = useState(false);
  
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

  function handleRestoreClick(log) {
    // Check if this is an archive action for an OrderItem
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    if (!archiveChange || archiveChange.newValue === 'null' || log.entityType !== 'OrderItem') {
      return;
    }

    // Get item details
    const itemName = getItemName(log);
    
    setPendingRestore({
      log,
      itemId: log.entityId,
      orderId: log.parentEntityId,
      itemName
    });
    setShowRestoreConfirm(true);
  }

  async function executeRestore() {
    if (!pendingRestore) return;

    try {
      setPerformingRestore(true);
      
      const res = await fetch(`/api/orders/${pendingRestore.orderId}/items/${pendingRestore.itemId}`, {
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
        // Reload the appropriate logs
        if (activeTab === 'universal') {
          await loadUniversalChanges();
        } else if (selectedEntity) {
          await loadEntityLogs(selectedEntity.id);
        }
        setShowRestoreConfirm(false);
        setPendingRestore(null);
      } else {
        const error = await res.json();
        alert(`Failed to restore: ${error.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Restore error:', e);
      alert('Failed to restore item');
    } finally {
      setPerformingRestore(false);
    }
  }

  function cancelRestore() {
    setShowRestoreConfirm(false);
    setPendingRestore(null);
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

  function getItemName(log) {
    // PRIORITY 1: Check if backend provided orderItem data
    if (log.orderItem?.productCode) {
      return log.orderItem.productCode;
    }
    
    // PRIORITY 2: Try to get from changes
    if (log.changes) {
      const productCodeChange = log.changes.find(c => c.field === 'productCode');
      if (productCodeChange) {
        return productCodeChange.newValue || productCodeChange.oldValue;
      }
    }
    
    // PRIORITY 3: Try to get from metadata
    if (log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0) {
      return log.metadata.items[0].productCode;
    }
    
    return null;
  }

  function getItemHeaderInfo(log) {
    // Only for OrderItem logs
    if (log.entityType !== 'OrderItem') return null;
    
    let productCode = null;
    let modelNumber = null;
    
    // PRIORITY 1: Check if backend provided orderItem data (THIS IS THE KEY FIX!)
    if (log.orderItem) {
      productCode = log.orderItem.productCode || null;
      modelNumber = log.orderItem.modelNumber || null;
    }
    
    // PRIORITY 2: Try to get from changes (fallback if orderItem not provided)
    if (!productCode && log.changes) {
      const productCodeChange = log.changes.find(c => c.field === 'productCode');
      const modelNumberChange = log.changes.find(c => c.field === 'modelNumber');
      
      if (productCodeChange) {
        productCode = productCodeChange.newValue || productCodeChange.oldValue;
      }
      if (modelNumberChange) {
        modelNumber = modelNumberChange.newValue || modelNumberChange.oldValue;
      }
    }
    
    // PRIORITY 3: Try metadata if other sources didn't have it (last resort)
    if (!productCode && log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0) {
      const item = log.metadata.items[0];
      productCode = item.productCode;
      modelNumber = item.modelNumber;
    }
    
    // Format the display
    if (productCode && modelNumber && modelNumber !== 'null' && modelNumber !== '') {
      return `${productCode} • Model: ${modelNumber}`;
    } else if (productCode) {
      return productCode;
    }
    
    return null;
  }

  function getEntityInfo(log) {
    const info = {
      title: '',
      subtitle: ''
    };
    
    // For Order logs
    if (log.entityType === 'Order' && !log.parentEntityId) {
      const order = orders.find(o => o.id === log.entityId);
      if (order) {
        info.title = order.account?.name || 'Unknown Customer';
        info.subtitle = order.sku || '';  // Sales rep in red
      }
    }
    
    // For Account logs
    if (log.entityType === 'Account') {
      const account = accounts.find(a => a.id === log.entityId);
      if (account) {
        info.title = account.name;
        // Try to find sales rep from orders
        const accountOrders = orders.filter(o => o.accountId === account.id);
        if (accountOrders.length > 0 && accountOrders[0].sku) {
          info.subtitle = accountOrders[0].sku;
        }
      }
    }
    
    // For OrderItem logs - show customer and sales rep
    if (log.entityType === 'OrderItem') {
      if (log.parentEntityId) {
        const order = orders.find(o => o.id === log.parentEntityId);
        if (order) {
          info.title = order.account?.name || 'Unknown Customer';
          info.subtitle = order.sku || '';
        }
      }
    }
    
    return info;
  }

  function getFieldLabel(field) {
    const labels = {
      // Order fields
      'poNumber': 'PO Number',
      'sku': 'Sales Person',
      'customerDocsLink': 'Customer Documents Link',
      'orderDate': 'Order Date',
      'discount': 'Discount',
      'etaDate': 'ETA Date',
      'shippingCarrier': 'Shipping Carrier',
      'trackingNumber': 'Tracking Number',
      'currentStage': 'Current Stage',
      'isLocked': 'Lock Status',
      'internalNotes': 'Internal Notes',
      
      // OrderItem fields
      'productCode': 'Item Name',
      'qty': 'Quantity',
      'serialNumber': 'Serial Number',
      'modelNumber': 'Model Number',
      'voltage': 'Voltage',
      'laserWattage': 'Power',
      'notes': 'Notes',
      'itemPrice': 'Price',
      'privateItemNote': 'Private Item Note',
      'hasExtendedShipping': 'Extended Shipping',
      'isOrdered': 'Ordered Status',
      'archivedAt': 'Archive Status',
      'height': 'Height',
      'width': 'Width',
      'length': 'Length',
      'weight': 'Weight',
      'units': 'Units',
      
      // Account fields
      'name': 'Name',
      'email': 'Email',
      'phone': 'Phone',
      'address': 'Address',
      'commissionPercentage': 'Commission %'
    };
    
    return labels[field] || field;
  }
  
  function formatValue(value) {
    if (value === null || value === 'null') return '(empty)';
    if (value === true || value === 'true') return 'Yes';
    if (value === false || value === 'false') return 'No';
    if (value === '') return '(blank)';
    return value;
  }

  function renderChanges(changes) {
    if (!changes || changes.length === 0) return null;
    
    return (
      <div className="log-changes">
        {changes.map((change, idx) => (
          <div key={idx} className="change-item">
            <span className="change-field">{getFieldLabel(change.field)}:</span>
            <span className="change-old">{formatValue(change.oldValue)}</span>
            <span className="change-arrow">→</span>
            <span className="change-new">{formatValue(change.newValue)}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderLogEntry(log) {
    const showRestore = isArchiveAction(log);
    const entityInfo = getEntityInfo(log);
    const itemHeaderInfo = getItemHeaderInfo(log);
    
    return (
      <div key={log.id} className="log-entry">
        <div className="log-header">
          <div className="log-meta">
            <span className={`log-badge ${getActionBadgeClass(log.action)}`}>
              {getActionLabel(log.action)}
            </span>
            {itemHeaderInfo && (
              <span className="log-item-info">{itemHeaderInfo}</span>
            )}
            <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
          </div>
          <div className="log-user">
            {log.performedByName || 'System'}
          </div>
        </div>
        
        {(entityInfo.title || entityInfo.subtitle) && (
          <div className="log-entity-info">
            {entityInfo.title && <div className="entity-info-title">{entityInfo.title}</div>}
            {entityInfo.subtitle && <div className="entity-info-subtitle">{entityInfo.subtitle}</div>}
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
              onClick={() => handleRestoreClick(log)}
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

        {/* Restore Confirmation Dialog */}
        {showRestoreConfirm && pendingRestore && (
          <div className="confirm-overlay" onClick={cancelRestore}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>📦 Restore Item?</h3>
              <p style={{ fontSize: '16px', marginBottom: '1rem' }}>
                You are about to restore <strong>"{pendingRestore.itemName}"</strong>.
              </p>
              <div style={{ 
                padding: '1rem', 
                backgroundColor: 'rgba(255, 170, 0, 0.1)', 
                border: '1px solid rgba(255, 170, 0, 0.3)',
                borderRadius: '6px',
                marginBottom: '1rem'
              }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '14px' }}>
                  <strong>What will happen:</strong>
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '14px' }}>
                  <li>The item will reappear on the board and kiosk view</li>
                  <li>All item data will be preserved</li>
                  <li>The item will continue through the production stages</li>
                </ul>
              </div>
              <div className="confirm-actions">
                <button 
                  onClick={cancelRestore} 
                  className="btn-cancel"
                  disabled={performingRestore}
                >
                  Cancel
                </button>
                <button 
                  onClick={executeRestore} 
                  disabled={performingRestore}
                  className="btn-confirm"
                >
                  {performingRestore ? 'Restoring...' : 'Yes, Restore Item'}
                </button>
              </div>
            </div>
          </div>
        )}
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
                          ? entity.account?.name || 'Unknown Customer'
                          : entity.name
                        }
                      </div>
                      <div className="entity-details">
                        {activeTab === 'orders' 
                          ? entity.sku || 'No sales rep'
                          : (() => {
                              // Find sales rep for customer
                              const customerOrders = orders.filter(o => o.accountId === entity.id);
                              return customerOrders.length > 0 && customerOrders[0].sku 
                                ? customerOrders[0].sku 
                                : 'No sales rep';
                            })()
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
                        ? selectedEntity.account?.name || 'Unknown Customer'
                        : selectedEntity.name
                      }
                    </h2>
                    <p style={{ fontSize: '14px', color: '#ef4444', margin: '5px 0 0 0', fontWeight: '500' }}>
                      {activeTab === 'orders' && selectedEntity.sku 
                        ? selectedEntity.sku
                        : activeTab === 'customers' && (() => {
                            const customerOrders = orders.filter(o => o.accountId === selectedEntity.id);
                            return customerOrders.length > 0 && customerOrders[0].sku ? customerOrders[0].sku : '';
                          })()
                      }
                    </p>
                  </div>
                  {currentLogs.map(log => renderLogEntry(log))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Dialog */}
      {showRestoreConfirm && pendingRestore && (
        <div className="confirm-overlay" onClick={cancelRestore}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>📦 Restore Item?</h3>
            <p style={{ fontSize: '16px', marginBottom: '1rem' }}>
              You are about to restore <strong>"{pendingRestore.itemName}"</strong>.
            </p>
            <div style={{ 
              padding: '1rem', 
              backgroundColor: 'rgba(255, 170, 0, 0.1)', 
              border: '1px solid rgba(255, 170, 0, 0.3)',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '14px' }}>
                <strong>What will happen:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '14px' }}>
                <li>The item will reappear on the board and kiosk view</li>
                <li>All item data will be preserved</li>
                <li>The item will continue through the production stages</li>
              </ul>
            </div>
            <div className="confirm-actions">
              <button 
                onClick={cancelRestore} 
                className="btn-cancel"
                disabled={performingRestore}
              >
                Cancel
              </button>
              <button 
                onClick={executeRestore} 
                disabled={performingRestore}
                className="btn-confirm"
              >
                {performingRestore ? 'Restoring...' : 'Yes, Restore Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
