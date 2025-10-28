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
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: "#fff",
        borderRadius: "8px",
        padding: "24px",
        maxWidth: "500px",
        width: "90%"
      }}>
        <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Unmark Item as Ordered</h3>
        <p style={{ marginBottom: "16px", color: "#6b7280" }}>
          Please provide a reason for unmarking this item as ordered. This will be logged in the audit trail.
        </p>
        <textarea
          value={unorderReason}
          onChange={(e) => setUnorderReason(e.target.value)}
          placeholder="Enter reason for unmarking as ordered (minimum 10 characters)"
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "8px",
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            marginBottom: "16px"
          }}
        />
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            className="btn"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={onUnorder}
            disabled={saving || unorderReason.trim().length < 10}
            style={{
              backgroundColor: "#dc2626",
              color: "#fff",
              border: "none"
            }}
          >
            {saving ? "Processing..." : "Unmark as Ordered"}
          </button>
        </div>
      </div>
    </div>
  );
}
