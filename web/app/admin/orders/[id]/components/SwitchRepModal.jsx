"use client";

import { useState } from "react";

// Safe "switch the sales rep" modal.
// Calls POST /api/commissions/order/:orderId/switch-rep, which moves only the
// NOT-yet-paid commission payouts to the new rep; already-PAID payouts stay with
// the current rep (their earned history is never reassigned). This is the safe
// replacement for editing the raw Sales Person field once a commission exists.
export default function SwitchRepModal({
  show,
  onClose,
  orderId,
  currentRep,
  salesAgents = [],
  getAuthHeaders,
  onDone,
}) {
  const [newRep, setNewRep] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  if (!show) return null;

  function close() {
    setNewRep("");
    setReason("");
    setError("");
    setResult(null);
    setSubmitting(false);
    onClose && onClose();
  }

  async function submit() {
    setError("");
    if (!newRep || newRep === currentRep) {
      setError("Pick a different sales rep to switch to.");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch(`/api/commissions/order/${encodeURIComponent(orderId)}/switch-rep`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ newRepName: newRep, reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      onDone && onDone(data);
    } catch (e) {
      setError(e.message || "Failed to switch rep");
    } finally {
      setSubmitting(false);
    }
  }

  const overlay = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  };
  const panel = {
    backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px",
    padding: "2rem", maxWidth: "520px", width: "90%",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  };
  const label = { display: "block", fontSize: "12px", marginBottom: "4px", color: "#9ca3af" };
  const field = {
    width: "100%", padding: "10px", background: "#252525",
    border: "1px solid #404040", borderRadius: "6px", color: "#fff",
    fontSize: "14px", fontFamily: "inherit",
  };

  return (
    <div style={overlay} onClick={close}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
          🔁 Switch Sales Rep
        </h3>

        {result ? (
          <>
            <div style={{
              padding: "1rem", backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", marginBottom: "1rem",
            }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#e4e4e4" }}>
                Reassigned from <strong>{result.oldRep}</strong> to <strong>{result.newRep}</strong>.
              </p>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "13px", color: "#d1d5db" }}>
                <li>{result.movedPayouts} unpaid payout(s) moved to {result.newRep}</li>
                <li>{result.keptPaidPayouts} already-paid payout(s) kept with {result.oldRep}</li>
              </ul>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={close} style={{
                backgroundColor: "#2563eb", color: "#fff", border: "none",
                padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
              }}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Moves the account to a new rep the safe way: <strong>already-paid</strong> commissions
              stay with the current rep; everything <strong>not yet paid</strong> (waiting, pending,
              approved) moves to the new rep. Logged to the audit trail; both reps are notified.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Current rep</label>
              <div style={{ ...field, background: "#1a1a1a", color: "#e4e4e4" }}>
                {currentRep || "(none)"}
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Switch to *</label>
              <select
                value={newRep}
                onChange={(e) => setNewRep(e.target.value)}
                style={field}
                disabled={submitting}
              >
                <option value="">Select new sales rep...</option>
                {salesAgents
                  .filter((a) => a.name !== currentRep)
                  .map((a) => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
              </select>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Reason (optional, logged)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this account being reassigned?"
                style={{ ...field, minHeight: "80px" }}
                disabled={submitting}
              />
            </div>

            {error && (
              <p style={{ margin: "0 0 1rem", fontSize: "13px", color: "#ef4444" }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={close}
                disabled={submitting}
                style={{
                  background: "#2d2d2d", color: "#fff", border: "1px solid #404040",
                  padding: "0.5rem 1.5rem", borderRadius: "6px",
                  cursor: submitting ? "not-allowed" : "pointer", fontSize: "14px", opacity: submitting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !newRep}
                style={{
                  backgroundColor: "#2563eb", color: "#fff", border: "none",
                  padding: "0.5rem 1.5rem", borderRadius: "6px",
                  cursor: (submitting || !newRep) ? "not-allowed" : "pointer", fontSize: "14px",
                  opacity: (submitting || !newRep) ? 0.5 : 1,
                }}
              >
                {submitting ? "Switching..." : "Switch Rep"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
