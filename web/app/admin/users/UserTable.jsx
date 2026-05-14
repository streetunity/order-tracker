export function UserTable({ users, currentUser, onEdit, onDeactivate, onToggleSalesRep, onToggleEmployee, onToggleAlertEmails, togglingUserId, togglingEmployeeId, togglingAlertsId, showInactive, hideSalesRep }) {
  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getRoleDisplayName = (role) => ({
    SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', ACCOUNTANT: 'Accountant',
    AGENT: 'Agent', MANUFACTURER: 'Manufacturer', BROKER: 'Broker'
  }[role] || role);

  const getRoleBadgeColor = (role) => ({
    SUPER_ADMIN:  { bg: '#7f1d1d', text: '#fecaca' },
    ADMIN:        { bg: '#7c2d12', text: '#fed7aa' },
    ACCOUNTANT:   { bg: '#065f46', text: '#a7f3d0' },
    AGENT:        { bg: '#1e40af', text: '#bfdbfe' },
    MANUFACTURER: { bg: '#6b21a8', text: '#e9d5ff' },
    BROKER:       { bg: '#164e63', text: '#a5f3fc' },
  }[role] || { bg: '#374151', text: '#d1d5db' });

  if (users.length === 0) {
    return (
      <div className="user-table-empty">
        {showInactive ? 'No users found' : 'No active users found. Check "Show inactive users" to see all users.'}
      </div>
    );
  }

  return (
    <div className="user-table-section">
      <div className="user-table-container">
        <table className="user-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {!hideSalesRep && <th>Employee</th>}
              {!hideSalesRep && <th>Sales Rep</th>}
              {!hideSalesRep && <th>Alert Emails</th>}
              {hideSalesRep && <th>Has User Account</th>}
              <th>Status</th>
              <th>Last Login</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const roleBadge = getRoleBadgeColor(user.role);
              const isSelf = currentUser?.id === user.id;
              const isTogglingThis     = togglingUserId     === user.id;
              const isTogglingEmployee = togglingEmployeeId === user.id;
              const isTogglingAlerts   = togglingAlertsId   === user.id;
              const isSalesRep  = Boolean(user.showInSalesRepDropdown);
              const isEmployee  = user.isEmployee !== false; // default true
              const alertsOn    = user.alertEmailsEnabled !== false; // default true

              return (
                <tr key={user.id} className={!user.isActive ? 'inactive' : ''}>
                  <td>
                    <div className="user-name">
                      {user.name}
                      {isSelf && <span className="badge-self">(You)</span>}
                      {!user.isActive && <span className="badge-inactive">(Inactive)</span>}
                    </div>
                  </td>
                  <td className="user-email">{user.email}</td>
                  <td>
                    <span className="role-badge" style={{ backgroundColor: roleBadge.bg, color: roleBadge.text }}>
                      {getRoleDisplayName(user.role)}
                    </span>
                  </td>

                  {/* Employee toggle \u2014 system users only */}
                  {!hideSalesRep && (
                    <td className="sales-rep-cell">
                      <div className="sales-rep-toggle">
                        <input
                          type="checkbox"
                          checked={isEmployee}
                          onChange={() => onToggleEmployee && onToggleEmployee(user)}
                          disabled={isTogglingEmployee}
                          title={isEmployee ? 'Mark as non-employee (system account)' : 'Mark as employee'}
                        />
                        {isTogglingEmployee && <span className="saving-indicator">Saving...</span>}
                      </div>
                    </td>
                  )}

                  {/* Sales rep toggle \u2014 system users only */}
                  {!hideSalesRep && (
                    <td className="sales-rep-cell">
                      <div className="sales-rep-toggle">
                        <input
                          type="checkbox"
                          checked={isSalesRep}
                          onChange={() => onToggleSalesRep(user)}
                          disabled={isTogglingThis}
                          title={isSalesRep ? 'Remove from sales rep dropdown' : 'Add to sales rep dropdown'}
                        />
                        {isTogglingThis && <span className="saving-indicator">Saving...</span>}
                      </div>
                    </td>
                  )}

                  {/* Alert emails toggle \u2014 system users only */}
                  {!hideSalesRep && (
                    <td className="sales-rep-cell">
                      <div className="sales-rep-toggle">
                        <input
                          type="checkbox"
                          checked={alertsOn}
                          onChange={() => onToggleAlertEmails && onToggleAlertEmails(user)}
                          disabled={isTogglingAlerts}
                          title={alertsOn ? 'Disable alert email notifications for this user' : 'Enable alert email notifications for this user'}
                        />
                        {isTogglingAlerts && <span className="saving-indicator">Saving...</span>}
                      </div>
                    </td>
                  )}

                  {hideSalesRep && (
                    <td className="center-cell">
                      {user.email ? <span className="has-account-badge">\u2713 Yes</span> : <span className="no-data">\u2014</span>}
                    </td>
                  )}

                  <td>
                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="date-cell">{formatDate(user.lastLogin)}</td>
                  <td className="date-cell">{formatDate(user.createdAt)}</td>
                  <td className="actions-cell">
                    <button onClick={() => onEdit(user)} className="action-btn edit">Edit</button>
                    <button onClick={() => onDeactivate(user)} disabled={!user.isActive} className="action-btn deactivate">
                      {user.isActive ? 'Deactivate' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
