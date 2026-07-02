"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const CHUNK_SIZE = 10 * 1024 * 1024;

// Mirrors the desktop customer-files categories and accept filters.
const CATEGORIES = [
  { id: "photos", label: "Photos", accept: "image/*", capture: true, captureLabel: "Take Photo" },
  { id: "videos", label: "Videos", accept: "video/*", capture: true, captureLabel: "Record Video" },
  { id: "manuals", label: "Manuals", accept: ".pdf,.doc,.docx" },
  { id: "documents", label: "Documents", accept: ".pdf,.doc,.docx,.xls,.xlsx" },
  { id: "readme",    label: "Read Me",   accept: "*/*" },
];

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "14px 14px 32px" },
  back: { display: "inline-block", fontSize: 14, color: "#dc2626", marginBottom: 8 },
  h1: { fontSize: 21, fontWeight: 700, margin: "2px 0 2px" },
  sub: { fontSize: 13, color: "#9ca3af", marginBottom: 4 },
  section: { marginTop: 20 },
  label: { fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 },
  panel: { background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, padding: "14px" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 14 },
  rowLabel: { color: "#9ca3af" },
  contactBtn: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #404040", background: "#2a2a2a", color: "#e4e4e4", marginTop: 8 },
  item: { padding: "10px 0", borderBottom: "1px solid #2a2a2a", fontSize: 14 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: { padding: "8px 14px", minHeight: 40, borderRadius: 99, fontSize: 14, fontWeight: 600, border: "1px solid #404040", background: "#2a2a2a", color: "#9ca3af", cursor: "pointer" },
  chipActive: { background: "rgba(220,38,38,0.15)", borderColor: "#dc2626", color: "#f87171" },
  captureBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 52, marginTop: 10, borderRadius: 10, fontSize: 16, fontWeight: 600, border: "1px solid #404040", background: "#2a2a2a", color: "#e4e4e4", cursor: "pointer" },
  primary: { background: "#dc2626", border: "1px solid #dc2626", color: "#fff" },
  bar: { height: 8, borderRadius: 99, background: "#1f1f1f", overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", background: "#dc2626", borderRadius: 99, transition: "width 0.2s" },
  banner: (ok) => ({ padding: "12px 14px", borderRadius: 8, marginTop: 12, fontSize: 14, background: ok ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)", border: `1px solid ${ok ? "#10b981" : "#dc2626"}`, color: ok ? "#a7f3d0" : "#fca5a5" }),
  filesLink: { display: "block", textAlign: "center", marginTop: 12, fontSize: 14, color: "#dc2626" },
};

const money = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : null);

