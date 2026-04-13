export function ManufacturerModal({ show, editingManufacturer, formData, setFormData, onSubmit, onClose, error }) {
  if (!show) return null;

  const hasExistingUser = !!(editingManufacturer?.userId || editingManufacturer?.user);
  const isEdit = !!editingManufacturer;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{isEdit ? 'Edit Manufacturer' : 'Add New Manufacturer'}</h2>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={onSubmit}>

          {/* ── Core info ── */}
          <div className="form-group">
            <label>Name <span className="required">*</span></label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Manufacturer name"
            />
          </div>

          <div className="form-group">
            <label>Contact Info</label>
            <input
              type="text"
              value={formData.contactInfo}
              onChange={e => setFormData({ ...formData, contactInfo: e.target.value })}
              placeholder="Phone, email, or other contact details"
            />
            <div className="hint">Optional: Phone number, email, or other contact information</div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes about this manufacturer"
              rows={3}
            />
          </div>

          <div className="form-divider"></div>

          {/* ── User account section ── */}
          {isEdit && hasExistingUser && (
            // Editing an existing user account — update email / password
            <>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>✓ Has user account</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>Update credentials below (leave password blank to keep unchanged)</span>
              </div>

              <div className="form-group">
                <label>Login Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@manufacturer.com"
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Leave blank to keep current password"
                  minLength={formData.password ? 8 : undefined}
                />
                {formData.password && <div className="hint">Minimum 8 characters</div>}
              </div>
            </>
          )}

          {(!isEdit || (isEdit && !hasExistingUser)) && (
            // New manufacturer OR editing one without a user account
            <>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.createUserAccount}
                    onChange={e => setFormData({ ...formData, createUserAccount: e.target.checked })}
                  />
                  {isEdit ? 'Create user account for this manufacturer' : 'Create user account'}
                </label>
                <div className="hint">Allows the manufacturer to log in and view their assigned orders</div>
              </div>

              {formData.createUserAccount && (
                <>
                  <div className="form-group">
                    <label>Email <span className="required">*</span></label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="user@manufacturer.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Password <span className="required">*</span></label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Minimum 8 characters"
                      minLength={8}
                    />
                    <div className="hint">Minimum 8 characters</div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" className="btn primary">
              {isEdit ? 'Update' : 'Create'} Manufacturer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
