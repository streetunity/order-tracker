"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const STATUS_COLORS = {
  NEW:       { bg: 'rgba(59, 130, 246, 0.2)',  border: 'rgba(59, 130, 246, 0.5)',  text: '#60a5fa' },
  CONTACTED: { bg: 'rgba(234, 179, 8, 0.2)',   border: 'rgba(234, 179, 8, 0.5)',   text: '#facc15' },
  QUALIFIED: { bg: 'rgba(34, 197, 94, 0.2)',   border: 'rgba(34, 197, 94, 0.5)',   text: '#4ade80' },
  CONVERTED: { bg: 'rgba(147, 51, 234, 0.2)',  border: 'rgba(147, 51, 234, 0.5)',  text: '#a78bfa' },
  LOST:      { bg: 'rgba(239, 68, 68, 0.2)',   border: 'rgba(239, 68, 68, 0.5)',   text: '#f87171' }
};

const SOURCE_OPTIONS = [
  { value: 'manual',   label: 'Manual Entry' },
  { value: 'website',  label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google',   label: 'Google Ads' },
  { value: 'email',    label: 'Email Campaign' },
  { value: 'phone',    label: 'Phone Call' },
  { value: 'zapier',   label: 'Zapier/Automation' },
  { value: 'other',    label: 'Other' }
];

// View-mode field: renders nothing if value is empty
function Field({ label, value, span }) {
  if (!value || value === 'USA' && label !== 'Country') return null;
  return (
    <div style={span ? { gridColumn: '1 / -1' } : {}}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)' }}>{value}</div>
    </div>
  );
}

