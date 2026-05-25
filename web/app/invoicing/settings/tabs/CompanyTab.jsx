"use client";

import { INP, LBL, CARD, HINT } from "../_shared/styles";
import { SectionHeader, SaveBar } from "../_shared/components";

export default function CompanyTab({ settings }) {
  const { form, setForm, companyHasChanges, compSaving, saveCompany, compMsg } = settings;

  return (
    <>
      <div style={CARD}>
        <SectionHeader label="Company Information" desc="Used in invoices, estimates, email templates, and customer-facing documents" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Company Name</label><input style={INP} value={form.companyName} onChange={e => setForm(p => ({...p,companyName:e.target.value}))} placeholder="Stealth Machine Tools" /></div>
          <div><label style={LBL}>Phone</label><input style={INP} value={form.phone} onChange={e => setForm(p => ({...p,phone:e.target.value}))} placeholder="877-45LASER" /></div>
          <div><label style={LBL}>Email</label><input style={INP} value={form.email} onChange={e => setForm(p => ({...p,email:e.target.value}))} placeholder="Sales@StealthLaser.com" /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Website</label><input style={INP} value={form.website} onChange={e => setForm(p => ({...p,website:e.target.value}))} placeholder="www.StealthLaser.com" /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={LBL}>Street Address</label><input style={INP} value={form.address} onChange={e => setForm(p => ({...p,address:e.target.value}))} /></div>
          <div><label style={LBL}>City</label><input style={INP} value={form.city} onChange={e => setForm(p => ({...p,city:e.target.value}))} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={LBL}>State</label><input style={INP} value={form.state} onChange={e => setForm(p => ({...p,state:e.target.value}))} placeholder="AZ" /></div>
            <div><label style={LBL}>ZIP</label><input style={INP} value={form.zipCode} onChange={e => setForm(p => ({...p,zipCode:e.target.value}))} placeholder="85120" /></div>
          </div>
        </div>
        <SaveBar hasChanges={companyHasChanges} saving={compSaving} onSave={saveCompany} msg={compMsg} />
      </div>
      <div style={CARD}>
        <SectionHeader label="Email Branding" desc="Logo shown in email header. Must be a publicly accessible URL. Leave blank to show company name text instead." />
        <div><label style={LBL}>Logo URL</label><input style={INP} value={form.logoUrl} onChange={e => setForm(p => ({...p,logoUrl:e.target.value}))} placeholder="https://smt-orders.com/smt-logo.png" /></div>
        <p style={HINT}>Recommended: PNG or SVG, transparent background, max 260×60px.</p>
        {form.logoUrl && <div style={{ marginTop: 14, padding: "14px 20px", background: "#000", borderRadius: 8, display: "inline-block" }}><img src={form.logoUrl} alt="Logo preview" style={{ maxHeight: 52, maxWidth: 240, display: "block" }} onError={e => e.target.style.display="none"} /></div>}
        <SaveBar hasChanges={companyHasChanges} saving={compSaving} onSave={saveCompany} msg={compMsg} />
      </div>
    </>
  );
}
