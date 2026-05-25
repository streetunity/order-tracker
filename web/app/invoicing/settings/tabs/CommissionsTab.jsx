"use client";

import { useEffect, useState } from "react";
import { INP, LBL, CARD } from "../_shared/styles";
import { COMM_STAGES } from "../_shared/constants";
import { SectionHeader, SaveBar } from "../_shared/components";
import CommissionRecalcModal from "../modals/CommissionRecalcModal";

export default function CommissionsTab({ getAuthHeaders }) {
  const [loading, setLoading] = useState(true);
  const [commTab, setCommTab] = useState("global");
  const [globalComm, setGlobalComm] = useState({ enabled: true, defaultRate: 5.0, calculationBasis: "ORDER_TOTAL", minimumOrderValue: 0 });
  const [stageDist, setStageDist] = useState([{ stage: "SHIPPING", percentage: 50 }, { stage: "DELIVERED", percentage: 50 }]);
  const [salesReps, setSalesReps] = useState([]);
  const [indRates, setIndRates] = useState({});
  const [globalChanges, setGlobalChanges] = useState(false);
  const [stageDistChange, setStageDistChange] = useState(false);
  const [commMsg, setCommMsg] = useState({ type: "", text: "" });
  const [commSaving, setCommSaving] = useState(false);
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [recalcReason, setRecalcReason] = useState("");
  const [recalculating, setRecalculating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const h = getAuthHeaders();
      const [gRes, stRes, rRes, repRes] = await Promise.all([
        fetch("/api/commission-settings/global",    { headers: h, cache: "no-store" }),
        fetch("/api/commission-settings/stages",    { headers: h, cache: "no-store" }),
        fetch("/api/commission-settings/rates",     { headers: h, cache: "no-store" }),
        fetch("/api/commission-settings/sales-reps",{ headers: h, cache: "no-store" }),
      ]);
      if (gRes.ok)   setGlobalComm(await gRes.json());
      if (stRes.ok)  setStageDist((await stRes.json()).map(s => ({ stage: s.stage, percentage: s.percentage })));
      if (rRes.ok)   { const d = await rRes.json(); const m = {}; d.forEach(r => { m[r.salesPersonName] = r.rate; }); setIndRates(m); }
      if (repRes.ok) setSalesReps(await repRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveGlobalComm = async () => {
    setCommSaving(true); setCommMsg({ type: "", text: "" });
    const res = await fetch("/api/commission-settings/global", { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(globalComm) });
    if (res.ok) { setGlobalChanges(false); setCommMsg({ type: "success", text: "\u2713 Global settings saved" }); }
    else setCommMsg({ type: "error", text: "Save failed" });
    setCommSaving(false); setTimeout(() => setCommMsg({ type: "", text: "" }), 3000);
  };

  const saveStageDistribution = async () => {
    const total = stageDist.reduce((s, x) => s + Number(x.percentage), 0);
    if (Math.abs(total - 100) > 0.01) { setCommMsg({ type: "error", text: `Percentages must total 100% (currently ${total}%)` }); return; }
    setCommSaving(true); setCommMsg({ type: "", text: "" });
    const res = await fetch("/api/commission-settings/stages", { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(stageDist.map((s, i) => ({ ...s, percentage: Number(s.percentage), sortOrder: i + 1 }))) });
    if (res.ok) { setStageDistChange(false); setCommMsg({ type: "success", text: "\u2713 Stage distribution saved" }); await load(); }
    else setCommMsg({ type: "error", text: "Save failed" });
    setCommSaving(false); setTimeout(() => setCommMsg({ type: "", text: "" }), 3000);
  };

  const saveIndRate = async (name, rate) => {
    const res = await fetch(`/api/commission-settings/rates/${encodeURIComponent(name)}`, { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ rate: Number(rate) }) });
    if (res.ok) { setIndRates(p => ({ ...p, [name]: Number(rate) })); setCommMsg({ type: "success", text: `\u2713 Rate saved for ${name}` }); }
    else setCommMsg({ type: "error", text: "Save failed" });
    setTimeout(() => setCommMsg({ type: "", text: "" }), 3000);
  };

  const executeRecalc = async () => {
    if (recalcReason.trim().length < 10) return;
    setRecalculating(true);
    const res = await fetch("/api/commission-settings/recalculate-all", { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ reason: recalcReason.trim() }) });
    const d = await res.json();
    if (res.ok) { setCommMsg({ type: "success", text: `Recalculated: ${d.results?.recalculated ?? 0}, Skipped: ${d.results?.skipped ?? 0}, Failed: ${d.results?.failed ?? 0}` }); setShowRecalcModal(false); setRecalcReason(""); }
    else setCommMsg({ type: "error", text: d.error || "Recalculation failed" });
    setRecalculating(false); setTimeout(() => setCommMsg({ type: "", text: "" }), 8000);
  };

  if (loading) return <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "40px 0" }}>Loading…</div>;

  const stageTotal = stageDist.reduce((s, x) => s + Number(x.percentage), 0);

  return (
    <>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {[["global","Global Settings"],["stages","Stage Distribution"],["rates","Individual Rates"]].map(([id,label]) => (
          <button key={id} onClick={() => setCommTab(id)} style={{ padding: "9px 18px", background: "none", border: "none", borderBottom: commTab === id ? "2px solid #dc2626" : "2px solid transparent", color: commTab === id ? "#dc2626" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontWeight: commTab === id ? 600 : 400, marginBottom: -1 }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
          {commMsg.text && <span style={{ fontSize: 12, color: commMsg.type === "success" ? "#10b981" : "#dc2626" }}>{commMsg.text}</span>}
          <button onClick={() => setShowRecalcModal(true)} style={{ padding: "6px 14px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, color: "#f59e0b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Recalculate All</button>
        </div>
      </div>

      {commTab === "global" && (
        <div style={CARD}>
          <SectionHeader label="Global Commission Settings" />
          <div style={{ padding: "12px 14px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 8, marginBottom: 18, fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>Commissions are calculated based on the total order value when an order reaches specified stages. Individual agent rates override the default rate. Stage distribution determines when payouts occur.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={globalComm.enabled} onChange={e => { setGlobalComm(p => ({...p,enabled:e.target.checked})); setGlobalChanges(true); }} /><span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Enable commission system</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div><label style={LBL}>Default Rate (%)</label><input style={INP} type="number" step="0.1" min="0" max="100" value={globalComm.defaultRate} onChange={e => { setGlobalComm(p => ({...p,defaultRate:parseFloat(e.target.value)||0})); setGlobalChanges(true); }} /></div>
              <div><label style={LBL}>Calculation Basis</label><select style={{ ...INP, cursor: "pointer" }} value={globalComm.calculationBasis} onChange={e => { setGlobalComm(p => ({...p,calculationBasis:e.target.value})); setGlobalChanges(true); }}><option value="ORDER_TOTAL">Order Total Value</option><option value="SUBTOTAL">Order Subtotal (before tax)</option><option value="PROFIT_MARGIN">Profit Margin</option></select></div>
              <div><label style={LBL}>Min. Order Value ($)</label><input style={INP} type="number" step="100" min="0" value={globalComm.minimumOrderValue} onChange={e => { setGlobalComm(p => ({...p,minimumOrderValue:parseFloat(e.target.value)||0})); setGlobalChanges(true); }} /></div>
            </div>
          </div>
          <SaveBar hasChanges={globalChanges} saving={commSaving} onSave={saveGlobalComm} msg={{}} />
        </div>
      )}

      {commTab === "stages" && (
        <div style={CARD}>
          <SectionHeader label="Stage Distribution" desc="Set the percentage of total commission paid when an order reaches each stage. Must total 100%. Changes only apply to NEW orders — existing commissions use their original distribution." />
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{["Stage","Commission %","Example ($10k @ 5%)",""].map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>)}</tr></thead>
              <tbody>{stageDist.map((item, i) => (<tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}><td style={{ padding: "10px 12px" }}><select style={{ ...INP, width: 160 }} value={item.stage} onChange={e => { const n = [...stageDist]; n[i].stage = e.target.value; setStageDist(n); setStageDistChange(true); }}>{COMM_STAGES.map(s => <option key={s} value={s} disabled={stageDist.some((d,j) => d.stage === s && j !== i)}>{s}</option>)}</select></td><td style={{ padding: "10px 12px" }}><input type="number" step="0.1" min="0" max="100" value={item.percentage} onChange={e => { const n = [...stageDist]; n[i].percentage = Number(e.target.value); setStageDist(n); setStageDistChange(true); }} style={{ ...INP, width: 80 }} /></td><td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>${(500 * item.percentage / 100).toFixed(2)}</td><td style={{ padding: "10px 12px" }}><button onClick={() => { setStageDist(p => p.filter((_,j) => j !== i)); setStageDistChange(true); }} disabled={stageDist.length <= 1} style={{ padding: "4px 10px", background: stageDist.length > 1 ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.05)", border: stageDist.length > 1 ? "1px solid rgba(220,38,38,0.2)" : "1px solid transparent", borderRadius: 5, color: stageDist.length > 1 ? "#dc2626" : "rgba(255,255,255,0.2)", fontSize: 11, cursor: stageDist.length > 1 ? "pointer" : "not-allowed" }}>Remove</button></td></tr>))}</tbody>
            </table>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <button onClick={() => { const avail = COMM_STAGES.filter(s => !stageDist.find(d => d.stage === s)); if (avail.length) { setStageDist(p => [...p, { stage: avail[0], percentage: 0 }]); setStageDistChange(true); } }} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>+ Add Stage</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: Math.abs(stageTotal - 100) < 0.01 ? "#10b981" : stageTotal > 100 ? "#dc2626" : "#f59e0b" }}>Total: {stageTotal.toFixed(1)}% {Math.abs(stageTotal - 100) < 0.01 && "\u2713"}</span>
          </div>
          <SaveBar hasChanges={stageDistChange} saving={commSaving} onSave={saveStageDistribution} msg={{}} />
        </div>
      )}

      {commTab === "rates" && (
        <div style={CARD}>
          <SectionHeader label="Individual Rates" desc="Set custom commission rates per sales agent. Leave blank to use the global default rate." />
          {salesReps.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No sales reps found. Enable “Show in Sales Rep Dropdown” on user accounts.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {salesReps.map(rep => (
                <div key={rep.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#252525", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,#991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{rep.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)}</div>
                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{rep.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{rep.email}</div></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, padding: "2px 7px", background: indRates[rep.name] ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.06)", border: indRates[rep.name] ? "1px solid rgba(220,38,38,0.2)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: indRates[rep.name] ? "#dc2626" : "rgba(255,255,255,0.35)" }}>{indRates[rep.name] ? "Custom" : "Default"}</span>
                    <input type="number" step="0.1" min="0" max="100" value={indRates[rep.name] || ""} onChange={e => setIndRates(p => ({ ...p, [rep.name]: e.target.value }))} placeholder={String(globalComm.defaultRate)} style={{ ...INP, width: 80, textAlign: "center" }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>%</span>
                    <button onClick={() => saveIndRate(rep.name, indRates[rep.name] || globalComm.defaultRate)} style={{ padding: "5px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, color: "#10b981", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Save</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CommissionRecalcModal
        show={showRecalcModal}
        onClose={() => { setShowRecalcModal(false); setRecalcReason(""); }}
        recalcReason={recalcReason}
        setRecalcReason={setRecalcReason}
        recalculating={recalculating}
        onConfirm={executeRecalc}
      />
    </>
  );
}
