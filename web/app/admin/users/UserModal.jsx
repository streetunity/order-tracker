export function UserModal({ show, editingUser, formData, setFormData, onSubmit, onClose, error, assignableRoles, currentUser, hideSalesRep }) {
  if (!show) return null;

  const assignableRoleNames = assignableRoles.map(r => r.label).join(', ');
  const isSelfEdit = editingUser && currentUser?.id === editingUser.id;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>
              Password {editingUser && <span className="hint">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              required={!editingUser}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={editingUser ? 'Leave blank to keep current password' : ''}
            />
          </div>

          <div className="form-group">
            <label>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              disabled={isSelfEdit}
            >
              {assignableRoles.map(role => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
            {isSelfEdit && <div className="hint">You cannot change your own role</div>}
            {!isSelfEdit && <div className="hint">You can assign: {assignableRoleNames}</div>}
          </div>

          {/* System user toggles \u2014 only on System Users tab */}
          {!hideSalesRep && (
            <>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.isEmployee}
                    onChange={(e) => setFormData({ ...formData, isEmployee: e.target.checked })}
                  />
                  Is Employee
                </label>
                <div className="hint">Uncheck for system/service accounts (cron jobs, sysop, etc.) that should never appear in employee lists</div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.showInSalesRepDropdown}
                    onChange={(e) => setFormData({ ...formData, showInSalesRepDropdown: e.target.checked })}
                  />
                  Show in Sales Rep dropdown
                </label>
                <div className="hint">When checked, this user will appear in the "Sales Person" field when adding/editing orders</div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.alertEmailsEnabled}
                    onChange={(e) => setFormData({ ...formData, alertEmailsEnabled: e.target.checked })}
                  />
                  Alert Email Notifications
                </label>
                <div className="hint">When checked, this user receives emails when manufacturers update item stages. In-app notifications fire regardless.</div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" className="btn primary">{editingUser ? 'Update' : 'Create'} User</button>
          </div>
        </form>
      </div>
    </div>
  );
}
