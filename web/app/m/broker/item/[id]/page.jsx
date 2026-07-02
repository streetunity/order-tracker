"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const ALLOWED_ROLES = ["BROKER", "SUPER_ADMIN", "ACCOUNTANT"];

const DOC_TYPES = [
  { id: "ISF", label: "ISF" },
  { id: "ARRIVAL_NOTICE", label: "Arrival Notice" },
  { id: "BILL_OF_LADING", label: "Bill of Lading" },
  { id: "COMMERCIAL_INVOICE", label: "Commercial Invoice" },
  { id: "PACKING_LIST", label: "Packing List" },
  { id: "DELIVERY_ORDER", label: "Delivery Order" },
  { id: "ISF_REPORT", label: "ISF Report" },
  { id: "ENTRY_SUMMARY", label: "Entry Summary" },
  { id: "BROKER_INVOICE", label: "Broker Invoice" },
  { id: "OTHER", label: "Other" },
];
const DOC_LABELS = Object.fromEntries(DOC_TYPES.map((d) => [d.id, d.label]));
const REQUIRED_TYPES = ["ISF", "ARRIVAL_NOTICE", "BILL_OF_LADING", "COMMERCIAL_INVOICE", "PACKING_LIST", "DELIVERY_ORDER"];
const STATUS_OPTIONS = ["PENDING", "FILED", "RELEASED", "UNDER_EXAM"];
const STATUS_COLORS = {
  PENDING: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  FILED: { bg: "rgba(16,185,129,0.15)", text: "#34d399" },
  RELEASED: { bg: "rgba(37,99,235,0.15)", text: "#60a5fa" },
  UNDER_EXAM: { bg: "rgba(220,38,38,0.15)", text: "#f87171" },
};

