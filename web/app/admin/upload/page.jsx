"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const CHUNK_SIZE = 10 * 1024 * 1024; // matches customer-documents uploader

const S = {
  wrap: { maxWidth: 640, margin: "0 auto", padding: "16px 14px 32px" },
  h1: { fontSize: 20, fontWeight: 700, margin: "4px 0 2px" },
  sub: { fontSize: 13, color: "#9ca3af", margin: "0 0 16px" },
  label: { fontSize: 13, fontWeight: 600, color: "#e4e4e4", margin: "0 0 8px" },
  search: {
    width: "100%",
    fontSize: 16, // >=16px avoids iOS focus-zoom
    padding: "12px 14px",
    borderRadius: 8,
    boxSizing: "border-box",
  },
  card: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "14px",
    marginTop: 8,
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1f1f1f",
    color: "#e4e4e4",
    cursor: "pointer",
  },
  cardActive: { border: "1px solid #dc2626", background: "rgba(220,38,38,0.10)" },
  cardName: { fontSize: 15, fontWeight: 600 },
  cardMeta: { fontSize: 12, color: "#9ca3af", marginTop: 3 },
  captureBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    minHeight: 56,
    marginTop: 12,
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    border: "1px solid #404040",
    background: "#2a2a2a",
    color: "#e4e4e4",
    cursor: "pointer",
  },
  capturePrimary: { background: "#dc2626", border: "1px solid #dc2626", color: "#fff" },
  bar: { height: 8, borderRadius: 99, background: "#1f1f1f", overflow: "hidden", marginTop: 6 },
  barFill: { height: "100%", background: "#dc2626", borderRadius: 99, transition: "width 0.2s" },
  banner: (ok) => ({
    padding: "12px 14px",
    borderRadius: 8,
    marginTop: 14,
    fontSize: 14,
    background: ok ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)",
    border: `1px solid ${ok ? "#10b981" : "#dc2626"}`,
    color: ok ? "#a7f3d0" : "#fca5a5",
  }),
  change: {
    fontSize: 13,
    color: "#dc2626",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  },
};

