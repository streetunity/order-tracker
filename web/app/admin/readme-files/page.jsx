"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const CHUNK_SIZE = 10 * 1024 * 1024;

const S = {
  page:    { maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px" },
  card:    { backgroundColor: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: 8, padding: "20px 24px" },
  input:   { width: "100%", background: "#0f0f0f", border: "1px solid #2d2d2d", borderRadius: 6, padding: "8px 10px", color: "#e4e4e4", fontSize: 13, outline: "none", boxSizing: "border-box" },
  btn:     { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnGray: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#252525", color: "#e4e4e4", border: "1px solid #2d2d2d", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  iconBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, background: "transparent", border: "1px solid #2d2d2d", borderRadius: 5, cursor: "pointer", color: "#9ca3af", fontSize: 14 },
  row:     { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", backgroundColor: "#141414", border: "1px solid #2d2d2d", borderRadius: 8, marginBottom: 8 },
};

export default function ReadMeFilesPage() {
  const { user, getAuthHeaders, isAdminOrHigher } = useAuth();
  const router = useRouter();

  const [files, setFiles]                   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [uploadQueue, setUploadQueue]       = useState([]);
  const [uploadingIdx, setUploadingIdx]     = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus]     = useState("");
  const [editingId, setEditingId]           = useState(null);
  const [editForm, setEditForm]             = useState({ displayName: "", description: "" });
  const [error, setError]                   = useState("");
  const [success, setSuccess]               = useState("");
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef(null);
  const isUploading  = uploadingIdx !== null;

  useEffect(() => {
    if (!user) return;
    if (!isAdminOrHigher) { router.push('/admin/board'); return; }
    fetchFiles();
  }, [user, isAdminOrHigher]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/global-documents', { headers: getAuthHeaders() });
      if (res.ok) setFiles(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fmt = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  // ── Upload ──────────────────────────────────────────────────
  const uploadOne = useCallback(async (file) => {
    let documentId = null, uploadId = null, s3Key = null;
    try {
      const initRes = await fetch('/api/global-documents/initiate', {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream" }),
      });
      if (!initRes.ok) { const e = await initRes.json(); throw new Error(e.error || "Failed to initiate"); }
      const init = await initRes.json();
      documentId = init.documentId; uploadId = init.uploadId; s3Key = init.s3Key;
      const totalParts = init.totalParts;

      const parts = [];
      for (let part = 1; part <= totalParts; part++) {
        setUploadStatus(`Uploading "${file.name}" — part ${part}/${totalParts}`);
        setUploadProgress(Math.round(((part - 1) / totalParts) * 90));
        const chunk = file.slice((part - 1) * CHUNK_SIZE, part * CHUNK_SIZE);
        const signRes = await fetch('/api/global-documents/sign-part', {
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

      setUploadStatus(`Finalising "${file.name}"…`); setUploadProgress(95);
      const completeRes = await fetch('/api/global-documents/complete', {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");
      setUploadProgress(100);
      return true;
    } catch (e) {
      if (documentId && uploadId && s3Key)
        fetch('/api/global-documents/abort', { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ documentId, uploadId, s3Key }) }).catch(() => {});
      throw e;
    }
  }, [getAuthHeaders]);

  const processQueue = useCallback(async (queue) => {
    setError("");
    const errors = [];
    for (let i = 0; i < queue.length; i++) {
      setUploadingIdx(i);
      setUploadProgress(0);
      try { await uploadOne(queue[i].file); }
      catch (e) { errors.push(`${queue[i].file.name}: ${e.message}`); }
    }
    setUploadingIdx(null); setUploadProgress(0); setUploadStatus(""); setUploadQueue([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await fetchFiles();
    if (errors.length) setError(errors.join(" | "));
    else { setSuccess(`${queue.length} file${queue.length > 1 ? "s" : ""} uploaded. Now appears in all customer orders.`); setTimeout(() => setSuccess(""), 5000); }
  }, [uploadOne]);

  const enqueueFiles = useCallback((fileList) => {
    const newItems = Array.from(fileList).map(f => ({ file: f, id: Math.random().toString(36).slice(2) }));
    if (!newItems.length) return;
    setUploadQueue(newItems);
    processQueue(newItems);
  }, [processQueue]);

  // ── Edit ────────────────────────────────────────────────────
  const saveEdit = async (fileId) => {
    try {
      const res = await fetch(`/api/global-documents/${fileId}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null);
      await fetchFiles();
    } catch (e) { setError(e.message); }
  };

  // ── Delete ──────────────────────────────────────────────────
  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/global-documents/${deleteConfirm.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteConfirm(null);
      await fetchFiles();
      setSuccess("File deleted. It will no longer appear in any customer orders.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) { setError(e.message); }
  };

  if (!user || !isAdminOrHigher) return null;

  return (
    <>
      <TopNav />
      <div style={S.page}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => router.back()} style={{ ...S.btnGray, padding:"7px 12px" }}>← Back</button>
            <div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#fff" }}>📖 Global Read Me Files</h1>
              <p style={{ margin:"3px 0 0", fontSize:13, color:"#6b7280" }}>
                Files uploaded here appear automatically in the Read Me tab of every customer order.
              </p>
            </div>
          </div>
          <div style={{ fontSize:12, color:"#4b5563", textAlign:"right", lineHeight:1.5 }}>
            {files.length} file{files.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, padding:"10px 14px", background:"rgba(220,38,38,0.1)", border:"1px solid rgba(220,38,38,0.3)", borderRadius:7, color:"#fca5a5", fontSize:13 }}>
            ⚠ {error}
            <button onClick={() => setError("")} style={{ marginLeft:"auto", background:"none", border:"none", color:"#fca5a5", cursor:"pointer", fontSize:16 }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, padding:"10px 14px", background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.25)", borderRadius:7, color:"#6ee7b7", fontSize:13 }}>
            ✓ {success}
          </div>
        )}

        {/* Info banner */}
        <div style={{ marginBottom:20, padding:"12px 16px", background:"rgba(37,99,235,0.08)", border:"1px solid rgba(37,99,235,0.2)", borderRadius:7, fontSize:13, color:"#93c5fd" }}>
          💡 Changes here take effect immediately across all customer orders. Deleting a file removes it from all orders instantly.
        </div>

        <div style={S.card}>

          {/* Upload zone */}
          <div style={{ marginBottom: files.length > 0 ? 24 : 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              multiple
              onChange={e => enqueueFiles(e.target.files)}
              disabled={isUploading}
              style={{ display:"none" }}
            />

            {/* Multi-file progress */}
            {isUploading && uploadQueue.length > 1 && (
              <div style={{ marginBottom:12, padding:"10px 14px", background:"#111", border:"1px solid #2d2d2d", borderRadius:7 }}>
                <p style={{ margin:"0 0 6px", fontSize:13, color:"#9ca3af" }}>Uploading {uploadingIdx + 1} of {uploadQueue.length}…</p>
                {uploadQueue.map((item, i) => (
                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, marginBottom:2 }}>
                    <span style={{ color: i < uploadingIdx ? "#10b981" : i === uploadingIdx ? "#e4e4e4" : "#4b5563", minWidth:14 }}>
                      {i < uploadingIdx ? "✓" : i === uploadingIdx ? "▶" : "○"}
                    </span>
                    <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: i < uploadingIdx ? "#6b7280" : "#e4e4e4" }}>{item.file.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (!isUploading) enqueueFiles(e.dataTransfer.files); }}
              style={{
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8,
                padding:"32px 20px",
                border:`2px dashed ${isUploading ? "#2d2d2d" : dragOver ? "#dc2626" : "#374151"}`,
                borderRadius:8,
                background: dragOver ? "rgba(220,38,38,0.05)" : "#0f0f0f",
                cursor: isUploading ? "not-allowed" : "pointer",
                transition:"border-color 0.15s",
              }}
            >
              {isUploading && uploadQueue.length === 1 ? (
                <>
                  <div style={{ width:"100%", maxWidth:300, background:"#1f1f1f", borderRadius:99, height:6, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${uploadProgress}%`, background:"#dc2626", borderRadius:99, transition:"width 0.2s" }} />
                  </div>
                  <p style={{ margin:0, fontSize:13, color:"#9ca3af" }}>{uploadStatus} — {uploadProgress}%</p>
                </>
              ) : (
                <>
                  <span style={{ fontSize:32 }}>⬆</span>
                  <p style={{ margin:0, fontSize:14, fontWeight:500, color:"#e4e4e4" }}>Drag & drop or click to upload global Read Me files</p>
                  <p style={{ margin:0, fontSize:12, color:"#4b5563" }}>Any file type · Multiple files supported</p>
                </>
              )}
            </div>
          </div>

          {/* File list */}
          {loading ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:"#6b7280", fontSize:14 }}>Loading…</div>
          ) : files.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}>
              <div style={{ fontSize:40, marginBottom:10 }}>📖</div>
              <p style={{ margin:0, fontSize:14 }}>No global Read Me files yet</p>
              <p style={{ margin:"6px 0 0", fontSize:12, color:"#4b5563" }}>Upload files above and they will appear in every customer order automatically.</p>
            </div>
          ) : (
            <div>
              <p style={{ margin:"0 0 12px", fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                {files.length} global file{files.length !== 1 ? "s" : ""} · visible in all customer orders
              </p>
              {files.map(file => (
                <div key={file.id} style={S.row}>

                  {/* Icon */}
                  <div style={{ width:44, height:44, flexShrink:0, borderRadius:6, overflow:"hidden", background:"#1f1f1f", border:"1px solid #2d2d2d", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {file.mimeType?.startsWith("image/") ? (
                      <img src={file.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    ) : (
                      <span style={{ fontSize:22 }}>📖</span>
                    )}
                  </div>

                  {/* Info / edit form */}
                  <div style={{ flex:1, minWidth:0 }}>
                    {editingId === file.id ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        <input
                          type="text" value={editForm.displayName}
                          onChange={e => setEditForm({ ...editForm, displayName: e.target.value })}
                          placeholder="Display name"
                          style={S.input}
                        />
                        <input
                          type="text" value={editForm.description}
                          onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Description (optional)"
                          style={S.input}
                        />
                      </div>
                    ) : (
                      <>
                        <p style={{ margin:0, fontSize:14, fontWeight:500, color:"#e4e4e4", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {file.displayName || file.fileName}
                        </p>
                        {file.description && (
                          <p style={{ margin:"2px 0 0", fontSize:12, color:"#6b7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.description}</p>
                        )}
                        <p style={{ margin:"2px 0 0", fontSize:11, color:"#374151" }}>
                          {fmt(file.fileSize)}{file.uploadedBy?.name ? ` · ${file.uploadedBy.name}` : ""}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    {editingId === file.id ? (
                      <>
                        <button onClick={() => saveEdit(file.id)} title="Save" style={{ ...S.iconBtn, color:"#10b981", borderColor:"rgba(16,185,129,0.3)" }}>✓</button>
                        <button onClick={() => setEditingId(null)} title="Cancel" style={S.iconBtn}>✕</button>
                      </>
                    ) : (
                      <>
                        <a href={file.url} target="_blank" rel="noopener noreferrer" title="View / Download"
                          style={{ ...S.iconBtn, textDecoration:"none" }}>↗</a>
                        <button
                          onClick={() => { setEditingId(file.id); setEditForm({ displayName: file.displayName || file.fileName, description: file.description || "" }); }}
                          title="Edit" style={S.iconBtn}>✎</button>
                        <button
                          onClick={() => setDeleteConfirm({ id: file.id, name: file.displayName || file.fileName })}
                          title="Delete from all orders" style={{ ...S.iconBtn, color:"#dc2626", borderColor:"rgba(220,38,38,0.25)" }}>🗑</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete confirm */}
        {deleteConfirm && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}
            onClick={() => setDeleteConfirm(null)}>
            <div style={{ background:"#1a1a1a", border:"1px solid #2d2d2d", borderRadius:10, padding:"28px 32px", maxWidth:480, width:"90%" }}
              onClick={e => e.stopPropagation()}>
              <h3 style={{ margin:"0 0 12px", fontSize:18, fontWeight:600, color:"#fff" }}>Delete global file?</h3>
              <p style={{ margin:"0 0 8px", fontSize:14, color:"#9ca3af" }}>
                <strong style={{ color:"#e4e4e4" }}>"{deleteConfirm.name}"</strong> will be permanently deleted.
              </p>
              <p style={{ margin:"0 0 20px", fontSize:13, color:"#f59e0b" }}>
                ⚠ This file will immediately disappear from all customer orders.
              </p>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={() => setDeleteConfirm(null)} style={S.btnGray}>Cancel</button>
                <button onClick={executeDelete} style={{ ...S.btn, background:"#dc2626" }}>Delete permanently</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
