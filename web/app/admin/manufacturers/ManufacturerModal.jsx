export function ManufacturerModal({ show, editingManufacturer, formData, setFormData, onSubmit, onClose, error }) {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{editingManufacturer ? 'Edit Manufacturer' : 'Add New Manufacturer'}</h2>
        
        {error && <div className="modal-error">{error}</div>}
        
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Name <span className="required">*</span></label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Manufacturer name"
            />
          </div>
          
          <div className="form-group">
            <label>Contact Info</label>
            <input
              type="text"
              value={formData.contactInfo}
              onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
              placeholder="Phone, email, or other contact details"
            />
            <div className="hint">Optional: Phone number, email, or other contact information</div>
          </div>
          
          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes about this manufacturer"
              rows={3}
            />
            <div className="hint">Optional: Any notes or special instructions for this manufacturer</div>
          </div>
          
          {!editingManufacturer && (
            <>
              <div className="form-divider"></div>
              
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.createUserAccount}
                    onChange={(e) => setFormData({ ...formData, createUserAccount: e.target.checked })}
                  />
                  Create user account for this manufacturer
                </label>
                <div className="hint">Allows manufacturer to log in and view their assigned orders</div>
              </div>

              {formData.createUserAccount && (
                <>
                  <div className="form-group">
                    <label>Email <span className="required">*</span></label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="user@manufacturer.com"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Password <span className="required">*</span></label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
              {editingManufacturer ? 'Update' : 'Create'} Manufacturer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}