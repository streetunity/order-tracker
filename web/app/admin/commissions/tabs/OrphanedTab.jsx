"use client";

import { formatCurrency } from "../_shared/formatters";

export default function OrphanedTab({ orphanedCommissions, user, onDelete }) {
  return (
    <div>
      <div style={{ marginBottom: 20, color: "#f59e0b" }}>⚠️ These commissions are from deleted orders</div>
      {orphanedCommissions.map(commission => (
        <div key={commission.id} style={{ background: "linear-gradient(180deg,#202020,#151515)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <h3 style={{ color: "#f59e0b", marginBottom: 8 }}>PO #{commission.order?.poNumber || "Unknown"} - {commission.salesPersonName}</h3>
              <div style={{ color: "#999", marginBottom: 4 }}>Commission: {formatCurrency(commission.totalCommissionAmount)}</div>
              <div style={{ color: "#999", fontSize: 14 }}>Status: {commission.status}</div>
              <div style={{ marginTop: 8 }}>
                {commission.itemCommissions?.map(ic => ic.payouts?.map(p => (
                  <div key={p.id} style={{ color: "#666", fontSize: 13 }}>{p.stage}: {formatCurrency(p.amount)} ({p.status})</div>
                )))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {user.role === "SUPER_ADMIN" && (
                <button onClick={() => onDelete(commission.id)} style={{ padding: "8px 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Delete Commission</button>
              )}
              <button style={{ padding: "8px 16px", background: "#666", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Keep for Records</button>
            </div>
          </div>
        </div>
      ))}
      {orphanedCommissions.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No orphaned commissions</div>
      )}
    </div>
  );
}
