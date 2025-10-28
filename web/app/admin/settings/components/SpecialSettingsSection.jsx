// Special Settings Section Component
// Handles holiday season and extended shipping configuration

export default function SpecialSettingsSection({ 
  localStartDate, 
  setLocalStartDate,
  localEndDate,
  setLocalEndDate,
  localBufferDays,
  setLocalBufferDays,
  localExtendedDays,
  setLocalExtendedDays,
  hasUnsavedHolidayChanges,
  handleSpecialChange,
  saveSpecialSettings,
  saving 
}) {
  return (
    <section className="settings-section">
      <h2>Special Shipping & Holiday Configuration</h2>
      <p className="section-desc">
        Configure holiday season dates and special shipping requirements for extended lead time items.
      </p>

      <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="setting-item">
          <label>Holiday Season Start (MM-DD)</label>
          <input
            type="text"
            value={localStartDate}
            onChange={handleSpecialChange(setLocalStartDate)}
            placeholder="10-01"
            pattern="\d{2}-\d{2}"
          />
          <small>Format: MM-DD (e.g., 10-01 for October 1st)</small>
        </div>

        <div className="setting-item">
          <label>Holiday Season End (MM-DD)</label>
          <input
            type="text"
            value={localEndDate}
            onChange={handleSpecialChange(setLocalEndDate)}
            placeholder="12-31"
            pattern="\d{2}-\d{2}"
          />
          <small>Format: MM-DD (e.g., 12-31 for December 31st)</small>
        </div>

        <div className="setting-item">
          <label>Holiday Buffer Days (Manufacturing Only)</label>
          <input
            type="number"
            value={localBufferDays}
            onChange={handleSpecialChange(setLocalBufferDays)}
            min="0"
            max="100"
          />
          <small>Extra days for MANUFACTURING stage only during holidays (0-100)</small>
        </div>

        <div className="setting-item">
          <label style={{ color: 'var(--success)' }}>Extended Shipping Days ⭐</label>
          <input
            type="number"
            value={localExtendedDays}
            onChange={handleSpecialChange(setLocalExtendedDays)}
            min="0"
            max="100"
            style={{ borderColor: 'var(--success)' }}
          />
          <small style={{ color: 'var(--success)' }}>
            Additional days for items marked as "Extended Shipping" (special machines)
          </small>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button 
          onClick={saveSpecialSettings} 
          disabled={saving || !hasUnsavedHolidayChanges}
          className="btn-init"
          style={{ opacity: (!hasUnsavedHolidayChanges || saving) ? 0.5 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Special Settings'}
        </button>
        {hasUnsavedHolidayChanges && !saving && (
          <span style={{ color: 'var(--accent)', fontSize: '14px' }}>
            ⚠ Unsaved changes
          </span>
        )}
      </div>
    </section>
  );
}
