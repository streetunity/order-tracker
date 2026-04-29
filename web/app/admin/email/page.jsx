"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const CATEGORIES = {
  invoicing:  { label: "Invoicing",        icon: "\uD83D\uDCB0", color: "#10b981" },
  orders:     { label: "Order Tracking",   icon: "\uD83D\uDCE6", color: "#3b82f6" },
  internal:   { label: "Internal",         icon: "\uD83D\uDD12", color: "#8b5cf6" },
  documents:  { label: "Document Changes", icon: "\uD83D\uDCC1", color: "#f59e0b" },
};

const STAGES = [
  { key: "MANUFACTURING", label: "Manufacturing",       icon: "\uD83C\uDFED" },
  { key: "TESTING",       label: "Debugging & Testing", icon: "\uD83D\uDD27" },
  { key: "SHIPPING",      label: "Preparing Shipment",  icon: "\uD83D\uDCE6" },
  { key: "AT_SEA",        label: "Container At Sea",    icon: "\uD83D\uDEA2" },
  { key: "SMT",           label: "Arrived at SMT",      icon: "\uD83C\uDFE2" },
  { key: "QC",            label: "Quality Control",     icon: "\u2705" },
  { key: "DELIVERED",     label: "Delivered",           icon: "\uD83C\uDF89" },
];

