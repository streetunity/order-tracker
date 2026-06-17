"use client";

import { formatCurrency } from "../_shared/formatters";

export default function PendingTab({
  payoutGroups, expandedGroups, selectedPayouts, stageSettings,
  onToggleGroup, onTogglePayoutSelection, onSelectAllInGroup,
  onApprovePayout, onRejectPayout,
}) {
  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#999" }}>{payoutGroups.length} agents with pending commissions</div>
        <div>Total pending: {formatCurrency(payoutGroups.reduce((s, g) => s + g.total, 0))}</div>
      </div>
      {payoutGroups.map(group => (
        <div key={group.salesPerson} style={{ background: "linear-gradient(180deg,#202020,#151515)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", marginBottom: 20, overflow: "hidden", boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <div onClick={() => onToggleGroup(group.salesPerson)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, cursor: "pointer", background: expandedGroups.has(group.salesPerson) ? "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))" : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#667eea,#764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "white" }}>
                {group.salesPerson.split(" ").map(n => n[0]).join("").toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{group.salesPerson}</div>
                <div style={{ color: "#999", fontSize: 14 }}>{group.payouts.length} orders • Rate: {group.payouts[0]?.itemCommission?.commission?.commissionRate || 0}%</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#999", fontSize: 14 }}>Total Commission</div>
              <div style={{ fontSize: 24, fontWeight: "bold", color: "#dc2626" }}>{formatCurrency(group.total)}</div>
            </div>
            <span style={{ color: "#999", transform: expandedGroups.has(group.salesPerson) ? "rotate(180deg)" : "rotate(0)", display: "inline-block" }}>▼</span>
          </div>
          {expandedGroups.has(group.salesPerson) && (
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => onSelectAllInGroup(group)} style={{ padding: "8px 16px", background: "#333", color: "white", border: "none", borderRadius: 4, cursor: "pointer", marginRight: 8 }}>Select All</button>
              </div>
              <table className="commission-polish-table" style={{ width: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 40 }} /><col style={{ width: "27%" }} /><col style={{ width: "27%" }} />
                  {stageSettings.map((_, i) => <col key={i} style={{ width: 50 }} />)}
                  <col style={{ width: 100 }} /><col style={{ width: 70 }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "1px solid #333" }}>
                    <th style={{ padding: 4, textAlign: "left", fontSize: 11 }}>✓</th>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12 }}>Customer Name</th>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12 }}>Item Name</th>
                    {stageSettings.map((ss, i) => <th key={ss.stage} style={{ padding: "4px 2px", textAlign: "center", fontSize: 11, color: "#fff" }} title={`${ss.stage} (${ss.percentage}%)`}>P{i+1}</th>)}
                    <th style={{ padding: "8px 4px", textAlign: "right", fontSize: 12 }}>Amount</th>
                    <th style={{ padding: 4, textAlign: "center", fontSize: 11 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.payouts.map(payout => (
                    <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                      <td style={{ padding: 4, textAlign: "center" }}><input type="checkbox" checked={selectedPayouts.has(payout.id)} onChange={() => onTogglePayoutSelection(payout.id)} /></td>
                      <td style={{ padding: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={`/admin/orders/${payout.itemCommission.commission.orderId}`} style={{ color: "#dc2626", textDecoration: "none" }}>{payout.itemCommission.commission.order?.account?.name || "N/A"}</a>
                      </td>
                      <td style={{ padding: 8, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{Number.isInteger(payout.phaseCount) && payout.phaseCount !== stageSettings.length && <span title={`Old ${payout.phaseCount}-phase schedule -- no further phase to pay`} style={{ marginRight: 6, padding: "1px 5px", fontSize: 10, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.5)", borderRadius: 4 }}>{payout.phaseCount}-phase</span>}{payout.itemCommission?.productCode || "N/A"}</td>
                      {(() => {
                        const matchIdx = stageSettings.findIndex(ss => ss.stage === payout.stage);
                        const colIdx = matchIdx >= 0
                          ? matchIdx
                          : (Number.isInteger(payout.phaseIndex) ? Math.min(payout.phaseIndex, stageSettings.length - 1) : -1);
                        const hasCount = Number.isInteger(payout.phaseCount);
                        return stageSettings.map((ss, i) => {
                          const nonExistent = hasCount && i >= payout.phaseCount;
                          return <td key={ss.stage} style={{ padding: "4px 2px", textAlign: "center", color: i === colIdx ? "#10b981" : "#555", fontSize: 14 }}>{i === colIdx ? "✓" : (nonExistent ? "·" : "")}</td>;
                        });
                      })()}
                      <td style={{ padding: "8px 4px", color: "#ccc", fontWeight: "bold", textAlign: "right", fontSize: 13 }}>
                        {formatCurrency(payout.amount)}
                        {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && (
                          <span style={{ color: "#dc2626", fontSize: 11, marginLeft: 4 }}>({formatCurrency(((payout.itemCommission.itemSubtotal||0)/stageSettings.length)-(payout.itemCommission.allocatedDiscount/stageSettings.length))})</span>
                        )}
                      </td>
                      <td style={{ padding: "4px 2px", textAlign: "center" }}>
                        <button onClick={() => onApprovePayout(payout.id)} title="Approve" style={{ padding: "4px 6px", background: "#10b981", color: "white", border: "none", borderRadius: 3, cursor: "pointer", marginRight: 2, fontSize: 12 }}>✓</button>
                        <button onClick={() => onRejectPayout(payout.id)} title="Deny" style={{ padding: "4px 6px", background: "#dc2626", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 12 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      {payoutGroups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No pending approvals</div>}
    </div>
  );
}
