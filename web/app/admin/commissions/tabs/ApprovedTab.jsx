"use client";

import { formatCurrency } from "../_shared/formatters";

export default function ApprovedTab({
  approvedPayouts, selectedPayouts, setSelectedPayouts,
  paymentMethod, setPaymentMethod, paymentNotes, setPaymentNotes,
  stageSettings, onTogglePayoutSelection, onMarkAsPaid, onUnapprove,
}) {
  // The rep who actually earned this payout. Payouts are stamped with their
  // owner at creation and keep that owner through a rep switch or split, so
  // this must NOT fall back to the commission's current rep except for legacy
  // rows that were never stamped.
  const payeeOf = (p) => p.salesPersonName || p.itemCommission?.commission?.salesPersonName || null;

  // Revenue share attributable to this payout's stage, using the weight stored
  // on the payout. Falls back to an even split only when the payout predates
  // stored percentages.
  const stageShareOf = (p) => {
    const pct = Number(p.percentage);
    if (Number.isFinite(pct)) return pct / 100;
    const n = Number.isInteger(p.phaseCount) && p.phaseCount > 0 ? p.phaseCount : stageSettings.length;
    return n > 0 ? 1 / n : 1;
  };

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#999" }}>{approvedPayouts.length} approved payouts ready for payment</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ padding: 8, background: "#1a1a1a", color: "white", border: "1px solid #333", borderRadius: 4 }}>
            <option value="Check">Check</option>
            <option value="Wire">Wire Transfer</option>
            <option value="ACH">ACH</option>
            <option value="Cash">Cash</option>
          </select>
          <input type="text" placeholder="Payment notes (optional)" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} style={{ padding: 8, background: "#1a1a1a", color: "white", border: "1px solid #333", borderRadius: 4, width: 200 }} />
        </div>
      </div>
      <div style={{ background: "linear-gradient(180deg,#202020,#151515 48%,#121212)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 22px 52px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
        <table className="commission-polish-table" style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup><col style={{width:40}}/><col style={{width:"20%"}}/><col style={{width:"20%"}}/><col style={{width:"13%"}}/><col style={{width:80}}/><col style={{width:100}}/><col style={{width:100}}/><col style={{width:90}}/></colgroup>
          <thead>
            <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
              <th style={{padding:4,textAlign:"center",fontSize:11}}><input type="checkbox" onChange={e => { if(e.target.checked) setSelectedPayouts(new Set(approvedPayouts.map(p=>p.id))); else setSelectedPayouts(new Set()); }} /></th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Customer Name</th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Item Name</th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Sales Rep</th>
              <th style={{padding:"8px 4px",textAlign:"center",color:"#fff",fontSize:12}}>Payment</th>
              <th style={{padding:"8px 4px",textAlign:"right",color:"#999",fontSize:12}}>Amount</th>
              <th style={{padding:"8px 4px",textAlign:"left",color:"#999",fontSize:12}}>Approved</th>
              <th style={{padding:4,textAlign:"center",color:"#999",fontSize:11}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {approvedPayouts.map(payout => {
              const matchIdx = stageSettings.findIndex(s => s.stage === payout.stage);
              const pn = matchIdx >= 0
                ? matchIdx + 1
                : (Number.isInteger(payout.phaseIndex) ? Math.min(payout.phaseIndex, stageSettings.length - 1) + 1 : 0);
              const isLegacy = Number.isInteger(payout.phaseCount) && payout.phaseCount !== stageSettings.length;
              return (
                <tr key={payout.id} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{padding:4,textAlign:"center"}}><input type="checkbox" checked={selectedPayouts.has(payout.id)} onChange={() => onTogglePayoutSelection(payout.id)} /></td>
                  <td style={{padding:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><a href={`/admin/orders/${payout.itemCommission.commission.orderId}`} style={{color:"#dc2626",textDecoration:"none"}}>{payout.itemCommission.commission.order?.account?.name||"N/A"}</a></td>
                  <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isLegacy && <span title={`Old ${payout.phaseCount}-phase schedule -- no further phase to pay`} style={{marginRight:6,padding:"1px 5px",fontSize:10,color:"#f59e0b",border:"1px solid rgba(245,158,11,0.5)",borderRadius:4}}>{payout.phaseCount}-phase</span>}{payout.itemCommission?.productCode||"N/A"}</td>
                  <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payeeOf(payout) || "N/A"}</td>
                  <td style={{padding:"8px 4px",color:"#999",textAlign:"center",fontSize:11}}>P{pn>0?pn:"?"}</td>
                  <td style={{padding:"8px 4px",color:"#10b981",fontWeight:"bold",textAlign:"right",fontSize:13}}>
                    {formatCurrency(payout.amount)}
                    {payout.itemCommission?.allocatedDiscount > 0 && <span style={{color:"#dc2626",fontSize:11,marginLeft:4}}>({formatCurrency((((payout.itemCommission.itemSubtotal||0)-(payout.itemCommission.allocatedDiscount||0))*stageShareOf(payout)))})</span>}
                  </td>
                  <td style={{padding:"8px 4px",color:"#999",fontSize:11}}>{new Date(payout.approvedAt).toLocaleDateString()}</td>
                  <td style={{padding:"4px 2px",textAlign:"center"}}>
                    <button onClick={() => onMarkAsPaid(payout.id)} style={{padding:"4px 8px",background:"#10b981",color:"white",border:"none",borderRadius:3,cursor:"pointer",fontSize:11,marginRight:2}}>Pay</button>
                    <button onClick={() => onUnapprove(payout.id)} title="Undo Approval" style={{padding:"4px 8px",background:"#f59e0b",color:"white",border:"none",borderRadius:3,cursor:"pointer",fontSize:11}}>↩</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {approvedPayouts.length === 0 && <div style={{padding:40,textAlign:"center",color:"#666"}}>No approved payouts ready for payment</div>}
    </div>
  );
}
