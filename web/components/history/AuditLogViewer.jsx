import { useState } from 'react';

export default function AuditLogViewer({
  selectedEntity,
  entityType,
  auditLogs,
  logsLoading,
  activeTab
}) {
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Extract unique users for filter
  const uniqueUsers = Array.from(new Set(
    auditLogs.map(log => log.performedByName || log.performedBy?.name || 'System')
  )).filter(Boolean);

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
    if (value === 'null' || value === null) return <span className="value-null">empty</span>;
    if (value === 'true' || value === 'false') return <span className="value-boolean">{value}</span>;
    if (typeof value === 'string' && value.includes('T00:00:00')) {
      return new Date(value).toLocaleDateString();
    }
    return value;
  };

  // Filter audit logs
  const filteredLogs = auditLogs.filter(log => {
    if (actionFilter !== 'all') {
      if (actionFilter === 'creates' && !log.action.includes('CREATED')) return false;
      if (actionFilter === 'updates' && !log.action.includes('UPDATED')) return false;
      if (actionFilter === 'deletes' && !log.action.includes('DELETED')) return false;
      if (actionFilter === 'stage' && !log.action.includes('STAGE')) return false;
    }

    if (userFilter !== 'all') {
      const userName = log.performedByName || log.performedBy?.name || 'System';
      if (userName !== userFilter) return false;
    }

    if (dateRange.start) {
      const logDate = new Date(log.timestamp);
      const startDate = new Date(dateRange.start);
      if (logDate < startDate) return false;
    }
    if (dateRange.end) {
      const logDate = new Date(log.timestamp);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59);
      if (logDate > endDate) return false;
    }

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
      
      if (!actionMatch && !userMatch && !changesMatch && !messageMatch) return false;
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
      if (log.action === 'UNLOCKED' && log.message && log.message !== 'Order locked for data integrity') {
        unlockReason = log.message;
      }
      
      return [
        formatDate(log.timestamp),
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

  if (!selectedEntity) {
    return (
      <div className="audit-log-panel">
        <div className="no-selection">
          Select a {activeTab === 'customers' ? 'customer' : 'order'} to view audit history
        </div>
      </div>
    );
  }

  return (
    <div className="audit-log-panel">
      {/* Selected Entity Header */}
      <div className="audit-header">
        <h2>
          {entityType === 'account' ? '🏢' : '📋'} {entityType === 'account' ? selectedEntity.name : `Order ${selectedEntity.poNumber || selectedEntity.id}`}
        </h2>
        
        {/* Advanced Filters */}
        <div className="audit-filters">
          <div className="filter-row">
            <input
              type="text"
              placeholder="Search in logs..."
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              className="filter-input"
            />
            
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Actions</option>
              <option value="creates">Creates</option>
              <option value="updates">Updates</option>
              <option value="deletes">Deletes</option>
              <option value="stage">Stage Changes</option>
            </select>
            
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Users</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>
          
          <div className="filter-row">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="filter-input"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="filter-input"
            />
            <button onClick={exportToCSV} className="export-btn">
              Export CSV
            </button>
          </div>
          
          <div className="filter-summary">
            Showing {filteredLogs.length} of {auditLogs.length} events
          </div>
        </div>
      </div>

      {/* Logs List */}
      {logsLoading ? (
        <div className="logs-loading">Loading logs...</div>
      ) : paginatedLogs.length === 0 ? (
        <div className="no-logs">
          No audit logs found matching your filters
        </div>
      ) : (
        <>
          {paginatedLogs.map((log) => (
            <div key={log.id} className="log-entry">
              <div className="log-header">
                <div className="log-action">
                  <span className="log-icon">{getActionIcon(log.action)}</span>
                  <div>
                    <div className="log-action-name" style={{ color: getActionColor(log.action) }}>
                      {log.action.replace(/_/g, ' ')}
                    </div>
                    {log.entity && (
                      <div className="log-entity">
                        {log.entity} {log.entityId !== selectedEntity.id && `(${log.entityId.slice(0, 8)}...)`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="log-meta">
                  <div className="log-timestamp">
                    {formatDate(log.timestamp)}
                  </div>
                  <div className="log-user">
                    by {log.performedByName || log.performedBy?.name || 'System'}
                  </div>
                </div>
              </div>

              {/* Display unlock reason prominently */}
              {log.action === 'UNLOCKED' && log.metadata?.message && log.metadata.message !== 'Order locked for data integrity' && (
                <div className="unlock-reason">
                  <div className="reason-label">Reason:</div>
                  <div className="reason-text">{log.metadata.message}</div>
                </div>
              )}

              {/* Display custom lock reason */}
              {log.action === 'LOCKED' && log.metadata?.message && log.metadata.message !== 'Order locked for data integrity' && (
                <div className="lock-reason">
                  <div className="reason-label">Reason:</div>
                  <div className="reason-text">{log.metadata.message}</div>
                </div>
              )}

              {/* Field Changes */}
              {log.changes && log.changes.length > 0 && (
                <div 
                  className="changes-container"
                  onClick={() => toggleLogExpanded(log.id)}
                >
                  <div className="changes-header">
                    <span className="changes-count">
                      {log.changes.length} field{log.changes.length > 1 ? 's' : ''} changed
                    </span>
                    <span className="changes-toggle">
                      {expandedLogs.has(log.id) ? '▼' : '▶'} Click to {expandedLogs.has(log.id) ? 'collapse' : 'expand'}
                    </span>
                  </div>
                  
                  {expandedLogs.has(log.id) && (
                    <div className="changes-list">
                      {log.changes.map((change, idx) => (
                        <div key={idx} className="change-item">
                          <div className="change-field">{change.field}:</div>
                          <div className="change-values">
                            <span className="old-value">{formatFieldValue(change.oldValue)}</span>
                            <span className="arrow">→</span>
                            <span className="new-value">{formatFieldValue(change.newValue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Summary Stats */}
      {!logsLoading && auditLogs.length > 0 && (
        <div className="audit-summary">
          <h4>Audit Summary</h4>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Total Events:</span>
              <div className="summary-value">{auditLogs.length}</div>
            </div>
            <div className="summary-item">
              <span className="summary-label">Field Changes:</span>
              <div className="summary-value">
                {auditLogs.filter(l => l.changes && l.changes.length > 0).length}
              </div>
            </div>
            <div className="summary-item">
              <span className="summary-label">Last Activity:</span>
              <div className="summary-value summary-date">
                {auditLogs[0] ? formatDate(auditLogs[0].timestamp) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
