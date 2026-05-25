"use client";

import { useEffect, useRef, useState } from "react";
import { INP, LBL, CARD } from "../_shared/styles";
import { EMAIL_STAGES, EMAIL_CATEGORIES } from "../_shared/constants";
import PreviewModal from "../modals/PreviewModal";
import TestSendModal from "../modals/TestSendModal";

export default function EmailTemplatesTab({ getAuthHeaders }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [stageConfigs, setStageConfigs] = useState([]);
  const [emailView, setEmailView] = useState("templates");
  const [selTpl, setSelTpl] = useState(null);
  // Stage selector for the order_stage template's Preview / Test Send.
  // Defaults to AT_SEA so prior preview behavior is unchanged.
  const [selectedStage, setSelectedStage] = useState("AT_SEA");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editClosing, setEditClosing] = useState("");
  const [editFooter, setEditFooter] = useState("");
  const [tplChanges, setTplChanges] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMsg, setTplMsg] = useState({ type: "", text: "" });
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [showTestSend, setShowTestSend] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const bodyRef = useRef(null);

  const selectTemplate = (tpl) => {
    setSelTpl(tpl);
    setEditSubject(tpl.subject);
    setEditBody(tpl.bodyContent);
    setEditClosing(tpl.closingContent || "");
    setEditFooter(tpl.footerContent || "");
    setTplChanges(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const h = getAuthHeaders();
      const [tRes, sRes] = await Promise.all([
        fetch("/api/email-templates",              { headers: h, cache: "no-store" }),
        fetch("/api/email-templates/stages/config",{ headers: h, cache: "no-store" }),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setTemplates(d); if (d.length > 0) selectTemplate(d[0]); }
      if (sRes.ok) setStageConfigs(await sRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const insertVariable = (v) => {
    const ta = bodyRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const ins = `{{${v}}}`;
    setEditBody(editBody.substring(0, s) + ins + editBody.substring(e));
    setTplChanges(true);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + ins.length, s + ins.length); }, 0);
  };

  const saveTemplate = async () => {
    if (!selTpl) return;
    setTplSaving(true); setTplMsg({ type: "", text: "" });
    try {
      const res = await fetch(`/api/email-templates/${selTpl.key}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, bodyContent: editBody, closingContent: editClosing, footerContent: editFooter }),
      });
      if (res.ok) { setTplChanges(false); setTplMsg({ type: "success", text: "\u2713 Template saved" }); await load(); setTimeout(() => setTplMsg({ type: "", text: "" }), 3000); }
      else { const e = await res.json(); setTplMsg({ type: "error", text: e.error || "Save failed" }); }
    } finally { setTplSaving(false); }
  };

  const resetTemplate = async () => {
    if (!selTpl || !confirm(`Reset "${selTpl.name}" to system default?`)) return;
    setTplSaving(true);
    try {
      const res = await fetch(`/api/email-templates/${selTpl.key}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setTplChanges(false); await load(); if (d.template) selectTemplate(d.template); }
    } finally { setTplSaving(false); }
  };

  const generatePreview = async () => {
    if (!selTpl) return;
    const isOrderStage = selTpl.key === "order_stage";
    const res = await fetch(`/api/email-templates/preview/${selTpl.key}`, {
      method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: editSubject, bodyContent: editBody, closingContent: editClosing, footerContent: editFooter,
        stage: isOrderStage ? selectedStage : undefined,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setPreviewSubject(d.subject);
      setPreviewHtml(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;color:#333"><div style="background:#dc2626;color:#fff;padding:20px;text-align:center"><h1 style="margin:0;font-size:24px">Stealth Machine Tools</h1></div><div style="padding:30px">${d.bodyContent}${d.closingContent ? `<div style="margin-top:30px;padding-top:20px;border-top:1px solid #ddd">${d.closingContent}</div>` : ""}</div><div style="text-align:center;padding:20px;color:#666;font-size:12px;background:#f5f5f5">${d.footerContent}</div></div>`);
      setShowPreview(true);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail || !selTpl) return;
    setSendingTest(true);
    const isOrderStage = selTpl.key === "order_stage";
    const res = await fetch("/api/email-templates/test-send", {
      method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        templateKey: selTpl.key, toEmail: testEmail,
        stage: isOrderStage ? selectedStage : undefined,
      }),
    });
    const d = await res.json();
    if (d.success) { setTplMsg({ type: "success", text: `Test sent to ${testEmail}` }); setShowTestSend(false); setTestEmail(""); }
    else setTplMsg({ type: "error", text: d.message || "Send failed" });
    setSendingTest(false);
  };

  const saveStageEmails = async () => {
    setTplSaving(true);
    const res = await fetch("/api/email-templates/stages/config", {
      method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ stages: stageConfigs }),
    });
    if (res.ok) setTplMsg({ type: "success", text: "\u2713 Stage notifications saved" });
    else setTplMsg({ type: "error", text: "Save failed" });
    setTplSaving(false); setTimeout(() => setTplMsg({ type: "", text: "" }), 3000);
  };

  const groupedTemplates = {};
  templates.forEach(t => { const c = t.category || "other"; if (!groupedTemplates[c]) groupedTemplates[c] = []; groupedTemplates[c].push(t); });

  const isOrderStageSelected = selTpl?.key === "order_stage";
  const selectedStageLabel = EMAIL_STAGES.find(s => s.key === selectedStage)?.label || selectedStage;

  return (
    <>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {[["templates","Email Templates"],["stages","Stage Notifications"]].map(([id,label]) => (
          <button key={id} onClick={() => setEmailView(id)} style={{ padding: "9px 18px", background: "none", border: "none", borderBottom: emailView === id ? "2px solid #dc2626" : "2px solid transparent", color: emailView === id ? "#dc2626" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontWeight: emailView === id ? 600 : 400, marginBottom: -1 }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
          {tplMsg.text && <span style={{ fontSize: 12, color: tplMsg.type === "success" ? "#10b981" : "#dc2626" }}>{tplMsg.text}</span>}
        </div>
      </div>
      {loading ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "40px 0" }}>Loading templates…</div>
      : emailView === "templates" ? (
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, minHeight: 500 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.7px" }}>Templates</div>
            <div style={{ padding: 6 }}>
              {Object.entries(groupedTemplates).map(([cat, tpls]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ padding: "6px 10px", fontSize: 10, color: EMAIL_CATEGORIES[cat]?.color || "#999", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>{EMAIL_CATEGORIES[cat]?.label || cat}</div>
                  {tpls.map(t => (
                    <button key={t.key} onClick={() => selectTemplate(t)} style={{ width: "100%", textAlign: "left", padding: "9px 12px", background: selTpl?.key === t.key ? "rgba(255,255,255,0.06)" : "transparent", border: selTpl?.key === t.key ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.8)", marginBottom: 2, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      {t.name}{t.isCustomized && <span style={{ fontSize: 9, background: "#dc2626", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>EDITED</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
            {selTpl ? (
              <>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div><div style={{ fontSize: 16, fontWeight: 600 }}>{selTpl.name}</div>{selTpl.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{selTpl.description}</div>}</div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    {isOrderStageSelected && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Stage:</span>
                        <select value={selectedStage} onChange={e => setSelectedStage(e.target.value)} title="Pick which stage to use when previewing or test-sending this template" style={{ padding: "6px 10px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.85)", fontSize: 12, cursor: "pointer" }}>
                          {EMAIL_STAGES.map(s => <option key={s.key} value={s.key} style={{ background: "#1a1a1a" }}>{s.icon} {s.label}</option>)}
                        </select>
                      </div>
                    )}
                    <button onClick={generatePreview} style={{ padding: "6px 13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Preview</button>
                    <button onClick={() => setShowTestSend(true)} style={{ padding: "6px 13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Test Send</button>
                    {selTpl.isCustomized && <button onClick={resetTemplate} disabled={tplSaving} style={{ padding: "6px 13px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, cursor: "pointer", color: "#f59e0b", fontSize: 12 }}>Reset Default</button>}
                    <button onClick={saveTemplate} disabled={tplSaving || !tplChanges} style={{ padding: "6px 16px", background: tplChanges ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 6, cursor: tplChanges ? "pointer" : "not-allowed", color: tplChanges ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 600 }}>{tplSaving ? "Saving\u2026" : "Save"}</button>
                  </div>
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ marginBottom: 14 }}><label style={LBL}>Email Subject</label><input style={INP} value={editSubject} onChange={e => { setEditSubject(e.target.value); setTplChanges(true); }} /></div>
                  {selTpl.variables?.length > 0 && (
                    <div style={{ marginBottom: 14, padding: 14, background: "#252525", borderRadius: 7, border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Available Variables <span style={{ fontWeight: 400 }}>(click to insert)</span></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {selTpl.variables.map(v => <button key={v.name} onClick={() => insertVariable(v.name)} title={v.description} style={{ padding: "3px 9px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#60a5fa", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>&#123;&#123;{v.name}&#125;&#125;</button>)}
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}><label style={LBL}>Email Body (HTML)</label><textarea ref={bodyRef} value={editBody} onChange={e => { setEditBody(e.target.value); setTplChanges(true); }} style={{ ...INP, minHeight: 260, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }} /></div>
                  <div style={{ marginBottom: 14 }}><label style={LBL}>Closing / Sign-off (HTML) — optional</label><textarea value={editClosing} onChange={e => { setEditClosing(e.target.value); setTplChanges(true); }} style={{ ...INP, minHeight: 80, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }} /></div>
                  <div><label style={LBL}>Footer (HTML) — optional</label><textarea value={editFooter} onChange={e => { setEditFooter(e.target.value); setTplChanges(true); }} style={{ ...INP, minHeight: 60, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }} /></div>
                </div>
              </>
            ) : <div style={{ padding: "60px 24px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Select a template to edit</div>}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ ...CARD, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.7 }}>Configure the subject line and message body for each order stage notification. These are sent to customers when their items progress through manufacturing stages. Use <code style={{ background: "rgba(255,255,255,0.07)", padding: "0 4px", borderRadius: 3, color: "#60a5fa" }}>&#123;&#123;productCode&#125;&#125;</code> to insert the item&#39;s product code.</p>
          </div>
          {stageConfigs.map(stage => {
            const info = EMAIL_STAGES.find(s => s.key === stage.stage) || { label: stage.stage, icon: "\uD83D\uDCCC" };
            return (
              <div key={stage.stage} style={{ ...CARD, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stage.notify ? 16 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{info.icon}</span>
                    <div><div style={{ fontWeight: 600, fontSize: 14 }}>{info.label}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginTop: 2 }}>{stage.stage}</div></div>
                    {stage.isCustomized && <span style={{ fontSize: 9, background: "#dc2626", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>EDITED</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: stage.notify ? "#10b981" : "rgba(255,255,255,0.3)" }}>{stage.notify ? "Enabled" : "Disabled"}</span>
                    <div onClick={() => setStageConfigs(p => p.map(s => s.stage === stage.stage ? { ...s, notify: !s.notify } : s))} style={{ width: 40, height: 22, borderRadius: 11, background: stage.notify ? "#10b981" : "rgba(255,255,255,0.1)", position: "relative", cursor: "pointer", transition: "all 0.2s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: stage.notify ? 20 : 2, transition: "all 0.2s" }} />
                    </div>
                  </div>
                </div>
                {stage.notify && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div><label style={LBL}>Subject Line</label><input style={INP} value={stage.subject} onChange={e => setStageConfigs(p => p.map(s => s.stage === stage.stage ? { ...s, subject: e.target.value } : s))} /></div><div><label style={LBL}>Message Body</label><textarea value={stage.message} onChange={e => setStageConfigs(p => p.map(s => s.stage === stage.stage ? { ...s, message: e.target.value } : s))} style={{ ...INP, minHeight: 60, resize: "vertical", lineHeight: 1.5 }} /></div></div>}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, alignItems: "center" }}>
            {tplMsg.text && <span style={{ fontSize: 13, color: tplMsg.type === "success" ? "#10b981" : "#dc2626" }}>{tplMsg.text}</span>}
            <button onClick={saveStageEmails} disabled={tplSaving} style={{ padding: "9px 22px", background: "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{tplSaving ? "Saving\u2026" : "Save Stage Settings"}</button>
          </div>
        </div>
      )}

      <PreviewModal
        show={showPreview}
        onClose={() => setShowPreview(false)}
        html={previewHtml}
        subject={previewSubject}
        isOrderStageSelected={isOrderStageSelected}
        selectedStageLabel={selectedStageLabel}
      />
      <TestSendModal
        show={showTestSend}
        onClose={() => setShowTestSend(false)}
        selTpl={selTpl}
        testEmail={testEmail}
        setTestEmail={setTestEmail}
        sendingTest={sendingTest}
        onSend={sendTestEmail}
        isOrderStageSelected={isOrderStageSelected}
        selectedStageLabel={selectedStageLabel}
      />
    </>
  );
}
