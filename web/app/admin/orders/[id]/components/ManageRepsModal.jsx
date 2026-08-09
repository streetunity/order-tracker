"use client";

import { useState } from "react";

// Manage the reps on a SPLIT order (2+ active reps).
//  - Replace: swap one rep for another. Only that rep's not-yet-paid payouts move
//    to the replacement; the other reps and all paid amounts are untouched.
//    Calls POST /api/commissions/order/:id/replace-rep.
//  - Remove: drop a rep. Their not-yet-paid share is re-divided evenly among the
//    remaining reps; their paid amounts stay with them. If they were primary, a new
//    primary is chosen. Calls POST /api/commissions/order/:id/remove-rep.
export default function ManageRepsModal({
  show,
  onClose,
  orderId,
  reps = [],
  salesAgents = [],
  getAuthHeaders,
  onDone,
}) {
  const [acting, setActing] = useState(null); // { name, role, type: 'replace' | 'remove' }
  const [pick, setPick] = useState("");       // replacement name, or new-primary name
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!show) return null;

  const activeNames = reps.map((r) => r.salesPersonName);
  const primaryName = reps.find((r) => r.role === "PRIMARY")?.salesPersonName;

  function reset() {
    setActing(null);
    setPick("");
    setReason("");
    setError("");
    setSubmitting(false);
  }
  function close() {
    reset();
    setNotice("");
    onClose && onClose();
  }
  function startAction(rep, type) {
    setError("");
    setNotice("");
    setPick("");
    setReason("");
    setActing({ ...rep, type });
  }

  // When removing the primary and 2+ reps will remain, the user must pick a new primary.
  const removingPrimaryNeedsPick =
    acting?.type === "remove" && acting.role === "PRIMARY" && reps.length > 2;

  async function post(path, body) {
    const res = await fetch(`/api/commissions/order/${encodeURIComponent(orderId)}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function confirm() {
    setError("");
    try {
      setSubmitting(true);
      if (acting.type === "replace") {
        if (!pick) { setError("Pick the rep to bring in."); setSubmitting(false); return; }
        await post("replace-rep", { outgoingRep: acting.salesPersonName, newRepName: pick, reason: reason || null });
        setNotice(`Replaced ${acting.salesPersonName} with ${pick}.`);
      } else {
        if (removingPrimaryNeedsPick && !pick) { setError("Pick who becomes the new primary."); setSubmitting(false); return; }
        await post("remove-rep", { repName: acting.salesPersonName, newPrimaryRep: pick || null, reason: reason || null });
        setNotice(`Removed ${acting.salesPersonName}.`);
      }
      reset();
      onDone && (await onDone());
    } catch (e) {
      setError(e.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  const overlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const panel = { backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "580px", width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" };
  const label = { display: "block", fontSize: "12px", marginBottom: "4px", color: "#9ca3af" };
  const field = { width: "100%", padding: "10px", background: "#252525", border: "1px solid #404040", borderRadius: "6px", color: "#fff", fontSize: "14px", fontFamily: "inherit" };
  const repRow = { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#252525", border: "1px solid #404040", borderRadius: "6px", marginBottom: "8px" };
  const smallBtn = (bg) => ({ padding: "6px 12px", backgroundColor: bg, color: "#fff", border: "none", borderRadius: "4px", fontSize: "13px", cursor: submitting ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: submitting ? 0.5 : 1 });

  const otherAgents = salesAgents.filter((a) => !activeNames.includes(a.name));
  const remainingIfRemoved = acting ? reps.filter((r) => r.salesPersonName !== acting.salesPersonName) : [];

  return (
    <div style={overlay} onClick={close}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "0.5rem" }}>👥 Manage Reps</h3>
        <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: 0, marginBottom: "1rem" }}>
          Only <strong>not-yet-paid</strong> commissions are affected — already-paid amounts stay with whoever earned them.
        </p>

        {notice && (
          <div style={{ padding: "0.6rem 0.8rem", backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", marginBottom: "1rem", fontSize: "13px", color: "#e4e4e4" }}>
            {notice}
          </div>
        )}

        {reps.map((rep) => {
          const isActing = acting && acting.salesPersonName === rep.salesPersonName;
          return (
            <div key={rep.salesPersonName}>
              <div style={repRow}>
                <div style={{ flex: 1, fontSize: "14px", color: "#e4e4e4" }}>
                  {rep.salesPersonName}
                  {rep.role === "PRIMARY" && (
                    <span style={{ fontSize: "11px", color: "#22c55e", marginLeft: "8px" }}>primary · sends customer emails</span>
                  )}
                  <span style={{ fontSize: "12px", color: "#9ca3af", marginLeft: "8px" }}>{Number(rep.sharePercentage).toFixed(1)}%</span>
                </div>
                {!acting && (
                  <>
                    <button onClick={() => startAction(rep, "replace")} style={smallBtn("#2563eb")}>Replace</button>
                    <button onClick={() => startAction(rep, "remove")} disabled={reps.length < 2} style={{ ...smallBtn("#dc2626"), opacity: reps.length < 2 ? 0.4 : 1, cursor: reps.length < 2 ? "not-allowed" : "pointer" }}>Remove</button>
                  </>
                )}
              </div>

              {isActing && (
                <div style={{ padding: "12px", border: "1px solid #404040", borderRadius: "6px", marginBottom: "8px", background: "#1a1a1a" }}>
                  {acting.type === "replace" ? (
                    <>
                      <label style={label}>Replace <strong>{acting.salesPersonName}</strong> with *</label>
                      <select value={pick} onChange={(e) => setPick(e.target.value)} style={field} disabled={submitting}>
                        <option value="">Select rep...</option>
                        {otherAgents.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                      <p style={{ fontSize: "12px", color: "#9ca3af", margin: "6px 0 0" }}>
                        {acting.salesPersonName}'s unpaid payouts move to the new rep{acting.role === "PRIMARY" ? ", who becomes the new primary" : ""}. Their {Number(acting.sharePercentage).toFixed(1)}% share carries over.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: "13px", color: "#e4e4e4", margin: "0 0 8px" }}>
                        Remove <strong>{acting.salesPersonName}</strong>? Their unpaid share re-divides evenly among the remaining {remainingIfRemoved.length} rep{remainingIfRemoved.length === 1 ? "" : "s"} ({(100 / remainingIfRemoved.length).toFixed(1)}% each).
                      </p>
                      {removingPrimaryNeedsPick && (
                        <>
                          <label style={label}>New primary (customer-facing sender) *</label>
                          <select value={pick} onChange={(e) => setPick(e.target.value)} style={field} disabled={submitting}>
                            <option value="">Select new primary...</option>
                            {remainingIfRemoved.map((r) => <option key={r.salesPersonName} value={r.salesPersonName}>{r.salesPersonName}</option>)}
                          </select>
                        </>
                      )}
                    </>
                  )}

                  <div style={{ marginTop: "10px" }}>
                    <label style={label}>Reason (optional, logged)</label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, minHeight: "56px" }} disabled={submitting} />
                  </div>

                  {error && <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#ef4444" }}>{error}</p>}

                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
                    <button onClick={reset} disabled={submitting} style={{ ...smallBtn("#2d2d2d"), border: "1px solid #404040" }}>Cancel</button>
                    <button onClick={confirm} disabled={submitting} style={smallBtn(acting.type === "remove" ? "#dc2626" : "#2563eb")}>
                      {submitting ? "Working..." : acting.type === "remove" ? "Confirm Remove" : "Confirm Replace"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button onClick={close} disabled={submitting} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: submitting ? "not-allowed" : "pointer", fontSize: "14px" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
