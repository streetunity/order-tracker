"use client";

import { formatCurrency, isPaymentDenied, parseDenialReason, getCommissionDisplayName } from "../_shared/formatters";

export default function FlaggedTab({ flaggedCommissions, user, router, onUnflag, onRecalculate }) {
  return (
    <div>
      <div style={{ marginBottom: 20, color: "#999" }}>{flaggedCommissions.length} commissions need attention</div>
      {flaggedCommissions.map(commission => (
        <div key={commission.id} style={{ background: "linear-gradient(180deg,#202020,#151515)", border: isPaymentDenied(commission.flagReason) ? "1px solid #dc2626" : "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ color: isPaymentDenied(commission.flagReason) ? "#dc2626" : "#f59e0b", marginBottom: 8 }}>
                {isPaymentDenied(commission.flagReason) ? "🚫" : "⚠️"} {getCommissionDisplayName(commission)} - {commission.salesPersonName}
              </h3>
              {isPaymentDenied(commission.flagReason) ? (
                <div>
                  <div style={{ color: "#dc2626", fontWeight: 600, marginBottom: 8, fontSize: 15 }}>Payment Denied</div>
                  <div style={{ color: "#ccc", marginBottom: 8, fontSize: 14, lineHeight: 1.5 }}>{parseDenialReason(commission.flagReason)}</div>
                  <div style={{ padding: 12, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, marginTop: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>The payout has been reset to WAITING status and will be retriggered when the item reaches the appropriate stage again, or you can unflag this commission to clear the denial.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ color: "#999", marginBottom: 8 }}>Flag Reason: <span style={{ color: "#f59e0b" }}>{commission.flagReason}</span></div>
                  {commission.flagReason === "AWAITING_PRICES" && <div style={{ color: "#999" }}>Missing prices for order items</div>}
                  {commission.flagReason === "PRICE_CHANGED" && <div style={{ color: "#999" }}>Prices changed after commission calculation<div style={{ marginTop: 8, fontSize: 14 }}>Old total: {formatCurrency(commission.orderTotalAmount)} → New total: Check current prices</div></div>}
                  {commission.flagReason === "ORDER_DELETED" && <div style={{ color: "#999" }}>Order was deleted — commission is orphaned</div>}
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
              {(isPaymentDenied(commission.flagReason) || commission.flagReason === "AWAITING_PRICES") && commission.orderId && (
                <button onClick={() => router.push(`/admin/orders/${commission.orderId}`)} style={{ padding: "8px 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>View Order</button>
              )}
              {commission.flagReason === "PRICE_CHANGED" && user.role === "SUPER_ADMIN" && (
                <button onClick={() => onRecalculate(commission.id)} style={{ padding: "8px 16px", background: "#f59e0b", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Recalculate</button>
              )}
              <button onClick={() => onUnflag(commission.id)} style={{ padding: "8px 16px", background: "#666", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Unflag</button>
            </div>
          </div>
        </div>
      ))}
      {flaggedCommissions.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No flagged commissions</div>}
    </div>
  );
}
