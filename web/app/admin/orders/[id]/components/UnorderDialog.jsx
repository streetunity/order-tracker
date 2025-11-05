// Dialog component for unmarking items as ordered
export default function UnorderDialog({
  show,
  unorderReason,
  setUnorderReason,
  onCancel,
  onUnorder,
  saving
}) {
  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }} onClick={onCancel}>
      <div style={{
        backgroundColor: "#1f1f1f",
        border: "1px solid #404040",
        borderRadius: "8px",
        padding: "2rem",
        maxWidth: "500px",
        width: "90%",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
          ↩️ Unmark Item as Ordered
        </h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
          Please provide a reason for unmarking this item as ordered. This will be logged in the audit trail.
        </p>
        <div style={{
          padding: "1rem",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "6px",
          marginBottom: "1rem"
        }}>
          <p style={{ margin: "0", fontSize: "14px", color: "#ef4444" }}>
            <strong>Note:</strong> This action will be recorded in the order's audit log.
          </p>
        </div>
        <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}>
          <strong>Reason:</strong>
        </p>
        <textarea
          value={unorderReason}
          onChange={(e) => setUnorderReason(e.target.value)}
          placeholder="Enter reason for unmarking as ordered (minimum 10 characters)"
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "10px",
            background: "#252525",
            border: "1px solid #404040",
            borderRadius: "6px",
            color: "#fff",
            fontSize: "14px",
            marginBottom: "1rem",
            fontFamily: "inherit"
          }}
        />
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              background: "#2d2d2d",
              color: "#fff",
              border: "1px solid #404040",
              padding: "0.5rem 1.5rem",
              borderRadius: "6px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "14px",
              opacity: saving ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={onUnorder}
            disabled={saving || unorderReason.trim().length < 10}
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              padding: "0.5rem 1.5rem",
              borderRadius: "6px",
              cursor: (saving || unorderReason.trim().length < 10) ? "not-allowed" : "pointer",
              fontSize: "14px",
              opacity: (saving || unorderReason.trim().length < 10) ? 0.5 : 1
            }}
          >
            {saving ? "Processing..." : "Unmark as Ordered"}
          </button>
        </div>
      </div>
    </div>
  );
}
