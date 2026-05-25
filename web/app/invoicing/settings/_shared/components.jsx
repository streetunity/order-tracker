"use client";

// Shared UI primitives used across all settings tabs.

export function SectionHeader({ label, desc }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: desc ? 6 : 0 }}>
        <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>{label}</h3>
      </div>
      {desc && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "0 0 0 13px", lineHeight: 1.6 }}>{desc}</p>}
    </div>
  );
}

export function SaveBar({ hasChanges, saving, onSave, msg }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, paddingTop: 16, marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      {msg?.text && <span style={{ fontSize: 13, color: msg.type === "success" ? "#10b981" : "#dc2626" }}>{msg.text}</span>}
      <button
        onClick={onSave}
        disabled={!hasChanges || saving}
        style={{ padding: "9px 22px", background: hasChanges && !saving ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 7, color: hasChanges && !saving ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600, cursor: hasChanges && !saving ? "pointer" : "not-allowed" }}
      >
        {saving ? "Saving\u2026" : hasChanges ? "Save Changes" : "No Changes"}
      </button>
    </div>
  );
}
