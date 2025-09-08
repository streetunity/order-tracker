"use client";

import { useEffect, useState } from "react";

// Store API base URL as a constant
const API_BASE_URL = "http://localhost:4000";

function getAdminKey() {
  return "dev-admin-key";
}

export default function AuditHistoryViewer() {
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [expandedLogs, setExpandedLogs] = useState(new Set());

  async function loadData() {
    try {
      // Load orders
      const ordersRes = await fetch(`${API_BASE_URL}/orders`, {
        headers: { "x-admin-key": getAdminKey() },
        cache: "no-store",
      });
      
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      }

      // Load accounts
      const accountsRes = await fetch(`${API_BASE_URL}/accounts`, {
        headers: { "x-admin-key": getAdminKey() },
        cache: "no-store",
      });
      
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
      }
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs(entityId) {
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/comprehensive-audit/${entityId}`, {
        headers: { "x-admin-key": getAdminKey() },
        cache: "no-store",
      });
      
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedEntity) {
      loadAuditLogs(selectedEntity.id);
    }
  }, [selectedEntity]);

  const toggleLogExpanded = (logId) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionColor = (action) => {
    if (action.includes('CREATED')) return '#10b981';
    if (action.includes('UPDATED')) return '#3b82f6';
    if (action.includes('DELETED')) return '#ef4444';
    if (action.includes('LOCKED')) return '#f59e0b';
    if (action.includes('UNLOCKED')) return '#06b6d4';
    if (action.includes('STAGE')) return '#8b5cf6';
    return '#6b7280';
  };

  const getActionIcon = (action) => {
    if (action.includes('CREATED')) return '✨';
    if (action.includes('UPDATED')) return '📝';
    if (action.includes('DELETED')) return '🗑️';
    if (action.includes('LOCKED')) return '🔒';
    if (action.includes('UNLOCKED')) return '🔓';
    if (action.includes('STAGE')) return '📦';
    if (action.includes('USER')) return '👤';
    if (action.includes('ACCOUNT')) return '🏢';
    if (action.includes('ORDER')) return '📋';
    if (action.includes('ITEM')) return '🔧';
    return '📌';
  };

  const formatFieldValue = (value) => {
    if (value === 'null' || value === null) return <span style={{ color: '#999' }}>empty</span>;
    if (value === 'true' || value === 'false') return <span style={{ color: '#06b6d4' }}>{value}</span>;
    if (value.includes('T00:00:00')) {
      return new Date(value).toLocaleDateString();
    }
    return value;
  };

  // Filter audit logs
  const filteredLogs = filter === 'all' 
    ? auditLogs 
    : auditLogs.filter(log => {
        if (filter === 'field_changes') return log.changes && log.changes.length > 0;
        if (filter === 'stage_changes') return log.action.includes('STAGE');
        if (filter === 'lock_unlock') return log.action.includes('LOCK');
        if (filter === 'creates_deletes') return log.action.includes('CREATED') || log.action.includes('DELETED');
        return true;
      });

  // Styles
  const containerStyle = {
    minHeight: '100vh',
    background: '#0f0f0f',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '20px',
  };

  const headerStyle = {
    marginBottom: '30px',
    borderBottom: '2px solid #333',
    paddingBottom: '15px',
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '350px 1fr',
    gap: '20px',
    height: 'calc(100vh - 120px)',
  };

  const sidebarStyle = {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '15px',
    overflowY: 'auto',
  };

  const entityCardStyle = {
    background: '#262626',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  const selectedEntityCardStyle = {
    ...entityCardStyle,
    background: '#2a3f5f',
    border: '1px solid #3b82f6',
  };

  const detailPanelStyle = {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '20px',
    overflowY: 'auto',
  };

  const logCardStyle = {
    background: '#262626',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '15px',
    marginBottom: '10px',
  };

  const changeItemStyle = {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '10px',
    marginTop: '10px',
  };

  const fieldChangeStyle = {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '10px',
    marginBottom: '8px',
    fontSize: '13px',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', marginTop: '100px', color: '#666' }}>
          Loading audit history...
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '500' }}>
          Complete Audit History
        </h1>
        <p style={{ margin: '5px 0 0 0', color: '#999', fontSize: '14px' }}>
          View all changes to customers, orders, items, and users
        </p>
      </div>

      <div style={gridStyle}>
        {/* Entity List Sidebar */}
        <div style={sidebarStyle}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', color: '#999', marginBottom: '10px' }}>
              🏢 Customers ({accounts.length})
            </h3>
            {accounts.map((account) => (
              <div
                key={account.id}
                style={selectedEntity?.id === account.id ? selectedEntityCardStyle : entityCardStyle}
                onClick={() => {
                  setSelectedEntity(account);
                  setEntityType('account');
                }}
              >
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                  {account.name}
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>
                  {account.email || 'No email'}
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                  Created {formatDate(account.createdAt)}
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 style={{ fontSize: '14px', color: '#999', marginBottom: '10px' }}>
              📋 Orders ({orders.length})
            </h3>
            {orders.map((order) => (
              <div
                key={order.id}
                style={selectedEntity?.id === order.id ? selectedEntityCardStyle : entityCardStyle}
                onClick={() => {
                  setSelectedEntity(order);
                  setEntityType('order');
                }}
              >
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                  {order.account?.name || 'Unknown Customer'}
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  PO: {order.poNumber || 'N/A'}
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                  {order.items?.length || 0} items • {order.currentStage}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div style={detailPanelStyle}>
          {!selectedEntity ? (
            <div style={{ textAlign: 'center', marginTop: '50px', color: '#666' }}>
              Select a customer or order to view its audit history
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>
                  {entityType === 'account' ? '🏢' : '📋'} {entityType === 'account' ? selectedEntity.name : `Order ${selectedEntity.poNumber || selectedEntity.id}`}
                </h2>
                
                {/* Filter Bar */}
                <div style={{ background: '#0f0f0f', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                      background: '#262626',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  >
                    <option value="all">All Changes ({auditLogs.length})</option>
                    <option value="field_changes">Field Changes Only</option>
                    <option value="stage_changes">Stage Changes</option>
                    <option value="lock_unlock">Lock/Unlock Events</option>
                    <option value="creates_deletes">Creates & Deletes</option>
                  </select>
                  <span style={{ marginLeft: '15px', fontSize: '12px', color: '#666' }}>
                    Showing {filteredLogs.length} events
                  </span>
                </div>
              </div>

              {logsLoading ? (
                <div style={{ textAlign: 'center', color: '#666' }}>Loading logs...</div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', marginTop: '50px' }}>
                  No audit logs found for this filter
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} style={logCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>{getActionIcon(log.action)}</span>
                        <div>
                          <div style={{ fontWeight: '500', color: getActionColor(log.action) }}>
                            {log.action.replace(/_/g, ' ')}
                          </div>
                          {log.entity && (
                            <div style={{ fontSize: '11px', color: '#999' }}>
                              {log.entity} {log.entityId !== selectedEntity.id && `(${log.entityId.slice(0, 8)}...)`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {formatDate(log.createdAt)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#999' }}>
                          by {log.performedByName || log.performedBy?.name || 'System'}
                        </div>
                      </div>
                    </div>

                    {/* Field Changes */}
                    {log.changes && log.changes.length > 0 && (
                      <div 
                        style={{ ...changeItemStyle, cursor: 'pointer' }}
                        onClick={() => toggleLogExpanded(log.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#3b82f6' }}>
                            {log.changes.length} field{log.changes.length > 1 ? 's' : ''} changed
                          </span>
                          <span style={{ fontSize: '11px', color: '#666' }}>
                            {expandedLogs.has(log.id) ? '▼' : '▶'} Click to {expandedLogs.has(log.id) ? 'collapse' : 'expand'}
                          </span>
                        </div>
                        
                        {expandedLogs.has(log.id) && (
                          <div>
                            {log.changes.map((change, idx) => (
                              <div key={idx} style={fieldChangeStyle}>
                                <div style={{ color: '#999', fontWeight: '500' }}>
                                  {change.field}:
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ color: '#ef4444' }}>{formatFieldValue(change.oldValue)}</span>
                                  <span style={{ color: '#666' }}>→</span>
                                  <span style={{ color: '#10b981' }}>{formatFieldValue(change.newValue)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Creation/Deletion Data */}
                    {log.data && (
                      <div style={changeItemStyle}>
                        <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: '#10b981' }}>
                          Initial Data:
                        </div>
                        {Object.entries(log.data).map(([key, value]) => (
                          <div key={key} style={{ fontSize: '12px', marginBottom: '4px' }}>
                            <span style={{ color: '#999' }}>{key}:</span>{' '}
                            <span style={{ color: '#fff' }}>{value || 'empty'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Lock/Unlock Reasons */}
                    {log.message && !log.changes && !log.data && (
                      <div style={{ fontSize: '13px', color: '#ccc', marginTop: '10px', padding: '10px', background: '#1a1a1a', borderRadius: '4px' }}>
                        {log.message}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Summary Stats */}
              {!logsLoading && auditLogs.length > 0 && (
                <div style={{ marginTop: '30px', padding: '15px', background: '#0f0f0f', borderRadius: '6px' }}>
                  <h4 style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Audit Summary</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#999' }}>Total Events:</span>
                      <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px' }}>{auditLogs.length}</div>
                    </div>
                    <div>
                      <span style={{ color: '#999' }}>Field Changes:</span>
                      <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px' }}>
                        {auditLogs.filter(l => l.changes && l.changes.length > 0).length}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#999' }}>Last Activity:</span>
                      <div style={{ fontSize: '14px', marginTop: '4px' }}>
                        {auditLogs[0] ? formatDate(auditLogs[0].createdAt) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}