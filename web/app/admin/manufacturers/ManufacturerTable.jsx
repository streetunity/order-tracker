export function ManufacturerTable({ manufacturers, onEdit, onDeactivate, showInactive }) {
  if (manufacturers.length === 0) {
    return (
      <div className="user-table-empty">
        {showInactive ? 'No manufacturers found' : 'No active manufacturers found. Check "Show inactive" to see all.'}
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
              <th>Contact Info</th>
              <th>Notes</th>
              <th>Has Account</th>
              <th>Items</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {manufacturers.map((mfg) => (
              <tr key={mfg.id} className={!mfg.isActive ? 'inactive' : ''}>

                <td>
                  <div className="user-name">
                    {mfg.name}
                    {!mfg.isActive && <span className="badge-inactive">(Inactive)</span>}
                  </div>
                </td>

                <td className="user-email">
                  {mfg.user?.email || <span className="no-data">—</span>}
                </td>

                <td>
                  {mfg.contactInfo
                    ? <span title={mfg.contactInfo}>{mfg.contactInfo.length > 30 ? mfg.contactInfo.slice(0, 30) + '…' : mfg.contactInfo}</span>
                    : <span className="no-data">—</span>}
                </td>

                <td>
                  {mfg.notes
                    ? <span title={mfg.notes}>{mfg.notes.length > 40 ? mfg.notes.slice(0, 40) + '…' : mfg.notes}</span>
                    : <span className="no-data">—</span>}
                </td>

                <td className="center-cell">
                  {mfg.userId
                    ? <span className="has-account-badge">✓ Yes</span>
                    : <span className="no-data">—</span>}
                </td>

                <td className="center-cell">
                  <span className="count-badge">{mfg._count?.orderItems || 0}</span>
                </td>

                <td>
                  <span className={`status-badge ${mfg.isActive ? 'active' : 'inactive'}`}>
                    {mfg.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>

                <td className="actions-cell">
                  <button onClick={() => onEdit(mfg)} className="action-btn edit">Edit</button>
                  <button
                    onClick={() => onDeactivate(mfg)}
                    className="action-btn deactivate"
                  >
                    {mfg.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
