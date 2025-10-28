// ETA Management Section Component
// Handles customer ETA recalculation

export default function ETAManagementSection({ 
  averageTotal, 
  extendedTotal, 
  setShowETAConfirm, 
  recalculating 
}) {
  return (
    <section className="settings-section">
      <h2>Customer ETA Management</h2>
      <p className="section-desc">
        Recalculate estimated delivery dates for all existing orders based on current threshold settings. 
        This will update the ETA shown on all customer tracking pages.
      </p>
      
      <div style={{ 
        padding: '1rem', 
        backgroundColor: 'rgba(255, 170, 0, 0.1)', 
        border: '1px solid rgba(255, 170, 0, 0.3)',
        borderRadius: '8px',
        marginBottom: '1rem'
      }}>
        <p style={{ margin: 0, color: 'var(--accent)' }}>
          ⚠️ <strong>Warning:</strong> This will overwrite ALL existing ETA dates on customer tracking pages. 
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '14px' }}>
          Standard orders: Order Date + <strong>{averageTotal.toFixed(0)} days</strong> = ETA
        </p>
        <p style={{ marginTop: '0.25rem', fontSize: '14px' }}>
          Extended shipping orders: Order Date + <strong>{extendedTotal.toFixed(0)} days</strong> = ETA
        </p>
      </div>

      <button 
        onClick={() => setShowETAConfirm(true)} 
        disabled={recalculating}
        className="btn-init"
        style={{ 
          backgroundColor: 'var(--accent)',
          opacity: recalculating ? 0.5 : 1 
        }}
      >
        {recalculating ? 'Recalculating...' : 'Recalculate All ETAs'}
      </button>
    </section>
  );
}