export default function MobileOrderView() {
  const { user, getAuthHeaders } = useAuth();
  const params = useParams();
  const id = params?.id;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [category, setCategory] = useState("photos");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadErr, setUploadErr] = useState("");

  const captureRef = useRef(null);
  const pickRef = useRef(null);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/orders/${id}`, { headers: getAuthHeaders(), cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setOrder(data);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, id, getAuthHeaders]);

  const uploadOne = useCallback(async (file, cat) => {
    let documentId = null, uploadId = null, s3Key = null;
    try {
      const initRes = await fetch(`/api/customer-documents/${id}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream", category: cat }),
      });
      if (!initRes.ok) { const e = await initRes.json().catch(() => ({})); throw new Error(e.error || "Failed to initiate"); }
      const init = await initRes.json();
      documentId = init.documentId; uploadId = init.uploadId; s3Key = init.s3Key;
      const totalParts = init.totalParts;
      const parts = [];
      for (let part = 1; part <= totalParts; part++) {
        setStatus(`Uploading part ${part}/${totalParts}`);
        setProgress(Math.round(((part - 1) / totalParts) * 90));
        const chunk = file.slice((part - 1) * CHUNK_SIZE, part * CHUNK_SIZE);
        const signRes = await fetch(`/api/customer-documents/${id}/sign-part`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, uploadId, partNumber: part, s3Key }),
        });
        if (!signRes.ok) throw new Error("Failed to get signed URL");
        const { presignedUrl } = await signRes.json();
        const up = await fetch(presignedUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: chunk });
        if (!up.ok) throw new Error(`Part ${part} upload failed`);
        parts.push({ PartNumber: part, ETag: up.headers.get("ETag") });
      }
      setStatus("Finalising");
      setProgress(95);
      const completeRes = await fetch(`/api/customer-documents/${id}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");
      setProgress(100);
      return true;
    } catch (e) {
      if (documentId && uploadId && s3Key) {
        fetch(`/api/customer-documents/${id}/abort`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ documentId, uploadId, s3Key }) }).catch(() => {});
      }
      throw e;
    }
  }, [id, getAuthHeaders]);

  const handleFiles = useCallback(async (fileList) => {
    const list = Array.from(fileList || []);
    if (!list.length) return;
    setUploadErr(""); setSuccess(""); setUploading(true);
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setProgress(0);
      setStatus(list.length > 1 ? `File ${i + 1}/${list.length}` : "Preparing");
      try { await uploadOne(file, category); }
      catch (e) { errors.push(`${file.name}: ${e.message}`); }
    }
    setUploading(false); setProgress(0); setStatus("");
    if (captureRef.current) captureRef.current.value = "";
    if (pickRef.current) pickRef.current.value = "";
    if (errors.length) setUploadErr(errors.join(" | "));
    else {
      const catLabel = (CATEGORIES.find((c) => c.id === category) || {}).label || "files";
      setSuccess(`${list.length} file${list.length > 1 ? "s" : ""} uploaded to ${catLabel}.`);
    }
  }, [uploadOne, category]);

  if (!user) return <><TopNav /><div style={S.wrap} /></>;

  const acct = order?.account;
  const items = Array.isArray(order?.items) ? order.items : [];
  const cat = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];

  return (
    <>
      <TopNav />
      <div style={S.wrap}>
        <a href="/m/orders" style={S.back}>&#8249; Orders</a>

        {loading ? (
          <div style={{ color: "#6b7280", padding: "40px 0", textAlign: "center" }}>Loading...</div>
        ) : err ? (
          <div style={S.banner(false)}>{err}</div>
        ) : !order ? (
          <div style={S.banner(false)}>Order not found.</div>
        ) : (
          <>
            <h1 style={S.h1}>{acct?.name || "(no customer)"}</h1>
            <div style={S.sub}>
              {order.isLocked ? "Locked" : "Active"}
              {order.orderDate ? `  ·  ${new Date(order.orderDate).toLocaleDateString()}` : ""}
            </div>

            <div style={S.section}>
              <div style={S.label}>Customer</div>
              <div style={S.panel}>
                {acct?.contactName && <div style={S.row}><span style={S.rowLabel}>Contact</span><span>{acct.contactName}</span></div>}
                {order.sku && <div style={S.row}><span style={S.rowLabel}>Sales</span><span>{order.sku}</span></div>}
                {order.onsiteInstallationDate && <div style={S.row}><span style={S.rowLabel}>Install</span><span>{new Date(order.onsiteInstallationDate).toLocaleDateString()}</span></div>}
                {acct?.phone && <a href={`tel:${acct.phone}`} style={S.contactBtn}>Call {acct.phone}</a>}
                {acct?.email && <a href={`mailto:${acct.email}`} style={S.contactBtn}>Email</a>}
                {acct?.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(acct.address)}`} target="_blank" rel="noreferrer" style={S.contactBtn}>Map {acct.address}</a>}
              </div>
            </div>

            <div style={S.section}>
              <div style={S.label}>Items ({items.length})</div>
              <div style={S.panel}>
                {items.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 14 }}>No items.</div>
                ) : (
                  items.map((it, idx) => (
                    <div key={it.id || idx} style={{ ...S.item, borderBottom: idx === items.length - 1 ? "none" : S.item.borderBottom }}>
                      <div style={{ fontWeight: 600 }}>{it.productCode || `Item ${idx + 1}`}</div>
                      <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 2 }}>
                        {[it.qty ? `Qty ${it.qty}` : null, money(it.itemPrice)].filter(Boolean).join("  ·  ")}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={S.section}>
              <div style={S.label}>Add files</div>
              <div style={S.chips}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={uploading}
                    onClick={() => { setCategory(c.id); setSuccess(""); setUploadErr(""); }}
                    style={{ ...S.chip, ...(category === c.id ? S.chipActive : null) }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <input ref={captureRef} type="file" accept={cat.accept} capture="environment" onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} disabled={uploading} />
              <input ref={pickRef} type="file" accept={cat.accept} multiple onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} disabled={uploading} />

              {cat.capture && (
                <button type="button" style={{ ...S.captureBtn, ...S.primary }} disabled={uploading} onClick={() => captureRef.current?.click()}>
                  {cat.captureLabel}
                </button>
              )}
              <button type="button" style={S.captureBtn} disabled={uploading} onClick={() => pickRef.current?.click()}>
                {cat.capture ? "Choose from Library" : `Choose ${cat.label}`}
              </button>

              {uploading && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: "#9ca3af" }}>{status} - {progress}%</div>
                  <div style={S.bar}><div style={{ ...S.barFill, width: `${progress}%` }} /></div>
                </div>
              )}
              {uploadErr && <div style={S.banner(false)}>{uploadErr}</div>}
              {success && <div style={S.banner(true)}>{success}</div>}
              <a href={`/admin/orders/${id}/customer-files?desktop=1`} style={S.filesLink}>View all files for this order</a>
            </div>
          </>
        )}
      </div>
    </>
  );
}
