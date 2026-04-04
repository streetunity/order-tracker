"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google Ads' },
  { value: 'email', label: 'Email Campaign' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'other', label: 'Other' }
];

export default function NewLeadPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    source: "manual",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "USA",
    notes: "",
    status: "NEW"
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
  }, [user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/invoicing/leads/${data.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
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

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/invoicing/leads" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}>
            ← Back to Leads
          </Link>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>New Lead</h1>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", marginBottom: "20px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", color: "#ef4444" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: 24 }}>

            {/* Contact Information */}
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Contact Information</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
              <div>
                <label style={labelStyle}>First Name *</label>
                <input type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} style={inputStyle} required placeholder="John" />
              </div>
              <div>
                <label style={labelStyle}>Last Name *</label>
                <input type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} style={inputStyle} required placeholder="Doe" />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={inputStyle} required placeholder="john@example.com" />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={inputStyle} placeholder="+1 (555) 123-4567" />
              </div>
              <div>
                <label style={labelStyle}>Company</label>
                <input type="text" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} style={inputStyle} placeholder="Acme Inc." />
              </div>
              <div>
                <label style={labelStyle}>Source</label>
                <select value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })} style={inputStyle}>
                  {SOURCE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>

            {/* Address */}
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Address</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Street Address</label>
                <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} style={inputStyle} placeholder="123 Main St" />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} style={inputStyle} placeholder="New York" />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input type="text" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} style={inputStyle} placeholder="NY" />
              </div>
              <div>
                <label style={labelStyle}>ZIP Code</label>
                <input type="text" value={formData.zipCode} onChange={e => setFormData({ ...formData, zipCode: e.target.value })} style={inputStyle} placeholder="10001" />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input type="text" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} style={inputStyle} placeholder="USA" />
              </div>
            </div>

            {/* Notes */}
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Notes</h2>
            <div>
              <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }} placeholder="Additional notes about this lead..." />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
            <Link href="/invoicing/leads" style={{ padding: "10px 20px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", color: "rgba(255, 255, 255, 0.9)", textDecoration: "none", fontSize: "14px" }}>Cancel</Link>
            <button type="submit" disabled={loading} style={{ padding: "10px 24px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", border: "none", borderRadius: "8px", color: "white", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "600", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Creating..." : "Create Lead"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
