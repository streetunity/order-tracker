"use client";

// Delete Item Confirmation Dialog
export function DeleteItemDialog({
  show,
  pendingAction,
  performingAction,
  onCancel,
  onConfirm
}) {
  if (!show || !pendingAction) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Delete Item Permanently?</h3>
        <p style={{ fontSize: "16px", marginBottom: "1rem" }}>
          You are about to permanently delete <strong>"{pendingAction.itemName}"</strong>.
        </p>
        <div style={{
          padding: "1rem",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "6px",
          marginBottom: "1rem"
        }}>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#ef4444" }}>
            <strong>Warning:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "14px" }}>
            <li>This action cannot be undone</li>
            <li>The item will be completely removed from the system</li>
            <li>All item data (serial numbers, notes, measurements) will be lost</li>
          </ul>
        </div>
        <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "14px" }}>
          <strong>Alternative:</strong> Consider archiving the item instead. Archived items are hidden from the board but can be restored later by clicking "Show archived items".
        </p>
        <div className="confirm-actions">
          <button
            onClick={onCancel}
            className="btn-cancel"
            disabled={performingAction}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={performingAction}
            className="btn-confirm"
            style={{ backgroundColor: "#ef4444" }}
          >
            {performingAction ? "Deleting..." : "Yes, Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Archive/Restore Item Confirmation Dialog
export function ArchiveItemDialog({
  show,
  pendingAction,
  performingAction,
  onCancel,
  onConfirm
}) {
  if (!show || !pendingAction) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{pendingAction.isArchived ? "Restore Item?" : "Archive Item?"}</h3>
        <p style={{ fontSize: "16px", marginBottom: "1rem" }}>
          {pendingAction.isArchived
            ? <>You are about to restore <strong>"{pendingAction.itemName}"</strong>.</>
            : <>You are about to archive <strong>"{pendingAction.itemName}"</strong>.</>
          }
        </p>
        <div style={{
          padding: "1rem",
          backgroundColor: "rgba(255, 170, 0, 0.1)",
          border: "1px solid rgba(255, 170, 0, 0.3)",
          borderRadius: "6px",
          marginBottom: "1rem"
        }}>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>
            <strong>What will happen:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "14px" }}>
            {pendingAction.isArchived ? (
              <>
                <li>The item will reappear on the board and kiosk view</li>
                <li>All item data will be preserved</li>
                <li>The item will continue through the production stages</li>
              </>
            ) : (
              <>
                <li>The item will be hidden from the board and kiosk view</li>
                <li>All item data will be preserved</li>
                <li>You can restore it later by clicking "Show archived items"</li>
              </>
            )}
          </ul>
        </div>
        <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "14px" }}>
          {!pendingAction.isArchived && (
            <><strong>Note:</strong> This does not delete the item. You can bring it back anytime.</>
          )}
        </p>
        <div className="confirm-actions">
          <button
            onClick={onCancel}
            className="btn-cancel"
            disabled={performingAction}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={performingAction}
            className="btn-confirm"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {performingAction
              ? (pendingAction.isArchived ? "Restoring..." : "Archiving...")
              : (pendingAction.isArchived ? "Yes, Restore Item" : "Yes, Archive Item")
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// Archive Order Confirmation Modal
export function ArchiveOrderDialog({
  show,
  pendingOrder,
  loading,
  onCancel,
  onConfirm
}) {
  if (!show || !pendingOrder) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100
      }}
      onClick={() => !loading && onCancel()}
    >
      <div
        style={{
          backgroundColor: "#1f1f1f",
          border: "1px solid #404040",
          borderRadius: "8px",
          padding: "2rem",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
          {pendingOrder.isArchived ? "Restore Order?" : "Delete Order?"}
        </h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
          {pendingOrder.isArchived
            ? "Are you sure you want to unarchive this order? It will appear on the board and in active orders."
            : "Are you sure you want to archive this order? It will be hidden from the board and active orders."}
        </p>
        {!pendingOrder.isArchived && (
          <div style={{
            padding: "1rem",
            backgroundColor: "rgba(107, 114, 128, 0.1)",
            border: "1px solid rgba(107, 114, 128, 0.3)",
            borderRadius: "6px",
            marginBottom: "1rem"
          }}>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#9ca3af" }}>
              <strong>What will happen:</strong>
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "13px", color: "#9ca3af" }}>
              <li>Order will be removed from the board view</li>
              <li>Order will appear in the "Archived Orders" tab</li>
              <li>You can unarchive the order at any time</li>
            </ul>
          </div>
        )}
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              background: "#2d2d2d",
              color: "#fff",
              border: "1px solid #404040",
              padding: "0.5rem 1.5rem",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              opacity: loading ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              backgroundColor: pendingOrder.isArchived ? "#10b981" : "#6b7280",
              color: "white",
              border: "none",
              padding: "0.5rem 1.5rem",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? (pendingOrder.isArchived ? "Unarchiving..." : "Archiving...") : (pendingOrder.isArchived ? "Unarchive Order" : "Archive Order")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Notification Toast
export function NotificationToast({ show, message }) {
  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "100px",
        right: "24px",
        backgroundColor: "#1f1f1f",
        border: "1px solid #404040",
        borderRadius: "8px",
        padding: "1rem 1.5rem",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        zIndex: 1200,
        maxWidth: "400px"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "20px" }}>ℹ️</span>
        <span style={{ color: "#d1d5db", fontSize: "14px" }}>{message}</span>
      </div>
    </div>
  );
}
