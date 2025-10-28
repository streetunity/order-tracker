// Confirmation Dialogs Component
// Handles all confirmation dialogs for settings page

export default function ConfirmationDialogs({
  showInitConfirm,
  setShowInitConfirm,
  initializeThresholds,
  showETAConfirm,
  setShowETAConfirm,
  recalculateETAs,
  recalculating,
  saving,
  averageTotal,
  extendedTotal
}) {
  return (
    <>
      {/* Initialize Thresholds Confirmation Dialog */}
      {showInitConfirm && (
        <div className="confirm-overlay" onClick={() => setShowInitConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Initialize Default Thresholds?</h3>
            <p>This will load the default threshold values for all stages. Any existing custom values will be overwritten.</p>
            <p style={{ marginTop: '1rem', color: 'var(--text-dim)' }}>
              <strong>Note:</strong> You can modify these values after initialization.
            </p>
            <div className="confirm-actions">
              <button 
                onClick={() => setShowInitConfirm(false)} 
                className="btn-cancel"
              >
                Cancel
              </button>
              <button 
                onClick={initializeThresholds} 
                disabled={saving}
                className="btn-confirm"
              >
                {saving ? 'Initializing...' : 'Initialize Defaults'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ETA Recalculation Confirmation Dialog */}
      {showETAConfirm && (
        <div className="confirm-overlay" onClick={() => setShowETAConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Recalculate All Customer ETAs?</h3>
            <p style={{ fontSize: '16px', marginBottom: '1rem' }}>
              This will recalculate and <strong>overwrite</strong> the estimated delivery dates for <strong>ALL existing orders</strong>.
            </p>
            <div style={{ 
              padding: '1rem', 
              backgroundColor: 'rgba(255, 170, 0, 0.1)', 
              border: '1px solid rgba(255, 170, 0, 0.3)',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '14px' }}>
                <strong>What will happen:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '14px' }}>
                <li>All customer tracking pages will show updated ETA dates</li>
                <li>Standard items: Order Date + <strong>{averageTotal.toFixed(0)} days</strong></li>
                <li>Extended shipping items: Order Date + <strong>{extendedTotal.toFixed(0)} days</strong></li>
                <li>Orders with ANY extended shipping items will use the extended timeline</li>
                <li>This process cannot be undone</li>
              </ul>
            </div>
            <p style={{ marginTop: '1rem', color: 'var(--text-dim)', fontSize: '14px' }}>
              <strong>When to use this:</strong> After updating stage thresholds or extended shipping days.
            </p>
            <div className="confirm-actions">
              <button 
                onClick={() => setShowETAConfirm(false)} 
                className="btn-cancel"
              >
                Cancel
              </button>
              <button 
                onClick={recalculateETAs} 
                disabled={recalculating}
                className="btn-confirm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {recalculating ? 'Recalculating...' : 'Yes, Recalculate All ETAs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