export default function EmailTemplatesPage() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [loading,           setLoading]           = useState(true);
  const [templates,         setTemplates]         = useState([]);
  const [stageConfigs,      setStageConfigs]      = useState([]);
  const [activeView,        setActiveView]        = useState("templates");
  const [selectedTemplate,  setSelectedTemplate]  = useState(null);

  const [editSubject,  setEditSubject]  = useState("");
  const [editBody,     setEditBody]     = useState("");
  const [editClosing,  setEditClosing]  = useState("");
  const [editFooter,   setEditFooter]   = useState("");
  const [hasChanges,   setHasChanges]   = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Stage selector for the order_stage template's preview / test send.
  // Defaults to AT_SEA to preserve the prior preview behavior. Persists
  // across template switches so users don't have to re-pick when toggling.
  const [selectedStage, setSelectedStage] = useState("AT_SEA");

  // Customer files template state (Document Changes tab)
  const [docTemplate,        setDocTemplate]        = useState(null);
  const [editDocSubject,     setEditDocSubject]     = useState("");
  const [editDocBody,        setEditDocBody]        = useState("");
  const [editDocFooter,      setEditDocFooter]      = useState("");
  const [docHasChanges,      setDocHasChanges]      = useState(false);
  const [docSaving,          setDocSaving]          = useState(false);
  const docBodyRef = useRef(null);

  const [showPreview,    setShowPreview]    = useState(false);
  const [previewHtml,    setPreviewHtml]    = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewStageLabel, setPreviewStageLabel] = useState("");
  const [showTestSend,   setShowTestSend]   = useState(false);
  const [testEmail,      setTestEmail]      = useState("");
  const [sendingTest,    setSendingTest]    = useState(false);
  const [toast,          setToast]          = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) { router.push("/admin"); return; }
    fetchAll();
  }, [user, authLoading, router]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [templatesRes, stagesRes] = await Promise.all([
        fetch("/api/email-templates", { headers, cache: "no-store" }),
        fetch("/api/email-templates/stages/config", { headers, cache: "no-store" }),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data);
        // Find and load the customer_files template for the Document Changes tab
        const docTpl = data.find(t => t.key === 'customer_files');
        if (docTpl) {
          setDocTemplate(docTpl);
          setEditDocSubject(docTpl.subject);
          setEditDocBody(docTpl.bodyContent);
          setEditDocFooter(docTpl.footerContent || '');
        }
        // Auto-select first non-documents template for the main tab
        const firstNonDoc = data.find(t => t.category !== 'documents');
        if (firstNonDoc && !selectedTemplate) selectTemplate(firstNonDoc);
      }

      if (stagesRes.ok) setStageConfigs(await stagesRes.json());
    } catch (error) {
      console.error("Error fetching email templates:", error);
      showToast("Failed to load email templates", "error");
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = (tpl) => {
    if (hasChanges && !confirm("You have unsaved changes. Switch template anyway?")) return;
    setSelectedTemplate(tpl);
    setEditSubject(tpl.subject);
    setEditBody(tpl.bodyContent);
    setEditClosing(tpl.closingContent || '');
    setEditFooter(tpl.footerContent || '');
    setHasChanges(false);
    setShowPreview(false);
  };

  const handleFieldChange = (field, value) => {
    switch (field) {
      case "subject": setEditSubject(value); break;
      case "body":    setEditBody(value);    break;
      case "closing": setEditClosing(value); break;
      case "footer":  setEditFooter(value);  break;
    }
    setHasChanges(true);
  };

  const insertVariable = (varName) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const insertion = `{{${varName}}}`;
    const newText = editBody.substring(0, start) + insertion + editBody.substring(end);
    setEditBody(newText);
    setHasChanges(true);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + insertion.length, start + insertion.length); }, 0);
  };

  const insertDocVariable = (varName) => {
    const textarea = docBodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const insertion = `{{${varName}}}`;
    const newText = editDocBody.substring(0, start) + insertion + editDocBody.substring(end);
    setEditDocBody(newText);
    setDocHasChanges(true);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + insertion.length, start + insertion.length); }, 0);
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/email-templates/${selectedTemplate.key}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, bodyContent: editBody, closingContent: editClosing, footerContent: editFooter }),
      });
      if (res.ok) {
        showToast(`"${selectedTemplate.name}" saved successfully`);
        setHasChanges(false);
        await fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to save template", "error");
      }
    } catch { showToast("Error saving template", "error"); }
    finally { setSaving(false); }
  };

  const resetTemplate = async () => {
    if (!selectedTemplate) return;
    if (!confirm(`Reset "${selectedTemplate.name}" to the system default? This cannot be undone.`)) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/email-templates/${selectedTemplate.key}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        showToast(`"${selectedTemplate.name}" reset to defaults`);
        setHasChanges(false);
        await fetchAll();
        if (data.template) selectTemplate(data.template);
      } else { showToast("Failed to reset template", "error"); }
    } catch { showToast("Error resetting template", "error"); }
    finally { setSaving(false); }
  };

  // Save / reset for Document Changes tab
  const saveDocTemplate = async () => {
    try {
      setDocSaving(true);
      const res = await fetch('/api/email-templates/customer_files', {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editDocSubject, bodyContent: editDocBody, closingContent: '', footerContent: editDocFooter }),
      });
      if (res.ok) {
        showToast('Customer files notification template saved');
        setDocHasChanges(false);
        await fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save', 'error');
      }
    } catch { showToast('Error saving template', 'error'); }
    finally { setDocSaving(false); }
  };

  const resetDocTemplate = async () => {
    if (!confirm('Reset the customer files notification template to the system default? This cannot be undone.')) return;
    try {
      setDocSaving(true);
      const res = await fetch('/api/email-templates/customer_files', { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) {
        showToast('Template reset to defaults');
        setDocHasChanges(false);
        await fetchAll();
      } else { showToast('Failed to reset template', 'error'); }
    } catch { showToast('Error resetting template', 'error'); }
    finally { setDocSaving(false); }
  };

  const generatePreview = async () => {
    if (!selectedTemplate) return;
    try {
      const isOrderStage = selectedTemplate.key === 'order_stage';
      const stageObj = isOrderStage ? STAGES.find(s => s.key === selectedStage) : null;
      const res = await fetch(`/api/email-templates/preview/${selectedTemplate.key}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          bodyContent: editBody,
          closingContent: editClosing,
          footerContent: editFooter,
          // Only meaningful for order_stage; backend ignores for other keys.
          stage: isOrderStage ? selectedStage : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewSubject(data.subject);
        setPreviewStageLabel(stageObj ? `${stageObj.icon} ${stageObj.label}` : "");
        setPreviewHtml(`
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; color: #333;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Stealth Machine Tools</h1>
            </div>
            <div style="padding: 30px;">
              ${data.bodyContent}
              ${data.closingContent ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">${data.closingContent}</div>` : ''}
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f5f5f5;">${data.footerContent}</div>
          </div>
        `);
        setShowPreview(true);
      }
    } catch { showToast("Error generating preview", "error"); }
  };

  const sendTestEmail = async () => {
    if (!testEmail || !selectedTemplate) return;
    try {
      setSendingTest(true);
      const isOrderStage = selectedTemplate.key === 'order_stage';
      const res = await fetch("/api/email-templates/test-send", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: selectedTemplate.key,
          toEmail: testEmail,
          // Only meaningful for order_stage; backend ignores for other keys.
          stage: isOrderStage ? selectedStage : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) { showToast(data.message); setShowTestSend(false); setTestEmail(''); }
      else { showToast(data.message || "Failed to send test email", "error"); }
    } catch { showToast("Error sending test email", "error"); }
    finally { setSendingTest(false); }
  };

  const updateStageConfig = (stage, field, value) => {
    setStageConfigs(prev => prev.map(s => s.stage === stage ? { ...s, [field]: value } : s));
    setHasChanges(true);
  };

  const saveStageConfigs = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/email-templates/stages/config", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stages: stageConfigs }),
      });
      if (res.ok) { showToast("Stage email settings saved"); setHasChanges(false); }
      else { showToast("Failed to save stage settings", "error"); }
    } catch { showToast("Error saving stage settings", "error"); }
    finally { setSaving(false); }
  };

  if (authLoading) return (<><TopNav /><div style={{ padding: "100px 24px", textAlign: "center", color: "#666" }}>Loading...</div></>);
  if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return null;

  // Only show non-documents templates in the sidebar
  const groupedTemplates = {};
  templates.filter(t => t.category !== 'documents').forEach(t => {
    const cat = t.category || "other";
    if (!groupedTemplates[cat]) groupedTemplates[cat] = [];
    groupedTemplates[cat].push(t);
  });

  const tabBtn = (id, label) => (
    <button
      onClick={() => { setActiveView(id); setHasChanges(false); }}
      style={{
        padding: "12px 24px", background: "none", border: "none",
        color: activeView === id ? "#ef4444" : "#999",
        borderBottom: activeView === id ? "2px solid #ef4444" : "2px solid transparent",
        cursor: "pointer", fontSize: "16px", marginBottom: "-2px", fontWeight: "600",
      }}
    >
      {label}
    </button>
  );

  // Used in editor header (only for order_stage) and the test send modal description.
  const isOrderStageSelected = selectedTemplate?.key === 'order_stage';
  const selectedStageLabel = STAGES.find(s => s.key === selectedStage)?.label || selectedStage;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "100px 24px 40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: "700", color: "#ef4444", margin: 0 }}>✉️ Email Templates</h1>
            <p style={{ color: "#999", margin: "8px 0 0", fontSize: "14px" }}>Manage and customize all system email templates</p>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "24px", borderBottom: "2px solid #333" }}>
          {tabBtn("templates", "\uD83D\uDCE7 Email Templates")}
          {tabBtn("stages",    "\uD83D\uDCCA Stage Notifications")}
          {tabBtn("documents", "\uD83D\uDCC1 Document Changes")}
        </div>

        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#666" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>⏳</div>
            Loading email templates...
          </div>
        ) : activeView === "templates" ? (

          /* ── EMAIL TEMPLATES TAB ── */
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", minHeight: "600px" }}>
            {/* Sidebar */}
            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #333" }}>
                <h3 style={{ margin: 0, fontSize: "14px", color: "#999", textTransform: "uppercase", letterSpacing: "1px" }}>Templates</h3>
              </div>
              <div style={{ padding: "8px" }}>
                {Object.entries(groupedTemplates).map(([category, tpls]) => (
                  <div key={category} style={{ marginBottom: "12px" }}>
                    <div style={{ padding: "8px 12px", fontSize: "11px", color: CATEGORIES[category]?.color || "#999", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                      {CATEGORIES[category]?.icon} {CATEGORIES[category]?.label || category}
                    </div>
                    {tpls.map(tpl => (
                      <button key={tpl.key} onClick={() => selectTemplate(tpl)} style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: selectedTemplate?.key === tpl.key ? "#252525" : "transparent", border: selectedTemplate?.key === tpl.key ? "1px solid #444" : "1px solid transparent", borderRadius: "6px", cursor: "pointer", color: "white", marginBottom: "2px", transition: "all 0.15s" }}>
                        <div style={{ fontWeight: "500", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          {tpl.name}
                          {tpl.isCustomized && <span style={{ fontSize: "10px", background: "#dc2626", color: "white", padding: "2px 6px", borderRadius: "3px", fontWeight: "600" }}>EDITED</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div>
              {selectedTemplate ? (
                <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
                  <div style={{ padding: "20px 24px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>{selectedTemplate.name}</h2>
                      <p style={{ margin: "4px 0 0", color: "#999", fontSize: "13px" }}>{selectedTemplate.description}</p>
                      {selectedTemplate.isCustomized && selectedTemplate.lastUpdatedBy && (
                        <p style={{ margin: "4px 0 0", color: "#666", fontSize: "12px" }}>Last edited by {selectedTemplate.lastUpdatedBy}{selectedTemplate.lastUpdatedAt && ` on ${new Date(selectedTemplate.lastUpdatedAt).toLocaleDateString()}`}</p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      {isOrderStageSelected && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", color: "#999", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Stage:</span>
                          <select
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                            title="Pick which stage to use when previewing or test-sending this template"
                            style={{ padding: "8px 12px", background: "#252525", border: "1px solid #333", color: "white", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}
                          >
                            {STAGES.map(s => (
                              <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button onClick={generatePreview} style={{ padding: "8px 16px", background: "#333", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>👁️ Preview</button>
                      <button onClick={() => setShowTestSend(true)} style={{ padding: "8px 16px", background: "#333", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>📤 Test Send</button>
                      {selectedTemplate.isCustomized && (
                        <button onClick={resetTemplate} disabled={saving} style={{ padding: "8px 16px", background: "#333", color: "#f59e0b", border: "1px solid #f59e0b33", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>↩️ Reset Default</button>
                      )}
                      <button onClick={saveTemplate} disabled={saving || !hasChanges} style={{ padding: "8px 20px", background: hasChanges ? "#dc2626" : "#444", color: "white", border: "none", borderRadius: "6px", cursor: hasChanges ? "pointer" : "not-allowed", fontSize: "13px", fontWeight: "600" }}>
                        {saving ? "⏳ Saving..." : "💾 Save"}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "24px" }}>
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Subject</label>
                      <input type="text" value={editSubject} onChange={(e) => handleFieldChange("subject", e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "#252525", border: "1px solid #333", color: "white", borderRadius: "6px", fontSize: "14px" }} />
                    </div>

                    <div style={{ marginBottom: "20px", background: "#252525", borderRadius: "6px", border: "1px solid #333", padding: "16px" }}>
                      <div style={{ fontSize: "12px", color: "#999", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>🔗 Available Variables <span style={{ color: "#666", fontWeight: "400" }}>(click to insert)</span></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {selectedTemplate.variables?.map(v => (
                          <button key={v.name} onClick={() => insertVariable(v.name)} title={v.description} style={{ padding: "4px 10px", background: "#1a1a1a", border: "1px solid #444", color: "#60a5fa", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontFamily: "monospace" }}
                            onMouseEnter={(e) => { e.target.style.background = "#333"; e.target.style.borderColor = "#60a5fa"; }}
                            onMouseLeave={(e) => { e.target.style.background = "#1a1a1a"; e.target.style.borderColor = "#444"; }}
                          >{"{{" + v.name + "}}"}  </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Body (HTML)</label>
                      <textarea ref={bodyRef} value={editBody} onChange={(e) => handleFieldChange("body", e.target.value)} style={{ width: "100%", minHeight: "320px", padding: "14px", background: "#252525", border: "1px solid #333", color: "#e2e8f0", borderRadius: "6px", fontSize: "13px", fontFamily: "monospace", lineHeight: "1.6", resize: "vertical" }} />
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Closing / Sign-off (HTML) <span style={{ fontWeight: "400", color: "#666" }}>— optional</span></label>
                      <textarea value={editClosing} onChange={(e) => handleFieldChange("closing", e.target.value)} style={{ width: "100%", minHeight: "100px", padding: "14px", background: "#252525", border: "1px solid #333", color: "#e2e8f0", borderRadius: "6px", fontSize: "13px", fontFamily: "monospace", lineHeight: "1.6", resize: "vertical" }} />
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Footer (HTML) <span style={{ fontWeight: "400", color: "#666" }}>— optional</span></label>
                      <textarea value={editFooter} onChange={(e) => handleFieldChange("footer", e.target.value)} style={{ width: "100%", minHeight: "80px", padding: "14px", background: "#252525", border: "1px solid #333", color: "#e2e8f0", borderRadius: "6px", fontSize: "13px", fontFamily: "monospace", lineHeight: "1.6", resize: "vertical" }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", padding: "80px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>✉️</div>
                  <p style={{ color: "#999", fontSize: "16px" }}>Select a template from the sidebar to begin editing</p>
                </div>
              )}
            </div>
          </div>

        ) : activeView === "stages" ? (

          /* ── STAGE NOTIFICATIONS TAB ── */
          <div>
            <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "6px", padding: "16px 20px", marginBottom: "24px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "20px" }}>💡</span>
              <div>
                <div style={{ fontWeight: "600", marginBottom: "4px" }}>Stage Email Configuration</div>
                <div style={{ color: "#999", fontSize: "13px" }}>Configure the subject line and message body for each order stage notification. Use <code style={{ color: "#60a5fa", background: "#252525", padding: "1px 4px", borderRadius: "3px" }}>{"{{productCode}}"}</code> to insert the item's product code.</div>
              </div>
            </div>

            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
              {stageConfigs.map((stage, idx) => {
                const stageInfo = STAGES.find(s => s.key === stage.stage) || { label: stage.stage, icon: "\uD83D\uDCCC" };
                return (
                  <div key={stage.stage} style={{ padding: "24px", borderBottom: idx < stageConfigs.length - 1 ? "1px solid #333" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "24px" }}>{stageInfo.icon}</span>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>{stageInfo.label}</h3>
                          <span style={{ fontSize: "11px", color: "#666", fontFamily: "monospace", background: "#252525", padding: "2px 6px", borderRadius: "3px" }}>{stage.stage}</span>
                        </div>
                        {stage.isCustomized && <span style={{ fontSize: "10px", background: "#dc2626", color: "white", padding: "2px 6px", borderRadius: "3px", fontWeight: "600" }}>EDITED</span>}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: stage.notify ? "#10b981" : "#666" }}>{stage.notify ? "Enabled" : "Disabled"}</span>
                        <div onClick={() => updateStageConfig(stage.stage, "notify", !stage.notify)} style={{ width: "44px", height: "24px", borderRadius: "12px", background: stage.notify ? "#10b981" : "#333", position: "relative", cursor: "pointer", transition: "all 0.2s" }}>
                          <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "white", position: "absolute", top: "2px", left: stage.notify ? "22px" : "2px", transition: "all 0.2s" }} />
                        </div>
                      </label>
                    </div>
                    {stage.notify && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div>
                          <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Subject Line</label>
                          <input type="text" value={stage.subject} onChange={(e) => updateStageConfig(stage.stage, "subject", e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#252525", border: "1px solid #333", color: "white", borderRadius: "6px", fontSize: "13px" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Message Body</label>
                          <textarea value={stage.message} onChange={(e) => updateStageConfig(stage.stage, "message", e.target.value)} style={{ width: "100%", minHeight: "70px", padding: "10px 12px", background: "#252525", border: "1px solid #333", color: "white", borderRadius: "6px", fontSize: "13px", resize: "vertical", lineHeight: "1.5" }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button onClick={saveStageConfigs} disabled={saving || !hasChanges} style={{ padding: "12px 32px", background: hasChanges ? "#dc2626" : "#444", color: "white", border: "none", borderRadius: "6px", cursor: hasChanges ? "pointer" : "not-allowed", fontSize: "14px", fontWeight: "600" }}>
                {saving ? "⏳ Saving..." : "💾 Save Stage Settings"}
              </button>
            </div>
          </div>

        ) : (

          /* ── DOCUMENT CHANGES TAB ── */
          <div style={{ maxWidth: "900px" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "6px", padding: "16px 20px", marginBottom: "24px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "20px" }}>📁</span>
              <div>
                <div style={{ fontWeight: "600", marginBottom: "4px" }}>Customer Files Notification</div>
                <div style={{ color: "#999", fontSize: "13px" }}>
                  This email is sent to customers when you click "Notify Customer" from the customer files manager.
                  Customize the subject and body below. Available variables will be substituted automatically when the email is sent.
                </div>
              </div>
            </div>

            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>Customer Files Notification</h2>
                  {docTemplate?.isCustomized && docTemplate?.lastUpdatedBy && (
                    <p style={{ margin: "4px 0 0", color: "#666", fontSize: "12px" }}>Last edited by {docTemplate.lastUpdatedBy}{docTemplate.lastUpdatedAt && ` on ${new Date(docTemplate.lastUpdatedAt).toLocaleDateString()}`}</p>
                  )}
                  {!docTemplate?.isCustomized && (
                    <p style={{ margin: "4px 0 0", color: "#666", fontSize: "12px" }}>Using system default</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {docTemplate?.isCustomized && (
                    <button onClick={resetDocTemplate} disabled={docSaving} style={{ padding: "8px 16px", background: "#333", color: "#f59e0b", border: "1px solid #f59e0b33", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>↩️ Reset Default</button>
                  )}
                  <button onClick={saveDocTemplate} disabled={docSaving || !docHasChanges} style={{ padding: "8px 20px", background: docHasChanges ? "#dc2626" : "#444", color: "white", border: "none", borderRadius: "6px", cursor: docHasChanges ? "pointer" : "not-allowed", fontSize: "13px", fontWeight: "600" }}>
                    {docSaving ? "⏳ Saving..." : "💾 Save"}
                  </button>
                </div>
              </div>

              <div style={{ padding: "24px" }}>
                {/* Subject */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Subject</label>
                  <input type="text" value={editDocSubject} onChange={(e) => { setEditDocSubject(e.target.value); setDocHasChanges(true); }} style={{ width: "100%", padding: "12px 14px", background: "#252525", border: "1px solid #333", color: "white", borderRadius: "6px", fontSize: "14px" }} />
                </div>

                {/* Variables */}
                <div style={{ marginBottom: "20px", background: "#252525", borderRadius: "6px", border: "1px solid #333", padding: "16px" }}>
                  <div style={{ fontSize: "12px", color: "#999", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>🔗 Available Variables <span style={{ color: "#666", fontWeight: "400" }}>(click to insert into body)</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {(docTemplate?.variables || []).map(v => (
                      <button key={v.name} onClick={() => insertDocVariable(v.name)} title={v.description} style={{ padding: "4px 10px", background: "#1a1a1a", border: "1px solid #444", color: "#60a5fa", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontFamily: "monospace" }}
                        onMouseEnter={(e) => { e.target.style.background = "#333"; e.target.style.borderColor = "#60a5fa"; }}
                        onMouseLeave={(e) => { e.target.style.background = "#1a1a1a"; e.target.style.borderColor = "#444"; }}
                      >{"{{" + v.name + "}}"}</button>
                    ))}
                  </div>
                </div>

                {/* Body */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Body (HTML)</label>
                  <textarea ref={docBodyRef} value={editDocBody} onChange={(e) => { setEditDocBody(e.target.value); setDocHasChanges(true); }} style={{ width: "100%", minHeight: "320px", padding: "14px", background: "#252525", border: "1px solid #333", color: "#e2e8f0", borderRadius: "6px", fontSize: "13px", fontFamily: "monospace", lineHeight: "1.6", resize: "vertical" }} />
                </div>

                {/* Footer */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Footer (HTML) <span style={{ fontWeight: "400", color: "#666" }}>— optional</span></label>
                  <textarea value={editDocFooter} onChange={(e) => { setEditDocFooter(e.target.value); setDocHasChanges(true); }} style={{ width: "100%", minHeight: "80px", padding: "14px", background: "#252525", border: "1px solid #333", color: "#e2e8f0", borderRadius: "6px", fontSize: "13px", fontFamily: "monospace", lineHeight: "1.6", resize: "vertical" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreview && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowPreview(false)}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", width: "90%", maxWidth: "700px", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px" }}>📧 Email Preview{previewStageLabel ? ` — ${previewStageLabel}` : ""}</h3>
                  <p style={{ margin: "4px 0 0", color: "#999", fontSize: "13px" }}>Subject: {previewSubject}</p>
                </div>
                <button onClick={() => setShowPreview(false)} style={{ background: "#333", color: "white", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" }}>✕ Close</button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "24px", background: "#f5f5f5" }}>
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        )}

        {/* Test Send Modal */}
        {showTestSend && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowTestSend(false)}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "24px", width: "90%", maxWidth: "450px" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 16px", fontSize: "18px" }}>📤 Send Test Email</h3>
              <p style={{ color: "#999", fontSize: "13px", marginBottom: "16px" }}>
                Send a test version of "{selectedTemplate?.name}"
                {isOrderStageSelected ? ` for the ${selectedStageLabel} stage` : ''} with sample data.
              </p>
              <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Recipient Email</label>
              <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" style={{ width: "100%", padding: "12px 14px", background: "#252525", border: "1px solid #333", color: "white", borderRadius: "6px", fontSize: "14px", marginBottom: "20px" }} />
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button onClick={() => setShowTestSend(false)} style={{ background: "#333", color: "white", border: "none", borderRadius: "6px", padding: "10px 20px", cursor: "pointer" }}>Cancel</button>
                <button onClick={sendTestEmail} disabled={sendingTest || !testEmail} style={{ background: testEmail ? "#dc2626" : "#444", color: "white", border: "none", borderRadius: "6px", padding: "10px 20px", cursor: testEmail ? "pointer" : "not-allowed", fontWeight: "600" }}>
                  {sendingTest ? "⏳ Sending..." : "📤 Send Test"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", top: "100px", right: "24px", backgroundColor: "#1f1f1f", border: `1px solid ${toast.type === "error" ? "#ef4444" : "#10b981"}`, borderRadius: "8px", padding: "14px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", zIndex: 1002, maxWidth: "400px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>{toast.type === "error" ? "❌" : "✅"}</span>
            <span style={{ color: "#d1d5db", fontSize: "14px" }}>{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
