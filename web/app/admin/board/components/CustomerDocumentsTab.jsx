"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
  const [files,         setFiles]         = useState({ photos: [], videos: [], manuals: [], documents: [] });
  const [loading,       setLoading]       = useState(false);
  const [category,      setCategory]      = useState("photos");
  const [uploadQueue,   setUploadQueue]   = useState([]);    // [{ file, id }]
  const [uploadingIdx,  setUploadingIdx]  = useState(null);  // index currently uploading
  const [progress,      setProgress]      = useState(0);
  const [status,        setStatus]        = useState("");
  const [uploadError,   setUploadError]   = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [dragOver,      setDragOver]      = useState(false);
  const fileInputRef = useRef(null);
  const isUploading = uploadingIdx !== null;

  // ── Fetch ──────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!order?.id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/customer-documents/${order.id}`, { headers: getAuthHeaders() });
      if (res.ok) setFiles(await res.json());
    } catch (e) { console.error("Failed to load customer files:", e); }
    finally { setLoading(false); }
  }, [order?.id, getAuthHeaders]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Upload single file ─────────────────────────────────────────
  const uploadOne = useCallback(async (file) => {
    let documentId = null, uploadId = null, s3Key = null;
    try {
      const initRes = await fetch(`/api/customer-documents/${order.id}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream", category }),
      });
      if (!initRes.ok) { const e = await initRes.json(); throw new Error(e.error || "Failed to initiate"); }
      const init = await initRes.json();
      documentId = init.documentId; uploadId = init.uploadId; s3Key = init.s3Key;
      const totalParts = init.totalParts;

      const parts = [];
      for (let part = 1; part <= totalParts; part++) {
        setStatus(`"${file.name}" — part ${part}/${totalParts}`);
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

      setStatus(`Finalising "${file.name}"…`); setProgress(95);
      const completeRes = await fetch(`/api/customer-documents/${order.id}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");
      setProgress(100);
      return true;
    } catch (e) {
      if (documentId && uploadId && s3Key)
        fetch(`/api/customer-documents/${order.id}/abort`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ documentId, uploadId, s3Key }) }).catch(() => {});
      throw e;
    }
  }, [order?.id, category, getAuthHeaders]);

  // ── Process queue sequentially ────────────────────────────────
  const processQueue = useCallback(async (queue) => {
    setUploadError(""); setUploadSuccess("");
    const errors = [];
    for (let i = 0; i < queue.length; i++) {
      setUploadingIdx(i); setProgress(0);
      try { await uploadOne(queue[i].file); }
      catch (e) { errors.push(`${queue[i].file.name}: ${e.message}`); }
    }
    setUploadingIdx(null); setProgress(0); setStatus(""); setUploadQueue([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadFiles();
    if (errors.length) setUploadError(errors.join(" | "));
    else {
      setUploadSuccess(`${queue.length} file${queue.length > 1 ? "s" : ""} uploaded.`);
      setTimeout(() => setUploadSuccess(""), 4000);
    }
  }, [uploadOne, loadFiles]);

  // ── Enqueue and kick off ──────────────────────────────────────
  const enqueueFiles = useCallback((fileList) => {
    const items = Array.from(fileList).map(f => ({ file: f, id: Math.random().toString(36).slice(2) }));
    if (!items.length) return;
    setUploadQueue(items);
    processQueue(items);
  }, [processQueue]);

  const handleFileInput = (e) => enqueueFiles(e.target.files);

  // ── Drag-and-drop ─────────────────────────────────────────────
  const handleDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = ()  => setDragOver(false);
  const handleDrop      = (e) => {
    e.preventDefault(); setDragOver(false);
    if (!isUploading) enqueueFiles(e.dataTransfer.files);
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
          <a href={`/admin/orders/${order?.id}/customer-files`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "13px", color: "#dc2626", textDecoration: "none", fontWeight: 500 }}>
            Manage Files ↗
          </a>
        )}
      </div>

      {/* Upload panel */}
      {!isManufacturer && (
        <div style={{ background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Upload File</h4>

          {uploadError   && <div style={{ padding: "10px 12px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "6px", color: "#fca5a5", fontSize: "13px", marginBottom: "10px" }}>⚠ {uploadError}</div>}
          {uploadSuccess && <div style={{ padding: "10px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "6px", color: "#6ee7b7", fontSize: "13px", marginBottom: "10px" }}>✓ {uploadSuccess}</div>}

          {/* Category selector */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
                padding: "5px 12px", fontSize: "12px",
                background: category === cat.id ? "#dc2626" : "#252525",
                color: category === cat.id ? "#fff" : "#9ca3af",
                border: category === cat.id ? "none" : "1px solid #2d2d2d",
                borderRadius: "5px", cursor: "pointer",
              }}>
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={currentCat?.accept}
            multiple
            onChange={handleFileInput}
            disabled={isUploading}
            style={{ display: "none" }}
          />

          {/* Multi-file queue progress */}
          {isUploading && uploadQueue.length > 1 && (
            <div style={{ padding: "10px 12px", background: "#0f0f0f", border: "1px solid #2d2d2d", borderRadius: "6px", marginBottom: "10px" }}>
              <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#9ca3af" }}>
                Uploading {uploadingIdx + 1} of {uploadQueue.length} files…
              </p>
              {uploadQueue.map((item, i) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", marginBottom: "3px" }}>
                  <span style={{ color: i < uploadingIdx ? "#10b981" : i === uploadingIdx ? "#e4e4e4" : "#4b5563", minWidth: 12 }}>
                    {i < uploadingIdx ? "✓" : i === uploadingIdx ? "▶" : "○"}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: i < uploadingIdx ? "#6b7280" : "#e4e4e4" }}>
                    {item.file.name}
                  </span>
                  <span style={{ color: "#4b5563", flexShrink: 0 }}>{fmt(item.file.size)}</span>
                  {i === uploadingIdx && (
                    <div style={{ width: 60, background: "#1f1f1f", borderRadius: 99, height: 3, overflow: "hidden", flexShrink: 0 }}>
                      <div style={{ height: "100%", width: `${progress}%`, background: "#dc2626", borderRadius: 99, transition: "width 0.2s" }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          {isUploading && uploadQueue.length === 1 ? (
            <div style={{ padding: "16px", background: "#0f0f0f", borderRadius: "6px", border: "1px solid #2d2d2d" }}>
              <div style={{ width: "100%", background: "#1f1f1f", borderRadius: "99px", height: "6px", overflow: "hidden", marginBottom: "8px" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "#dc2626", borderRadius: "99px", transition: "width 0.2s" }} />
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af", textAlign: "center" }}>{status} — {progress}%</p>
            </div>
          ) : (
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                padding: "20px",
                border: `2px dashed ${isUploading ? "#2d2d2d" : dragOver ? "#dc2626" : "#374151"}`,
                borderRadius: "6px",
                cursor: isUploading ? "not-allowed" : "pointer",
                background: dragOver ? "rgba(220,38,38,0.05)" : "#0f0f0f",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {dragOver ? (
                <>
                  <span style={{ fontSize: "24px" }}>📂</span>
                  <span style={{ fontSize: "13px", color: "#dc2626", fontWeight: 500 }}>Drop files here</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: "22px" }}>⬆</span>
                  <span style={{ fontSize: "13px", color: "#e4e4e4" }}>Drag & drop or click to upload {currentCat?.label.toLowerCase()}</span>
                  <span style={{ fontSize: "11px", color: "#4b5563" }}>Multiple files supported · {currentCat?.accept}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

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
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", borderRadius: "6px", overflow: "hidden", border: "1px solid #2d2d2d", aspectRatio: "1", backgroundColor: "#1a1a1a" }}>
                        <img src={f.url} alt={f.displayName || f.fileName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </a>
                    ))}
                  </div>
                )}

                {(cat.id === "videos" || cat.id === "manuals" || cat.id === "documents") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {catFiles.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", backgroundColor: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "6px", textDecoration: "none", color: "#e4e4e4", fontSize: "13px" }}>
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
