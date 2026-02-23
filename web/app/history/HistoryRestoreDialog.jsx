'use client';

export default function HistoryRestoreDialog({
  show,
  pendingRestore,
  performingRestore,
  onCancel,
  onConfirm
}) {
  if (!show || !pendingRestore) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Restore Item?</h3>
        <p style={{ fontSize: '16px', marginBottom: '1rem' }}>
          You are about to restore <strong>"{pendingRestore.itemName}"</strong>.
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
            <li>The item will reappear on the board and kiosk view</li>
            <li>All item data will be preserved</li>
            <li>The item will continue through the production stages</li>
          </ul>
        </div>
        <div className="confirm-actions">
          <button onClick={onCancel} className="btn-cancel" disabled={performingRestore}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={performingRestore} className="btn-confirm">
            {performingRestore ? 'Restoring...' : 'Yes, Restore Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
