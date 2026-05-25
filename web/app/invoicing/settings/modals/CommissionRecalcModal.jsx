"use client";

import { OVERLAY, DIALOG, INP } from "../_shared/styles";

export default function CommissionRecalcModal({ show, onClose, recalcReason, setRecalcReason, recalculating, onConfirm }) {
  if (!show) return null;
  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={DIALOG} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10 }}>🔄 Recalculate All Commissions</h3>
        <p style={{ fontSize: 14, margin: "0 0 16px", color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          This will recalculate ALL unpaid commissions based on current rates and stage settings.
        </p>
        <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, marginBottom: 20 }}>
          <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>Note:</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
            <li>Only unpaid commissions will be recalculated</li>
            <li>Commissions with paid payouts will be skipped</li>
            <li>This action will be logged in the audit trail</li>
          </ul>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Please provide a reason:</p>
        <textarea
          value={recalcReason}
          onChange={e => setRecalcReason(e.target.value)}
          placeholder="Enter reason for recalculation (minimum 10 characters)"
          rows={4}
          style={{ ...INP, resize: "vertical", lineHeight: 1.6, marginBottom: 20, minHeight: 90 }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 22px", background: "#2d2d2d", border: "1px solid #404040", borderRadius: 7, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={recalculating || recalcReason.trim().length < 10}
            style={{ padding: "10px 22px", background: recalcReason.trim().length >= 10 && !recalculating ? "#f59e0b" : "rgba(245,158,11,0.25)", border: "none", borderRadius: 7, color: recalcReason.trim().length >= 10 && !recalculating ? "#000" : "rgba(255,255,255,0.3)", cursor: recalcReason.trim().length >= 10 && !recalculating ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 700 }}
          >
            {recalculating ? "Recalculating\u2026" : "Recalculate Commissions"}
          </button>
        </div>
      </div>
    </div>
  );
}