export default function LeadDetailPage() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leadId = params.id;

  const [lead, setLead]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [isEditing, setIsEditing]   = useState(false);
  const [notification, setNotification] = useState({ show: false, message: "", type: "info" });
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [converting, setConverting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", company: "",
    source: "manual", address: "", city: "", state: "", zipCode: "",
    country: "USA", notes: "", lostReason: "", status: "NEW"
  });

  function showNotif(message, type = "info") {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 3000);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
  }, [user, router]);

  async function loadLead() {
    if (!user || !leadId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/leads/${leadId}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 404) { setError("Lead not found"); return; }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setLead(data);
      setFormData({
        firstName: data.firstName || "", lastName: data.lastName || "",
        email: data.email || "", phone: data.phone || "",
        company: data.company || "", source: data.source || "manual",
        address: data.address || "", city: data.city || "",
        state: data.state || "", zipCode: data.zipCode || "",
        country: data.country || "USA", notes: data.notes || "",
        lostReason: data.lostReason || "", status: data.status || "NEW"
      });
      setError("");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (user && leadId) loadLead(); }, [user, leadId]);

  async function handleSave() {
    try {
      setSaving(true);
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(formData)
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `HTTP ${res.status}`); }
      await loadLead();
      setIsEditing(false);
      showNotif("Lead updated successfully", "success");
    } catch (err) { showNotif(`Failed to save: ${err.message}`, "error"); }
    finally { setSaving(false); }
  }

  async function executeConvert() {
    try {
      setConverting(true);
      const res = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showNotif(`Lead converted to customer ${data.customer.customerNumber}`, "success");
      router.push(`/invoicing/customers/${data.customer.id}`);
    } catch (err) { showNotif(`Failed to convert: ${err.message}`, "error"); }
    finally { setConverting(false); setShowConvertConfirm(false); }
  }

  const inp = {
    width: "100%", padding: "10px 14px",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px"
  };
  const lbl = { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "500", color: "rgba(255,255,255,0.7)" };
  const fd = (k) => (e) => setFormData(p => ({ ...p, [k]: e.target.value }));

  if (authLoading || !user) return null;

  if (loading) return (
    <><InvoicingNav />
    <div style={{ width: "80%", maxWidth: 1800, margin: "0 auto", paddingTop: 80 }}>
      <div style={{ color: "#a0a0a0", padding: 40, textAlign: "center" }}>Loading lead...</div>
    </div></>
  );

  if (error || !lead) return (
    <><InvoicingNav />
    <div style={{ width: "80%", maxWidth: 1800, margin: "0 auto", paddingTop: 80 }}>
      <div style={{ padding: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", textAlign: "center" }}>{error || "Lead not found"}</div>
      <Link href="/invoicing/leads" style={{ display: "inline-block", marginTop: 16, color: "#dc2626", textDecoration: "none" }}>← Back to Leads</Link>
    </div></>
  );

  const hasAddress = lead.address || lead.city || lead.state || lead.zipCode || (lead.country && lead.country !== 'USA');

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: 1800, margin: "0 auto", paddingTop: 80 }}>

        {/* Header */}
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <Link href="/invoicing/leads" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 6 }}>← Back to Leads</Link>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>{lead.firstName} {lead.lastName}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ padding: "3px 10px", background: STATUS_COLORS[lead.status]?.bg, border: `1px solid ${STATUS_COLORS[lead.status]?.border}`, borderRadius: 4, color: STATUS_COLORS[lead.status]?.text, fontSize: 11, fontWeight: 600 }}>{lead.status}</span>
              {lead.source && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Source: {lead.source}</span>}
              {lead.assignedTo && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Assigned: {lead.assignedTo.name}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {lead.status !== "CONVERTED" && (
              <>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 14 }}>Edit</button>
                ) : (
                  <>
                    <button onClick={() => { setIsEditing(false); loadLead(); }} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#ef4444 0%,#dc2626 100%)", border: "none", borderRadius: 8, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save"}</button>
                  </>
                )}
                {lead.status !== "LOST" && !isEditing && (
                  <button onClick={() => setShowConvertConfirm(true)} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#9333ea 0%,#7c3aed 100%)", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Convert to Customer</button>
                )}
              </>
            )}
            {lead.status === "CONVERTED" && lead.convertedToCustomer && (
              <Link href={`/invoicing/customers/${lead.convertedToCustomer.id}`} style={{ padding: "9px 18px", background: "rgba(147,51,234,0.2)", border: "1px solid rgba(147,51,234,0.5)", borderRadius: 8, color: "#a78bfa", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>View Customer: {lead.convertedToCustomer.customerNumber}</Link>
            )}
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 24 }}>

          {isEditing ? (
            /* ── EDIT MODE ── */
            <>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>Contact Information</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
                <div><label style={lbl}>First Name *</label><input type="text" value={formData.firstName} onChange={fd('firstName')} style={inp} required /></div>
                <div><label style={lbl}>Last Name *</label><input type="text" value={formData.lastName} onChange={fd('lastName')} style={inp} required /></div>
                <div><label style={lbl}>Email *</label><input type="email" value={formData.email} onChange={fd('email')} style={inp} required /></div>
                <div><label style={lbl}>Phone</label><input type="tel" value={formData.phone} onChange={fd('phone')} style={inp} /></div>
                <div><label style={lbl}>Company</label><input type="text" value={formData.company} onChange={fd('company')} style={inp} /></div>
                <div>
                  <label style={lbl}>Source</label>
                  <select value={formData.source} onChange={fd('source')} style={inp}>
                    {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>Address</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Street Address</label><input type="text" value={formData.address} onChange={fd('address')} style={inp} /></div>
                <div><label style={lbl}>City</label><input type="text" value={formData.city} onChange={fd('city')} style={inp} /></div>
                <div><label style={lbl}>State</label><input type="text" value={formData.state} onChange={fd('state')} style={inp} /></div>
                <div><label style={lbl}>ZIP Code</label><input type="text" value={formData.zipCode} onChange={fd('zipCode')} style={inp} /></div>
                <div><label style={lbl}>Country</label><input type="text" value={formData.country} onChange={fd('country')} style={inp} /></div>
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>Status</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
                <div>
                  <label style={lbl}>Status</label>
                  {lead.status !== "CONVERTED" ? (
                    <select value={formData.status} onChange={fd('status')} style={inp}>
                      <option value="NEW">NEW</option>
                      <option value="CONTACTED">CONTACTED</option>
                      <option value="QUALIFIED">QUALIFIED</option>
                      <option value="LOST">LOST</option>
                    </select>
                  ) : <div style={{ color: STATUS_COLORS[lead.status]?.text, padding: "10px 0" }}>{lead.status}</div>}
                </div>
                {formData.status === "LOST" && (
                  <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Lost Reason</label><input type="text" value={formData.lostReason} onChange={fd('lostReason')} style={inp} placeholder="Why was this lead lost?" /></div>
                )}
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>Notes</h2>
              <textarea value={formData.notes} onChange={fd('notes')} style={{ ...inp, minHeight: 100, resize: "vertical" }} />
            </>
          ) : (
            /* ── VIEW MODE ── */
            <>
              {/* Contact — always show */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>Contact Information</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="First Name" value={lead.firstName} />
                  <Field label="Last Name" value={lead.lastName} />
                  <Field label="Email" value={lead.email} />
                  <Field label="Phone" value={lead.phone} />
                  <Field label="Company" value={lead.company} />
                  <Field label="Source" value={lead.source} />
                </div>
              </div>

              {/* Address — only if something is populated */}
              {hasAddress && (
                <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>Address</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Field label="Street Address" value={lead.address} span />
                    <Field label="City" value={lead.city} />
                    <Field label="State" value={lead.state} />
                    <Field label="ZIP Code" value={lead.zipCode} />
                    <Field label="Country" value={lead.country} />
                  </div>
                </div>
              )}

              {/* Status */}
              <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>Status</div>
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>Status</div>
                    <span style={{ padding: "3px 10px", background: STATUS_COLORS[lead.status]?.bg, border: `1px solid ${STATUS_COLORS[lead.status]?.border}`, borderRadius: 4, color: STATUS_COLORS[lead.status]?.text, fontSize: 11, fontWeight: 600 }}>{lead.status}</span>
                  </div>
                  {lead.lostReason && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>Lost Reason</div>
                      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.88)" }}>{lead.lostReason}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes — only if populated */}
              {lead.notes && (
                <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 8 }}>Notes</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{lead.notes}</div>
                </div>
              )}

              {/* Metadata */}
              <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 20, color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                <span>Created: {new Date(lead.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(lead.updatedAt).toLocaleString()}</span>
                {lead.lastContactAt && <span>Last Contact: {new Date(lead.lastContactAt).toLocaleString()}</span>}
              </div>
            </>
          )}
        </div>

        {/* Convert Modal */}
        {showConvertConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => setShowConvertConfirm(false)}>
            <div style={{ background: "#1f1f1f", border: "1px solid #404040", borderRadius: 8, padding: "2rem", maxWidth: 440, width: "90%" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Convert Lead to Customer</h3>
              <p style={{ fontSize: 14, marginBottom: "1rem", color: "#d1d5db" }}>Convert <strong>{lead.firstName} {lead.lastName}</strong> to a new customer?</p>
              <p style={{ fontSize: 13, marginBottom: "1.5rem", color: "rgba(255,255,255,0.5)" }}>This will create a new customer record with the lead&rsquo;s information.</p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                <button onClick={() => setShowConvertConfirm(false)} disabled={converting} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
                <button onClick={executeConvert} disabled={converting} style={{ background: "linear-gradient(135deg,#9333ea 0%,#7c3aed 100%)", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: converting ? "not-allowed" : "pointer", opacity: converting ? 0.7 : 1 }}>{converting ? "Converting..." : "Convert"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {notification.show && (
          <div style={{ position: "fixed", top: 100, right: 24, background: notification.type === "error" ? "#7f1d1d" : notification.type === "success" ? "#14532d" : "#1f1f1f", border: `1px solid ${notification.type === "error" ? "#991b1b" : notification.type === "success" ? "#15803d" : "#404040"}`, borderRadius: 8, padding: "1rem 1.5rem", zIndex: 1200, maxWidth: 400 }}>
            <span style={{ color: notification.type === "error" ? "#fecaca" : notification.type === "success" ? "#bbf7d0" : "#d1d5db", fontSize: 14 }}>{notification.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
