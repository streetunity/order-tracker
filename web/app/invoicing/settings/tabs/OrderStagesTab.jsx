"use client";

import { useEffect, useState } from "react";
import { INP, LBL, CARD, HINT } from "../_shared/styles";
import { ALL_STAGES, ETA_STAGES_KEYS } from "../_shared/constants";
import { SectionHeader, SaveBar } from "../_shared/components";
import ETARecalcModal from "../modals/ETARecalcModal";

export default function OrderStagesTab({ getAuthHeaders }) {
  const [loading, setLoading] = useState(true);
  const [localThresh, setLocalThresh] = useState([]);
  const [threshChanges, setThreshChanges] = useState(false);
  const [threshSaving, setThreshSaving] = useState(false);
  const [threshMsg, setThreshMsg] = useState({ type: "", text: "" });
  const [holidayStart, setHolidayStart] = useState("10-01");
  const [holidayEnd, setHolidayEnd] = useState("12-31");
  const [bufferDays, setBufferDays] = useState("25");
  const [extendedDays, setExtendedDays] = useState("30");
  const [holidayChanges, setHolidayChanges] = useState(false);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayMsg, setHolidayMsg] = useState({ type: "", text: "" });
  const [recalcETA, setRecalcETA] = useState(false);
  const [showETAConfirm, setShowETAConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const h = getAuthHeaders();
        const [tRes, sRes] = await Promise.all([
          fetch("/api/settings/thresholds", { headers: h }),
          fetch("/api/settings/system",     { headers: h }),
        ]);
        if (tRes.ok) setLocalThresh(JSON.parse(JSON.stringify(await tRes.json())));
        if (sRes.ok) {
          const d = await sRes.json();
          setHolidayStart(d.HOLIDAY_SEASON_START?.value   || "10-01");
          setHolidayEnd(d.HOLIDAY_SEASON_END?.value       || "12-31");
          setBufferDays(d.HOLIDAY_BUFFER_DAYS?.value      || "25");
          setExtendedDays(d.EXTENDED_SHIPPING_DAYS?.value || "30");
        }
        setThreshChanges(false); setHolidayChanges(false);
      } finally { setLoading(false); }
    };
    load();
  }, [getAuthHeaders]);

  const saveThresholds = async () => {
    setThreshSaving(true); setThreshMsg({ type: "", text: "" });
    try {
      await Promise.all(localThresh.map(t =>
        fetch(`/api/settings/thresholds/${t.stage}`, {
          method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ warningDays: t.warningDays, criticalDays: t.criticalDays }),
        })
      ));
      setThreshChanges(false); setThreshMsg({ type: "success", text: "\u2713 Thresholds saved" }); setTimeout(() => setThreshMsg({ type: "", text: "" }), 3000);
    } catch { setThreshMsg({ type: "error", text: "Save failed" }); }
    finally { setThreshSaving(false); }
  };

  const saveHoliday = async () => {
    setHolidaySaving(true); setHolidayMsg({ type: "", text: "" });
    const dateRx = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
    if (!dateRx.test(holidayStart) || !dateRx.test(holidayEnd)) { setHolidayMsg({ type: "error", text: "Dates must be in MM-DD format (e.g. 10-01)" }); setHolidaySaving(false); return; }
    try {
      await Promise.all([
        fetch("/api/settings/system/HOLIDAY_SEASON_START",  { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: holidayStart }) }),
        fetch("/api/settings/system/HOLIDAY_SEASON_END",    { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: holidayEnd }) }),
        fetch("/api/settings/system/HOLIDAY_BUFFER_DAYS",   { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: bufferDays }) }),
        fetch("/api/settings/system/EXTENDED_SHIPPING_DAYS",{ method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ value: extendedDays }) }),
      ]);
      setHolidayChanges(false); setHolidayMsg({ type: "success", text: "\u2713 Saved" }); setTimeout(() => setHolidayMsg({ type: "", text: "" }), 3000);
    } catch { setHolidayMsg({ type: "error", text: "Save failed" }); }
    finally { setHolidaySaving(false); }
  };

  const recalcETAs = async () => {
    setShowETAConfirm(false); setRecalcETA(true);
    const res = await fetch("/api/settings/recalculate-etas", { method: "POST", headers: getAuthHeaders() });
    const d = await res.json();
    setThreshMsg({ type: res.ok ? "success" : "error", text: d.message || (res.ok ? "ETAs recalculated" : "Failed") });
    setRecalcETA(false); setTimeout(() => setThreshMsg({ type: "", text: "" }), 5000);
  };

  const etaTotals = (() => {
    let warnTotal = 0, critTotal = 0;
    ETA_STAGES_KEYS.forEach(s => {
      const t = localThresh.find(x => x.stage === s);
      if (t) { warnTotal += t.warningDays || 0; critTotal += t.criticalDays || 0; }
    });
    const avg = (warnTotal + critTotal) / 2;
    const extDays = parseInt(extendedDays || "0", 10);
    return { warnTotal, critTotal, avg, extDays, extAvg: avg + extDays };
  })();

  if (loading) return <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "40px 0" }}>Loading…</div>;

  return (
    <>
      <div style={CARD}>
        <SectionHeader label="Special Shipping & Holiday Configuration" desc="Configure holiday season dates and special shipping requirements for extended lead time items." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label style={LBL}>Holiday Season Start (MM-DD)</label><input style={INP} value={holidayStart} onChange={e => { setHolidayStart(e.target.value); setHolidayChanges(true); }} placeholder="10-01" /><p style={HINT}>Format: MM-DD (e.g., 10-01 for October 1st)</p></div>
          <div><label style={LBL}>Holiday Season End (MM-DD)</label><input style={INP} value={holidayEnd} onChange={e => { setHolidayEnd(e.target.value); setHolidayChanges(true); }} placeholder="12-31" /><p style={HINT}>Format: MM-DD (e.g., 12-31 for December 31st)</p></div>
          <div><label style={LBL}>Holiday Buffer Days (Manufacturing Only)</label><input style={INP} type="number" min="0" max="100" value={bufferDays} onChange={e => { setBufferDays(e.target.value); setHolidayChanges(true); }} /><p style={HINT}>Extra days for MANUFACTURING stage only during holidays (0–100)</p></div>
          <div><label style={{ ...LBL, color: "#10b981" }}>Extended Shipping Days ⭐</label><input style={{ ...INP, borderColor: "rgba(16,185,129,0.3)" }} type="number" min="0" max="100" value={extendedDays} onChange={e => { setExtendedDays(e.target.value); setHolidayChanges(true); }} /><p style={{ ...HINT, color: "rgba(16,185,129,0.6)" }}>Additional days for items marked as “Extended Shipping” (special machines)</p></div>
        </div>
        <SaveBar hasChanges={holidayChanges} saving={holidaySaving} onSave={saveHoliday} msg={holidayMsg} />
      </div>

      <div style={CARD}>
        <SectionHeader label="Stage Time Thresholds" desc="Set warning and critical thresholds for each manufacturing stage. Orders exceeding these times will be flagged in OVaR and Chokepoints reports." />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Stage","Warning Days","Critical Days","Description"].map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ALL_STAGES.map(stage => {
                const isETA = ETA_STAGES_KEYS.includes(stage.key);
                const t = localThresh.find(x => x.stage === stage.key) || { stage: stage.key, warningDays: 0, criticalDays: 0, description: stage.desc };
                return (
                  <tr key={stage.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isETA ? "transparent" : "rgba(255,255,255,0.02)", opacity: isETA ? 1 : 0.65 }}>
                    <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: isETA ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}>{stage.label}</span>
                      {isETA && <span style={{ marginLeft: 7, fontSize: 10, color: "#dc2626", fontWeight: 700, background: "rgba(220,38,38,0.1)", padding: "1px 5px", borderRadius: 3 }}>(ETA)</span>}
                    </td>
                    <td style={{ padding: "10px 12px" }}><input type="number" min="1" max="365" value={t.warningDays || ""} onChange={e => { setLocalThresh(p => p.map(x => x.stage === stage.key ? { ...x, warningDays: parseInt(e.target.value) || 0 } : x)); setThreshChanges(true); }} style={{ ...INP, width: 90 }} /></td>
                    <td style={{ padding: "10px 12px" }}><input type="number" min="1" max="365" value={t.criticalDays || ""} onChange={e => { setLocalThresh(p => p.map(x => x.stage === stage.key ? { ...x, criticalDays: parseInt(e.target.value) || 0 } : x)); setThreshChanges(true); }} style={{ ...INP, width: 90 }} /></td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.description || stage.desc}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid #dc2626", background: "rgba(220,38,38,0.07)", fontWeight: 700 }}>
                <td style={{ padding: "11px 12px" }}><span style={{ fontSize: 12, color: "#dc2626" }}>STANDARD ETA TOTALS</span><div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Includes stages through DELIVERED only</div></td>
                <td style={{ padding: "11px 12px", color: "#dc2626", fontSize: 14 }}>{etaTotals.warnTotal} days</td>
                <td style={{ padding: "11px 12px", color: "#dc2626", fontSize: 14 }}>{etaTotals.critTotal} days</td>
                <td style={{ padding: "11px 12px" }}><span style={{ color: "#dc2626", fontSize: 14, fontWeight: 700 }}>Average: {etaTotals.avg.toFixed(1)} days</span><div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Base ETA calculation for standard items</div></td>
              </tr>
              <tr style={{ background: "rgba(16,185,129,0.06)", fontWeight: 700 }}>
                <td style={{ padding: "11px 12px" }}><span style={{ fontSize: 12, color: "#10b981" }}>EXTENDED SHIPPING TOTALS ⭐</span><div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>For items marked as Extended Shipping</div></td>
                <td style={{ padding: "11px 12px", color: "#10b981", fontSize: 14 }}>{etaTotals.warnTotal + etaTotals.extDays} days</td>
                <td style={{ padding: "11px 12px", color: "#10b981", fontSize: 14 }}>{etaTotals.critTotal + etaTotals.extDays} days</td>
                <td style={{ padding: "11px 12px" }}><span style={{ color: "#10b981", fontSize: 14, fontWeight: 700 }}>Average: {etaTotals.extAvg.toFixed(1)} days</span><div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Standard ETA + {etaTotals.extDays} extended days</div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 20, padding: 16, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginBottom: 10 }}>📅 ETA Calculation Examples</div>
          <div style={{ marginBottom: 8 }}><div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>Standard Items:</div><div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", paddingLeft: 16 }}>Order Date + <strong style={{ color: "rgba(255,255,255,0.8)" }}>{etaTotals.avg.toFixed(0)} days</strong> = Estimated Delivery</div></div>
          <div style={{ marginBottom: 8 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#10b981", marginBottom: 2 }}>Extended Shipping Items (Special Machines):</div><div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", paddingLeft: 16 }}>Order Date + <strong style={{ color: "#10b981" }}>{etaTotals.extAvg.toFixed(0)} days</strong> = Estimated Delivery</div></div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: 8 }}>Note: If ANY item in an order requires extended shipping, the entire order uses the extended ETA.</div>
        </div>
        <SaveBar hasChanges={threshChanges} saving={threshSaving} onSave={saveThresholds} msg={threshMsg} />
      </div>

      <div style={CARD}>
        <SectionHeader label="Customer ETA Management" desc="Recalculate estimated delivery dates for all existing orders based on current threshold settings. This will update the ETA shown on all customer tracking pages." />
        <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>⚠️ Warning: This will overwrite ALL existing ETA dates on customer tracking pages.</p>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Standard orders: Order Date + <strong>{etaTotals.avg.toFixed(0)} days</strong> = ETA</p>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Extended shipping orders: Order Date + <strong>{etaTotals.extAvg.toFixed(0)} days</strong> = ETA</p>
        </div>
        <button onClick={() => setShowETAConfirm(true)} disabled={recalcETA} style={{ padding: "9px 20px", background: recalcETA ? "rgba(220,38,38,0.3)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: recalcETA ? "not-allowed" : "pointer" }}>{recalcETA ? "Recalculating\u2026" : "Recalculate All ETAs"}</button>
        {threshMsg.text && <span style={{ marginLeft: 12, fontSize: 13, color: threshMsg.type === "success" ? "#10b981" : "#dc2626" }}>{threshMsg.text}</span>}
      </div>

      <div style={{ ...CARD, background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 14 }}>💡 How Thresholds Work</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[["Warning","Items exceeding this time are flagged yellow (attention needed)"],["Critical","Items exceeding this time are flagged red (urgent action required)"],["Holiday Adjustment","Buffer days are ONLY added to MANUFACTURING stage (Oct\u2013Dec)"],["Extended Shipping","Additional days for special machines that require extended lead times"],["ETA Calculation","Uses average of Warning and Critical days for stages through DELIVERED"],["Order-Level ETA","If ANY item has extended shipping, the entire order uses the extended timeline"]].map(([term,def]) => (
            <div key={term} style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}><strong style={{ color: "rgba(255,255,255,0.8)" }}>{term}:</strong> {def}</div>
          ))}
        </div>
      </div>

      <ETARecalcModal
        show={showETAConfirm}
        onClose={() => setShowETAConfirm(false)}
        onConfirm={recalcETAs}
        etaTotals={etaTotals}
        recalcETA={recalcETA}
      />
    </>
  );
}
