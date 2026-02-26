"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

// ============================================
// CATEGORY CONFIG
// ============================================
const CATEGORIES = {
  invoicing: { label: "Invoicing", icon: "💰", color: "#10b981" },
  orders: { label: "Order Tracking", icon: "📦", color: "#3b82f6" },
  internal: { label: "Internal", icon: "🔒", color: "#8b5cf6" },
};

const STAGES = [
  { key: "MANUFACTURING", label: "Manufacturing", icon: "🏭" },
  { key: "TESTING", label: "Debugging & Testing", icon: "🔧" },
  { key: "SHIPPING", label: "Preparing Shipment", icon: "📦" },
  { key: "AT_SEA", label: "Container At Sea", icon: "🚢" },
  { key: "SMT", label: "Arrived at SMT", icon: "🏢" },
  { key: "QC", label: "Quality Control", icon: "✅" },
  { key: "DELIVERED", label: "Delivered", icon: "🎉" },
];

export default function EmailTemplatesPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();

  // Main state
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [stageConfigs, setStageConfigs] = useState([]);
  const [activeView, setActiveView] = useState("templates"); // templates | stages
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Editing state
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editClosing, setEditClosing] = useState("");
  const [editFooter, setEditFooter] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");

  // Test send state
  const [showTestSend, setShowTestSend] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Toast state
  const [toast, setToast] = useState(null);
  const bodyRef = useRef(null);

  // ============================================
  // EFFECTS
  // ============================================
  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
      router.push("/admin");
    } else {
      fetchAll();
    }
  }, [user, router]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ============================================
  // DATA FETCHING
  // ============================================
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
        // Auto-select first template
        if (data.length > 0 && !selectedTemplate) {
          selectTemplate(data[0]);
        }
      }

      if (stagesRes.ok) {
        const data = await stagesRes.json();
        setStageConfigs(data);
      }
    } catch (error) {
      console.error("Error fetching email templates:", error);
      showToast("Failed to load email templates", "error");
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // TEMPLATE SELECTION & EDITING
  // ============================================
  const selectTemplate = (tpl) => {
    if (hasChanges) {
      if (!confirm("You have unsaved changes. Switch template anyway?")) return;
    }
    setSelectedTemplate(tpl);
    setEditSubject(tpl.subject);
    setEditBody(tpl.bodyContent);
    setEditClosing(tpl.closingContent || "");
    setEditFooter(tpl.footerContent || "");
    setHasChanges(false);
    setShowPreview(false);
  };

  const handleFieldChange = (field, value) => {
    switch (field) {
      case "subject": setEditSubject(value); break;
      case "body": setEditBody(value); break;
      case "closing": setEditClosing(value); break;
      case "footer": setEditFooter(value); break;
    }
    setHasChanges(true);
  };

  const insertVariable = (varName) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = editBody;
    const insertion = `{{${varName}}}`;
    const newText = text.substring(0, start) + insertion + text.substring(end);
    setEditBody(newText);
    setHasChanges(true);
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  // ============================================
  // SAVE / RESET
  // ============================================
  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/email-templates/${selectedTemplate.key}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          bodyContent: editBody,
          closingContent: editClosing,
          footerContent: editFooter,
        }),
      });
      if (res.ok) {
        showToast(`"${selectedTemplate.name}" saved successfully`);
        setHasChanges(false);
        await fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to save template", "error");
      }
    } catch (error) {
      console.error("Error saving template:", error);
      showToast("Error saving template", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = async () => {
    if (!selectedTemplate) return;
    if (!confirm(`Reset "${selectedTemplate.name}" to the system default? This cannot be undone.`)) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/email-templates/${selectedTemplate.key}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`"${selectedTemplate.name}" reset to defaults`);
        setHasChanges(false);
        await fetchAll();
        // Re-select the template with defaults
        if (data.template) {
          selectTemplate(data.template);
        }
      } else {
        showToast("Failed to reset template", "error");
      }
    } catch (error) {
      showToast("Error resetting template", "error");
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // PREVIEW
  // ============================================
  const generatePreview = async () => {
    if (!selectedTemplate) return;
    try {
      const res = await fetch(`/api/email-templates/preview/${selectedTemplate.key}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          bodyContent: editBody,
          closingContent: editClosing,
          footerContent: editFooter,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewSubject(data.subject);
        // Build a full preview HTML
        setPreviewHtml(`
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; color: #333;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Stealth Machine Tools</h1>
            </div>
            <div style="padding: 30px;">
              ${data.bodyContent}
              ${data.closingContent ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">${data.closingContent}</div>` : ''}
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f5f5f5;">
              ${data.footerContent}
            </div>
          </div>
        `);
        setShowPreview(true);
      }
    } catch (error) {
      showToast("Error generating preview", "error");
    }
  };

  // ============================================
  // TEST SEND
  // ============================================
  const sendTestEmail = async () => {
    if (!testEmail || !selectedTemplate) return;
    try {
      setSendingTest(true);
      const res = await fetch("/api/email-templates/test-send", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: selectedTemplate.key,
          toEmail: testEmail,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setShowTestSend(false);
        setTestEmail("");
      } else {
        showToast(data.message || "Failed to send test email", "error");
      }
    } catch (error) {
      showToast("Error sending test email", "error");
    } finally {
      setSendingTest(false);
    }
  };

  // ============================================
  // STAGE CONFIGS
  // ============================================
  const updateStageConfig = (stage, field, value) => {
    setStageConfigs(prev =>
      prev.map(s => (s.stage === stage ? { ...s, [field]: value } : s))
    );
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
      if (res.ok) {
        showToast("Stage email settings saved");
        setHasChanges(false);
      } else {
        showToast("Failed to save stage settings", "error");
      }
    } catch (error) {
      showToast("Error saving stage settings", "error");
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // RENDER HELPERS
  // ============================================
  if (!user) return null;
  if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) return null;

  const groupedTemplates = {};
  templates.forEach(t => {
    const cat = t.category || "other";
    if (!groupedTemplates[cat]) groupedTemplates[cat] = [];
    groupedTemplates[cat].push(t);
  });

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "100px 24px 40px" }}>
        {/* Page Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: "700", color: "#ef4444", margin: 0 }}>
              ✉️ Email Templates
            </h1>
            <p style={{ color: "#999", margin: "8px 0 0", fontSize: "14px" }}>
              Manage and customize all system email templates
            </p>
          </div>
        </div>

        {/* View Tabs */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "24px", borderBottom: "2px solid #333" }}>
          <button
            onClick={() => { setActiveView("templates"); setHasChanges(false); }}
            style={{
              padding: "12px 24px", background: "none", border: "none",
              color: activeView === "templates" ? "#ef4444" : "#999",
              borderBottom: activeView === "templates" ? "2px solid #ef4444" : "2px solid transparent",
              cursor: "pointer", fontSize: "16px", marginBottom: "-2px", fontWeight: "600",
            }}
          >
            📧 Email Templates
          </button>
          <button
            onClick={() => { setActiveView("stages"); setHasChanges(false); }}
            style={{
              padding: "12px 24px", background: "none", border: "none",
              color: activeView === "stages" ? "#ef4444" : "#999",
              borderBottom: activeView === "stages" ? "2px solid #ef4444" : "2px solid transparent",
              cursor: "pointer", fontSize: "16px", marginBottom: "-2px", fontWeight: "600",
            }}
          >
            📊 Stage Notifications
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#666" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>⏳</div>
            Loading email templates...
          </div>
        ) : activeView === "templates" ? (
          /* ============================================ */
          /* TEMPLATES VIEW                              */
          /* ============================================ */
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", minHeight: "600px" }}>
            {/* Left Sidebar - Template List */}
            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #333" }}>
                <h3 style={{ margin: 0, fontSize: "14px", color: "#999", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Templates
                </h3>
              </div>
              <div style={{ padding: "8px" }}>
                {Object.entries(groupedTemplates).map(([category, tpls]) => (
                  <div key={category} style={{ marginBottom: "12px" }}>
                    <div style={{
                      padding: "8px 12px", fontSize: "11px", color: CATEGORIES[category]?.color || "#999",
                      textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700",
                      display: "flex", alignItems: "center", gap: "6px",
                    }}>
                      {CATEGORIES[category]?.icon} {CATEGORIES[category]?.label || category}
                    </div>
                    {tpls.map(tpl => (
                      <button
                        key={tpl.key}
                        onClick={() => selectTemplate(tpl)}
                        style={{
                          width: "100%", textAlign: "left", padding: "12px 16px",
                          background: selectedTemplate?.key === tpl.key ? "#252525" : "transparent",
                          border: selectedTemplate?.key === tpl.key ? "1px solid #444" : "1px solid transparent",
                          borderRadius: "6px", cursor: "pointer", color: "white", marginBottom: "2px",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ fontWeight: "500", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          {tpl.name}
                          {tpl.isCustomized && (
                            <span style={{
                              fontSize: "10px", background: "#dc2626", color: "white",
                              padding: "2px 6px", borderRadius: "3px", fontWeight: "600",
                            }}>
                              EDITED
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Content - Template Editor */}
            <div>
              {selectedTemplate ? (
                <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
                  {/* Editor Header */}
                  <div style={{
                    padding: "20px 24px", borderBottom: "1px solid #333",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>
                        {selectedTemplate.name}
                      </h2>
                      <p style={{ margin: "4px 0 0", color: "#999", fontSize: "13px" }}>
                        {selectedTemplate.description}
                      </p>
                      {selectedTemplate.isCustomized && selectedTemplate.lastUpdatedBy && (
                        <p style={{ margin: "4px 0 0", color: "#666", fontSize: "12px" }}>
                          Last edited by {selectedTemplate.lastUpdatedBy}
                          {selectedTemplate.lastUpdatedAt && ` on ${new Date(selectedTemplate.lastUpdatedAt).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={generatePreview}
                        style={{
                          padding: "8px 16px", background: "#333", color: "white",
                          border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px",
                          display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        👁️ Preview
                      </button>
                      <button
                        onClick={() => setShowTestSend(true)}
                        style={{
                          padding: "8px 16px", background: "#333", color: "white",
                          border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px",
                          display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        📤 Test Send
                      </button>
                      {selectedTemplate.isCustomized && (
                        <button
                          onClick={resetTemplate}
                          disabled={saving}
                          style={{
                            padding: "8px 16px", background: "#333", color: "#f59e0b",
                            border: "1px solid #f59e0b33", borderRadius: "6px", cursor: "pointer",
                            fontSize: "13px", display: "flex", alignItems: "center", gap: "6px",
                          }}
                        >
                          ↩️ Reset Default
                        </button>
                      )}
                      <button
                        onClick={saveTemplate}
                        disabled={saving || !hasChanges}
                        style={{
                          padding: "8px 20px",
                          background: hasChanges ? "#dc2626" : "#444",
                          color: "white", border: "none", borderRadius: "6px",
                          cursor: hasChanges ? "pointer" : "not-allowed",
                          fontSize: "13px", fontWeight: "600",
                          display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        {saving ? "⏳ Saving..." : "💾 Save"}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "24px" }}>
                    {/* Subject Line */}
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Email Subject
                      </label>
                      <input
                        type="text"
                        value={editSubject}
                        onChange={(e) => handleFieldChange("subject", e.target.value)}
                        style={{
                          width: "100%", padding: "12px 14px", background: "#252525",
                          border: "1px solid #333", color: "white", borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </div>

                    {/* Available Variables */}
                    <div style={{
                      marginBottom: "20px", background: "#252525", borderRadius: "6px",
                      border: "1px solid #333", padding: "16px",
                    }}>
                      <div style={{
                        fontSize: "12px", color: "#999", fontWeight: "600",
                        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px",
                        display: "flex", alignItems: "center", gap: "6px",
                      }}>
                        🔗 Available Variables <span style={{ color: "#666", fontWeight: "400" }}>(click to insert)</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {selectedTemplate.variables?.map(v => (
                          <button
                            key={v.name}
                            onClick={() => insertVariable(v.name)}
                            title={v.description}
                            style={{
                              padding: "4px 10px", background: "#1a1a1a", border: "1px solid #444",
                              color: "#60a5fa", borderRadius: "4px", cursor: "pointer", fontSize: "12px",
                              fontFamily: "monospace", transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { e.target.style.background = "#333"; e.target.style.borderColor = "#60a5fa"; }}
                            onMouseLeave={(e) => { e.target.style.background = "#1a1a1a"; e.target.style.borderColor = "#444"; }}
                          >
                            {"{{" + v.name + "}}"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Body Content */}
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Email Body (HTML)
                      </label>
                      <textarea
                        ref={bodyRef}
                        value={editBody}
                        onChange={(e) => handleFieldChange("body", e.target.value)}
                        style={{
                          width: "100%", minHeight: "320px", padding: "14px",
                          background: "#252525", border: "1px solid #333", color: "#e2e8f0",
                          borderRadius: "6px", fontSize: "13px", fontFamily: "monospace",
                          lineHeight: "1.6", resize: "vertical",
                        }}
                      />
                    </div>

                    {/* Closing Content */}
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Closing / Sign-off (HTML) <span style={{ fontWeight: "400", color: "#666" }}>— optional</span>
                      </label>
                      <textarea
                        value={editClosing}
                        onChange={(e) => handleFieldChange("closing", e.target.value)}
                        style={{
                          width: "100%", minHeight: "100px", padding: "14px",
                          background: "#252525", border: "1px solid #333", color: "#e2e8f0",
                          borderRadius: "6px", fontSize: "13px", fontFamily: "monospace",
                          lineHeight: "1.6", resize: "vertical",
                        }}
                      />
                    </div>

                    {/* Footer Content */}
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Email Footer (HTML) <span style={{ fontWeight: "400", color: "#666" }}>— optional</span>
                      </label>
                      <textarea
                        value={editFooter}
                        onChange={(e) => handleFieldChange("footer", e.target.value)}
                        style={{
                          width: "100%", minHeight: "80px", padding: "14px",
                          background: "#252525", border: "1px solid #333", color: "#e2e8f0",
                          borderRadius: "6px", fontSize: "13px", fontFamily: "monospace",
                          lineHeight: "1.6", resize: "vertical",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333",
                  padding: "80px 24px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>✉️</div>
                  <p style={{ color: "#999", fontSize: "16px" }}>Select a template from the sidebar to begin editing</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ============================================ */
          /* STAGE NOTIFICATIONS VIEW                    */
          /* ============================================ */
          <div>
            <div style={{
              background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "6px", padding: "16px 20px", marginBottom: "24px",
              display: "flex", gap: "12px", alignItems: "flex-start",
            }}>
              <span style={{ fontSize: "20px" }}>💡</span>
              <div>
                <div style={{ fontWeight: "600", marginBottom: "4px" }}>Stage Email Configuration</div>
                <div style={{ color: "#999", fontSize: "13px" }}>
                  Configure the subject line and message body for each order stage notification.
                  These messages are sent to customers when their items progress through manufacturing stages.
                  Use <code style={{ color: "#60a5fa", background: "#252525", padding: "1px 4px", borderRadius: "3px" }}>{"{{productCode}}"}</code> to insert the item's product code.
                </div>
              </div>
            </div>

            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
              {stageConfigs.map((stage, idx) => {
                const stageInfo = STAGES.find(s => s.key === stage.stage) || { label: stage.stage, icon: "📌" };
                return (
                  <div
                    key={stage.stage}
                    style={{
                      padding: "24px",
                      borderBottom: idx < stageConfigs.length - 1 ? "1px solid #333" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "24px" }}>{stageInfo.icon}</span>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>{stageInfo.label}</h3>
                          <span style={{
                            fontSize: "11px", color: "#666", fontFamily: "monospace",
                            background: "#252525", padding: "2px 6px", borderRadius: "3px",
                          }}>
                            {stage.stage}
                          </span>
                        </div>
                        {stage.isCustomized && (
                          <span style={{
                            fontSize: "10px", background: "#dc2626", color: "white",
                            padding: "2px 6px", borderRadius: "3px", fontWeight: "600",
                          }}>
                            EDITED
                          </span>
                        )}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: stage.notify ? "#10b981" : "#666" }}>
                          {stage.notify ? "Enabled" : "Disabled"}
                        </span>
                        <div
                          onClick={() => updateStageConfig(stage.stage, "notify", !stage.notify)}
                          style={{
                            width: "44px", height: "24px", borderRadius: "12px",
                            background: stage.notify ? "#10b981" : "#333",
                            position: "relative", cursor: "pointer", transition: "all 0.2s",
                          }}
                        >
                          <div style={{
                            width: "20px", height: "20px", borderRadius: "50%",
                            background: "white", position: "absolute", top: "2px",
                            left: stage.notify ? "22px" : "2px",
                            transition: "all 0.2s",
                          }} />
                        </div>
                      </label>
                    </div>

                    {stage.notify && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div>
                          <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                            Subject Line
                          </label>
                          <input
                            type="text"
                            value={stage.subject}
                            onChange={(e) => updateStageConfig(stage.stage, "subject", e.target.value)}
                            style={{
                              width: "100%", padding: "10px 12px", background: "#252525",
                              border: "1px solid #333", color: "white", borderRadius: "6px",
                              fontSize: "13px",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                            Message Body
                          </label>
                          <textarea
                            value={stage.message}
                            onChange={(e) => updateStageConfig(stage.stage, "message", e.target.value)}
                            style={{
                              width: "100%", minHeight: "70px", padding: "10px 12px",
                              background: "#252525", border: "1px solid #333", color: "white",
                              borderRadius: "6px", fontSize: "13px", resize: "vertical",
                              lineHeight: "1.5",
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button
                onClick={saveStageConfigs}
                disabled={saving || !hasChanges}
                style={{
                  padding: "12px 32px",
                  background: hasChanges ? "#dc2626" : "#444",
                  color: "white", border: "none", borderRadius: "6px",
                  cursor: hasChanges ? "pointer" : "not-allowed",
                  fontSize: "14px", fontWeight: "600",
                }}
              >
                {saving ? "⏳ Saving..." : "💾 Save Stage Settings"}
              </button>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* PREVIEW MODAL                               */}
        {/* ============================================ */}
        {showPreview && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => setShowPreview(false)}>
            <div style={{
              backgroundColor: "#1f1f1f", border: "1px solid #404040",
              borderRadius: "8px", width: "90%", maxWidth: "700px",
              maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column",
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px" }}>📧 Email Preview</h3>
                  <p style={{ margin: "4px 0 0", color: "#999", fontSize: "13px" }}>
                    Subject: {previewSubject}
                  </p>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{ background: "#333", color: "white", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" }}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "24px", background: "#f5f5f5" }}>
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* TEST SEND MODAL                             */}
        {/* ============================================ */}
        {showTestSend && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => setShowTestSend(false)}>
            <div style={{
              backgroundColor: "#1f1f1f", border: "1px solid #404040",
              borderRadius: "8px", padding: "24px", width: "90%", maxWidth: "450px",
            }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 16px", fontSize: "18px" }}>📤 Send Test Email</h3>
              <p style={{ color: "#999", fontSize: "13px", marginBottom: "16px" }}>
                Send a test version of "{selectedTemplate?.name}" with sample data.
              </p>
              <label style={{ display: "block", marginBottom: "6px", color: "#999", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>
                Recipient Email
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: "100%", padding: "12px 14px", background: "#252525",
                  border: "1px solid #333", color: "white", borderRadius: "6px",
                  fontSize: "14px", marginBottom: "20px",
                }}
              />
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowTestSend(false)}
                  style={{ background: "#333", color: "white", border: "none", borderRadius: "6px", padding: "10px 20px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={sendTestEmail}
                  disabled={sendingTest || !testEmail}
                  style={{
                    background: testEmail ? "#dc2626" : "#444", color: "white", border: "none",
                    borderRadius: "6px", padding: "10px 20px", cursor: testEmail ? "pointer" : "not-allowed",
                    fontWeight: "600",
                  }}
                >
                  {sendingTest ? "⏳ Sending..." : "📤 Send Test"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* TOAST NOTIFICATION                          */}
        {/* ============================================ */}
        {toast && (
          <div style={{
            position: "fixed", top: "100px", right: "24px",
            backgroundColor: "#1f1f1f", border: `1px solid ${toast.type === "error" ? "#ef4444" : "#10b981"}`,
            borderRadius: "8px", padding: "14px 20px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)", zIndex: 1002,
            maxWidth: "400px", display: "flex", alignItems: "center", gap: "10px",
          }}>
            <span style={{ fontSize: "18px" }}>
              {toast.type === "error" ? "❌" : "✅"}
            </span>
            <span style={{ color: "#d1d5db", fontSize: "14px" }}>{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