export default function QuickUploadPage() {
  const { user, getAuthHeaders } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const libraryRef = useRef(null);

  const isLimited = user && (user.role === "MANUFACTURER" || user.role === "BROKER");

  useEffect(() => {
    if (!user || isLimited) { setLoadingOrders(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/orders?includeArchived=false", {
          headers: getAuthHeaders(),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setOrders(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isLimited, getAuthHeaders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? orders.filter((o) => {
          const name = (o.account?.name || "").toLowerCase();
          const sku = (o.sku || "").toLowerCase();
          return name.includes(q) || sku.includes(q);
        })
      : orders;
    return list.slice(0, 60);
  }, [orders, query]);

  const uploadOne = useCallback(async (file, orderId, category) => {
    let documentId = null, uploadId = null, s3Key = null;
    try {
      const initRes = await fetch(`/api/customer-documents/${orderId}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          category,
        }),
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
        const signRes = await fetch(`/api/customer-documents/${orderId}/sign-part`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, uploadId, partNumber: part, s3Key }),
        });
        if (!signRes.ok) throw new Error("Failed to get signed URL");
        const { presignedUrl } = await signRes.json();
        const up = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: chunk,
        });
        if (!up.ok) throw new Error(`Part ${part} upload failed`);
        parts.push({ PartNumber: part, ETag: up.headers.get("ETag") });
      }

      setStatus("Finalising");
      setProgress(95);
      const completeRes = await fetch(`/api/customer-documents/${orderId}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");
      setProgress(100);
      return true;
    } catch (e) {
      if (documentId && uploadId && s3Key) {
        fetch(`/api/customer-documents/${orderId}/abort`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, uploadId, s3Key }),
        }).catch(() => {});
      }
      throw e;
    }
  }, [getAuthHeaders]);

  const handleFiles = useCallback(async (fileList) => {
    const list = Array.from(fileList || []);
    if (!list.length || !selected) return;

    setError(""); setSuccess(""); setUploading(true);
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const category = (file.type || "").startsWith("video/") ? "videos" : "photos";
      setProgress(0);
      setStatus(list.length > 1 ? `File ${i + 1}/${list.length}` : "Preparing");
      try {
        await uploadOne(file, selected.id, category);
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    setUploading(false); setProgress(0); setStatus("");
    // Reset inputs so the same file can be re-picked if needed.
    if (photoRef.current) photoRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";

    if (errors.length) setError(errors.join(" | "));
    else setSuccess(`${list.length} file${list.length > 1 ? "s" : ""} uploaded to ${selected.account?.name || "order"}.`);
  }, [selected, uploadOne]);

  if (!user) {
    return <><TopNav /><div style={S.wrap} /></>;
  }

  if (isLimited) {
    return (
      <>
        <TopNav />
        <div style={S.wrap}>
          <h1 style={S.h1}>Quick Upload</h1>
          <p style={S.sub}>This screen isn&apos;t available for your role yet.</p>
        </div>
      </>
    );
  }

  const orderMeta = (o) => {
    const d = o.orderDate ? new Date(o.orderDate).toLocaleDateString() : null;
    const bits = [d, o.sku ? `Sales: ${o.sku}` : null, `${Array.isArray(o.items) ? o.items.length : 0} items`].filter(Boolean);
    return bits.join("  ·  ");
  };

  return (
    <>
      <TopNav />
      <div style={S.wrap}>
        <h1 style={S.h1}>Quick Upload</h1>
        <p style={S.sub}>Snap a photo or video and attach it straight to an order.</p>

        {!selected ? (
          <>
            <div style={S.label}>1. Find the order</div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer or sales person"
              style={S.search}
              autoComplete="off"
            />
            {loadingOrders ? (
              <p style={{ ...S.sub, marginTop: 14 }}>Loading orders...</p>
            ) : filtered.length === 0 ? (
              <p style={{ ...S.sub, marginTop: 14 }}>No matching orders.</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  style={S.card}
                  onClick={() => { setSelected(o); setSuccess(""); setError(""); }}
                >
                  <div style={S.cardName}>{o.account?.name || "(no customer)"}</div>
                  <div style={S.cardMeta}>{orderMeta(o)}</div>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={S.label}>Uploading to</div>
              {!uploading && (
                <button type="button" style={S.change} onClick={() => { setSelected(null); setSuccess(""); setError(""); }}>
                  Change order
                </button>
              )}
            </div>
            <div style={{ ...S.card, ...S.cardActive, cursor: "default" }}>
              <div style={S.cardName}>{selected.account?.name || "(no customer)"}</div>
              <div style={S.cardMeta}>{orderMeta(selected)}</div>
            </div>

            <div style={{ ...S.label, marginTop: 20 }}>2. Capture or choose</div>

            <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} disabled={uploading} />
            <input ref={videoRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} disabled={uploading} />
            <input ref={libraryRef} type="file" accept="image/*,video/*" multiple onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} disabled={uploading} />

            <button type="button" style={{ ...S.captureBtn, ...S.capturePrimary }} disabled={uploading} onClick={() => photoRef.current?.click()}>
              Take Photo
            </button>
            <button type="button" style={S.captureBtn} disabled={uploading} onClick={() => videoRef.current?.click()}>
              Record Video
            </button>
            <button type="button" style={S.captureBtn} disabled={uploading} onClick={() => libraryRef.current?.click()}>
              Choose from Library
            </button>

            {uploading && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>{status} - {progress}%</div>
                <div style={S.bar}><div style={{ ...S.barFill, width: `${progress}%` }} /></div>
              </div>
            )}
          </>
        )}

        {error && <div style={S.banner(false)}>{error}</div>}
        {success && <div style={S.banner(true)}>{success}</div>}
      </div>
    </>
  );
}
