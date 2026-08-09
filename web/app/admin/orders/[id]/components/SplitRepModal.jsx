"use client";

import { useState } from "react";

// "Split the commission across reps" modal.
// Calls POST /api/commissions/order/:orderId/split, which divides only the
// NOT-yet-paid payouts EQUALLY across the chosen reps; already-PAID payouts stay
// with whoever earned them. Total per stage is unchanged.
//
// The current rep is always one of the participants. You add one or more other
// reps, then explicitly pick which rep is PRIMARY — the primary is the
// customer-facing sender (their email sends the stage updates) and the name shown
// on the order. Money is split evenly regardless of who is primary.
export default function SplitRepModal({
  show,
  onClose,
  orderId,
  currentRep,
  salesAgents = [],
  getAuthHeaders,
  onDone,
}) {
  const [others, setOthers] = useState([]); // additional rep names
  const [primary, setPrimary] = useState(""); // must be chosen
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  if (!show) return null;

  const allReps = [currentRep, ...others].filter(Boolean);
  const shareEach = allReps.length ? (100 / allReps.length) : 0;

  function toggleOther(name) {
    setError("");
    setOthers((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      // If the removed rep was the primary, clear the primary selection.
      if (!next.includes(primary) && primary !== currentRep) setPrimary("");
      return next;
    });
  }

  function close() {
    setOthers([]);
    setPrimary("");
    setReason("");
    setError("");
    setResult(null);
    setSubmitting(false);
    onClose && onClose();
  }

  async function submit() {
    setError("");
    if (allReps.length < 2) {
      setError("Add at least one more rep to split with.");
      return;
    }
    if (!primary || !allReps.includes(primary)) {
      setError("Pick which rep is primary (the customer-facing sender).");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch(`/api/commissions/order/${encodeURIComponent(orderId)}/split`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ repNames: allReps, primaryRep: primary, reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      onDone && onDone(data);
    } catch (e) {
      setError(e.message || "Failed to split commission");
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
    padding: "2rem", maxWidth: "560px", width: "90%", maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  };
  const label = { display: "block", fontSize: "12px", marginBottom: "4px", color: "#9ca3af" };
  const field = {
    width: "100%", padding: "10px", background: "#252525",
    border: "1px solid #404040", borderRadius: "6px", color: "#fff",
    fontSize: "14px", fontFamily: "inherit",
  };
  const row = {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 10px", background: "#252525", border: "1px solid #404040",
    borderRadius: "6px", marginBottom: "6px", fontSize: "14px", color: "#e4e4e4",
  };
  // Shared control style so the "add rep" checkboxes and "primary" radios match
  // (same red accent + size). Checkbox stays square / radio stays round to signal
  // multi-select vs pick-one.
  const control = { accentColor: "#dc2626", width: "16px", height: "16px", flexShrink: 0, cursor: submitting ? "not-allowed" : "pointer" };

  const otherAgents = salesAgents.filter((a) => a.name !== currentRep);

  return (
    <div style={overlay} onClick={close}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
          ➕ Split Commission
        </h3>

        {result ? (
          <>
            <div style={{
              padding: "1rem", backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", marginBottom: "1rem",
            }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#e4e4e4" }}>
                Split {result.reps?.length} ways ({Number(result.sharePercentEach).toFixed(1)}% each):{" "}
                <strong>{result.reps?.join(", ")}</strong>.
              </p>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "13px", color: "#d1d5db" }}>
                <li>Primary (customer-facing sender): <strong>{result.primaryRep}</strong></li>
                <li>{result.dividedPayouts} unpaid payout(s) divided evenly</li>
                <li>{result.keptPaidPayouts} already-paid payout(s) untouched</li>
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
              Splits the commission <strong>evenly</strong> across the reps below. Only{" "}
              <strong>not-yet-paid</strong> commissions are divided; already-paid amounts stay with
              whoever earned them. Pick which rep is <strong>primary</strong> — the primary is the
              customer-facing sender (their email sends stage updates) and the name on the order.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Current rep (always included)</label>
              <div style={{ ...field, background: "#1a1a1a", color: "#e4e4e4" }}>
                {currentRep || "(none)"}
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Add rep(s) to split with *</label>
              <div style={{ maxHeight: "160px", overflowY: "auto", paddingRight: "4px" }}>
                {otherAgents.length === 0 && (
                  <div style={{ fontSize: "13px", color: "#9ca3af" }}>No other sales reps available.</div>
                )}
                {otherAgents.map((a) => (
                  <label key={a.id} style={{ ...row, cursor: submitting ? "not-allowed" : "pointer" }}>
                    <input
                      type="checkbox"
                      checked={others.includes(a.name)}
                      onChange={() => toggleOther(a.name)}
                      disabled={submitting}
                      style={control}
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>

            {allReps.length >= 2 && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={label}>Primary rep (customer-facing sender) *</label>
                {allReps.map((name) => (
                  <label key={name} style={{ ...row, cursor: submitting ? "not-allowed" : "pointer" }}>
                    <input
                      type="radio"
                      name="primaryRep"
                      value={name}
                      checked={primary === name}
                      onChange={() => setPrimary(name)}
                      disabled={submitting}
                      style={control}
                    />
                    {name}
                    {primary === name && (
                      <span style={{ fontSize: "11px", color: "#22c55e", marginLeft: "auto" }}>sends customer emails</span>
                    )}
                  </label>
                ))}
                <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "6px" }}>
                  Splitting {allReps.length} ways — {shareEach.toFixed(1)}% each.
                </div>
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Reason (optional, logged)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this order being shared?"
                style={{ ...field, minHeight: "70px" }}
                disabled={submitting}
              />
            </div>

            {error && (
              <p style={{ margin: "0 0 1rem", fontSize: "13px", color: "#ef4444" }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1rem" }}>
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
                disabled={submitting || allReps.length < 2 || !primary}
                style={{
                  backgroundColor: "#dc2626", color: "#fff", border: "none",
                  padding: "0.5rem 1.5rem", borderRadius: "6px",
                  cursor: (submitting || allReps.length < 2 || !primary) ? "not-allowed" : "pointer", fontSize: "14px",
                  opacity: (submitting || allReps.length < 2 || !primary) ? 0.5 : 1,
                }}
              >
                {submitting ? "Splitting..." : "Split Commission"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
