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

  // ---- Alert email opt-out ----
  const [alertEmailsEnabled, setAlertEmailsEnabled] = useState(true);

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

  // Alert-emails toggle is shown to roles that actually receive internal
  // alert emails (admins + sales agents). Brokers and manufacturers never
  // receive these so hiding the toggle keeps the UI focused.
  const showAlertToggle = !isManufacturer && !isBroker;

  // Read ?from= on the client side
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFromInvoicing(params.get("from") === "invoicing");
  }, []);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    setName(user.name || "");
    setEmail(user.email || "");
    setAlertEmailsEnabled(user.alertEmailsEnabled ?? true);
    loadEmailSettings();
    loadIcsState();
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    const origAlerts = user.alertEmailsEnabled ?? true;
    setHasChanges(
      name !== (user.name || "") ||
      email !== (user.email || "") ||
      alertEmailsEnabled !== origAlerts
    );
  }, [name, email, alertEmailsEnabled, user]);

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
      if (showAlertToggle) body.alertEmailsEnabled = alertEmailsEnabled;
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update profile");
      }
      setMessage({ type: "success", text: "Profile updated successfully" });
      setHasChanges(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally { setSaving(false); }
  }

  async function handleSaveEmailSettings() {
    if (!emailHasChanges) return;
    setEmailSaving(true); setEmailMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/users/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ fromName, title, phoneNumber, mobileNumber, emailSignature, invoiceEmailBody, estimateEmailBody })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update email settings");
      }
      const data = await res.json();
      applyEmailSettings(data);
      setEmailMessage({ type: "success", text: "Email settings saved" });
      setTimeout(() => setEmailMessage({ type: "", text: "" }), 3000);
    } catch (err) {
      setEmailMessage({ type: "error", text: err.message });
    } finally { setEmailSaving(false); }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (newPassword !== confirmPassword) { setPwError("New passwords don't match"); return; }
    if (newPassword.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    setPwLoading(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to change password");
      }
      setPwSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      setPwError(err.message);
    } finally { setPwLoading(false); }
  }

  // ---- Calendar Sync API ----
  async function loadIcsState() {
    setIcsLoading(true); setIcsError("");
    try {
      const res = await fetch("/api/users/me/ics-feed", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load calendar settings");
      const data = await res.json();
      setIcsEnabled(!!data.enabled);
      setIcsFeedUrl(data.feedUrl || "");
    } catch (e) {
      setIcsError(e.message || "Unable to load calendar settings");
    } finally { setIcsLoading(false); }
  }

  async function handleIcsEnable() {
    setIcsBusy(true); setIcsError("");
    try {
      const res = await fetch("/api/users/me/ics-feed", {
        method: "POST", headers: getAuthHeaders()
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to enable calendar sync");
      }
      const data = await res.json();
      setIcsEnabled(true);
      setIcsFeedUrl(data.feedUrl || "");
      setIcsConfirm(null);
    } catch (e) {
      setIcsError(e.message);
    } finally { setIcsBusy(false); }
  }

  async function handleIcsDisable() {
    setIcsBusy(true); setIcsError("");
    try {
      const res = await fetch("/api/users/me/ics-feed", {
        method: "DELETE", headers: getAuthHeaders()
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to disable calendar sync");
      }
      setIcsEnabled(false);
      setIcsFeedUrl("");
      setIcsConfirm(null);
    } catch (e) {
      setIcsError(e.message);
    } finally { setIcsBusy(false); }
  }

  function handleIcsCopy() {
    if (!icsFeedUrl) return;
    navigator.clipboard.writeText(icsFeedUrl).then(
      () => { setIcsCopied(true); setTimeout(() => setIcsCopied(false), 1500); },
      () => setIcsError("Unable to copy to clipboard")
    );
  }

  if (!user) return null;

  // ----- Styles -----
  const PAD = "24px 28px";
  const CARD = {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: PAD,
  };
  const LBL = { display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 };
  const INP = {
    width: "100%", padding: "10px 14px",
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 7, color: "rgba(255,255,255,0.9)",
    fontSize: 14, outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <>
      {fromInvoicing ? <InvoicingNav /> : <TopNav />}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.95)", margin: 0, letterSpacing: "-0.5px" }}>Profile Settings</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0" }}>
            Manage your account, email defaults, password, and calendar sync.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 24, flexWrap: "wrap" }}>
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "10px 18px",
                background: "transparent",
                border: "none",
                borderBottom: activeTab === t.id ? "2px solid #dc2626" : "2px solid transparent",
                color: activeTab === t.id ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                marginBottom: -1, transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Account Information */}
        {activeTab === "account" && (
          <div style={CARD}>
            <div style={{ marginBottom: 18 }}>
              <label style={LBL}>Username</label>
              <div style={{ ...INP, background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.5)", cursor: "not-allowed" }}>{user.username || user.email}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>Username cannot be changed.</div>
            </div>

            {!isManufacturer && (
              <div style={{ marginBottom: 18 }}>
                <label style={LBL}>Display Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} style={INP} />
              </div>
            )}

            <div style={{ marginBottom: showAlertToggle ? 18 : 6 }}>
              <label style={LBL}>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={INP} />
            </div>

            {showAlertToggle && (
              <div style={{ marginBottom: 6 }}>
                <label style={LBL}>Alert Emails</label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={alertEmailsEnabled}
                    onChange={e => setAlertEmailsEnabled(e.target.checked)}
                    style={{ accentColor: "#dc2626", width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                    Send me alert emails (late orders, items in jeopardy, weekly summary)
                  </span>
                </label>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
                  Turn this off if you don't want to receive any of the system-generated alert emails.
                </div>
              </div>
            )}

            {message.text && (
              <div style={{ marginTop: 18, padding: "10px 14px", borderRadius: 8, fontSize: 13, background: message.type === "success" ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)", border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(220,38,38,0.3)"}`, color: message.type === "success" ? "#10b981" : "#dc2626" }}>
                {message.text}
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button
                onClick={handleSaveProfile}
                disabled={!hasChanges || saving}
                style={{ padding: "10px 20px", background: hasChanges && !saving ? "#dc2626" : "rgba(220,38,38,0.4)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: hasChanges && !saving ? "pointer" : "not-allowed" }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {hasChanges && (
                <button onClick={() => { setName(user.name || ""); setEmail(user.email || ""); setAlertEmailsEnabled(user.alertEmailsEnabled ?? true); }} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              )}
            </div>
          </div>
        )}

        {/* Email Settings */}
        {activeTab === "email" && !hideExtras && (
          <div style={CARD}>
            {emailSettingsLoading ? (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "20px 0" }}>Loading…</div>
            ) : (
              <>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>From Name</label>
                  <input type="text" value={fromName} onChange={e => setFromName(e.target.value)} placeholder={user.name} style={INP} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>Shown as the sender on invoice & estimate emails.</div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Title</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sales Representative" style={INP} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Phone Number</label>
                  <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="e.g. 877-45LASER" style={INP} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Mobile Number</label>
                  <input type="text" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="e.g. 555-123-4567" style={INP} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Email Signature</label>
                  <textarea
                    value={emailSignature}
                    onChange={e => setEmailSignature(e.target.value)}
                    placeholder="Your signature text appended to all outgoing emails…"
                    rows={4}
                    style={{ ...INP, resize: "vertical", lineHeight: 1.6 }}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Invoice Email Body</label>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Optional. Used when sending invoices.</div>
                  <textarea value={invoiceEmailBody} onChange={e => setInvoiceEmailBody(e.target.value)} placeholder="Leave blank to use the system default template…" rows={5} style={{ ...INP, resize: "vertical", lineHeight: 1.6, marginTop: 8 }} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Estimate Email Body</label>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Optional. Used when sending estimates.</div>
                  <textarea value={estimateEmailBody} onChange={e => setEstimateEmailBody(e.target.value)} placeholder="Leave blank to use the system default template…" rows={5} style={{ ...INP, resize: "vertical", lineHeight: 1.6, marginTop: 8 }} />
                </div>

                {emailMessage.text && (
                  <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 8, fontSize: 13, background: emailMessage.type === "success" ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)", border: `1px solid ${emailMessage.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(220,38,38,0.3)"}`, color: emailMessage.type === "success" ? "#10b981" : "#dc2626" }}>
                    {emailMessage.text}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={handleSaveEmailSettings}
                    disabled={!emailHasChanges || emailSaving}
                    style={{ padding: "10px 20px", background: emailHasChanges && !emailSaving ? "#dc2626" : "rgba(220,38,38,0.4)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: emailHasChanges && !emailSaving ? "pointer" : "not-allowed" }}
                  >
                    {emailSaving ? "Saving..." : "Save Email Settings"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Change Password */}
        {activeTab === "password" && (
          <div style={CARD}>
            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 18 }}>
                <label style={LBL}>Current Password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={INP} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={LBL}>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} style={INP} />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>Minimum 8 characters.</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={LBL}>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} style={INP} />
              </div>

              {pwError && (
                <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, color: "#dc2626", fontSize: 13, marginBottom: 18 }}>{pwError}</div>
              )}
              {pwSuccess && (
                <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, color: "#10b981", fontSize: 13, marginBottom: 18 }}>Password updated successfully.</div>
              )}

              <button
                type="submit"
                disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                style={{ padding: "10px 20px", background: (pwLoading || !currentPassword || !newPassword || !confirmPassword) ? "rgba(220,38,38,0.4)" : "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (pwLoading || !currentPassword || !newPassword || !confirmPassword) ? "not-allowed" : "pointer" }}
              >
                {pwLoading ? "Updating..." : "Change Password"}
              </button>
            </form>
          </div>
        )}

        {/* Calendar Sync */}
        {activeTab === "calendar" && !hideExtras && (
          <div style={CARD}>
            {icsLoading ? (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "20px 0" }}>Loading…</div>
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
