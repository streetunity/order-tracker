"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import InvoicingNav from "@/components/InvoicingNav";

const TABS = [
  { id: "account",  label: "Account Information" },
  { id: "email",    label: "Email Settings" },
  { id: "password", label: "Change Password" },
  { id: "calendar", label: "Calendar Sync" },
];

export default function ProfilePage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("account");
  const [fromInvoicing, setFromInvoicing] = useState(false);

  // ---- Account Info ----
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [message,    setMessage]    = useState({ type: "", text: "" });
  const [hasChanges, setHasChanges] = useState(false);

  // ---- Email Settings ----
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(true);
  const [emailSaving,          setEmailSaving]          = useState(false);
  const [emailMessage,         setEmailMessage]         = useState({ type: "", text: "" });
  const [emailHasChanges,      setEmailHasChanges]      = useState(false);
  const [fromName,           setFromName]           = useState("");
  const [title,              setTitle]              = useState("");
  const [phoneNumber,        setPhoneNumber]        = useState("");
  const [mobileNumber,       setMobileNumber]       = useState("");
  const [emailSignature,     setEmailSignature]     = useState("");
  const [invoiceEmailBody,   setInvoiceEmailBody]   = useState("");
  const [estimateEmailBody,  setEstimateEmailBody]  = useState("");
  const [origEmailSettings,  setOrigEmailSettings]  = useState({});

  // ---- Change Password ----
  const [currentPassword,  setCurrentPassword]  = useState("");
  const [newPassword,      setNewPassword]      = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");
  const [pwLoading,        setPwLoading]        = useState(false);
  const [pwError,          setPwError]          = useState("");
  const [pwSuccess,        setPwSuccess]        = useState(false);

  // ---- Calendar Sync ----
  const [icsLoading,   setIcsLoading]   = useState(true);
  const [icsEnabled,   setIcsEnabled]   = useState(false);
  const [icsFeedUrl,   setIcsFeedUrl]   = useState("");
  const [icsBusy,      setIcsBusy]      = useState(false);
  const [icsError,     setIcsError]     = useState("");
  const [icsCopied,    setIcsCopied]    = useState(false);
  const [icsConfirm,   setIcsConfirm]   = useState(null); // 'regenerate' | 'disable' | null

  const isManufacturer = user?.role === "MANUFACTURER";
  const isBroker       = user?.role === "BROKER";

  // Brokers and manufacturers don't need email-template settings or
  // outbound calendar sync; hide those tabs for them.
  const hideExtras  = isManufacturer || isBroker;
  const visibleTabs = hideExtras
    ? TABS.filter(t => t.id !== "email" && t.id !== "calendar")
    : TABS;

  // Read ?from= on the client side
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFromInvoicing(params.get("from") === "invoicing");
  }, []);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    setName(user.name || "");
    setEmail(user.email || "");
    loadEmailSettings();
    loadIcsState();
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    setHasChanges(name !== (user.name || "") || email !== (user.email || ""));
  }, [name, email, user]);

  useEffect(() => {
    const cur = { fromName, title, phoneNumber, mobileNumber, emailSignature, invoiceEmailBody, estimateEmailBody };
    setEmailHasChanges(Object.keys(cur).some(k => cur[k] !== origEmailSettings[k]));
  }, [fromName, title, phoneNumber, mobileNumber, emailSignature, invoiceEmailBody, estimateEmailBody, origEmailSettings]);

  async function loadEmailSettings() {
    setEmailSettingsLoading(true);
    try {
      const res = await fetch("/api/users/email-settings", { headers: getAuthHeaders() });
      if (res.ok) applyEmailSettings(await res.json());
    } catch (e) { console.error(e); }
    finally { setEmailSettingsLoading(false); }
  }

  function applyEmailSettings(d) {
    const vals = {
      fromName:          d.fromName          || "",
      title:             d.title             || "",
      phoneNumber:       d.phoneNumber       || "",
      mobileNumber:      d.mobileNumber      || "",
      emailSignature:    d.emailSignature    || "",
      invoiceEmailBody:  d.invoiceEmailBody  || "",
      estimateEmailBody: d.estimateEmailBody || "",
    };
    setFromName(vals.fromName); setTitle(vals.title);
    setPhoneNumber(vals.phoneNumber); setMobileNumber(vals.mobileNumber);
    setEmailSignature(vals.emailSignature); setInvoiceEmailBody(vals.invoiceEmailBody);
    setEstimateEmailBody(vals.estimateEmailBody);
    setOrigEmailSettings(vals); setEmailHasChanges(false);
  }

  async function handleSaveProfile() {
    if (!hasChanges) return;
    setSaving(true); setMessage({ type: "", text: "" });
    try {
      const body = { email: email.trim().toLowerCase() };
      if (!isManufacturer) body.name = name.trim();
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated. Refreshing\u2026" });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "Failed to update profile" });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to update profile." });
    } finally { setSaving(false); }
  }

  async function handleSaveEmailSettings() {
    if (!emailHasChanges) return;
    setEmailSaving(true); setEmailMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/users/email-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ fromName, title, phoneNumber, mobileNumber, emailSignature, invoiceEmailBody, estimateEmailBody })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      applyEmailSettings(d);
      setEmailMessage({ type: "success", text: "Email settings saved." });
      setTimeout(() => setEmailMessage({ type: "", text: "" }), 3000);
    } catch (e) {
      setEmailMessage({ type: "error", text: e.message });
    } finally { setEmailSaving(false); }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (!currentPassword || !newPassword || !confirmPassword) { setPwError("All fields are required"); return; }
    if (newPassword.length < 6) { setPwError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setPwError("New passwords do not match"); return; }
    try {
      setPwLoading(true);
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      setPwSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 5000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally { setPwLoading(false); }
  }

  async function loadIcsState() {
    setIcsLoading(true); setIcsError("");
    try {
      const res = await fetch("/api/users/me/ics-token", { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setIcsEnabled(!!d.enabled);
        setIcsFeedUrl(d.feedUrl || "");
      } else {
        setIcsError("Failed to load calendar sync status.");
      }
    } catch (e) { setIcsError("Failed to load calendar sync status."); }
    finally { setIcsLoading(false); }
  }

  async function handleIcsEnable() {
    setIcsBusy(true); setIcsError("");
    try {
      const res = await fetch("/api/users/me/ics-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to enable sync");
      setIcsEnabled(true); setIcsFeedUrl(d.feedUrl || "");
    } catch (e) { setIcsError(e.message); }
    finally { setIcsBusy(false); setIcsConfirm(null); }
  }

  async function handleIcsDisable() {
    setIcsBusy(true); setIcsError("");
    try {
      const res = await fetch("/api/users/me/ics-token", {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to disable sync");
      setIcsEnabled(false); setIcsFeedUrl("");
    } catch (e) { setIcsError(e.message); }
    finally { setIcsBusy(false); setIcsConfirm(null); }
  }

  async function handleIcsCopy() {
    if (!icsFeedUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(icsFeedUrl);
      } else {
        // Fallback: select the input so the user can copy manually.
        const inp = document.getElementById("ics-feed-url");
        if (inp) { inp.select(); document.execCommand("copy"); }
      }
      setIcsCopied(true);
      setTimeout(() => setIcsCopied(false), 2000);
    } catch (e) { setIcsError("Copy failed -- please select and copy manually."); }
  }

  function formatDate(dateValue, includeTime = false) {
    if (!dateValue) return "N/A";
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "N/A";
      const opts = { month: "long", day: "numeric", year: "numeric" };
      if (includeTime) { opts.hour = "numeric"; opts.minute = "2-digit"; }
      return date.toLocaleDateString("en-US", opts);
    } catch { return "N/A"; }
  }

  if (!user) return null;

  const INP  = { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.9)", fontSize: 13, boxSizing: "border-box", outline: "none" };
  const LBL  = { display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.45)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.6px" };
  const CARD = { background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 28 };

  function SectionHeader({ label }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ width: 3, height: 14, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>{label}</h3>
      </div>
    );
  }

  function SaveBar({ hasChanges, saving, onSave, message }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 10 }}>
        {message.text
          ? <span style={{ fontSize: 13, color: message.type === "success" ? "#10b981" : "#dc2626" }}>{message.text}</span>
          : <span />}
        <button
          onClick={onSave}
          disabled={!hasChanges || saving}
          style={{ padding: "9px 20px", background: hasChanges && !saving ? "#dc2626" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 7, color: hasChanges && !saving ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600, cursor: hasChanges && !saving ? "pointer" : "not-allowed" }}
        >
          {saving ? "Saving\u2026" : hasChanges ? "Save Changes" : "No Changes"}
        </button>
      </div>
    );
  }

  const tabStyle = (id) => ({
    padding: "10px 20px", background: "none", border: "none",
    borderBottom: activeTab === id ? "2px solid #dc2626" : "2px solid transparent",
    color: activeTab === id ? "#dc2626" : "rgba(255,255,255,0.45)",
    cursor: "pointer", fontSize: 13, fontWeight: activeTab === id ? 600 : 400,
    marginBottom: -1, transition: "all 0.15s", whiteSpace: "nowrap",
  });

  return (
    <>
      {fromInvoicing ? <InvoicingNav /> : <TopNav />}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "80px 24px 80px" }}>

        {/* Avatar + name header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,#991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {user.name ? (user.name.split(" ").length >= 2 ? user.name.split(" ")[0][0] + user.name.split(" ")[1][0] : user.name.substring(0, 2)).toUpperCase() : "??"}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{user.name}</div>
            <span style={{ padding: "3px 10px", background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 20, color: "#dc2626", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{user.role}</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 24 }}>
          {visibleTabs.map(tab => (
            <button key={tab.id} style={tabStyle(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* -- Tab 1: Account Information -- */}
        {activeTab === "account" && (
          <div style={CARD}>
            <SectionHeader label="Account Information" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={LBL}>Full Name {isManufacturer && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(locked)</span>}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => !isManufacturer && setName(e.target.value)}
                  disabled={isManufacturer}
                  style={{ ...INP, opacity: isManufacturer ? 0.5 : 1, cursor: isManufacturer ? "not-allowed" : "text" }}
                />
              </div>
              <div>
                <label style={LBL}>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={INP} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>Member since {formatDate(user.createdAt)}</span>
              {user.lastLogin && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>Last login {formatDate(user.lastLogin, true)}</span>}
            </div>
            <SaveBar hasChanges={hasChanges} saving={saving} onSave={handleSaveProfile} message={message} />
          </div>
        )}

        {/* -- Tab 2: Email Settings -- */}
        {activeTab === "email" && (
          <div style={CARD}>
            <SectionHeader label="Email Settings" />
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 18, lineHeight: 1.6, marginTop: -8 }}>
              These settings personalise the emails you send to customers. Your signature and contact details are automatically inserted into outgoing emails.
            </p>

            {emailSettingsLoading ? (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "20px 0" }}>Loading\u2026</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={LBL}>From Name</label>
                    <input type="text" value={fromName} onChange={e => setFromName(e.target.value)} placeholder={user.name} style={INP} />
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Displayed as sender. Defaults to your account name.</div>
                  </div>
                  <div>
                    <label style={LBL}>Title / Role</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sales Representative" style={INP} />
                  </div>
                  <div>
                    <label style={LBL}>Phone Number</label>
                    <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="e.g. 877-45LASER" style={INP} />
                  </div>
                  <div>
                    <label style={LBL}>Mobile Number</label>
                    <input type="text" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="e.g. 555-123-4567" style={INP} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>Email Signature</label>
                  <textarea
                    value={emailSignature}
                    onChange={e => setEmailSignature(e.target.value)}
                    placeholder="Your signature text appended to all outgoing emails\u2026"
                    rows={4}
                    style={{ ...INP, resize: "vertical", lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                    Plain text. Inserted via the <code style={{ background: "rgba(255,255,255,0.07)", padding: "0 4px", borderRadius: 3 }}>&#123;&#123;signature&#125;&#125;</code> variable in email templates.
                  </div>
                </div>

                <details style={{ marginBottom: 14 }}>
                  <summary style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", userSelect: "none", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.6px" }}>Default Invoice Email Body (optional)</summary>
                  <textarea value={invoiceEmailBody} onChange={e => setInvoiceEmailBody(e.target.value)} placeholder="Leave blank to use the system default template\u2026" rows={5} style={{ ...INP, resize: "vertical", lineHeight: 1.6, marginTop: 8 }} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Overrides the system default invoice email body when you send invoices.</div>
                </details>

                <details>
                  <summary style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", userSelect: "none", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.6px" }}>Default Estimate Email Body (optional)</summary>
                  <textarea value={estimateEmailBody} onChange={e => setEstimateEmailBody(e.target.value)} placeholder="Leave blank to use the system default template\u2026" rows={5} style={{ ...INP, resize: "vertical", lineHeight: 1.6, marginTop: 8 }} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Overrides the system default estimate email body when you send estimates.</div>
                </details>

                <SaveBar hasChanges={emailHasChanges} saving={emailSaving} onSave={handleSaveEmailSettings} message={emailMessage} />
              </>
            )}
          </div>
        )}

        {/* -- Tab 3: Change Password -- */}
        {activeTab === "password" && (
          <div style={CARD}>
            <SectionHeader label="Change Password" />

            {pwSuccess && (
              <div style={{ padding: "12px 16px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, color: "#10b981", marginBottom: 20 }}>
                &#10003; Password changed successfully!
              </div>
            )}

            {pwError && (
              <div style={{ padding: "12px 16px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, color: "#dc2626", marginBottom: 20 }}>
                {pwError}
              </div>
            )}

            <form onSubmit={handleChangePassword}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={LBL}>Current Password</label>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={INP} />
                </div>
                <div>
                  <label style={LBL}>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} style={INP} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>At least 6 characters</div>
                </div>
                <div>
                  <label style={LBL}>Confirm New Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={INP} />
                </div>
              </div>
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={pwLoading}
                  style={{ padding: "9px 24px", background: pwLoading ? "rgba(220,38,38,0.4)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: pwLoading ? "not-allowed" : "pointer" }}
                >
                  {pwLoading ? "Changing\u2026" : "Change Password"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* -- Tab 4: Calendar Sync -- */}
        {activeTab === "calendar" && (
          <div style={CARD}>
            <SectionHeader label="Calendar Subscription" />

            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 18, lineHeight: 1.6, marginTop: -8 }}>
              Subscribe to your Order Tracker calendar from Google, Apple, or Outlook. Events you can see in the in-app calendar will appear in your external calendar. Updates may take several hours to appear depending on your calendar app's refresh schedule.
            </p>

            {icsLoading ? (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "20px 0" }}>Loading\u2026</div>
            ) : (
              <>
                {/* Status indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: icsEnabled ? "#10b981" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: icsEnabled ? "#10b981" : "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                    {icsEnabled ? "Active" : "Not Enabled"}
                  </span>
                </div>

                {icsError && (
                  <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, color: "#dc2626", fontSize: 13, marginBottom: 16 }}>
                    {icsError}
                  </div>
                )}

                {!icsEnabled && (
                  <div>
                    <button
                      onClick={handleIcsEnable}
                      disabled={icsBusy}
                      style={{ padding: "10px 20px", background: icsBusy ? "rgba(220,38,38,0.4)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: icsBusy ? "not-allowed" : "pointer" }}
                    >
                      {icsBusy ? "Enabling\u2026" : "Enable Calendar Sync"}
                    </button>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 8 }}>
                      Generates a private subscription URL you can add to your calendar app.
                    </div>
                  </div>
                )}

                {icsEnabled && (
                  <>
                    {/* URL + Copy */}
                    <label style={LBL}>Subscription URL</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 16 }}>
                      <input
                        id="ics-feed-url"
                        type="text"
                        value={icsFeedUrl}
                        readOnly
                        onClick={e => e.target.select()}
                        style={{ ...INP, flex: 1 }}
                      />
                      <button
                        onClick={handleIcsCopy}
                        style={{
                          padding: "0 16px", minWidth: 92,
                          background: icsCopied ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
                          border: `1px solid ${icsCopied ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: 7,
                          color: icsCopied ? "#10b981" : "rgba(255,255,255,0.7)",
                          fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                          transition: "all 0.15s",
                        }}
                      >
                        {icsCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 18 }}>
                      Keep this URL private. Anyone with it can read your calendar.
                    </div>

                    {/* Instructions */}
                    <details style={{ marginBottom: 10 }}>
                      <summary style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", userSelect: "none", padding: "8px 0", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                        Google Calendar
                      </summary>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, padding: "8px 0 12px 4px" }}>
                        Open Google Calendar. In the left sidebar, click the <strong>+</strong> next to <strong>Other calendars</strong>, choose <strong>From URL</strong>, paste the URL above, click <strong>Add calendar</strong>.
                      </div>
                    </details>

                    <details style={{ marginBottom: 10 }}>
                      <summary style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", userSelect: "none", padding: "8px 0", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                        Apple Calendar (Mac)
                      </summary>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, padding: "8px 0 12px 4px" }}>
                        Open Calendar. <strong>File &rarr; New Calendar Subscription</strong>. Paste the URL above and click <strong>Subscribe</strong>. Choose your preferred refresh frequency.
                      </div>
                    </details>

                    <details style={{ marginBottom: 20 }}>
                      <summary style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", userSelect: "none", padding: "8px 0", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                        Apple Calendar (iPhone / iPad)
                      </summary>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, padding: "8px 0 12px 4px" }}>
                        <strong>Settings &rarr; Calendar &rarr; Accounts &rarr; Add Account &rarr; Other &rarr; Add Subscribed Calendar</strong>. Paste the URL and tap <strong>Next</strong>.
                      </div>
                    </details>

                    {/* Confirm prompts */}
                    {icsConfirm === "regenerate" && (
                      <div style={{ padding: "14px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, marginBottom: 14 }}>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, marginBottom: 12 }}>
                          This will break the connection to any calendar app currently subscribed to your old URL. You will need to update the URL in each one. Continue?
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setIcsConfirm(null)} disabled={icsBusy} style={{ padding: "7px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                          <button onClick={handleIcsEnable} disabled={icsBusy} style={{ padding: "7px 16px", background: icsBusy ? "rgba(245,158,11,0.4)" : "#f59e0b", border: "none", borderRadius: 7, color: "#000", fontSize: 13, fontWeight: 600, cursor: icsBusy ? "not-allowed" : "pointer" }}>
                            {icsBusy ? "Regenerating\u2026" : "Regenerate URL"}
                          </button>
                        </div>
                      </div>
                    )}

                    {icsConfirm === "disable" && (
                      <div style={{ padding: "14px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, marginBottom: 14 }}>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, marginBottom: 12 }}>
                          This will stop your external calendars from receiving updates. Continue?
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setIcsConfirm(null)} disabled={icsBusy} style={{ padding: "7px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                          <button onClick={handleIcsDisable} disabled={icsBusy} style={{ padding: "7px 16px", background: icsBusy ? "rgba(220,38,38,0.4)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: icsBusy ? "not-allowed" : "pointer" }}>
                            {icsBusy ? "Disabling\u2026" : "Disable Sync"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {!icsConfirm && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <button
                          onClick={() => { setIcsError(""); setIcsConfirm("regenerate"); }}
                          style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(245,158,11,0.5)", borderRadius: 7, color: "#f59e0b", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                        >
                          Regenerate URL
                        </button>
                        <button
                          onClick={() => { setIcsError(""); setIcsConfirm("disable"); }}
                          style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(220,38,38,0.5)", borderRadius: 7, color: "#dc2626", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                        >
                          Disable Sync
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </>
  );
}
