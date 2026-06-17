"use client";

import { formatCurrency } from "../_shared/formatters";

export default function PaidTab({
  recentlyPaid, paidFilterSalesRep, setPaidFilterSalesRep,
  selectedPayouts, setSelectedPayouts, onTogglePayoutSelection,
  stageSettings, onUnpay,
}) {
  const uniquePaidSalesReps = [...new Set(recentlyPaid.map(p => p.itemCommission?.commission?.salesPersonName).filter(Boolean))].sort();
  const filteredPaidCommissions = paidFilterSalesRep ? recentlyPaid.filter(p => p.itemCommission?.commission?.salesPersonName === paidFilterSalesRep) : recentlyPaid;

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#999" }}>
          {paidFilterSalesRep ? <>Showing {filteredPaidCommissions.length} of {recentlyPaid.length} paid commissions</> : <>Last {recentlyPaid.length} paid commissions</>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={paidFilterSalesRep} onChange={e => { setPaidFilterSalesRep(e.target.value); setSelectedPayouts(new Set()); }} style={{ padding: 8, background: "#1a1a1a", color: "white", border: "1px solid #333", borderRadius: 4, minWidth: 180 }}>
            <option value="">All Sales Reps</option>
            {uniquePaidSalesReps.map(rep => <option key={rep} value={rep}>{rep}</option>)}
          </select>
          {paidFilterSalesRep && <button onClick={() => { setPaidFilterSalesRep(""); setSelectedPayouts(new Set()); }} style={{ padding: "8px 12px", background: "#333", color: "#999", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Clear</button>}
        </div>
      </div>
      <div style={{ background: "linear-gradient(180deg,#202020,#151515 48%,#121212)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 22px 52px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
        <table className="commission-polish-table" style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup><col style={{width:40}}/><col style={{width:"15%"}}/><col style={{width:"18%"}}/><col style={{width:"12%"}}/><col style={{width:50}}/><col style={{width:90}}/><col style={{width:65}}/><col style={{width:80}}/><col style={{width:"10%"}}/><col style={{width:50}}/></colgroup>
          <thead>
            <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
              <th style={{padding:4,textAlign:"center",fontSize:11}}><input type="checkbox" checked={filteredPaidCommissions.length>0&&filteredPaidCommissions.every(p=>selectedPayouts.has(p.id))} onChange={e=>{ if(e.target.checked) setSelectedPayouts(new Set(filteredPaidCommissions.map(p=>p.id))); else setSelectedPayouts(new Set()); }}/></th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Customer Name</th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Item Name</th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Sales Rep</th>
              <th style={{padding:"8px 4px",textAlign:"center",color:"#fff",fontSize:12}}>Pmt</th>
              <th style={{padding:"8px 4px",textAlign:"right",color:"#999",fontSize:12}}>Amount</th>
              <th style={{padding:"8px 4px",textAlign:"left",color:"#999",fontSize:12}}>Method</th>
              <th style={{padding:"8px 4px",textAlign:"left",color:"#999",fontSize:12}}>Paid Date</th>
              <th style={{padding:8,textAlign:"left",color:"#999",fontSize:12}}>Paid By</th>
              <th style={{padding:4,textAlign:"center",color:"#999",fontSize:11}}>Undo</th>
            </tr>
          </thead>
          <tbody>
            {filteredPaidCommissions.map(payout => {
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
                  <td style={{padding:8,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payout.itemCommission.commission.salesPersonName}</td>
                  <td style={{padding:"8px 4px",color:"#999",textAlign:"center",fontSize:11}}>P{pn>0?pn:"?"}</td>
                  <td style={{padding:"8px 4px",color:"#ccc",fontWeight:"bold",textAlign:"right",fontSize:13}}>
                    {formatCurrency(payout.amount)}
                    {payout.itemCommission?.allocatedDiscount > 0 && stageSettings.length > 0 && <span style={{color:"#dc2626",fontSize:11,marginLeft:4}}>({formatCurrency(((payout.itemCommission.itemSubtotal||0)/stageSettings.length)-(payout.itemCommission.allocatedDiscount/stageSettings.length))})</span>}
                  </td>
                  <td style={{padding:"8px 4px",color:"#999",fontSize:11}}>{payout.paymentMethod||"N/A"}</td>
                  <td style={{padding:"8px 4px",color:"#999",fontSize:11}}>{new Date(payout.paidAt).toLocaleDateString()}</td>
                  <td style={{padding:8,color:"#999",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:11}}>{payout.paidByName||"N/A"}</td>
                  <td style={{padding:"4px 2px",textAlign:"center"}}><button onClick={() => onUnpay(payout.id)} title="Undo Payment" style={{padding:"4px 8px",background:"#f59e0b",color:"white",border:"none",borderRadius:3,cursor:"pointer",fontSize:11}}>↩</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredPaidCommissions.length === 0 && <div style={{padding:40,textAlign:"center",color:"#666"}}>{paidFilterSalesRep ? "No paid commissions for selected sales rep" : "No payment history available"}</div>}
    </div>
  );
}
