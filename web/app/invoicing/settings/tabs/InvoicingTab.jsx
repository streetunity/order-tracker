"use client";

import { INP, LBL, CARD, HINT } from "../_shared/styles";
import { SectionHeader } from "../_shared/components";

export default function InvoicingTab({ settings }) {
  const { form, setForm, invoicingHasChanges, invSaving, saveInvoicing, invMsg } = settings;

  return (
    <>
      <div style={CARD}>
        <SectionHeader label="Number Sequences" desc="Prefix for auto-generated document numbers" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[["invoicePrefix","Invoice Prefix","INV"],["estimatePrefix","Estimate Prefix","EST"],["paymentPrefix","Payment Prefix","PAY"],["customerPrefix","Customer Prefix","CUST"]].map(([k,l,ph]) => (
            <div key={k}><label style={LBL}>{l}</label><input style={INP} value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} placeholder={ph} /><p style={HINT}>e.g. {form[k]||ph}-2026-00001</p></div>
          ))}
        </div>
      </div>
      <div style={CARD}>
        <SectionHeader label="Defaults" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div><label style={LBL}>Local Tax Rate (%)</label><input style={INP} type="number" step="0.01" min="0" value={form.defaultTaxRate} onChange={e => setForm(p => ({...p,defaultTaxRate:e.target.value}))} /><p style={HINT}>Applied when Pinal County Sales Tax is selected</p></div>
          <div><label style={LBL}>Default Payment Schedule</label>
            <select style={{ ...INP, cursor: "pointer" }} value={form.defaultPaymentTerms} onChange={e => setForm(p => ({...p,defaultPaymentTerms:e.target.value}))}>
              <option value="DUE_ON_RECEIPT">Due on Receipt</option>
              <option value="NET15">Net 15</option>
              <option value="NET30">Net 30</option>
              <option value="NET45">Net 45</option>
              <option value="NET60">Net 60</option>
              <option value="NET90">Net 90</option>
            </select>
          </div>
          <div><label style={LBL}>Estimate Validity (days)</label><input style={INP} type="number" min="1" value={form.defaultValidityDays} onChange={e => setForm(p => ({...p,defaultValidityDays:e.target.value}))} /></div>
        </div>
      </div>
      <div style={CARD}>
        <SectionHeader label="Approval Thresholds" desc="Require admin approval when these limits are exceeded. Leave blank to disable." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div><label style={LBL}>Discount Threshold (%)</label><input style={INP} type="number" step="0.1" min="0" value={form.discountApprovalThreshold} onChange={e => setForm(p => ({...p,discountApprovalThreshold:e.target.value}))} placeholder="e.g. 10" /></div>
          <div><label style={LBL}>Amount Threshold ($)</label><input style={INP} type="number" step="1" min="0" value={form.amountApprovalThreshold} onChange={e => setForm(p => ({...p,amountApprovalThreshold:e.target.value}))} placeholder="e.g. 50000" /></div>
        </div>
      </div>
      <div style={CARD}>
        <SectionHeader label="Default Terms & Conditions" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={LBL}>Default Estimate Terms</label><textarea style={{ ...INP, minHeight: 90, resize: "vertical", lineHeight: 1.6 }} value={form.defaultEstimateTerms} onChange={e => setForm(p => ({...p,defaultEstimateTerms:e.target.value}))} rows={4} /></div>
          <div><label style={LBL}>Default Invoice Terms</label><textarea style={{ ...INP, minHeight: 90, resize: "vertical", lineHeight: 1.6 }} value={form.defaultInvoiceTerms} onChange={e => setForm(p => ({...p,defaultInvoiceTerms:e.target.value}))} rows={4} /></div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, alignItems: "center" }}>
        {invMsg.text && <span style={{ fontSize: 13, color: invMsg.type === "success" ? "#10b981" : "#dc2626" }}>{invMsg.text}</span>}
        <button onClick={saveInvoicing} disabled={invSaving || !invoicingHasChanges} style={{ padding: "9px 22px", background: invoicingHasChanges && !invSaving ? "#dc2626" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 7, color: invoicingHasChanges && !invSaving ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600, cursor: invoicingHasChanges && !invSaving ? "pointer" : "not-allowed" }}>{invSaving ? "Saving\u2026" : invoicingHasChanges ? "Save Changes" : "No Changes"}</button>
      </div>
    </>
  );
}
