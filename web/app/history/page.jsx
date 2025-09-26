"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function AuditHistoryViewer() {
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  
  // New state for enhanced features
  const [activeTab, setActiveTab] = useState('customers'); // 'customers', 'orders', 'users'
  const [searchQuery, setSearchQuery] = useState('');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [uniqueUsers, setUniqueUsers] = useState([]);
  
  const router = useRouter();
  const { user, getAuthHeaders, isAdmin } = useAuth();

  // Redirect to login if not authenticated or not admin
  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (!isAdmin) {
      router.push("/admin/board");
    }
  }, [user, isAdmin, router]);

  async function loadData() {
    if (!user || !isAdmin) return;
    
    try {
      // Load orders using proper API endpoints
      const ordersRes = await fetch("/api/orders", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      }

      // Load accounts
      const accountsRes = await fetch("/api/accounts", {
        headers: getAuthHeaders(),
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
    if (!user || !isAdmin) return;
    
    setLogsLoading(true);
    setCurrentPage(1);
    try {
      // Use the API endpoint for audit logs
      const res = await fetch(`/api/audit/${entityId}`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
        
        // Extract unique users for filter
        const users = new Set();
        data.forEach(log => {
          if (log.performedByName) users.add(log.performedByName);
          else if (log.performedBy?.name) users.add(log.performedBy.name);
        });
        setUniqueUsers(Array.from(users));
      }
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (user && isAdmin) {
      loadData();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (selectedEntity && user && isAdmin) {
      loadAuditLogs(selectedEntity.id);
    }
  }, [selectedEntity, user, isAdmin]);

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
    if (action.includes('CREATED')) return '➕';
    if (action.includes('UPDATED')) return '✏️';
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
    if (value === 'null' || value === null) return <span style={{ color: '#a0a0a0' }}>empty</span>;
    if (value === 'true' || value === 'false') return <span style={{ color: '#06b6d4' }}>{value}</span>;
    if (typeof value === 'string' && value.includes('T00:00:00')) {
      return new Date(value).toLocaleDateString();
    }
    return value;
  };

  // Filter entities based on search
  const filteredAccounts = accounts.filter(acc => 
    acc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOrders = orders.filter(order => 
    order.poNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.account?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get current entities based on active tab
  const getCurrentEntities = () => {
    if (activeTab === 'customers') return filteredAccounts;
    if (activeTab === 'orders') return filteredOrders;
    return [];
  };

  // Filter audit logs
  const filteredLogs = auditLogs.filter(log => {
    // Action filter
    if (actionFilter !== 'all') {
      if (actionFilter === 'creates' && !log.action.includes('CREATED')) return false;
      if (actionFilter === 'updates' && !log.action.includes('UPDATED')) return false;
      if (actionFilter === 'deletes' && !log.action.includes('DELETED')) return false;
      if (actionFilter === 'stage' && !log.action.includes('STAGE')) return false;
    }

    // User filter
    if (userFilter !== 'all') {
      const userName = log.performedByName || log.performedBy?.name || 'System';
      if (userName !== userFilter) return false;
    }

    // Date range filter
    if (dateRange.start) {
      const logDate = new Date(log.createdAt);
      const startDate = new Date(dateRange.start);
      if (logDate < startDate) return false;
    }
    if (dateRange.end) {
      const logDate = new Date(log.createdAt);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59);
      if (logDate > endDate) return false;
    }

    // Search in log content
    if (logSearchQuery) {
      const searchLower = logSearchQuery.toLowerCase();
      const actionMatch = log.action.toLowerCase().includes(searchLower);
      const userMatch = (log.performedByName || log.performedBy?.name || '').toLowerCase().includes(searchLower);
      const changesMatch = log.changes?.some(change => 
        change.field.toLowerCase().includes(searchLower) ||
        String(change.oldValue).toLowerCase().includes(searchLower) ||
        String(change.newValue).toLowerCase().includes(searchLower)
      );
      const messageMatch = log.message?.toLowerCase().includes(searchLower);
      const dataMatch = log.data?.unlockReason?.toLowerCase().includes(searchLower);
      const metadataMatch = (() => {
        if (log.metadata) {
          try {
            const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
            return metadata.message?.toLowerCase().includes(searchLower);
          } catch {
            return false;
          }
        }
        return false;
      })();
      
      if (!actionMatch && !userMatch && !changesMatch && !messageMatch && !dataMatch && !metadataMatch) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Export function
  const exportToCSV = () => {
    const headers = ['Date', 'Action', 'Entity', 'User', 'Changes', 'Unlock Reason'];
    const rows = filteredLogs.map(log => {
      let unlockReason = '';
      if (log.metadata) {
        try {
          const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
          unlockReason = metadata.message || '';
        } catch {}
      }
      if (!unlockReason && log.data?.unlockReason) {
        unlockReason = log.data.unlockReason;
      }
      
      return [
        formatDate(log.createdAt),
        log.action,
        log.entity || '',
        log.performedByName || log.performedBy?.name || 'System',
        log.changes?.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`).join('; ') || '',
        unlockReason
      ];
    });
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Don't render until authentication is checked
  if (!user || !isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#e4e4e4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#a0a0a0' }}>Loading audit history...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      color: '#e4e4e4',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ margin: 0, marginBottom: 12, fontSize: '28px', fontWeight: '600', color: '#e4e4e4' }}>
            Audit History
          </h1>
          <div style={{ marginBottom: 12, display: 'flex', gap: '8px' }}>
            <button
              onClick={() => router.push('/admin/board')}
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: '#383838',
                color: '#e4e4e4',
                border: '1px solid #404040',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Back to Board
            </button>
            <button
              onClick={() => router.push('/admin/customers')}
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: '#383838',
                color: '#e4e4e4',
                border: '1px solid #404040',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Manage Customers
            </button>
            <button
              onClick={() => router.push('/admin/orders')}
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: '#383838',
                color: '#e4e4e4',
                border: '1px solid #404040',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Manage Orders
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px', minHeight: 'calc(100vh - 160px)' }}>
          {/* Left Sidebar */}
          <div style={{
            backgroundColor: '#2d2d2d',
            border: '1px solid #404040',
            borderRadius: '8px',
            padding: '20px',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 160px)'
          }}>
            {/* Tabs */}
            <div style={{ 
              display: 'flex', 
              gap: '10px', 
              marginBottom: '20px',
              borderBottom: '1px solid #404040',
              paddingBottom: '10px'
            }}>
              <button
                onClick={() => setActiveTab('customers')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: activeTab === 'customers' ? '#ef4444' : 'transparent',
                  color: activeTab === 'customers' ? '#fff' : '#a0a0a0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Customers ({accounts.length})
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: activeTab === 'orders' ? '#ef4444' : 'transparent',
                  color: activeTab === 'orders' ? '#fff' : '#a0a0a0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Orders ({orders.length})
              </button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '15px' }}>
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#383838',
                  border: '1px solid #404040',
                  borderRadius: '4px',
                  color: '#e4e4e4',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Entity List */}
            <div style={{ overflowY: 'auto' }}>
              {getCurrentEntities().map((entity) => {
                const isCustomer = activeTab === 'customers';
                return (
                  <div
                    key={entity.id}
                    onClick={() => {
                      setSelectedEntity(entity);
                      setEntityType(isCustomer ? 'account' : 'order');
                    }}
                    style={{
                      backgroundColor: selectedEntity?.id === entity.id ? '#383838' : '#2d2d2d',
                      border: selectedEntity?.id === entity.id ? '1px solid #ef4444' : '1px solid #404040',
                      borderRadius: '6px',
                      padding: '12px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: '500', marginBottom: '4px', color: '#e4e4e4' }}>
                      {isCustomer ? entity.name : (entity.account?.name || 'Unknown Customer')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#a0a0a0' }}>
                      {isCustomer ? (entity.email || 'No email') : `PO: ${entity.poNumber || 'N/A'}`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      {isCustomer 
                        ? `Created ${formatDate(entity.createdAt)}`
                        : `${entity.items?.length || 0} items • ${entity.currentStage}`
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel - Audit Logs */}
          <div style={{
            backgroundColor: '#2d2d2d',
            border: '1px solid #404040',
            borderRadius: '8px',
            padding: '20px',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 160px)'
          }}>
            {!selectedEntity ? (
              <div style={{ textAlign: 'center', marginTop: '100px', color: '#a0a0a0' }}>
                Select a {activeTab === 'customers' ? 'customer' : 'order'} to view audit history
              </div>
            ) : (
              <>
                {/* Selected Entity Header */}
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={{ margin: '0 0 10px 0', fontSize: '20px', color: '#e4e4e4' }}>
                    {entityType === 'account' ? '🏢' : '📋'} {entityType === 'account' ? selectedEntity.name : `Order ${selectedEntity.poNumber || selectedEntity.id}`}
                  </h2>
                  
                  {/* Advanced Filters */}
                  <div style={{ 
                    backgroundColor: '#1a1a1a',
                    padding: '15px',
                    borderRadius: '6px',
                    marginBottom: '15px'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      {/* Search in logs */}
                      <input
                        type="text"
                        placeholder="Search in logs..."
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#383838',
                          border: '1px solid #404040',
                          borderRadius: '4px',
                          color: '#e4e4e4',
                          fontSize: '13px'
                        }}
                      />
                      
                      {/* Action filter */}
                      <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#383838',
                          border: '1px solid #404040',
                          borderRadius: '4px',
                          color: '#e4e4e4',
                          fontSize: '13px'
                        }}
                      >
                        <option value="all">All Actions</option>
                        <option value="creates">Creates</option>
                        <option value="updates">Updates</option>
                        <option value="deletes">Deletes</option>
                        <option value="stage">Stage Changes</option>
                      </select>
                      
                      {/* User filter */}
                      <select
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#383838',
                          border: '1px solid #404040',
                          borderRadius: '4px',
                          color: '#e4e4e4',
                          fontSize: '13px'
                        }}
                      >
                        <option value="all">All Users</option>
                        {uniqueUsers.map(user => (
                          <option key={user} value={user}>{user}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                      {/* Date range */}
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#383838',
                          border: '1px solid #404040',
                          borderRadius: '4px',
                          color: '#e4e4e4',
                          fontSize: '13px'
                        }}
                      />
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#383838',
                          border: '1px solid #404040',
                          borderRadius: '4px',
                          color: '#e4e4e4',
                          fontSize: '13px'
                        }}
                      />
                      <button
                        onClick={exportToCSV}
                        style={{
                          display: 'inline-block',
                          padding: '8px 16px',
                          backgroundColor: '#383838',
                          color: '#e4e4e4',
                          border: '1px solid #404040',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.2s'
                        }}
                      >
                        Export CSV
                      </button>
                    </div>
                    
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#a0a0a0' }}>
                      Showing {filteredLogs.length} of {auditLogs.length} events
                    </div>
                  </div>
                </div>

                {/* Logs List */}
                {logsLoading ? (
                  <div style={{ textAlign: 'center', color: '#a0a0a0' }}>Loading logs...</div>
                ) : paginatedLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#a0a0a0', marginTop: '50px' }}>
                    No audit logs found matching your filters
                  </div>
                ) : (
                  <>
                    {paginatedLogs.map((log) => (
                      <div key={log.id} style={{
                        backgroundColor: '#383838',
                        border: '1px solid #404040',
                        borderRadius: '6px',
                        padding: '15px',
                        marginBottom: '10px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '18px' }}>{getActionIcon(log.action)}</span>
                            <div>
                              <div style={{ fontWeight: '500', color: getActionColor(log.action) }}>
                                {log.action.replace(/_/g, ' ')}
                              </div>
                              {log.entity && (
                                <div style={{ fontSize: '11px', color: '#a0a0a0' }}>
                                  {log.entity} {log.entityId !== selectedEntity.id && `(${log.entityId.slice(0, 8)}...)`}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', color: '#a0a0a0' }}>
                              {formatDate(log.createdAt)}
                            </div>
                            <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: '500' }}>
                              by {log.performedByName || log.performedBy?.name || 'System'}
                            </div>
                          </div>
                        </div>

                        {/* Display unlock reason prominently if present */}
                        {log.action.includes('UNLOCKED') && (() => {
                          let unlockReason = null;
                          if (log.metadata) {
                            try {
                              const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                              unlockReason = metadata.message;
                            } catch (e) {
                              console.error('Failed to parse metadata:', e);
                            }
                          }
                          if (!unlockReason && log.data?.unlockReason) {
                            unlockReason = log.data.unlockReason;
                          }
                          
                          if (unlockReason) {
                            return (
                              <div style={{
                                backgroundColor: '#06b6d4',
                                color: '#ffffff',
                                padding: '12px',
                                borderRadius: '6px',
                                marginBottom: '10px',
                                fontSize: '14px',
                                fontWeight: '500'
                              }}>
                                <div style={{ marginBottom: '4px', fontSize: '12px', opacity: 0.9 }}>
                                  🔓 UNLOCK REASON:
                                </div>
                                <div style={{ fontSize: '15px' }}>
                                  "{unlockReason}"
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Display lock reason if present */}
                        {log.action.includes('LOCKED') && (() => {
                          let lockReason = null;
                          if (log.metadata) {
                            try {
                              const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                              lockReason = metadata.message;
                            } catch (e) {
                              console.error('Failed to parse metadata:', e);
                            }
                          }
                          
                          if (lockReason && lockReason !== 'Order locked for data integrity') {
                            return (
                              <div style={{
                                backgroundColor: '#f59e0b',
                                color: '#ffffff',
                                padding: '12px',
                                borderRadius: '6px',
                                marginBottom: '10px',
                                fontSize: '14px',
                                fontWeight: '500'
                              }}>
                                <div style={{ marginBottom: '4px', fontSize: '12px', opacity: 0.9 }}>
                                  🔒 LOCK REASON:
                                </div>
                                <div style={{ fontSize: '15px' }}>
                                  "{lockReason}"
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Field Changes */}
                        {log.changes && log.changes.length > 0 && (
                          <div 
                            style={{
                              backgroundColor: '#2d2d2d',
                              border: '1px solid #404040',
                              borderRadius: '4px',
                              padding: '10px',
                              marginTop: '10px',
                              cursor: 'pointer'
                            }}
                            onClick={() => toggleLogExpanded(log.id)}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: expandedLogs.has(log.id) ? '10px' : 0 }}>
                              <span style={{ fontSize: '12px', fontWeight: '500', color: '#3b82f6' }}>
                                {log.changes.length} field{log.changes.length > 1 ? 's' : ''} changed
                              </span>
                              <span style={{ fontSize: '11px', color: '#a0a0a0' }}>
                                {expandedLogs.has(log.id) ? '▼' : '▶'} Click to {expandedLogs.has(log.id) ? 'collapse' : 'expand'}
                              </span>
                            </div>
                            
                            {expandedLogs.has(log.id) && (
                              <div>
                                {log.changes.map((change, idx) => (
                                  <div key={idx} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '120px 1fr',
                                    gap: '10px',
                                    marginBottom: '8px',
                                    fontSize: '13px'
                                  }}>
                                    <div style={{ color: '#a0a0a0', fontWeight: '500' }}>
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

                        {/* Message */}
                        {log.message && !log.changes && !log.data && (
                          <div style={{ 
                            fontSize: '13px',
                            color: '#e4e4e4',
                            marginTop: '10px',
                            padding: '10px',
                            backgroundColor: '#2d2d2d',
                            borderRadius: '4px'
                          }}>
                            {log.message}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div style={{ 
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '10px',
                        marginTop: '20px',
                        paddingTop: '20px',
                        borderTop: '1px solid #404040'
                      }}>
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          style={{
                            display: 'inline-block',
                            padding: '8px 16px',
                            backgroundColor: currentPage === 1 ? '#2d2d2d' : '#383838',
                            color: currentPage === 1 ? '#666' : '#e4e4e4',
                            border: '1px solid #404040',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            opacity: currentPage === 1 ? 0.6 : 1,
                            transition: 'all 0.2s'
                          }}
                        >
                          Previous
                        </button>
                        <span style={{ color: '#a0a0a0', fontSize: '14px' }}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          style={{
                            display: 'inline-block',
                            padding: '8px 16px',
                            backgroundColor: currentPage === totalPages ? '#2d2d2d' : '#383838',
                            color: currentPage === totalPages ? '#666' : '#e4e4e4',
                            border: '1px solid #404040',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            opacity: currentPage === totalPages ? 0.6 : 1,
                            transition: 'all 0.2s'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Summary Stats */}
                {!logsLoading && auditLogs.length > 0 && (
                  <div style={{ 
                    marginTop: '30px',
                    padding: '15px',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '6px',
                    border: '1px solid #404040'
                  }}>
                    <h4 style={{ fontSize: '14px', color: '#a0a0a0', marginBottom: '10px' }}>
                      Audit Summary
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: '#666' }}>Total Events:</span>
                        <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#e4e4e4' }}>
                          {auditLogs.length}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: '#666' }}>Field Changes:</span>
                        <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#e4e4e4' }}>
                          {auditLogs.filter(l => l.changes && l.changes.length > 0).length}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: '#666' }}>Last Activity:</span>
                        <div style={{ fontSize: '14px', marginTop: '4px', color: '#e4e4e4' }}>
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
    </div>
  );
}