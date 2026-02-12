"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

const PAYMENT_TERMS_OPTIONS = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'CUSTOM', label: 'Custom' }
];

export default function NewCustomerPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    // Company Info
    companyName: "",
    // Primary Contact
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    // Billing Address
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingZipCode: "",
    billingCountry: "USA",
    // Shipping Address
    sameAsBilling: true,
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZipCode: "",
    shippingCountry: "USA",
    // Payment & Settings
    paymentTerms: "NET30",
    taxExempt: false,
    taxExemptId: "",
    // Tags & Notes
    tags: "",
    notes: ""
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const submitData = {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      };

      // If same as billing, copy billing to shipping
      if (formData.sameAsBilling) {
        submitData.shippingAddress = formData.billingAddress;
        submitData.shippingCity = formData.billingCity;
        submitData.shippingState = formData.billingState;
        submitData.shippingZipCode = formData.billingZipCode;
        submitData.shippingCountry = formData.billingCountry;
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      router.push(`/invoicing/customers/${data.id}`);
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

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: 24,
    marginBottom: 24
  };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/invoicing/customers"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}
          >
            ← Back to Customers
          </Link>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
            New Customer
          </h1>
        </div>

        {error && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Company Information */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Company Information
            </h2>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                style={inputStyle}
                placeholder="Acme Manufacturing Inc."
              />
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                Leave blank for individual customers
              </p>
            </div>
          </div>

          {/* Primary Contact */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Primary Contact
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  style={inputStyle}
                  required
                  placeholder="John"
                />
              </div>
              <div>
                <label style={labelStyle}>Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  style={inputStyle}
                  required
                  placeholder="Doe"
                />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={inputStyle}
                  required
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={inputStyle}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Billing Address */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Billing Address
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Street Address</label>
                <input
                  type="text"
                  value={formData.billingAddress}
                  onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                  style={inputStyle}
                  placeholder="123 Main St"
                />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input
                  type="text"
                  value={formData.billingCity}
                  onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                  style={inputStyle}
                  placeholder="New York"
                />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input
                  type="text"
                  value={formData.billingState}
                  onChange={(e) => setFormData({ ...formData, billingState: e.target.value })}
                  style={inputStyle}
                  placeholder="NY"
                />
              </div>
              <div>
                <label style={labelStyle}>ZIP Code</label>
                <input
                  type="text"
                  value={formData.billingZipCode}
                  onChange={(e) => setFormData({ ...formData, billingZipCode: e.target.value })}
                  style={inputStyle}
                  placeholder="10001"
                />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input
                  type="text"
                  value={formData.billingCountry}
                  onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })}
                  style={inputStyle}
                  placeholder="USA"
                />
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Shipping Address
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={formData.sameAsBilling}
                  onChange={(e) => setFormData({ ...formData, sameAsBilling: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                  Same as billing address
                </span>
              </label>
            </div>
            {!formData.sameAsBilling && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Street Address</label>
                  <input
                    type="text"
                    value={formData.shippingAddress}
                    onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                    style={inputStyle}
                    placeholder="456 Industrial Blvd"
                  />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input
                    type="text"
                    value={formData.shippingCity}
                    onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                    style={inputStyle}
                    placeholder="Los Angeles"
                  />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input
                    type="text"
                    value={formData.shippingState}
                    onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })}
                    style={inputStyle}
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label style={labelStyle}>ZIP Code</label>
                  <input
                    type="text"
                    value={formData.shippingZipCode}
                    onChange={(e) => setFormData({ ...formData, shippingZipCode: e.target.value })}
                    style={inputStyle}
                    placeholder="90001"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Country</label>
                  <input
                    type="text"
                    value={formData.shippingCountry}
                    onChange={(e) => setFormData({ ...formData, shippingCountry: e.target.value })}
                    style={inputStyle}
                    placeholder="USA"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payment & Settings */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Payment & Settings
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Payment Terms</label>
                <select
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  style={inputStyle}
                >
                  {PAYMENT_TERMS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 24 }}>
                  <input
                    type="checkbox"
                    checked={formData.taxExempt}
                    onChange={(e) => setFormData({ ...formData, taxExempt: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                    Tax Exempt
                  </span>
                </label>
              </div>
              {formData.taxExempt && (
                <div>
                  <label style={labelStyle}>Tax Exempt Number</label>
                  <input
                    type="text"
                    value={formData.taxExemptId}
                    onChange={(e) => setFormData({ ...formData, taxExemptId: e.target.value })}
                    style={inputStyle}
                    placeholder="EIN or Exemption #"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tags & Notes */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Tags & Notes
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Tags</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                style={inputStyle}
                placeholder="VIP, wholesale, referral (comma-separated)"
              />
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                Separate multiple tags with commas
              </p>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
                placeholder="Additional notes about this customer..."
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Link
              href="/invoicing/customers"
              style={{
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                textDecoration: "none",
                fontSize: "14px"
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 24px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Creating..." : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
