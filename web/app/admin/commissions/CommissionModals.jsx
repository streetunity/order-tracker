"use client";

// Reject Payment Modal
export function RejectPaymentModal({
  show,
  onClose,
  rejectionReason,
  setRejectionReason,
  onExecute
}) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>✕ Deny Commission Payment</h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Please provide a reason for denying this commission payment. This will be logged in the audit trail.</p>
        <div style={{ padding: "1rem", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
          <p style={{ margin: "0", fontSize: "14px", color: "#ef4444" }}><strong>Note:</strong> Denied payments will appear in the Flagged tab for review. The payout will be reset to WAITING status and can be retriggered.</p>
        </div>
        <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}><strong>Reason:</strong></p>
        <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Enter reason for denying payment (minimum 10 characters)" style={{ width: "100%", minHeight: "100px", padding: "10px", background: "#252525", border: "1px solid #404040", borderRadius: "6px", color: "#fff", fontSize: "14px", marginBottom: "1rem", fontFamily: "inherit" }} />
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button onClick={onClose} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onExecute} disabled={rejectionReason.trim().length < 10} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: rejectionReason.trim().length < 10 ? "not-allowed" : "pointer", fontSize: "14px", opacity: rejectionReason.trim().length < 10 ? 0.5 : 1 }}>Deny Payment</button>
        </div>
      </div>
    </div>
  );
}

// Unflag Commission Modal
export function UnflagModal({
  show,
  onClose,
  unflagNotes,
  setUnflagNotes,
  onExecute
}) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Remove Flag from Commission</h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you want to unflag this commission? You can optionally add review notes.</p>
        <div style={{ padding: "1rem", backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
          <p style={{ margin: "0", fontSize: "14px", color: "#f59e0b" }}><strong>Note:</strong> This action will be recorded in the audit log.</p>
        </div>
        <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}><strong>Review Notes (Optional):</strong></p>
        <textarea value={unflagNotes} onChange={(e) => setUnflagNotes(e.target.value)} placeholder="Optional notes about resolving this flag" style={{ width: "100%", minHeight: "100px", padding: "10px", background: "#252525", border: "1px solid #404040", borderRadius: "6px", color: "#fff", fontSize: "14px", marginBottom: "1rem", fontFamily: "inherit" }} />
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button onClick={onClose} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onExecute} style={{ backgroundColor: "#10b981", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Unflag Commission</button>
        </div>
      </div>
    </div>
  );
}

// Delete Orphaned Commission Modal
export function DeleteOrphanModal({ show, onClose, onExecute }) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Delete Orphaned Commission</h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you want to permanently delete this orphaned commission?</p>
        <div style={{ padding: "1rem", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#ef4444" }}><strong>Warning:</strong> This action cannot be undone.</p>
          <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#ef4444" }}>
            <li>The commission record will be permanently deleted</li>
            <li>All associated payout records will be removed</li>
            <li>This action will be logged in the audit trail</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button onClick={onClose} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onExecute} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Delete Commission</button>
        </div>
      </div>
    </div>
  );
}

// Recalculate Commission Modal
export function RecalculateModal({ show, onClose, onExecute }) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Recalculate Commission</h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you want to recalculate this commission based on current order prices?</p>
        <div style={{ padding: "1rem", backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#f59e0b" }}><strong>Note:</strong> This will update commission amounts:</p>
          <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
            <li>Commission will be recalculated using current item prices</li>
            <li>All pending payouts will be updated</li>
            <li>Approved and paid payouts will NOT be affected</li>
            <li>This action will be logged in the audit trail</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button onClick={onClose} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onExecute} style={{ backgroundColor: "#f59e0b", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Recalculate</button>
        </div>
      </div>
    </div>
  );
}

// Unapprove Payment Modal
export function UnapproveModal({ show, onClose, onExecute }) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Undo Approval</h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you want to move this payment back to pending status?</p>
        <div style={{ padding: "1rem", backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#f59e0b" }}><strong>Note:</strong> This will:</p>
          <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
            <li>Move the payment back to PENDING status</li>
            <li>Clear approval information</li>
            <li>Allow the payment to be re-reviewed</li>
            <li>Log this action in the audit trail</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button onClick={onClose} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onExecute} style={{ backgroundColor: "#f59e0b", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Undo Approval</button>
        </div>
      </div>
    </div>
  );
}

// Unpay Payment Modal
export function UnpayModal({ show, onClose, onExecute }) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Undo Payment</h3>
        <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you want to move this payment back to approved status?</p>
        <div style={{ padding: "1rem", backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#f59e0b" }}><strong>Note:</strong> This will:</p>
          <ul style={{ margin: "0", paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
            <li>Move the payment back to APPROVED status</li>
            <li>Clear payment information (paid date, method, etc.)</li>
            <li>Allow the payment to be re-processed</li>
            <li>Log this action in the audit trail</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button onClick={onClose} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onExecute} style={{ backgroundColor: "#f59e0b", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Undo Payment</button>
        </div>
      </div>
    </div>
  );
}

// Generate PDF Report Modal
export function PdfReportModal({
  show,
  onClose,
  pdfAgent,
  setPdfAgent,
  pdfStartDate,
  setPdfStartDate,
  pdfEndDate,
  setPdfEndDate,
  availableAgents,
  onGenerate
}) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#1a1a1a", padding: "30px", borderRadius: "12px", maxWidth: "500px", width: "90%", border: "1px solid #333" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: "24px", color: "#dc2626", fontSize: "20px" }}>Generate Commission Report</h2>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>Sales Agent</label>
          <select value={pdfAgent} onChange={(e) => setPdfAgent(e.target.value)} style={{ width: "100%", padding: "10px", background: "#2a2a2a", border: "1px solid #444", borderRadius: "4px", color: "#fff", fontSize: "14px" }}>
            <option value="">Select an agent...</option>
            {availableAgents.map((agent) => <option key={agent.id} value={agent.name}>{agent.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>Start Date</label>
          <input type="date" value={pdfStartDate} onChange={(e) => setPdfStartDate(e.target.value)} style={{ width: "100%", padding: "10px", background: "#2a2a2a", border: "1px solid #444", borderRadius: "4px", color: "#fff", fontSize: "14px" }} />
        </div>
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", marginBottom: "8px", color: "#ccc", fontSize: "14px" }}>End Date</label>
          <input type="date" value={pdfEndDate} onChange={(e) => setPdfEndDate(e.target.value)} style={{ width: "100%", padding: "10px", background: "#2a2a2a", border: "1px solid #444", borderRadius: "4px", color: "#fff", fontSize: "14px" }} />
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button onClick={() => { onClose(); setPdfAgent(""); setPdfStartDate(""); setPdfEndDate(""); }} style={{ background: "#2a2a2a", color: "#999", border: "1px solid #444", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
          <button onClick={onGenerate} style={{ background: "#dc2626", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>Generate PDF</button>
        </div>
      </div>
    </div>
  );
}

// Notification Toast
export function NotificationToast({ show, message, type }) {
  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: "80px", left: "50%", transform: "translateX(-50%)", backgroundColor: type === "success" ? "#10b981" : "#dc2626", color: "white", padding: "16px 24px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)", zIndex: 99999, minWidth: "300px", maxWidth: "500px", fontSize: "15px", fontWeight: "600", textAlign: "center", animation: "slideIn 0.3s ease-out" }}>
      {message}
    </div>
  );
}
