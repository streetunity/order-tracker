export function ManufacturerTable({ manufacturers, onEdit, onDeactivate, showInactive }) {
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

  if (manufacturers.length === 0) {
    return (
      <div className="manufacturer-table-empty">
        {showInactive ? 'No manufacturers found' : 'No active manufacturers found. Check "Show inactive manufacturers" to see all manufacturers.'}
      </div>
    );
  }

  return (
    <div className="manufacturer-table-container">
      <table className="manufacturer-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Contact Info</th>
            <th>Notes</th>
            <th>Has User Account</th>
            <th>Order Items</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {manufacturers.map((mfg) => {
            return (
              <tr key={mfg.id} className={!mfg.isActive ? 'inactive' : ''}>
                <td>
                  <div className="manufacturer-name">
                    {mfg.name}
                    {!mfg.isActive && <span className="badge-inactive">(Inactive)</span>}
                  </div>
                </td>
                <td className="contact-cell">
                  {mfg.contactInfo ? (
                    <span title={mfg.contactInfo}>
                      {mfg.contactInfo.length > 30 
                        ? mfg.contactInfo.substring(0, 30) + '...' 
                        : mfg.contactInfo}
                    </span>
                  ) : (
                    <span className="no-data">—</span>
                  )}
                </td>
                <td className="notes-cell">
                  {mfg.notes ? (
                    <span title={mfg.notes}>
                      {mfg.notes.length > 40 
                        ? mfg.notes.substring(0, 40) + '...' 
                        : mfg.notes}
                    </span>
                  ) : (
                    <span className="no-data">—</span>
                  )}
                </td>
                <td className="center-cell">
                  {mfg.userId ? (
                    <span className="has-account-badge">✓ Yes</span>
                  ) : (
                    <span className="no-data">—</span>
                  )}
                </td>
                <td className="center-cell">
                  <span className="count-badge">{mfg._count?.orderItems || 0}</span>
                </td>
                <td>
                  <span className={`status-badge ${mfg.isActive ? 'active' : 'inactive'}`}>
                    {mfg.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="date-cell">{formatDate(mfg.createdAt)}</td>
                <td className="actions-cell">
                  <button onClick={() => onEdit(mfg)} className="action-btn edit">Edit</button>
                  <button 
                    onClick={() => onDeactivate(mfg)} 
                    disabled={!mfg.isActive}
                    className="action-btn deactivate"
                  >
                    {mfg.isActive ? 'Deactivate' : 'Inactive'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}