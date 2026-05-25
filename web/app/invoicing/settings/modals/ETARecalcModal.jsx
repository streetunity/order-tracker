"use client";

import { OVERLAY, DIALOG } from "../_shared/styles";

export default function ETARecalcModal({ show, onClose, onConfirm, etaTotals, recalcETA }) {
  if (!show) return null;
  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={DIALOG} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 10 }}>⚠️ Recalculate All Customer ETAs?</h3>
        <p style={{ fontSize: 15, margin: "0 0 16px", color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
          This will recalculate and <strong>overwrite</strong> the estimated delivery dates for <strong>ALL existing orders</strong>.
        </p>
        <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>What will happen:</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
            <li>All customer tracking pages will show updated ETA dates</li>
            <li>Standard items: Order Date + <strong style={{ color: "#fff" }}>{etaTotals.avg.toFixed(0)} days</strong></li>
            <li>Extended shipping items: Order Date + <strong style={{ color: "#fff" }}>{etaTotals.extAvg.toFixed(0)} days</strong></li>
            <li>Orders with ANY extended shipping items will use the extended timeline</li>
            <li>This process cannot be undone</li>
          </ul>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          <strong style={{ color: "rgba(255,255,255,0.75)" }}>When to use this:</strong> After updating stage thresholds or extended shipping days.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 22px", background: "#2d2d2d", border: "1px solid #404040", borderRadius: 7, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={recalcETA}
            style={{ padding: "10px 22px", background: recalcETA ? "rgba(220,38,38,0.4)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", cursor: recalcETA ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700 }}
          >
            {recalcETA ? "Recalculating\u2026" : "Yes, Recalculate All ETAs"}
          </button>
        </div>
      </div>
    </div>
  );
}
