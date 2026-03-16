'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import HistoryFilters from './HistoryFilters';
import HistoryRestoreDialog from './HistoryRestoreDialog';
import {
  TABS,
  ROLE_LABELS,
  formatTimestamp,
  getActionLabel,
  getActionBadgeClass,
  isArchiveAction,
  getItemName,
  getItemHeaderInfo,
  getEntityInfo,
  getFieldLabel,
  formatValue,
  getDateRange
} from './historyHelpers';
import './history.css';

const DEFAULT_PAGINATION = { page: 1, limit: 50, totalCount: 0, totalPages: 0, hasMore: false };

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function AuditHistoryViewer() {
  // State
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  
  // Orders/Customers sidebar state (for legacy tabs)
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityLogs, setEntityLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Restore confirmation modal
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [performingRestore, setPerformingRestore] = useState(false);

  const router = useRouter();
  const { user, getAuthHeaders, isAdmin } = useAuth();

  // Debounced search - for API calls only
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Redirect to login if not authenticated or not admin
  useEffect(() => {
    if (!user) {
      router.push('/login');
    } else if (!isAdmin) {
      router.push('/admin/board');
    }
  }, [user, isAdmin, router]);

  // Load logs from search endpoint - use raw endpoint when searching for better JSON field matching
  const loadLogs = useCallback(async (page = 1, append = false) => {
    if (!user || !isAdmin) return;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const { startDate, endDate } = getDateRange(datePreset, customStartDate, customEndDate);
      const params = new URLSearchParams({
        tab: activeTab,
        page: page.toString(),
        limit: '50'
      });

      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (debouncedSearch) params.append('search', debouncedSearch);

      // Use raw SQL search endpoint when searching for better JSON field matching
      const endpoint = debouncedSearch ? '/api/audit/search-raw' : '/api/audit/search';
      
      const res = await fetch(`${endpoint}?${params.toString()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        if (append) {
          setLogs(prev => [...prev, ...(data.logs || [])]);
        } else {
          setLogs(data.logs || []);
        }
        // Guard: always fall back to defaults if pagination is missing
        setPagination(data.pagination || DEFAULT_PAGINATION);
      }
    } catch (e) {
      console.error('Failed to load logs:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, isAdmin, activeTab, debouncedSearch, datePreset, customStartDate, customEndDate, getAuthHeaders]);

  // Load sidebar data for Orders/Customers tabs
  const loadSidebarData = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      const [ordersRes, accountsRes] = await Promise.all([
        fetch('/api/orders', { headers: getAuthHeaders(), cache: 'no-store' }),
        fetch('/api/accounts', { headers: getAuthHeaders(), cache: 'no-store' })
      ]);

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      }
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
      }
    } catch (e) {
      console.error('Failed to load sidebar data:', e);
    }
  }, [user, isAdmin, getAuthHeaders]);

  // Load logs for selected entity (legacy)
  const loadEntityLogs = useCallback(async (entityId) => {
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
  }, [user, isAdmin, getAuthHeaders]);

  // Initial load
  useEffect(() => {
    if (user && isAdmin) {
      loadLogs(1);
      loadSidebarData();
    }
  }, [user, isAdmin]);

  // Reload when tab, search, or date changes
  useEffect(() => {
    if (user && isAdmin) {
      setSelectedEntity(null);
      loadLogs(1);
    }
  }, [activeTab, debouncedSearch, datePreset, customStartDate, customEndDate]);

  // Load entity logs when entity selected
  useEffect(() => {
    if (selectedEntity && user && isAdmin) {
      loadEntityLogs(selectedEntity.id);
    }
  }, [selectedEntity, user, isAdmin, loadEntityLogs]);

  // Handle load more
  const handleLoadMore = () => {
    if (pagination.hasMore && !loadingMore) {
      loadLogs(pagination.page + 1, true);
    }
  };

  // Restore handlers
  function handleRestoreClick(log) {
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    if (!archiveChange || archiveChange.newValue === 'null' || log.entityType !== 'OrderItem') {
      return;
    }
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
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: null })
      });

      if (res.ok) {
        loadLogs(1);
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

  // Render helper functions (use imported helpers)
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
    const entityInfo = getEntityInfo(log, orders, accounts);
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

        {/* Entity info section - title, subtitle, and details */}
        {(entityInfo.title || entityInfo.subtitle || entityInfo.details.length > 0) && (
          <div className="log-entity-info">
            {entityInfo.title && <div className="entity-info-title">{entityInfo.title}</div>}
            {entityInfo.subtitle && <div className="entity-info-subtitle">{entityInfo.subtitle}</div>}
            {entityInfo.details.length > 0 && (
              <div className="entity-info-details">
                {entityInfo.details.map((detail, idx) => (
                  <span key={idx} className="entity-detail-item">{detail}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {renderChanges(log.changes)}

        {log.metadata?.message && (
          <div className="log-metadata">{log.metadata.message}</div>
        )}

        {showRestore && (
          <div className="log-actions">
            <button className="btn-restore" onClick={() => handleRestoreClick(log)}>
              🔄 Restore Item
            </button>
          </div>
        )}
      </div>
    );
  }

  // Filter and sort sidebar entities alphabetically
  const filteredAccounts = accounts
    .filter(acc =>
      acc.name?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      acc.email?.toLowerCase().includes(sidebarSearch.toLowerCase())
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const filteredOrders = orders
    .filter(order =>
      order.poNumber?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      order.account?.name?.toLowerCase().includes(sidebarSearch.toLowerCase())
    )
    .sort((a, b) => (a.account?.name || '').localeCompare(b.account?.name || '', undefined, { sensitivity: 'base' }));

  // Don't render until authentication is checked
  if (!user || !isAdmin) {
    return null;
  }

  if (loading && logs.length === 0) {
    return (
      <div className="history-loading">
        <div>Loading audit history...</div>
      </div>
    );
  }

  // Determine if we should show the sidebar view or unified search results view
  const isSearchActive = searchQuery && searchQuery.trim().length > 0;
  const showSidebarView = (activeTab === 'orders' || activeTab === 'customers') && !isSearchActive;

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

          {/* Tabs */}
          <div className="history-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.id); setSelectedEntity(null); }}
                style={{ '--tab-color': tab.color }}
              >
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <HistoryFilters
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            datePreset={datePreset}
            setDatePreset={setDatePreset}
            customStartDate={customStartDate}
            setCustomStartDate={setCustomStartDate}
            customEndDate={customEndDate}
            setCustomEndDate={setCustomEndDate}
            totalCount={pagination.totalCount}
          />

          {/* Main Content */}
          {showSidebarView ? (
            // Legacy sidebar view for Orders/Customers (when no search active)
            <div className="history-grid">
              <div className="entity-list-sidebar">
                <div className="entity-search">
                  <input
                    type="text"
                    placeholder={`Filter ${activeTab}...`}
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                </div>
                <div className="entity-list">
                  {(activeTab === 'orders' ? filteredOrders : filteredAccounts).length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a0a0a0', padding: '20px' }}>
                      No {activeTab} found
                    </div>
                  ) : (
                    (activeTab === 'orders' ? filteredOrders : filteredAccounts).map(entity => (
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

              <div className="audit-log-panel">
                {!selectedEntity ? (
                  <div className="no-selection">
                    <p>Select {activeTab === 'orders' ? 'an order' : 'a customer'} to view audit history</p>
                    <p style={{ marginTop: '1rem', color: '#666', fontSize: '14px' }}>
                      Or use the search bar above to search all {activeTab} logs
                    </p>
                  </div>
                ) : logsLoading ? (
                  <div className="logs-loading">Loading logs...</div>
                ) : entityLogs.length === 0 ? (
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
                    {entityLogs.map(log => renderLogEntry(log))}
                  </>
                )}
              </div>
            </div>
          ) : (
            // Unified log view - for search results or non-sidebar tabs
            <div className="logs-container">
              {loading ? (
                <div className="logs-loading">Loading logs...</div>
              ) : logs.length === 0 ? (
                <div className="no-logs">
                  <p>No audit logs found.</p>
                  {searchQuery && <p style={{ marginTop: '0.5rem', color: '#666' }}>Try adjusting your search or date filters.</p>}
                </div>
              ) : (
                <>
                  {logs.map(log => renderLogEntry(log))}
                  
                  {/* Load More Button */}
                  {pagination.hasMore && (
                    <div className="load-more-container">
                      <button
                        className="btn-load-more"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? 'Loading...' : `Load More (${pagination.totalCount - logs.length} remaining)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <HistoryRestoreDialog
        show={showRestoreConfirm}
        pendingRestore={pendingRestore}
        performingRestore={performingRestore}
        onCancel={cancelRestore}
        onConfirm={executeRestore}
      />
    </>
  );
}
