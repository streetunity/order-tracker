"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import InvoicingNav from "@/components/InvoicingNav";
import { useAuth } from "@/contexts/AuthContext";

export default function InvoicingSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [form, setForm] = useState({
    companyName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    website: "",
    defaultTaxRate: 0,
    defaultPaymentTerms: "NET30",
    defaultValidityDays: 30,
    invoicePrefix: "INV",
    estimatePrefix: "EST",
    paymentPrefix: "PAY",
    customerPrefix: "CUST",
    defaultFromEmail: "",
    emailDomain: "",
    discountApprovalThreshold: "",
    amountApprovalThreshold: "",
    defaultEstimateTerms: "",
    defaultInvoiceTerms: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    fetchSettings();
  }, [user, authLoading]);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/invoicing-settings", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setForm({
          companyName: data.companyName || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zipCode: data.zipCode || "",
          phone: data.phone || "",
          email: data.email || "",
          website: data.website || "",
          defaultTaxRate: data.defaultTaxRate || 0,
          defaultPaymentTerms: data.defaultPaymentTerms || "NET30",
          defaultValidityDays: data.defaultValidityDays || 30,
          invoicePrefix: data.invoicePrefix || "INV",
          estimatePrefix: data.estimatePrefix || "EST",
          paymentPrefix: data.paymentPrefix || "PAY",
          customerPrefix: data.customerPrefix || "CUST",
          defaultFromEmail: data.defaultFromEmail || "",
          emailDomain: data.emailDomain || "",
          discountApprovalThreshold: data.discountApprovalThreshold ?? "",
          amountApprovalThreshold: data.amountApprovalThreshold ?? "",
          defaultEstimateTerms: data.defaultEstimateTerms || "",
          defaultInvoiceTerms: data.defaultInvoiceTerms || "",
        });
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/invoicing-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to save settings");
      }
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "24px",
  };

  const sectionTitleStyle = {
    fontSize: "18px",
    fontWeight: "600",
    color: "#dc2626",
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  };

  const fieldGroupStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "16px",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: "6px",
    fontWeight: "500",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
    appearance: "auto",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "80px",
    resize: "vertical",
    fontFamily: "inherit",
  };

  const helpTextStyle = {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.35)",
    marginTop: "4px",
  };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1200px", margin: "0 auto", paddingTop: 80, paddingBottom: 60 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 4 }}>
              Invoicing Settings
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              Company info, number sequences, defaults, and approval thresholds
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {saved && (
              <span style={{ color: "#22c55e", fontSize: "14px", fontWeight: "500" }}>
                ✓ Saved
              </span>
            )}
            {error && (
              <span style={{ color: "#ef4444", fontSize: "14px" }}>
                {error}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 24px",
                background: saving ? "rgba(220, 38, 38, 0.5)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontWeight: "600",
                fontSize: "14px",
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "rgba(255,255,255,0.5)" }}>
            Loading settings...
          </div>
        ) : (
          <>
            {/* Company Information */}
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Company Information</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginBottom: "16px", marginTop: "-8px" }}>
                Used in invoices, estimates, email templates, and customer-facing documents
              </p>
              <div style={fieldGroupStyle}>
                <div>
                  <label style={labelStyle}>Company Name</label>
                  <input
                    style={inputStyle}
                    value={form.companyName}
                    onChange={e => handleChange("companyName", e.target.value)}
                    placeholder="Stealth Machine Tools"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    style={inputStyle}
                    value={form.phone}
                    onChange={e => handleChange("phone", e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    style={inputStyle}
                    value={form.email}
                    onChange={e => handleChange("email", e.target.value)}
                    placeholder="info@stealthlaser.com"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Website</label>
                  <input
                    style={inputStyle}
                    value={form.website}
                    onChange={e => handleChange("website", e.target.value)}
                    placeholder="https://smt-orders.com"
                  />
                </div>
              </div>

              <div style={{ ...fieldGroupStyle, marginTop: "16px" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Street Address</label>
                  <input
                    style={inputStyle}
                    value={form.address}
                    onChange={e => handleChange("address", e.target.value)}
                    placeholder="123 Industrial Blvd"
                  />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input
                    style={inputStyle}
                    value={form.city}
                    onChange={e => handleChange("city", e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input
                    style={inputStyle}
                    value={form.state}
                    onChange={e => handleChange("state", e.target.value)}
                    placeholder="IL"
                  />
                </div>
                <div>
                  <label style={labelStyle}>ZIP Code</label>
                  <input
                    style={inputStyle}
                    value={form.zipCode}
                    onChange={e => handleChange("zipCode", e.target.value)}
                    placeholder="60601"
                  />
                </div>
              </div>
            </div>

            {/* Number Sequences */}
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Number Sequences</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginBottom: "16px", marginTop: "-8px" }}>
                Prefix used for auto-generated document numbers
              </p>
              <div style={fieldGroupStyle}>
                <div>
                  <label style={labelStyle}>Invoice Prefix</label>
                  <input
                    style={inputStyle}
                    value={form.invoicePrefix}
                    onChange={e => handleChange("invoicePrefix", e.target.value)}
                    placeholder="INV"
                  />
                  <p style={helpTextStyle}>e.g. INV-2026-00001</p>
                </div>
                <div>
                  <label style={labelStyle}>Estimate Prefix</label>
                  <input
                    style={inputStyle}
                    value={form.estimatePrefix}
                    onChange={e => handleChange("estimatePrefix", e.target.value)}
                    placeholder="EST"
                  />
                  <p style={helpTextStyle}>e.g. EST-2026-00001</p>
                </div>
                <div>
                  <label style={labelStyle}>Payment Prefix</label>
                  <input
                    style={inputStyle}
                    value={form.paymentPrefix}
                    onChange={e => handleChange("paymentPrefix", e.target.value)}
                    placeholder="PAY"
                  />
                  <p style={helpTextStyle}>e.g. PAY-2026-00001</p>
                </div>
                <div>
                  <label style={labelStyle}>Customer Prefix</label>
                  <input
                    style={inputStyle}
                    value={form.customerPrefix}
                    onChange={e => handleChange("customerPrefix", e.target.value)}
                    placeholder="CUST"
                  />
                  <p style={helpTextStyle}>e.g. CUST-2026-00001</p>
                </div>
              </div>
            </div>

            {/* Defaults */}
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Defaults</h2>
              <div style={fieldGroupStyle}>
                <div>
                  <label style={labelStyle}>Default Tax Rate (%)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultTaxRate}
                    onChange={e => handleChange("defaultTaxRate", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Default Payment Terms</label>
                  <select
                    style={selectStyle}
                    value={form.defaultPaymentTerms}
                    onChange={e => handleChange("defaultPaymentTerms", e.target.value)}
                  >
                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                    <option value="NET15">Net 15</option>
                    <option value="NET30">Net 30</option>
                    <option value="NET45">Net 45</option>
                    <option value="NET60">Net 60</option>
                    <option value="NET90">Net 90</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Default Estimate Validity (days)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={form.defaultValidityDays}
                    onChange={e => handleChange("defaultValidityDays", e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>
            </div>

            {/* Approval Thresholds */}
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Approval Thresholds</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginBottom: "16px", marginTop: "-8px" }}>
                Require admin approval when these limits are exceeded. Leave blank to disable.
              </p>
              <div style={fieldGroupStyle}>
                <div>
                  <label style={labelStyle}>Discount Approval Threshold (%)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.discountApprovalThreshold}
                    onChange={e => handleChange("discountApprovalThreshold", e.target.value)}
                    placeholder="e.g. 10 (require approval if discount > 10%)"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Amount Approval Threshold ($)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="1"
                    min="0"
                    value={form.amountApprovalThreshold}
                    onChange={e => handleChange("amountApprovalThreshold", e.target.value)}
                    placeholder="e.g. 50000 (require approval if total > $50k)"
                  />
                </div>
              </div>
            </div>

            {/* Email Settings */}
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Email Settings</h2>
              <div style={fieldGroupStyle}>
                <div>
                  <label style={labelStyle}>Default From Email</label>
                  <input
                    style={inputStyle}
                    value={form.defaultFromEmail}
                    onChange={e => handleChange("defaultFromEmail", e.target.value)}
                    placeholder="orders@stealthlaser.com"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email Domain</label>
                  <input
                    style={inputStyle}
                    value={form.emailDomain}
                    onChange={e => handleChange("emailDomain", e.target.value)}
                    placeholder="stealthlaser.com"
                  />
                </div>
              </div>
            </div>

            {/* Default Terms */}
            <div style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Default Terms & Conditions</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={labelStyle}>Default Estimate Terms</label>
                  <textarea
                    style={textareaStyle}
                    value={form.defaultEstimateTerms}
                    onChange={e => handleChange("defaultEstimateTerms", e.target.value)}
                    placeholder="Terms and conditions for estimates..."
                    rows={4}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Default Invoice Terms</label>
                  <textarea
                    style={textareaStyle}
                    value={form.defaultInvoiceTerms}
                    onChange={e => handleChange("defaultInvoiceTerms", e.target.value)}
                    placeholder="Terms and conditions for invoices..."
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Save Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
              {saved && (
                <span style={{ color: "#22c55e", fontSize: "14px", fontWeight: "500" }}>
                  ✓ Settings saved successfully
                </span>
              )}
              {error && (
                <span style={{ color: "#ef4444", fontSize: "14px" }}>
                  {error}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "10px 24px",
                  background: saving ? "rgba(220, 38, 38, 0.5)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
