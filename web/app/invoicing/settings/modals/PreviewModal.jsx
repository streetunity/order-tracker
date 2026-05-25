"use client";

import { OVERLAY, DIALOG } from "../_shared/styles";

export default function PreviewModal({ show, onClose, html, subject, isOrderStageSelected, selectedStageLabel }) {
  if (!show) return null;
  return (
    <div style={OVERLAY} onClick={onClose}>
      <div
        style={{ ...DIALOG, maxWidth: 680, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Email Preview{isOrderStageSelected ? ` \u2014 ${selectedStageLabel}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Subject: {subject}</div>
          </div>
          <button onClick={onClose} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Close</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#f5f5f5" }}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
