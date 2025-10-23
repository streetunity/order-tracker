export function UserTable({ users, currentUser, onEdit, onDeactivate, onToggleSalesRep, togglingUserId, showInactive, sectionTitle }) {
  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleDisplayName = (role) => {
    const names = {
      'SUPER_ADMIN': 'Super Admin',
      'ADMIN': 'Admin',
      'ACCOUNTANT': 'Accountant',
      'AGENT': 'Agent',
      'MANUFACTURER': 'Manufacturer'
    };
    return names[role] || role;
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      'SUPER_ADMIN': { bg: '#7f1d1d', text: '#fecaca' },
      'ADMIN': { bg: '#7c2d12', text: '#fed7aa' },
      'ACCOUNTANT': { bg: '#065f46', text: '#a7f3d0' },
      'AGENT': { bg: '#1e40af', text: '#bfdbfe' },
      'MANUFACTURER': { bg: '#6b21a8', text: '#e9d5ff' }
    };
    return colors[role] || { bg: '#374151', text: '#d1d5db' };
  };

  if (users.length === 0) {
    return (
      <div className="user-table-empty">
        {showInactive ? 'No users found' : 'No active users found. Check "Show inactive users" to see all users.'}
      </div>
    );
  }

  return (
    <div className="user-table-section">
      {sectionTitle && (
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          margin: '24px 0 12px 0',
          color: '#e4e4e4',
          borderBottom: '2px solid #374151',
          paddingBottom: '8px'
        }}>
          {sectionTitle}
        </h2>
      )}
      <div className="user-table-container">
        <table className="user-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Sales Rep</th>
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
              const isTogglingThisUser = togglingUserId === user.id;
              const isSalesRep = Boolean(user.canBeSalesRep);

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
                  <td className="sales-rep-cell">
                    <div className="sales-rep-toggle">
                      <input
                        type="checkbox"
                        checked={isSalesRep}
                        onChange={() => onToggleSalesRep(user)}
                        disabled={isTogglingThisUser}
                        title={isSalesRep ? "Remove from sales rep dropdown" : "Add to sales rep dropdown"}
                      />
                      {isTogglingThisUser && <span className="saving-indicator">Saving...</span>}
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => onToggleSalesRep(user)}
                      className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}
                      title={user.isActive ? 'Click to deactivate' : 'Click to reactivate'}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="date-cell">{formatDate(user.lastLogin)}</td>
                  <td className="date-cell">{formatDate(user.createdAt)}</td>
                  <td className="actions-cell">
                    <button onClick={() => onEdit(user)} className="action-btn edit">Edit</button>
                    <button 
                      onClick={() => onDeactivate(user)} 
                      disabled={!user.isActive}
                      className="action-btn deactivate"
                    >
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