"use client";

export default function BulkActionsBar({
  activeTab,
  selectedCount,
  onBulkApprove,
  onBulkPay,
  onGenerateReport,
  onClearSelection
}) {
  if (selectedCount === 0) return null;
  if (activeTab !== "pending" && activeTab !== "approved" && activeTab !== "paid") return null;

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a1a1a", padding: "20px", borderTop: "2px solid #333", display: "flex", gap: "10px", justifyContent: "center", alignItems: "center" }}>
      <span style={{ color: "#999" }}>{selectedCount} selected</span>
      {activeTab === "pending" && (
        <button onClick={onBulkApprove} style={{ padding: "10px 20px", background: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}>
          Approve Selected ({selectedCount})
        </button>
      )}
      {activeTab === "approved" && (
        <button onClick={onBulkPay} style={{ padding: "10px 20px", background: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}>
          Mark Selected as Paid ({selectedCount})
        </button>
      )}
      {activeTab === "paid" && (
        <button onClick={onGenerateReport} style={{ padding: "10px 20px", background: "#dc2626", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}>
          Generate Report from Selected ({selectedCount})
        </button>
      )}
      <button onClick={onClearSelection} style={{ padding: "10px 20px", background: "#666", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
        Clear Selection
      </button>
    </div>
  );
}
