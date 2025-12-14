'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import './history.css';

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Tab configuration
const TABS = [
  { id: 'recent', label: 'Recent', icon: '🕐', color: '#6b7280' },
  { id: 'orders', label: 'Orders', icon: '📦', color: '#3b82f6' },
  { id: 'customers', label: 'Customers', icon: '👥', color: '#22c55e' },
  { id: 'users', label: 'Users', icon: '👤', color: '#a855f7' },
  { id: 'commissions', label: 'Commissions', icon: '💰', color: '#eab308' },
  { id: 'documents', label: 'Documents', icon: '📄', color: '#ef4444' },
];

// Date preset options
const DATE_PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
];

// Role display names
const ROLE_LABELS = {
  'SUPER_ADMIN': 'Super Admin',
  'ACCOUNTANT': 'Accountant',
  'ADMIN': 'Admin',
  'AGENT': 'Agent',
  'BROKER': 'Broker',
  'MANUFACTURER': 'Manufacturer'
};

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
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
    hasMore: false
  });
  
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

  // Calculate date range based on preset
  const getDateRange = useCallback(() => {
    const now = new Date();
    let startDate = null;
    let endDate = null;

    switch (datePreset) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        break;
      case '7days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'custom':
        if (customStartDate) startDate = new Date(customStartDate);
        if (customEndDate) endDate = new Date(customEndDate);
        break;
      default:
        // 'all' - no date filter
        break;
    }

    return {
      startDate: startDate ? startDate.toISOString().split('T')[0] : null,
      endDate: endDate ? endDate.toISOString().split('T')[0] : null
    };
  }, [datePreset, customStartDate, customEndDate]);

  // Load logs from search endpoint - use raw endpoint when searching for better JSON field matching
  const loadLogs = useCallback(async (page = 1, append = false) => {
    if (!user || !isAdmin) return;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const { startDate, endDate } = getDateRange();
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
          setLogs(prev => [...prev, ...data.logs]);
        } else {
          setLogs(data.logs);
        }
        setPagination(data.pagination);
      }
    } catch (e) {
      console.error('Failed to load logs:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, isAdmin, activeTab, debouncedSearch, getDateRange, getAuthHeaders]);

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

  // Helper functions
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
      'INTERNAL_NOTES_UPDATED': 'Internal Notes Updated',
      // User actions
      'USER_CREATED': 'User Created',
      'USER_UPDATED': 'User Updated',
      'USER_ROLE_CHANGED': 'Role Changed',
      'USER_DEACTIVATED': 'User Deactivated',
      'USER_ACTIVATED': 'User Activated',
      // Commission actions
      'APPROVED': 'Payout Approved',
      'UNAPPROVED': 'Payout Unapproved',
      'REJECTED': 'Payout Denied',
      'PAID': 'Payout Paid',
      'UNPAID': 'Payout Unpaid',
      'BULK_APPROVED': 'Bulk Approved',
      'BULK_PAID': 'Bulk Paid',
      'COMMISSION_APPROVED': 'Commission Approved',
      'COMMISSION_DENIED': 'Commission Denied',
      'COMMISSION_RECALCULATED': 'Commission Recalculated',
      'COMMISSION_RATE_CHANGED': 'Rate Changed',
      'PAYOUT_APPROVED': 'Payout Approved',
      'PAYOUT_DENIED': 'Payout Denied',
      'PAYOUT_PAID': 'Payout Paid',
      // Document actions
      'DOCUMENT_UPLOADED': 'Document Uploaded',
      'DOCUMENT_DELETED': 'Document Deleted',
    };
    return labels[action] || action;
  }

  function getActionBadgeClass(action) {
    if (action.includes('CREATED') || action.includes('UPLOADED')) return 'badge-created';
    if (action.includes('UPDATED') || action.includes('CHANGED')) return 'badge-updated';
    if (action.includes('DELETED')) return 'badge-deleted';
    if (action.includes('LOCKED') || action.includes('BLOCKED') || action.includes('DENIED') || action.includes('REJECTED')) return 'badge-locked';
    if (action.includes('UNLOCKED') || action.includes('ACTIVATED') || action.includes('UNAPPROVED') || action.includes('UNPAID')) return 'badge-unlocked';
    if (action.includes('ORDERED') || action.includes('APPROVED') || action.includes('PAID')) return 'badge-ordered';
    return 'badge-default';
  }

  function isArchiveAction(log) {
    if (log.entityType !== 'OrderItem') return false;
    const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
    return archiveChange && archiveChange.oldValue === 'null' && archiveChange.newValue !== 'null';
  }

  function getItemName(log) {
    if (log.orderItem?.productCode) return log.orderItem.productCode;
    if (log.changes) {
      const productCodeChange = log.changes.find(c => c.field === 'productCode');
      if (productCodeChange) return productCodeChange.newValue || productCodeChange.oldValue;
    }
    if (log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0) {
      return log.metadata.items[0].productCode;
    }
    return null;
  }

  function getItemHeaderInfo(log) {
    if (log.entityType !== 'OrderItem') return null;
    let productCode = null;
    let modelNumber = null;

    if (log.orderItem) {
      productCode = log.orderItem.productCode || null;
      modelNumber = log.orderItem.modelNumber || null;
    }

    if (!productCode && log.changes) {
      const productCodeChange = log.changes.find(c => c.field === 'productCode');
      const modelNumberChange = log.changes.find(c => c.field === 'modelNumber');
      if (productCodeChange) productCode = productCodeChange.newValue || productCodeChange.oldValue;
      if (modelNumberChange) modelNumber = modelNumberChange.newValue || modelNumberChange.oldValue;
    }

    if (!productCode && log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0) {
      const item = log.metadata.items[0];
      productCode = item.productCode;
      modelNumber = item.modelNumber;
    }

    if (productCode && modelNumber && modelNumber !== 'null' && modelNumber !== '') {
      return `${productCode} • Model: ${modelNumber}`;
    } else if (productCode) {
      return productCode;
    }
    return null;
  }

  // Get entity info for display - enhanced for users and commissions
  function getEntityInfo(log) {
    const info = { title: '', subtitle: '', details: [] };

    // Order entity
    if (log.entityType === 'Order' && !log.parentEntityId) {
      const order = orders.find(o => o.id === log.entityId);
      if (order) {
        info.title = order.account?.name || 'Unknown Customer';
        info.subtitle = order.sku || '';
      }
    }

    // Container entity - try to find related order
    if (log.entityType === 'Container') {
      // Check metadata for order info
      if (log.metadata?.orderName) {
        info.title = log.metadata.orderName;
      }
      if (log.metadata?.salesPerson) {
        info.subtitle = log.metadata.salesPerson;
      }
      // If we have parentEntityId, try to find the order
      if (log.parentEntityId) {
        const order = orders.find(o => o.id === log.parentEntityId);
        if (order) {
          info.title = order.account?.name || info.title || 'Unknown Customer';
          info.subtitle = order.sku || info.subtitle || '';
        }
      }
    }

    // Account entity
    if (log.entityType === 'Account') {
      const account = accounts.find(a => a.id === log.entityId);
      if (account) {
        info.title = account.name;
        const accountOrders = orders.filter(o => o.accountId === account.id);
        if (accountOrders.length > 0 && accountOrders[0].sku) {
          info.subtitle = accountOrders[0].sku;
        }
      }
    }

    // OrderItem entity
    if (log.entityType === 'OrderItem') {
      if (log.parentEntityId) {
        const order = orders.find(o => o.id === log.parentEntityId);
        if (order) {
          info.title = order.account?.name || 'Unknown Customer';
          info.subtitle = order.sku || '';
        }
      }
    }

    // User entity - show username and role
    if (log.entityType === 'User') {
      // Try to get from metadata first (new format)
      if (log.metadata?.userName) {
        info.title = log.metadata.userName;
        const role = log.metadata.userRole;
        info.subtitle = role ? (ROLE_LABELS[role] || role) : '';
      } else if (log.metadata?.data) {
        // Legacy format
        info.title = log.metadata.data.name || log.metadata.data.email || 'Unknown User';
        const role = log.metadata.data.role;
        info.subtitle = role ? (ROLE_LABELS[role] || role) : '';
      }
      // Also check changes for role info
      if (log.changes && log.changes.length > 0) {
        const nameChange = log.changes.find(c => c.field === 'name');
        const roleChange = log.changes.find(c => c.field === 'role');
        if (nameChange && !info.title) {
          info.title = nameChange.newValue || nameChange.oldValue;
        }
        if (roleChange) {
          const oldRole = ROLE_LABELS[roleChange.oldValue] || roleChange.oldValue;
          const newRole = ROLE_LABELS[roleChange.newValue] || roleChange.newValue;
          info.details.push(`Role: ${oldRole} → ${newRole}`);
        }
      }
    }

    // Commission/CommissionPayout entity - show order, phase, amount, agent
    if (log.entityType === 'Commission' || log.entityType === 'CommissionPayout' || log.entityType === 'ItemCommission') {
      const meta = log.metadata || {};
      
      // Build title from sales person / agent
      if (meta.salesPersonName || meta.salesPerson) {
        info.title = meta.salesPersonName || meta.salesPerson;
      }
      
      // Build subtitle from order info
      const orderInfo = [];
      if (meta.orderPO) orderInfo.push(meta.orderPO);
      if (meta.customerName) orderInfo.push(meta.customerName);
      if (meta.itemName) orderInfo.push(meta.itemName);
      if (orderInfo.length > 0) {
        info.subtitle = orderInfo.join(' • ');
      }
      
      // Build details array for phase and amount
      if (meta.stage) {
        const stageLabel = meta.stage === 'SHIPPING' ? 'P1 (Shipping)' : 
                          meta.stage === 'DELIVERED' ? 'P2 (Delivered)' : meta.stage;
        info.details.push(`Phase: ${stageLabel}`);
      }
      if (meta.amount !== undefined && meta.amount !== null) {
        info.details.push(`Amount: $${parseFloat(meta.amount).toFixed(2)}`);
      }
      if (meta.rejectionReason) {
        info.details.push(`Reason: ${meta.rejectionReason}`);
      }
      if (meta.paymentMethod) {
        info.details.push(`Method: ${meta.paymentMethod}`);
      }
    }

    // Document entities
    if (log.entityType?.includes('Document') && log.metadata) {
      info.title = log.metadata.fileName || '';
      const docTypeLabel = log.metadata.documentTypeLabel || log.metadata.documentType || '';
      if (docTypeLabel) {
        info.subtitle = docTypeLabel;
      }
      if (log.metadata.productCode) {
        info.details.push(`Item: ${log.metadata.productCode}`);
      }
      if (log.metadata.orderPO) {
        info.details.push(`Order: ${log.metadata.orderPO}`);
      }
    }

    return info;
  }

  function getFieldLabel(field) {
    const labels = {
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
      'name': 'Name',
      'email': 'Email',
      'phone': 'Phone',
      'address': 'Address',
      'role': 'Role',
      'isActive': 'Active Status',
      'rate': 'Commission Rate',
      'status': 'Status',
      'amount': 'Amount',
      'showInSalesRepDropdown': 'Show in Sales Rep Dropdown',
      'password': 'Password',
    };
    return labels[field] || field;
  }

  function formatValue(value) {
    if (value === null || value === 'null') return '(empty)';
    if (value === true || value === 'true') return 'Yes';
    if (value === false || value === 'false') return 'No';
    if (value === '') return '(blank)';
    if (value === '[hidden]' || value === '[changed]') return value;
    // Check if it's a role value
    if (ROLE_LABELS[value]) return ROLE_LABELS[value];
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

  // Filter sidebar entities
  const filteredAccounts = accounts.filter(acc =>
    acc.name?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
    acc.email?.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  const filteredOrders = orders.filter(order =>
    order.poNumber?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
    order.account?.name?.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

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
  // Use searchQuery directly (not debounced) so UI switches immediately when typing
  // Show unified view when: search is active OR not on orders/customers tab
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

          {/* Filters Bar */}
          <div className="filters-bar">
            {/* Search */}
            <div className="filter-search">
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>

            {/* Date Preset */}
            <div className="filter-date">
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
              >
                {DATE_PRESETS.map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </div>

            {/* Custom Date Range */}
            {datePreset === 'custom' && (
              <div className="filter-custom-dates">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  placeholder="Start Date"
                />
                <span>to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  placeholder="End Date"
                />
              </div>
            )}

            {/* Results Count */}
            <div className="filter-results">
              {pagination.totalCount} {pagination.totalCount === 1 ? 'result' : 'results'}
            </div>
          </div>

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
              <button onClick={cancelRestore} className="btn-cancel" disabled={performingRestore}>
                Cancel
              </button>
              <button onClick={executeRestore} disabled={performingRestore} className="btn-confirm">
                {performingRestore ? 'Restoring...' : 'Yes, Restore Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
