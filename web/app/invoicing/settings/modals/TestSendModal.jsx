"use client";

import { OVERLAY, DIALOG } from "../_shared/styles";
import { INP, LBL } from "../_shared/styles";

export default function TestSendModal({ show, onClose, selTpl, testEmail, setTestEmail, sendingTest, onSend, isOrderStageSelected, selectedStageLabel }) {
  if (!show) return null;
  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={DIALOG} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Send Test Email</h3>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
          Send a test version of \u201c{selTpl?.name}\u201d{isOrderStageSelected ? ` for the ${selectedStageLabel} stage` : ""} with sample data.
        </p>
        <label style={LBL}>Recipient Email</label>
        <input
          type="email"
          value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ ...INP, marginBottom: 20 }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button
            onClick={onSend}
            disabled={sendingTest || !testEmail}
            style={{ padding: "8px 18px", background: testEmail ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, color: testEmail ? "#fff" : "rgba(255,255,255,0.3)", cursor: testEmail ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}
          >
            {sendingTest ? "Sending\u2026" : "Send Test"}
          </button>
        </div>
      </div>
    </div>
  );
}