const fmtSize = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const S = {
  header: { position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#1a1a1a", borderBottom: "1px solid #333" },
  back: { fontSize: 14, color: "#dc2626", textDecoration: "none", background: "none", border: "none", cursor: "pointer", padding: 0 },
  wrap: { maxWidth: 720, margin: "0 auto", padding: "12px 14px 32px" },
  h1: { fontSize: 20, fontWeight: 700, margin: "4px 0 2px" },
  label: { fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 8px" },
  panel: { background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, padding: "14px" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 14 },
  rowLabel: { color: "#9ca3af" },
  link: { color: "#60a5fa", textDecoration: "none" },
  badge: { display: "inline-block", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99 },
  field: { width: "100%", fontSize: 16, padding: "11px 12px", borderRadius: 8, boxSizing: "border-box", marginTop: 8, background: "#2a2a2a", border: "1px solid #404040", color: "#e4e4e4" },
  btn: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 48, marginTop: 10, borderRadius: 8, fontSize: 15, fontWeight: 600, border: "1px solid #404040", background: "#2a2a2a", color: "#e4e4e4", cursor: "pointer" },
  primary: { background: "#dc2626", border: "1px solid #dc2626", color: "#fff" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 14 },
  docRow: { padding: "10px 0", borderBottom: "1px solid #2a2a2a" },
  docName: { fontSize: 14, fontWeight: 600, wordBreak: "break-word" },
  docMeta: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  docBtns: { display: "flex", gap: 8, marginTop: 8 },
  docBtn: { flex: 1, minHeight: 40, borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #404040", background: "#2a2a2a", color: "#e4e4e4", cursor: "pointer" },
  danger: { color: "#f87171", borderColor: "rgba(220,38,38,0.4)" },
  banner: (ok) => ({ padding: "10px 12px", borderRadius: 8, marginTop: 10, fontSize: 13, background: ok ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)", border: `1px solid ${ok ? "#10b981" : "#dc2626"}`, color: ok ? "#a7f3d0" : "#fca5a5" }),
  empty: { color: "#6b7280", fontSize: 14, padding: "8px 0" },
};

export default function MobileBrokerItem() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const params = useParams();
  const itemId = params?.id;

  const [item, setItem] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState("PENDING");
  const [notes, setNotes] = useState("");
  const [entryNumber, setEntryNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [docType, setDocType] = useState("ISF");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef(null);

  const loadItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/customs/item/${itemId}`, { headers: getAuthHeaders(), cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItem(data);
        setStatus(data.customsDocumentStatus || "PENDING");
        setNotes(data.customsNotes || "");
        setEntryNumber(data.entryNumber || "");
      }
    } catch (e) { console.error(e); }
  }, [itemId, getAuthHeaders]);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/customs/item/${itemId}/documents`, { headers: getAuthHeaders(), cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
      }
    } catch (e) { console.error(e); }
  }, [itemId, getAuthHeaders]);

  useEffect(() => {
    if (!user) return;
    if (!ALLOWED_ROLES.includes(user.role)) { router.push("/login"); return; }
    (async () => { setLoading(true); await Promise.all([loadItem(), loadDocuments()]); setLoading(false); })();
  }, [user, router, loadItem, loadDocuments]);

  async function handleSaveStatus() {
    setSaving(true); setSavedMsg("");
    try {
      const res = await fetch(`/api/customs/update-status/${itemId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ customsDocumentStatus: status, customsNotes: notes, entryNumber }),
      });
      if (res.ok) { setSavedMsg("Saved."); await loadItem(); }
      else setSavedMsg("Save failed.");
    } catch (e) { setSavedMsg("Save failed."); }
    setSaving(false);
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg(""); setUploadErr("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", docType);
      const res = await fetch(`/api/customs/item/${itemId}/documents`, { method: "POST", headers: getAuthHeaders(), body: formData });
      if (res.ok) {
        setUploadMsg(`Uploaded ${DOC_LABELS[docType] || docType}.`);
        if (fileRef.current) fileRef.current.value = "";
        await loadDocuments();
      } else {
        const d = await res.json().catch(() => ({}));
        setUploadErr(d.error || "Upload failed.");
      }
    } catch (e) { setUploadErr("Upload failed."); }
    setUploading(false);
  }

  async function handleDownload(doc) {
    try {
      const res = await fetch(`/api/customs/item/${itemId}/documents/${doc.id}/download`, { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); if (data.downloadUrl) window.open(data.downloadUrl, "_blank"); }
    } catch (e) { console.error(e); }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.fileName}"?`)) return;
    try {
      const res = await fetch(`/api/customs/item/${itemId}/documents/${doc.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) await loadDocuments();
    } catch (e) { console.error(e); }
  }

  if (!user) return null;

  const acct = item?.order?.account;
  const sc = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  const haveType = (t) => documents.some((d) => d.documentType === t);

  return (
    <>
      <div style={S.header}>
        <button style={S.back} onClick={() => router.push("/m/broker")}>&#8249; Broker Portal</button>
      </div>

      <div style={S.wrap}>
        {loading ? (
          <div style={{ color: "#6b7280", padding: "40px 0", textAlign: "center" }}>Loading...</div>
        ) : !item ? (
          <div style={S.banner(false)}>Item not found.</div>
        ) : (
          <>
            <h1 style={S.h1}>{item.productCode || "Unnamed Item"}</h1>
            <span style={{ ...S.badge, background: sc.bg, color: sc.text }}>{(item.customsDocumentStatus || "PENDING").replace("_", " ")}</span>

            <div style={S.label}>Details</div>
            <div style={S.panel}>
              {acct?.name && <div style={S.row}><span style={S.rowLabel}>Customer</span><span>{acct.name}</span></div>}
              {acct?.phone && <div style={S.row}><span style={S.rowLabel}>Phone</span><a href={`tel:${acct.phone}`} style={S.link}>{acct.phone}</a></div>}
              {acct?.email && <div style={S.row}><span style={S.rowLabel}>Email</span><a href={`mailto:${acct.email}`} style={S.link}>{acct.email}</a></div>}
              {item.manufacturer?.name && <div style={S.row}><span style={S.rowLabel}>Manufacturer</span><span>{item.manufacturer.name}</span></div>}
              {item.serialNumber && <div style={S.row}><span style={S.rowLabel}>Serial</span><span>{item.serialNumber}</span></div>}
              {item.billOfLading && <div style={S.row}><span style={S.rowLabel}>BOL</span><span>{item.billOfLading}</span></div>}
              {item.shipment?.containerNumber && <div style={S.row}><span style={S.rowLabel}>Container</span><span>{item.shipment.containerNumber}</span></div>}
              {item.currentStage && <div style={S.row}><span style={S.rowLabel}>Stage</span><span>{item.currentStage}</span></div>}
            </div>

            <div style={S.label}>Customs Status</div>
            <div style={S.panel}>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={S.field}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
              <input type="text" value={entryNumber} onChange={(e) => setEntryNumber(e.target.value)} placeholder="Entry number" style={S.field} />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} style={{ ...S.field, resize: "vertical" }} />
              <button style={{ ...S.btn, ...S.primary }} disabled={saving} onClick={handleSaveStatus}>{saving ? "Saving..." : "Save Status"}</button>
              {savedMsg && <div style={S.banner(savedMsg === "Saved.")}>{savedMsg}</div>}
            </div>

            <div style={S.label}>Required Documents</div>
            <div style={S.panel}>
              {REQUIRED_TYPES.map((t) => (
                <div key={t} style={S.checkRow}>
                  <span style={{ color: haveType(t) ? "#34d399" : "#6b7280", fontWeight: 700 }}>{haveType(t) ? "✓" : "○"}</span>
                  <span style={{ color: haveType(t) ? "#e4e4e4" : "#9ca3af" }}>{DOC_LABELS[t]}</span>
                </div>
              ))}
            </div>

            <div style={S.label}>Documents ({documents.length})</div>
            <div style={S.panel}>
              {documents.length === 0 ? (
                <div style={S.empty}>No documents yet.</div>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} style={S.docRow}>
                    <div style={S.docName}>{doc.fileName}</div>
                    <div style={S.docMeta}>
                      {DOC_LABELS[doc.documentType] || doc.documentType}
                      {doc.fileSize ? `  ·  ${fmtSize(doc.fileSize)}` : ""}
                      {doc.uploadedBy ? `  ·  ${doc.uploadedBy}` : ""}
                      {doc.uploadedAt ? `  ·  ${new Date(doc.uploadedAt).toLocaleDateString()}` : ""}
                    </div>
                    <div style={S.docBtns}>
                      <button style={S.docBtn} onClick={() => handleDownload(doc)}>Download</button>
                      {doc.uploadedBy === user?.name && <button style={{ ...S.docBtn, ...S.danger }} onClick={() => handleDelete(doc)}>Delete</button>}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={S.label}>Upload Document</div>
            <div style={S.panel}>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} style={S.field}>
                {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
              <input ref={fileRef} type="file" style={{ ...S.field, padding: 10 }} disabled={uploading} />
              <button style={{ ...S.btn, ...S.primary }} disabled={uploading} onClick={handleUpload}>{uploading ? "Uploading..." : "Upload"}</button>
              {uploadMsg && <div style={S.banner(true)}>{uploadMsg}</div>}
              {uploadErr && <div style={S.banner(false)}>{uploadErr}</div>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
