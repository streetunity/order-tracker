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
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);

  const [form, setForm] = useState({
    companyName: "",
    logoUrl: "",
    address: "", city: "", state: "", zipCode: "",
    phone: "", email: "", website: "",
    defaultTaxRate: 0,
    defaultPaymentTerms: "NET30",
    defaultValidityDays: 30,
    invoicePrefix: "INV", estimatePrefix: "EST", paymentPrefix: "PAY", customerPrefix: "CUST",
    discountApprovalThreshold: "", amountApprovalThreshold: "",
    defaultEstimateTerms: "", defaultInvoiceTerms: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    fetchSettings();
  }, [user, authLoading]);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/invoicing-settings", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setForm({
          companyName:              data.companyName              || "",
          logoUrl:                  data.logoUrl                  || "",
          address:                  data.address                  || "",
          city:                     data.city                     || "",
          state:                    data.state                    || "",
          zipCode:                  data.zipCode                  || "",
          phone:                    data.phone                    || "",
          email:                    data.email                    || "",
          website:                  data.website                  || "",
          defaultTaxRate:           data.defaultTaxRate           || 0,
          defaultPaymentTerms:      data.defaultPaymentTerms      || "NET30",
          defaultValidityDays:      data.defaultValidityDays      || 30,
          invoicePrefix:            data.invoicePrefix            || "INV",
          estimatePrefix:           data.estimatePrefix           || "EST",
          paymentPrefix:            data.paymentPrefix            || "PAY",
          customerPrefix:           data.customerPrefix           || "CUST",
          discountApprovalThreshold:data.discountApprovalThreshold ?? "",
          amountApprovalThreshold:  data.amountApprovalThreshold  ?? "",
          defaultEstimateTerms:     data.defaultEstimateTerms     || "",
          defaultInvoiceTerms:      data.defaultInvoiceTerms      || "",
        });
      }
    } catch (err) {
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
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/invoicing-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(form),
      });
      if (res.ok) { setSettings(await res.json()); setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else { const e = await res.json(); setError(e.error || "Failed to save settings"); }
    } catch (err) { setError("Failed to save settings"); }
    finally { setSaving(false); }
  };

  const sec = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 24, marginBottom: 24 };
  const secTitle = { fontSize: 18, fontWeight: 600, color: "#dc2626", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 };
  const lbl = { display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6, fontWeight: 500 };
  const inp = { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const sel = { ...inp, cursor: "pointer", appearance: "auto" };
  const txta = { ...inp, minHeight: 80, resize: "vertical", fontFamily: "inherit" };
  const hint = { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 };
  const saveBtnStyle = { padding: "10px 24px", background: saving ? "rgba(220,38,38,0.5)" : "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 8, color: "white", fontWeight: 600, fontSize: 14, cursor: saving ? "wait" : "pointer" };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1200px", margin: "0 auto", paddingTop: 80, paddingBottom: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>Invoicing Settings</h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Company info, number sequences, defaults, and approval thresholds</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {saved && <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 500 }}>✓ Saved</span>}
            {error && <span style={{ color: "#ef4444", fontSize: 14 }}>{error}</span>}
            <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>{saving ? "Saving..." : "Save Settings"}</button>
          </div>
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.5)" }}>Loading settings...</div> : (
          <>
            {/* Company Information */}
            <div style={sec}>
              <h2 style={secTitle}>Company Information</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 16, marginTop: -8 }}>Used in invoices, estimates, email templates, and customer-facing documents</p>
              <div style={grid}>
                <div><label style={lbl}>Company Name</label><input style={inp} value={form.companyName} onChange={e => handleChange("companyName", e.target.value)} placeholder="Stealth Machine Tools" /></div>
                <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => handleChange("phone", e.target.value)} placeholder="(555) 123-4567" /></div>
                <div><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => handleChange("email", e.target.value)} placeholder="info@stealthlaser.com" /></div>
                <div><label style={lbl}>Website</label><input style={inp} value={form.website} onChange={e => handleChange("website", e.target.value)} placeholder="https://smt-orders.com" /></div>
              </div>
              <div style={{ ...grid, marginTop: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e => handleChange("address", e.target.value)} placeholder="123 Industrial Blvd" /></div>
                <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => handleChange("city", e.target.value)} placeholder="City" /></div>
                <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={e => handleChange("state", e.target.value)} placeholder="AZ" /></div>
                <div><label style={lbl}>ZIP Code</label><input style={inp} value={form.zipCode} onChange={e => handleChange("zipCode", e.target.value)} placeholder="85001" /></div>
              </div>
            </div>

            {/* Email Branding */}
            <div style={sec}>
              <h2 style={secTitle}>Email Branding</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 16, marginTop: -8 }}>Logo shown in email header instead of company name text. Must be a publicly accessible URL.</p>
              <div>
                <label style={lbl}>Logo URL</label>
                <input style={inp} value={form.logoUrl} onChange={e => handleChange("logoUrl", e.target.value)} placeholder="https://yourdomain.com/logo.png" />
                <p style={hint}>Recommended: PNG or SVG, transparent background, max 260×60px. Leave blank to show company name text instead.</p>
              </div>
              {form.logoUrl && (
                <div style={{ marginTop: 16, padding: "16px 24px", background: "#000000", borderRadius: 8, display: "inline-block" }}>
                  <img src={form.logoUrl} alt="Logo preview" style={{ maxHeight: 60, maxWidth: 260, display: "block" }} onError={e => e.target.style.display = "none"} />
                </div>
              )}
            </div>

            {/* Number Sequences */}
            <div style={sec}>
              <h2 style={secTitle}>Number Sequences</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 16, marginTop: -8 }}>Prefix used for auto-generated document numbers</p>
              <div style={grid}>
                <div><label style={lbl}>Invoice Prefix</label><input style={inp} value={form.invoicePrefix} onChange={e => handleChange("invoicePrefix", e.target.value)} placeholder="INV" /><p style={hint}>e.g. INV-2026-00001</p></div>
                <div><label style={lbl}>Estimate Prefix</label><input style={inp} value={form.estimatePrefix} onChange={e => handleChange("estimatePrefix", e.target.value)} placeholder="EST" /><p style={hint}>e.g. EST-2026-00001</p></div>
                <div><label style={lbl}>Payment Prefix</label><input style={inp} value={form.paymentPrefix} onChange={e => handleChange("paymentPrefix", e.target.value)} placeholder="PAY" /><p style={hint}>e.g. PAY-2026-00001</p></div>
                <div><label style={lbl}>Customer Prefix</label><input style={inp} value={form.customerPrefix} onChange={e => handleChange("customerPrefix", e.target.value)} placeholder="CUST" /><p style={hint}>e.g. CUST-2026-00001</p></div>
              </div>
            </div>

            {/* Defaults */}
            <div style={sec}>
              <h2 style={secTitle}>Defaults</h2>
              <div style={grid}>
                <div>
                  <label style={lbl}>Local Tax Rate (%)</label>
                  <input style={inp} type="number" step="0.01" min="0" value={form.defaultTaxRate} onChange={e => handleChange("defaultTaxRate", e.target.value)} placeholder="0" />
                  <p style={hint}>Applied when Pinal County Sales Tax is selected</p>
                </div>
                <div>
                  <label style={lbl}>Default Payment Terms</label>
                  <select style={sel} value={form.defaultPaymentTerms} onChange={e => handleChange("defaultPaymentTerms", e.target.value)}>
                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                    <option value="NET15">Net 15</option>
                    <option value="NET30">Net 30</option>
                    <option value="NET45">Net 45</option>
                    <option value="NET60">Net 60</option>
                    <option value="NET90">Net 90</option>
                  </select>
                </div>
                <div><label style={lbl}>Default Estimate Validity (days)</label><input style={inp} type="number" min="1" value={form.defaultValidityDays} onChange={e => handleChange("defaultValidityDays", e.target.value)} placeholder="30" /></div>
              </div>
            </div>

            {/* Approval Thresholds */}
            <div style={sec}>
              <h2 style={secTitle}>Approval Thresholds</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 16, marginTop: -8 }}>Require admin approval when these limits are exceeded. Leave blank to disable.</p>
              <div style={grid}>
                <div><label style={lbl}>Discount Threshold (%)</label><input style={inp} type="number" step="0.1" min="0" value={form.discountApprovalThreshold} onChange={e => handleChange("discountApprovalThreshold", e.target.value)} placeholder="e.g. 10" /></div>
                <div><label style={lbl}>Amount Threshold ($)</label><input style={inp} type="number" step="1" min="0" value={form.amountApprovalThreshold} onChange={e => handleChange("amountApprovalThreshold", e.target.value)} placeholder="e.g. 50000" /></div>
              </div>
            </div>

            {/* Default Terms */}
            <div style={sec}>
              <h2 style={secTitle}>Default Terms &amp; Conditions</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div><label style={lbl}>Default Estimate Terms</label><textarea style={txta} value={form.defaultEstimateTerms} onChange={e => handleChange("defaultEstimateTerms", e.target.value)} placeholder="Terms and conditions for estimates..." rows={4} /></div>
                <div><label style={lbl}>Default Invoice Terms</label><textarea style={txta} value={form.defaultInvoiceTerms} onChange={e => handleChange("defaultInvoiceTerms", e.target.value)} placeholder="Terms and conditions for invoices..." rows={4} /></div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "center" }}>
              {saved && <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 500 }}>✓ Settings saved successfully</span>}
              {error && <span style={{ color: "#ef4444", fontSize: 14 }}>{error}</span>}
              <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>{saving ? "Saving..." : "Save Settings"}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
