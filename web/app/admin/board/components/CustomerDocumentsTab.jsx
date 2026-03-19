"use client";

import { useState, useEffect, useRef } from "react";

const CATEGORIES = [
  { id: "photos",    label: "Photos",    icon: "🖼",  accept: "image/*" },
  { id: "videos",    label: "Videos",    icon: "🎬",  accept: "video/*" },
  { id: "manuals",   label: "Manuals",   icon: "📕",  accept: ".pdf,.doc,.docx" },
  { id: "documents", label: "Documents", icon: "📄",  accept: ".pdf,.doc,.docx,.xls,.xlsx" },
];

const CHUNK_SIZE = 10 * 1024 * 1024;

const fmt = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
};

export default function CustomerDocumentsTab({ order, isManufacturer, getAuthHeaders }) {
  const [files,           setFiles]           = useState({ photos: [], videos: [], manuals: [], documents: [] });
  const [loading,         setLoading]         = useState(false);
  const [category,        setCategory]        = useState("photos");
  const [uploading,       setUploading]       = useState(false);
  const [progress,        setProgress]        = useState(0);
  const [status,          setStatus]          = useState("");
  const [uploadError,     setUploadError]     = useState("");
  const [uploadSuccess,   setUploadSuccess]   = useState("");
  const fileInputRef = useRef(null);

  const loadFiles = async () => {
    if (!order?.id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/customer-documents/${order.id}`, { headers: getAuthHeaders() });
      if (res.ok) setFiles(await res.json());
    } catch (e) { console.error("Failed to load customer files:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadFiles(); }, [order?.id]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true); setProgress(0); setStatus("Preparing…"); setUploadError(""); setUploadSuccess("");
    let documentId = null, uploadId = null, s3Key = null;

    try {
      const initRes = await fetch(`/api/customer-documents/${order.id}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream", category }),
      });
      if (!initRes.ok) { const e = await initRes.json(); throw new Error(e.error || "Failed to initiate upload"); }
      const init = await initRes.json();
      documentId = init.documentId; uploadId = init.uploadId; s3Key = init.s3Key;
      const totalParts = init.totalParts;

      const parts = [];
      for (let part = 1; part <= totalParts; part++) {
        setStatus(`Uploading part ${part} of ${totalParts}…`);
        setProgress(Math.round(((part - 1) / totalParts) * 90));
        const chunk = file.slice((part - 1) * CHUNK_SIZE, part * CHUNK_SIZE);
        const signRes = await fetch(`/api/customer-documents/${order.id}/sign-part`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, uploadId, partNumber: part, s3Key }),
        });
        if (!signRes.ok) throw new Error("Failed to get signed URL");
        const { presignedUrl } = await signRes.json();
        const up = await fetch(presignedUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: chunk });
        if (!up.ok) throw new Error(`Part ${part} failed`);
        parts.push({ PartNumber: part, ETag: up.headers.get("ETag") });
      }

      setStatus("Finalizing…"); setProgress(95);
      const completeRes = await fetch(`/api/customer-documents/${order.id}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");

      setProgress(100);
      setUploadSuccess(`"${file.name}" uploaded successfully.`);
      setTimeout(() => setUploadSuccess(""), 4000);
      await loadFiles();
    } catch (e) {
      setUploadError(e.message || "Upload failed");
      if (documentId && uploadId && s3Key) {
        fetch(`/api/customer-documents/${order.id}/abort`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ documentId, uploadId, s3Key }) }).catch(() => {});
      }
    } finally {
      setUploading(false); setProgress(0); setStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const currentCat = CATEGORIES.find(c => c.id === category);
  const totalCount = CATEGORIES.reduce((n, cat) => n + (files[cat.id]?.length || 0), 0);

  return (
    <div style={{ padding: "1.5rem", maxHeight: "60vh", overflowY: "auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ fontSize: "13px", color: "#9ca3af" }}>
          {totalCount === 0 ? "No files uploaded yet" : `${totalCount} file${totalCount !== 1 ? "s" : ""} uploaded`}
        </span>
        {!isManufacturer && (
          <a href={`/admin/orders/${order?.id}/customer-files`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "#dc2626", textDecoration: "none", fontWeight: 500 }}>Manage Files ↗</a>
        )}
      </div>

      {/* Inline upload */}
      <div style={{ background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Upload File</h4>

        {uploadError   && <div style={{ padding: "10px 12px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "6px", color: "#fca5a5", fontSize: "13px", marginBottom: "10px" }}>⚠ {uploadError}</div>}
        {uploadSuccess && <div style={{ padding: "10px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "6px", color: "#6ee7b7", fontSize: "13px", marginBottom: "10px" }}>✓ {uploadSuccess}</div>}

        {/* Category selector */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)} style={{ padding: "5px 12px", fontSize: "12px", background: category === cat.id ? "#dc2626" : "#252525", color: category === cat.id ? "#fff" : "#9ca3af", border: category === cat.id ? "none" : "1px solid #2d2d2d", borderRadius: "5px", cursor: "pointer" }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <input ref={fileInputRef} type="file" accept={currentCat?.accept} onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />

        {uploading ? (
          <div style={{ padding: "20px", background: "#0f0f0f", borderRadius: "6px", border: "1px solid #2d2d2d" }}>
            <div style={{ width: "100%", background: "#1f1f1f", borderRadius: "99px", height: "6px", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#dc2626", borderRadius: "99px", transition: "width 0.2s" }} />
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af", textAlign: "center" }}>{status} — {progress}%</p>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "20px", border: "2px dashed #374151", borderRadius: "6px", cursor: "pointer", background: "#0f0f0f" }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#dc2626"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#374151"}
          >
            <span style={{ fontSize: "22px" }}>⬆</span>
            <span style={{ fontSize: "13px", color: "#e4e4e4" }}>Click to upload {currentCat?.label.toLowerCase()}</span>
            <span style={{ fontSize: "11px", color: "#4b5563" }}>{currentCat?.accept}</span>
          </div>
        )}
      </div>

      {/* File display */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Loading files...</div>
      ) : (
        <>
          {CATEGORIES.map((cat) => {
            const catFiles = files[cat.id] || [];
            if (catFiles.length === 0) return null;
            return (
              <div key={cat.id} style={{ marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {cat.icon} {cat.label} ({catFiles.length})
                </h4>

                {cat.id === "photos" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "8px" }}>
                    {catFiles.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: "6px", overflow: "hidden", border: "1px solid #2d2d2d", aspectRatio: "1", backgroundColor: "#1a1a1a" }}>
                        <img src={f.url} alt={f.displayName || f.fileName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </a>
                    ))}
                  </div>
                )}

                {(cat.id === "videos" || cat.id === "manuals" || cat.id === "documents") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {catFiles.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", backgroundColor: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "6px", textDecoration: "none", color: "#e4e4e4", fontSize: "13px" }}>
                        <span style={{ fontSize: "18px" }}>{cat.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.displayName || f.fileName}</div>
                          {f.description && <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{f.description}</div>}
                        </div>
                        <span style={{ fontSize: "12px", color: "#6b7280", flexShrink: 0 }}>{fmt(f.fileSize)}</span>
                        <span style={{ color: "#dc2626", flexShrink: 0 }}>↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Legacy Dropbox link */}
          {files.legacyDropboxLink && (
            <div style={{ marginTop: "16px", padding: "12px 16px", background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "7px" }}>
              <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>Legacy Dropbox Link</p>
              <a href={files.legacyDropboxLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "#dc2626", wordBreak: "break-all" }}>{files.legacyDropboxLink} ↗</a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
