// Component for managing internal notes
export default function InternalNotesSection({
  order,
  internalNotes,
  setInternalNotes,
  internalNotesChanged,
  setInternalNotesChanged,
  onSaveInternalNotes,
  internalNotesSaving
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Internal Notes</h2>
      {order.isLocked && (
        <div style={{ 
          fontSize: "12px", 
          color: "#dc2626", 
          marginBottom: "8px",
          fontStyle: "italic"
        }}>
          🔒 Internal notes are locked and cannot be edited while the order is locked.
        </div>
      )}
      <div style={{
        backgroundColor: "#2d2d2d",
        border: "1px solid #4b5563",
        borderRadius: "6px",
        padding: "12px"
      }}>
        <textarea
          value={internalNotes}
          onChange={(e) => {
            if (!order.isLocked) {
              setInternalNotes(e.target.value);
              setInternalNotesChanged(true);
            }
          }}
          placeholder="Internal notes only, payment / ordering information."
          disabled={order.isLocked}
          style={{
            width: "100%",
            minHeight: "120px",
            padding: "8px",
            border: "1px solid #4b5563",
            borderRadius: "4px",
            fontSize: "14px",
            fontFamily: "inherit",
            backgroundColor: order.isLocked ? "#1a1a1a" : "#2d2d2d",
            color: order.isLocked ? "#6b7280" : "#e5e7eb",
            opacity: order.isLocked ? 0.7 : 1,
            cursor: order.isLocked ? "not-allowed" : "text"
          }}
        />
        <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>
            These notes are private and will not be visible to customers.
          </div>
          {!order.isLocked && (
            <button
              className="btn primary"
              onClick={onSaveInternalNotes}
              disabled={!internalNotesChanged || internalNotesSaving}
              style={{
                opacity: !internalNotesChanged ? 0.5 : 1,
                cursor: !internalNotesChanged ? "not-allowed" : "pointer"
              }}
            >
              {internalNotesSaving ? "Saving..." : "Save Internal Notes"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
