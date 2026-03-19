"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const CATEGORIES = [
  { id: "photos",    label: "Photos",    accept: "image/*",                    icon: "🖼" },
  { id: "videos",    label: "Videos",    accept: "video/*",                    icon: "🎬" },
  { id: "manuals",   label: "Manuals",   accept: ".pdf,.doc,.docx",            icon: "📕" },
  { id: "documents", label: "Documents", accept: ".pdf,.doc,.docx,.xls,.xlsx", icon: "📄" },
];

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB — must match backend

// ─── Shared style tokens (match system) ───────────────────────
const S = {
  page:    { maxWidth: 1100, margin: "0 auto", padding: "24px 24px 60px" },
  card:    { backgroundColor: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: 8, padding: "20px 24px" },
  label:   { fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" },
  input:   { width: "100%", background: "#0f0f0f", border: "1px solid #2d2d2d", borderRadius: 6, padding: "8px 10px", color: "#e4e4e4", fontSize: 13, outline: "none", boxSizing: "border-box" },
  btn:     { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnGray: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#252525", color: "#e4e4e4", border: "1px solid #2d2d2d", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  iconBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, background: "transparent", border: "1px solid #2d2d2d", borderRadius: 5, cursor: "pointer", color: "#9ca3af", fontSize: 14 },
  row:     { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", backgroundColor: "#141414", border: "1px solid #2d2d2d", borderRadius: 8, marginBottom: 8 },
};

export default function CustomerFilesPage() {
  const { id: orderId } = useParams();
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [files, setFiles]               = useState({ photos: [], videos: [], manuals: [], documents: [] });
  const [loading, setLoading]           = useState(true);
  const [uploading, setUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("photos");
  const [editingId, setEditingId]       = useState(null);
  const [editForm, setEditForm]         = useState({ displayName: "", description: "" });
  const [notifying, setNotifying]       = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
  const fileInputRef = useRef(null);

  // ─── Fetch ────────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/customer-documents/${orderId}`, { headers: getAuthHeaders() });
      if (res.ok) setFiles(await res.json());
    } catch (e) {
      console.error("Error fetching files:", e);
    } finally {
      setLoading(false);
    }
  }, [orderId, getAuthHeaders]);

  useEffect(() => { if (user) fetchFiles(); }, [user, fetchFiles]);

  // ─── Upload ───────────────────────────────────────────────────
  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus("Preparing upload…");
    setError("");

    let documentId = null, uploadId = null, s3Key = null;

    try {
      const initRes = await fetch(`/api/customer-documents/${orderId}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream", category: selectedCategory }),
      });
      if (!initRes.ok) { const e = await initRes.json(); throw new Error(e.error || "Failed to initiate upload"); }

      const init = await initRes.json();
      documentId = init.documentId; uploadId = init.uploadId; s3Key = init.s3Key;
      const totalParts = init.totalParts;

      const parts = [];
      for (let part = 1; part <= totalParts; part++) {
        setUploadStatus(`Uploading part ${part} of ${totalParts}…`);
        setUploadProgress(Math.round(((part - 1) / totalParts) * 90));

        const chunk = file.slice((part - 1) * CHUNK_SIZE, part * CHUNK_SIZE);
        const signRes = await fetch(`/api/customer-documents/${orderId}/sign-part`, {
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

      setUploadStatus("Finalizing…"); setUploadProgress(95);
      const completeRes = await fetch(`/api/customer-documents/${orderId}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");

      setUploadProgress(100);
      setSuccess("File uploaded successfully.");
      setTimeout(() => setSuccess(""), 4000);
      await fetchFiles();
    } catch (e) {
      setError(e.message || "Upload failed");
      if (documentId && uploadId && s3Key) {
        fetch(`/api/customer-documents/${orderId}/abort`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ documentId, uploadId, s3Key }) }).catch(() => {});
      }
    } finally {
      setUploading(false); setUploadProgress(0); setUploadStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Delete ────────────────────────────────────────────────────
  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/${deleteConfirm.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteConfirm(null);
      await fetchFiles();
    } catch (e) { setError(e.message); }
  };

  // ─── Edit ──────────────────────────────────────────────────────
  const saveEdit = async (fileId) => {
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/${fileId}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null);
      await fetchFiles();
    } catch (e) { setError(e.message); }
  };

  // ─── Notify ────────────────────────────────────────────────────
  const handleNotify = async () => {
    setNotifying(true); setError("");
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/notify`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSuccess("Customer notified by email.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) { setError(e.message); }
    finally { setNotifying(false); }
  };

  // ─── Helpers ───────────────────────────────────────────────────
  const fmt = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  const totalCount = Object.values(files).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);

  if (!user) return null;

  const currentCat  = CATEGORIES.find((c) => c.id === selectedCategory);
  const currentFiles = files[selectedCategory] || [];

  // ─── Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <TopNav />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
          <div style={{ color: "#6b7280", fontSize: 14 }}>Loading…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <div style={S.page}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => router.push(`/admin/orders/${orderId}`)}
              style={{ ...S.btnGray, padding: "7px 12px" }}
              title="Back to order"
            >
              ← Back
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff" }}>Customer Files</h1>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6b7280" }}>
                {totalCount === 0 ? "No files uploaded yet" : `${totalCount} file${totalCount !== 1 ? "s" : ""} uploaded`}
              </p>
            </div>
          </div>

          <button
            onClick={handleNotify}
            disabled={notifying || totalCount === 0}
            style={{ ...S.btnGray, opacity: (notifying || totalCount === 0) ? 0.4 : 1, cursor: (notifying || totalCount === 0) ? "not-allowed" : "pointer" }}
          >
            🔔 {notifying ? "Sending…" : "Notify Customer"}
          </button>
        </div>

        {/* ── Alerts ── */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 14px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 7, color: "#fca5a5", fontSize: 13 }}>
            ⚠ {error}
            <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 7, color: "#6ee7b7", fontSize: 13 }}>
            ✓ {success}
          </div>
        )}

        {/* ── Main card ── */}
        <div style={S.card}>

          {/* Category tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #2d2d2d", paddingBottom: 0 }}>
            {CATEGORIES.map((cat) => {
              const count = files[cat.id]?.length || 0;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px",
                    background: "none", border: "none",
                    borderBottom: `2px solid ${active ? "#dc2626" : "transparent"}`,
                    color: active ? "#dc2626" : "#6b7280",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: "pointer", marginBottom: -1,
                    transition: "color 0.12s",
                  }}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                  {count > 0 && (
                    <span style={{ fontSize: 11, background: active ? "rgba(220,38,38,0.15)" : "#252525", color: active ? "#dc2626" : "#9ca3af", borderRadius: 99, padding: "1px 7px" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Upload zone */}
          <div style={{ marginBottom: 20 }}>
            <input ref={fileInputRef} type="file" accept={currentCat.accept} onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "28px 20px",
                border: `2px dashed ${uploading ? "#2d2d2d" : "#374151"}`,
                borderRadius: 8,
                background: uploading ? "#111" : "#0f0f0f",
                cursor: uploading ? "not-allowed" : "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.borderColor = "#dc2626"; }}
              onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.borderColor = "#374151"; }}
            >
              {uploading ? (
                <>
                  <div style={{ width: "100%", maxWidth: 300, background: "#1f1f1f", borderRadius: 99, height: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${uploadProgress}%`, background: "#dc2626", borderRadius: 99, transition: "width 0.2s" }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>{uploadStatus} — {uploadProgress}%</p>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 28 }}>⬆</span>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#e4e4e4" }}>
                    Click to upload {currentCat.label.toLowerCase()}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#4b5563" }}>{currentCat.accept}</p>
                </>
              )}
            </div>
          </div>

          {/* File list */}
          {currentFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#374151" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>{currentCat.icon}</div>
              <p style={{ margin: 0, fontSize: 14 }}>No {currentCat.label.toLowerCase()} uploaded yet</p>
            </div>
          ) : (
            <div>
              {currentFiles.map((file) => (
                <div key={file.id} style={S.row}>

                  {/* Thumbnail / icon */}
                  <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#1f1f1f", border: "1px solid #2d2d2d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {file.mimeType?.startsWith("image/") ? (
                      <img src={file.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 22 }}>{currentCat.icon}</span>
                    )}
                  </div>

                  {/* Info / edit form */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === file.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          type="text" value={editForm.displayName}
                          onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                          placeholder="Display name"
                          style={S.input}
                        />
                        <input
                          type="text" value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Description (optional)"
                          style={S.input}
                        />
                      </div>
                    ) : (
                      <>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#e4e4e4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.displayName || file.fileName}
                        </p>
                        {file.description && (
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.description}</p>
                        )}
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#374151" }}>
                          {fmt(file.fileSize)}{file.uploadedBy?.name ? ` · ${file.uploadedBy.name}` : ""}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {editingId === file.id ? (
                      <>
                        <button onClick={() => saveEdit(file.id)} title="Save" style={{ ...S.iconBtn, color: "#10b981", borderColor: "rgba(16,185,129,0.3)" }}>✓</button>
                        <button onClick={() => setEditingId(null)} title="Cancel" style={S.iconBtn}>✕</button>
                      </>
                    ) : (
                      <>
                        <a href={file.url} target="_blank" rel="noopener noreferrer" title="View / Download"
                          style={{ ...S.iconBtn, textDecoration: "none" }}>↗</a>
                        <button onClick={() => { setEditingId(file.id); setEditForm({ displayName: file.displayName || file.fileName, description: file.description || "" }); }}
                          title="Rename" style={S.iconBtn}>✎</button>
                        <button onClick={() => setDeleteConfirm({ id: file.id, name: file.displayName || file.fileName })}
                          title="Delete" style={{ ...S.iconBtn, color: "#dc2626", borderColor: "rgba(220,38,38,0.25)" }}>🗑</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legacy Dropbox link */}
          {files.legacyDropboxLink && (
            <div style={{ marginTop: 20, padding: "12px 16px", background: "#0f0f0f", border: "1px solid #2d2d2d", borderRadius: 7 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>Legacy Dropbox Link</p>
              <a href={files.legacyDropboxLink} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: "#dc2626", wordBreak: "break-all" }}>
                {files.legacyDropboxLink} ↗
              </a>
            </div>
          )}
        </div>

        {/* ── Delete confirmation modal ── */}
        {deleteConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => setDeleteConfirm(null)}>
            <div style={{ background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: 10, padding: "28px 32px", maxWidth: 460, width: "90%" }}
              onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600, color: "#fff" }}>Delete file?</h3>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "#9ca3af" }}>
                <strong style={{ color: "#e4e4e4" }}>"{deleteConfirm.name}"</strong> will be permanently deleted and cannot be recovered.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setDeleteConfirm(null)} style={S.btnGray}>Cancel</button>
                <button onClick={executeDelete} style={{ ...S.btn, background: "#dc2626" }}>Delete permanently</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
