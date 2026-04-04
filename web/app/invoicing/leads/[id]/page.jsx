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
    firstName:  "",
    lastName:   "",
    email:      "",
    phone:      "",
    company:    "",
    source:     "manual",
    address:    "",
    city:       "",
    state:      "",
    zipCode:    "",
    country:    "USA",
    notes:      "",
    lostReason: "",
    status:     "NEW"
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
        firstName:  data.firstName  || "",
        lastName:   data.lastName   || "",
        email:      data.email      || "",
        phone:      data.phone      || "",
        company:    data.company    || "",
        source:     data.source     || "manual",
        address:    data.address    || "",
        city:       data.city       || "",
        state:      data.state      || "",
        zipCode:    data.zipCode    || "",
        country:    data.country    || "USA",
        notes:      data.notes      || "",
        lostReason: data.lostReason || "",
        status:     data.status     || "NEW"
      });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
    } catch (err) {
      showNotif(`Failed to save: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
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
    } catch (err) {
      showNotif(`Failed to convert: ${err.message}`, "error");
    } finally {
      setConverting(false);
      setShowConvertConfirm(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px"
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)"
  };

  const val = (v) => <div style={{ color: "rgba(255,255,255,0.9)", padding: "10px 0" }}>{v || "-"}</div>;

  if (authLoading || !user) return null;

  if (loading) return (
    <><InvoicingNav />
    <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
      <div style={{ color: "#a0a0a0", padding: 40, textAlign: "center" }}>Loading lead...</div>
    </div></>
  );

  if (error || !lead) return (
    <><InvoicingNav />
    <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
      <div style={{ padding: "20px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#ef4444", textAlign: "center" }}>
        {error || "Lead not found"}
      </div>
      <Link href="/invoicing/leads" style={{ display: "inline-block", marginTop: 16, color: "#dc2626", textDecoration: "none" }}>← Back to Leads</Link>
    </div></>
  );

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <Link href="/invoicing/leads" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}>← Back to Leads</Link>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 8 }}>{lead.firstName} {lead.lastName}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ padding: "4px 12px", background: STATUS_COLORS[lead.status]?.bg, border: `1px solid ${STATUS_COLORS[lead.status]?.border}`, borderRadius: "4px", color: STATUS_COLORS[lead.status]?.text, fontSize: "12px", fontWeight: "500" }}>
                {lead.status}
              </span>
              {lead.source && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>Source: {lead.source}</span>}
              {lead.assignedTo && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>Assigned to: {lead.assignedTo.name}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {lead.status !== "CONVERTED" && (
              <>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: "14px" }}>Edit</button>
                ) : (
                  <>
                    <button onClick={() => { setIsEditing(false); loadLead(); }} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", border: "none", borderRadius: "8px", color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "600", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save"}</button>
                  </>
                )}
                {lead.status !== "LOST" && !isEditing && (
                  <button onClick={() => setShowConvertConfirm(true)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)", border: "none", borderRadius: "8px", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>Convert to Customer</button>
                )}
              </>
            )}
            {lead.status === "CONVERTED" && lead.convertedToCustomer && (
              <Link href={`/invoicing/customers/${lead.convertedToCustomer.id}`} style={{ padding: "10px 20px", background: "rgba(147,51,234,0.2)", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px", color: "#a78bfa", textDecoration: "none", fontSize: "14px", fontWeight: "500" }}>View Customer: {lead.convertedToCustomer.customerNumber}</Link>
            )}
          </div>
        </div>

        {/* Form/Details */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: 24 }}>

          {/* Contact Information */}
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Contact Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              {isEditing ? <input type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} style={inputStyle} required /> : val(lead.firstName)}
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              {isEditing ? <input type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} style={inputStyle} required /> : val(lead.lastName)}
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              {isEditing ? <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={inputStyle} required /> : val(lead.email)}
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              {isEditing ? <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={inputStyle} /> : val(lead.phone)}
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              {isEditing ? <input type="text" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} style={inputStyle} /> : val(lead.company)}
            </div>
            <div>
              <label style={labelStyle}>Source</label>
              {isEditing ? (
                <select value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })} style={inputStyle}>
                  {SOURCE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              ) : val(lead.source)}
            </div>
          </div>

          {/* Address */}
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Address</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Street Address</label>
              {isEditing ? <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} style={inputStyle} /> : val(lead.address)}
            </div>
            <div>
              <label style={labelStyle}>City</label>
              {isEditing ? <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} style={inputStyle} /> : val(lead.city)}
            </div>
            <div>
              <label style={labelStyle}>State</label>
              {isEditing ? <input type="text" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} style={inputStyle} /> : val(lead.state)}
            </div>
            <div>
              <label style={labelStyle}>ZIP Code</label>
              {isEditing ? <input type="text" value={formData.zipCode} onChange={e => setFormData({ ...formData, zipCode: e.target.value })} style={inputStyle} /> : val(lead.zipCode)}
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              {isEditing ? <input type="text" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} style={inputStyle} /> : val(lead.country || "USA")}
            </div>
          </div>

          {/* Status */}
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Status</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
            <div>
              <label style={labelStyle}>Status</label>
              {isEditing && lead.status !== "CONVERTED" ? (
                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} style={inputStyle}>
                  <option value="NEW">NEW</option>
                  <option value="CONTACTED">CONTACTED</option>
                  <option value="QUALIFIED">QUALIFIED</option>
                  <option value="LOST">LOST</option>
                </select>
              ) : (
                <div style={{ padding: "10px 0", color: STATUS_COLORS[lead.status]?.text }}>{lead.status}</div>
              )}
            </div>
            {(formData.status === "LOST" || lead.status === "LOST") && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Lost Reason</label>
                {isEditing ? <input type="text" value={formData.lostReason} onChange={e => setFormData({ ...formData, lostReason: e.target.value })} style={inputStyle} placeholder="Why was this lead lost?" /> : val(lead.lostReason)}
              </div>
            )}
          </div>

          {/* Notes */}
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Notes</h2>
          <div style={{ marginBottom: 32 }}>
            {isEditing ? (
              <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }} />
            ) : (
              <div style={{ color: "rgba(255,255,255,0.9)", padding: "10px 0", whiteSpace: "pre-wrap" }}>{lead.notes || "No notes"}</div>
            )}
          </div>

          {/* Metadata */}
          <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", gap: 24, color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
              <span>Created: {new Date(lead.createdAt).toLocaleString()}</span>
              <span>Updated: {new Date(lead.updatedAt).toLocaleString()}</span>
              {lead.lastContactAt && <span>Last Contact: {new Date(lead.lastContactAt).toLocaleString()}</span>}
            </div>
          </div>
        </div>

        {/* Convert Confirmation Modal */}
        {showConvertConfirm && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => setShowConvertConfirm(false)}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "450px", width: "90%" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Convert Lead to Customer</h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Convert <strong>{lead.firstName} {lead.lastName}</strong> to a new customer?</p>
              <p style={{ fontSize: "13px", marginBottom: "1.5rem", color: "rgba(255,255,255,0.5)" }}>This will create a new customer record with the lead&rsquo;s information.</p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                <button onClick={() => setShowConvertConfirm(false)} disabled={converting} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                <button onClick={executeConvert} disabled={converting} style={{ background: "linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: converting ? "not-allowed" : "pointer", opacity: converting ? 0.7 : 1 }}>{converting ? "Converting..." : "Convert"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Toast */}
        {notification.show && (
          <div style={{ position: "fixed", top: "100px", right: "24px", backgroundColor: notification.type === "error" ? "#7f1d1d" : notification.type === "success" ? "#14532d" : "#1f1f1f", border: `1px solid ${notification.type === "error" ? "#991b1b" : notification.type === "success" ? "#15803d" : "#404040"}`, borderRadius: "8px", padding: "1rem 1.5rem", zIndex: 1200, maxWidth: "400px" }}>
            <span style={{ color: notification.type === "error" ? "#fecaca" : notification.type === "success" ? "#bbf7d0" : "#d1d5db", fontSize: "14px" }}>{notification.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
