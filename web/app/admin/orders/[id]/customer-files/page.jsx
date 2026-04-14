"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const ALL_CATEGORIES = [
  { id: "photos",    label: "Photos",    accept: "image/*",                    icon: "🖼" },
  { id: "videos",    label: "Videos",    accept: "video/*",                    icon: "🎬" },
  { id: "manuals",   label: "Manuals",   accept: ".pdf,.doc,.docx",            icon: "📕" },
  { id: "documents", label: "Documents", accept: ".pdf,.doc,.docx,.xls,.xlsx", icon: "📄" },
  { id: "readme",    label: "Read Me",   accept: "*/*",                        icon: "📖" },
];

// Manufacturers can only see/upload photos and videos
const MANUFACTURER_CATEGORIES = ALL_CATEGORIES.filter(c => c.id === "photos" || c.id === "videos");

const CHUNK_SIZE = 10 * 1024 * 1024;

const S = {
  page:    { maxWidth: 1100, margin: "0 auto", padding: "24px 24px 60px" },
  card:    { backgroundColor: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: 8, padding: "20px 24px" },
  input:   { width: "100%", background: "#0f0f0f", border: "1px solid #2d2d2d", borderRadius: 6, padding: "8px 10px", color: "#e4e4e4", fontSize: 13, outline: "none", boxSizing: "border-box" },
  select:  { width: "100%", background: "#0f0f0f", border: "1px solid #2d2d2d", borderRadius: 6, padding: "8px 10px", color: "#e4e4e4", fontSize: 13, outline: "none", boxSizing: "border-box" },
  btn:     { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnGray: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#252525", color: "#e4e4e4", border: "1px solid #2d2d2d", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  iconBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, background: "transparent", border: "1px solid #2d2d2d", borderRadius: 5, cursor: "pointer", color: "#9ca3af", fontSize: 14 },
  row:     { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", backgroundColor: "#141414", border: "1px solid #2d2d2d", borderRadius: 8, marginBottom: 8 },
};

export default function CustomerFilesPage() {
  const { id: orderId } = useParams();
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [files, setFiles]                   = useState({ photos: [], videos: [], manuals: [], documents: [], readme: [] });
  const [loading, setLoading]               = useState(true);
  const [uploadQueue, setUploadQueue]       = useState([]);
  const [uploadingIdx, setUploadingIdx]     = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus]     = useState("");
  const [selectedCategory, setSelectedCategory] = useState("photos");
  const [editingId, setEditingId]           = useState(null);
  const [editForm, setEditForm]             = useState({ displayName: "", description: "", category: "photos" });
  const [notifying, setNotifying]           = useState(false);
  const [error, setError]                   = useState("");
  const [success, setSuccess]               = useState("");
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [dragOver, setDragOver]             = useState(false);
  const [draggingFileId, setDraggingFileId] = useState(null);
  const [dragOverFileId, setDragOverFileId] = useState(null);
  const fileInputRef = useRef(null);
  const isUploading  = uploadingIdx !== null;

  const isManufacturer = user?.role === "MANUFACTURER";
  const CATEGORIES = isManufacturer ? MANUFACTURER_CATEGORIES : ALL_CATEGORIES;

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/customer-documents/${orderId}`, { headers: getAuthHeaders() });
      if (res.ok) setFiles(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [orderId, getAuthHeaders]);

  useEffect(() => { if (user) fetchFiles(); }, [user, fetchFiles]);

  const uploadOne = useCallback(async (file) => {
    let documentId = null, uploadId = null, s3Key = null;
    try {
      const initRes = await fetch(`/api/customer-documents/${orderId}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream", category: selectedCategory }),
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
        const signRes = await fetch(`/api/customer-documents/${orderId}/sign-part`, {
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
      const completeRes = await fetch(`/api/customer-documents/${orderId}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");
      setUploadProgress(100);
      return true;
    } catch (e) {
      if (documentId && uploadId && s3Key)
        fetch(`/api/customer-documents/${orderId}/abort`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ documentId, uploadId, s3Key }) }).catch(() => {});
      throw e;
    }
  }, [orderId, selectedCategory, getAuthHeaders]);

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
    else {
      setSuccess(
        isManufacturer
          ? `${queue.length} file${queue.length > 1 ? "s" : ""} uploaded. The assigned agent has been notified.`
          : `${queue.length} file${queue.length > 1 ? "s" : ""} uploaded successfully.`
      );
      setTimeout(() => setSuccess(""), 5000);
    }
  }, [uploadOne, fetchFiles, isManufacturer]);

  const enqueueFiles = useCallback((fileList) => {
    const newItems = Array.from(fileList).map(f => ({ file: f, id: Math.random().toString(36).slice(2) }));
    if (!newItems.length) return;
    setUploadQueue(newItems);
    processQueue(newItems);
  }, [processQueue]);

  const handleFileInput = (e) => enqueueFiles(e.target.files);

  const handleZoneDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const handleZoneDragLeave = ()  => setDragOver(false);
  const handleZoneDrop      = (e) => {
    e.preventDefault(); setDragOver(false);
    if (!isUploading) enqueueFiles(e.dataTransfer.files);
  };

  const handleFileDragStart = (e, fileId) => { setDraggingFileId(fileId); e.dataTransfer.effectAllowed = "move"; };
  const handleFileDragOver  = (e, fileId) => { e.preventDefault(); if (fileId !== draggingFileId) setDragOverFileId(fileId); };
  const handleFileDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverFileId(null); setDraggingFileId(null);
    if (!draggingFileId || draggingFileId === targetId) return;
    const currentFiles = files[selectedCategory] || [];
    const fromIdx = currentFiles.findIndex(f => f.id === draggingFileId);
    const toIdx   = currentFiles.findIndex(f => f.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...currentFiles];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setFiles(prev => ({ ...prev, [selectedCategory]: reordered }));
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/reorder`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: reordered.map(f => f.id) }),
      });
      if (!res.ok) { await fetchFiles(); throw new Error("Reorder failed"); }
    } catch (e) { setError(e.message); }
  };
  const handleFileDragEnd = () => { setDraggingFileId(null); setDragOverFileId(null); };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/${deleteConfirm.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteConfirm(null); await fetchFiles();
    } catch (e) { setError(e.message); }
  };

  const saveEdit = async (fileId) => {
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/${fileId}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null); await fetchFiles();
    } catch (e) { setError(e.message); }
  };

  const handleNotify = async () => {
    setNotifying(true); setError("");
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/notify`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSuccess("Customer notified by email."); setTimeout(() => setSuccess(""), 4000);
    } catch (e) { setError(e.message); }
    finally { setNotifying(false); }
  };

  const fmt = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  const orderFileCount = Object.entries(files)
    .filter(([k]) => ['photos','videos','manuals','documents'].includes(k))
    .reduce((n, [, arr]) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    + (Array.isArray(files.readme) ? files.readme.filter(f => !f.isGlobal).length : 0);
  const totalCount = files.totalCount != null ? files.totalCount : orderFileCount;

  const currentCat   = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];
  const currentFiles = Array.isArray(files[selectedCategory]) ? files[selectedCategory] : [];
  const isReadmeTab  = selectedCategory === 'readme';
  const globalReadmeFiles = isReadmeTab ? currentFiles.filter(f => f.isGlobal)  : [];
  const orderReadmeFiles  = isReadmeTab ? currentFiles.filter(f => !f.isGlobal) : [];

  if (!user) return null;
  if (loading) return (
    <><TopNav />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300 }}>
        <div style={{ color:"#6b7280", fontSize:14 }}>Loading…</div>
      </div>
    </>
  );

  const renderFileRow = (file, { allowDrag = true } = {}) => {
    const isGlobalReadme = isReadmeTab && file.isGlobal;
    const canDrag = allowDrag && !isGlobalReadme && !isReadmeTab && !isManufacturer;
    // Manufacturers can only act on their own files
    const canAct  = !isManufacturer || file.uploadedBy?.id === user.id;

    return (
      <div
        key={file.id}
        draggable={canDrag}
        onDragStart={canDrag ? e => handleFileDragStart(e, file.id) : undefined}
        onDragOver={canDrag  ? e => handleFileDragOver(e, file.id)  : undefined}
        onDrop={canDrag      ? e => handleFileDrop(e, file.id)      : undefined}
        onDragEnd={canDrag   ? handleFileDragEnd                    : undefined}
        style={{
          ...S.row,
          opacity:    draggingFileId === file.id ? 0.4 : 1,
          border:     dragOverFileId === file.id ? "1px solid #dc2626" : S.row.border,
          background: isGlobalReadme ? "#111" : S.row.backgroundColor,
          transition: "opacity 0.15s, border-color 0.1s",
        }}
      >
        {canDrag && (
          <div style={{ color:"#374151", fontSize:18, cursor:"grab", flexShrink:0, userSelect:"none", lineHeight:1 }} title="Drag to reorder">⠿</div>
        )}
        {isGlobalReadme && (
          <span style={{ flexShrink:0, fontSize:10, background:"rgba(37,99,235,0.15)", color:"#60a5fa", border:"1px solid rgba(37,99,235,0.3)", borderRadius:4, padding:"2px 7px", fontWeight:700, whiteSpace:"nowrap" }}>GLOBAL</span>
        )}
        <div style={{ width:44, height:44, flexShrink:0, borderRadius:6, overflow:"hidden", background:"#1f1f1f", border:"1px solid #2d2d2d", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {file.mimeType?.startsWith("image/") ? (
            <img src={file.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          ) : (
            <span style={{ fontSize:20 }}>{currentCat.icon}</span>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {editingId === file.id ? (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <input type="text" value={editForm.displayName} onChange={e => setEditForm({ ...editForm, displayName: e.target.value })} placeholder="Display name" style={S.input} />
              <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description (optional)" style={S.input} />
              {!isManufacturer && (
                <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} style={S.select}>
                  {ALL_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              )}
            </div>
          ) : (
            <>
              <p style={{ margin:0, fontSize:14, fontWeight:500, color:"#e4e4e4", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {file.displayName || file.fileName}
              </p>
              {file.description && <p style={{ margin:"2px 0 0", fontSize:12, color:"#6b7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.description}</p>}
              <p style={{ margin:"2px 0 0", fontSize:11, color:"#374151" }}>
                {fmt(file.fileSize)}{file.uploadedBy?.name ? ` · ${file.uploadedBy.name}` : ""}
                {isGlobalReadme && <span style={{ color:"#4b5563", marginLeft:6 }}>· All orders</span>}
              </p>
            </>
          )}
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {isGlobalReadme ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer" title="View / Download" style={{ ...S.iconBtn, textDecoration:"none" }}>↗</a>
          ) : editingId === file.id ? (
            <>
              <button onClick={() => saveEdit(file.id)} title="Save" style={{ ...S.iconBtn, color:"#10b981", borderColor:"rgba(16,185,129,0.3)" }}>✓</button>
              <button onClick={() => setEditingId(null)} title="Cancel" style={S.iconBtn}>✕</button>
            </>
          ) : (
            <>
              <a href={file.url} target="_blank" rel="noopener noreferrer" title="View / Download" style={{ ...S.iconBtn, textDecoration:"none" }}>↗</a>
              {canAct && (
                <>
                  <button onClick={() => { setEditingId(file.id); setEditForm({ displayName: file.displayName || file.fileName, description: file.description || "", category: file.category || selectedCategory }); }} title="Edit" style={S.iconBtn}>✎</button>
                  <button onClick={() => setDeleteConfirm({ id: file.id, name: file.displayName || file.fileName })} title="Delete" style={{ ...S.iconBtn, color:"#dc2626", borderColor:"rgba(220,38,38,0.25)" }}>🗑</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <TopNav />
      <div style={S.page}>

        {/* Page header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => router.push(`/admin/orders/${orderId}`)} style={{ ...S.btnGray, padding:"7px 12px" }}>← Back</button>
            <div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#fff" }}>Customer Files</h1>
              <p style={{ margin:"3px 0 0", fontSize:13, color:"#6b7280" }}>
                {isManufacturer
                  ? "Upload photos and videos for this order. You can only see files you have uploaded."
                  : totalCount === 0 ? "No files uploaded yet" : `${totalCount} file${totalCount !== 1 ? "s" : ""} total`
                }
              </p>
            </div>
          </div>
          {!isManufacturer && (
            <div style={{ display:"flex", gap:8 }}>
              {isReadmeTab && (
                <a href="/admin/readme-files" style={{ ...S.btnGray, textDecoration:"none" }} title="Manage global Read Me files">⚙ Global Files</a>
              )}
              <button
                onClick={handleNotify}
                disabled={notifying || orderFileCount === 0}
                style={{ ...S.btnGray, opacity: (notifying || orderFileCount === 0) ? 0.4 : 1, cursor: (notifying || orderFileCount === 0) ? "not-allowed" : "pointer" }}
              >
                🔔 {notifying ? "Sending…" : "Notify Customer"}
              </button>
            </div>
          )}
        </div>

        {/* Manufacturer info banner */}
        {isManufacturer && (
          <div style={{ marginBottom:20, padding:"12px 16px", background:"rgba(37,99,235,0.08)", border:"1px solid rgba(37,99,235,0.2)", borderRadius:7, fontSize:13, color:"#93c5fd", display:"flex", alignItems:"center", gap:10 }}>
            ℹ️ Upload photos and videos to share with the customer. The assigned agent and administrators will be notified automatically when you upload. You can only see files you have uploaded.
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, padding:"10px 14px", background:"rgba(220,38,38,0.1)", border:"1px solid rgba(220,38,38,0.3)", borderRadius:7, color:"#fca5a5", fontSize:13 }}>
            ⚠ {error}
            <button onClick={() => setError("")} style={{ marginLeft:"auto", background:"none", border:"none", color:"#fca5a5", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, padding:"10px 14px", background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.25)", borderRadius:7, color:"#6ee7b7", fontSize:13 }}>
            ✓ {success}
          </div>
        )}

        {/* Multi-file upload progress */}
        {isUploading && uploadQueue.length > 1 && (
          <div style={{ marginBottom:16, padding:"12px 16px", background:"#141414", border:"1px solid #2d2d2d", borderRadius:8 }}>
            <p style={{ margin:"0 0 8px", fontSize:13, color:"#9ca3af" }}>Uploading {uploadingIdx + 1} of {uploadQueue.length} files…</p>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {uploadQueue.map((item, i) => (
                <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
                  <span style={{ color: i < uploadingIdx ? "#10b981" : i === uploadingIdx ? "#e4e4e4" : "#4b5563", minWidth:14 }}>
                    {i < uploadingIdx ? "✓" : i === uploadingIdx ? "▶" : "○"}
                  </span>
                  <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: i < uploadingIdx ? "#6b7280" : "#e4e4e4" }}>{item.file.name}</span>
                  <span style={{ color:"#4b5563" }}>{fmt(item.file.size)}</span>
                  {i === uploadingIdx && (
                    <div style={{ width:80, background:"#1f1f1f", borderRadius:99, height:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${uploadProgress}%`, background:"#dc2626", borderRadius:99, transition:"width 0.2s" }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={S.card}>

          {/* Category tabs */}
          <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid #2d2d2d" }}>
            {CATEGORIES.map(cat => {
              const count  = Array.isArray(files[cat.id]) ? files[cat.id].length : 0;
              const active = selectedCategory === cat.id;
              return (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"8px 16px", background:"none", border:"none",
                  borderBottom:`2px solid ${active ? "#dc2626" : "transparent"}`,
                  color: active ? "#dc2626" : "#6b7280",
                  fontSize:13, fontWeight: active ? 600 : 400,
                  cursor:"pointer", marginBottom:-1, transition:"color 0.12s",
                }}>
                  <span>{cat.icon}</span>
                  {cat.label}
                  {count > 0 && (
                    <span style={{ fontSize:11, background: active ? "rgba(220,38,38,0.15)" : "#252525", color: active ? "#dc2626" : "#9ca3af", borderRadius:99, padding:"1px 7px" }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Upload zone */}
          <div style={{ marginBottom:20 }}>
            <input ref={fileInputRef} type="file" accept={currentCat.accept} multiple onChange={handleFileInput} disabled={isUploading} style={{ display:"none" }} />
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDragOver={handleZoneDragOver} onDragLeave={handleZoneDragLeave} onDrop={handleZoneDrop}
              style={{
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8,
                padding:"28px 20px",
                border:`2px dashed ${isUploading ? "#2d2d2d" : dragOver ? "#dc2626" : "#374151"}`,
                borderRadius:8,
                background: dragOver ? "rgba(220,38,38,0.05)" : isUploading ? "#111" : "#0f0f0f",
                cursor: isUploading ? "not-allowed" : "pointer",
                transition:"border-color 0.15s, background 0.15s",
              }}
            >
              {isUploading && uploadQueue.length === 1 ? (
                <>
                  <div style={{ width:"100%", maxWidth:300, background:"#1f1f1f", borderRadius:99, height:6, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${uploadProgress}%`, background:"#dc2626", borderRadius:99, transition:"width 0.2s" }} />
                  </div>
                  <p style={{ margin:0, fontSize:13, color:"#9ca3af" }}>{uploadStatus} — {uploadProgress}%</p>
                </>
              ) : dragOver ? (
                <>
                  <span style={{ fontSize:32 }}>📂</span>
                  <p style={{ margin:0, fontSize:14, fontWeight:500, color:"#dc2626" }}>Drop files here</p>
                </>
              ) : (
                <>
                  <span style={{ fontSize:28 }}>⬆</span>
                  <p style={{ margin:0, fontSize:14, fontWeight:500, color:"#e4e4e4" }}>
                    {isReadmeTab
                      ? "Drag & drop or click to upload order-specific Read Me files"
                      : `Drag & drop or click to upload ${currentCat.label.toLowerCase()}`
                    }
                  </p>
                  <p style={{ margin:0, fontSize:12, color:"#4b5563" }}>
                    {isReadmeTab ? "Any file type · Global files appear automatically for all orders" : `Multiple files supported · ${currentCat.accept}`}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* File list */}
          {isReadmeTab ? (
            <div>
              {globalReadmeFiles.length > 0 && (
                <div style={{ marginBottom: orderReadmeFiles.length > 0 ? 20 : 0 }}>
                  <p style={{ margin:"0 0 10px", fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                    🌐 Global — appears in all orders
                    <a href="/admin/readme-files" style={{ marginLeft:10, color:"#dc2626", textDecoration:"none", fontWeight:600 }}>Manage ↗</a>
                  </p>
                  {globalReadmeFiles.map(file => renderFileRow(file))}
                </div>
              )}
              {orderReadmeFiles.length > 0 && (
                <div>
                  <p style={{ margin:"0 0 10px", fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.05em" }}>This Order Only</p>
                  {orderReadmeFiles.map(file => renderFileRow(file))}
                </div>
              )}
              {currentFiles.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>📖</div>
                  <p style={{ margin:0, fontSize:14 }}>No Read Me files yet</p>
                  <p style={{ margin:"8px 0 0", fontSize:12, color:"#4b5563" }}>
                    Upload order-specific files above, or <a href="/admin/readme-files" style={{ color:"#dc2626" }}>manage global files</a>
                  </p>
                </div>
              )}
            </div>
          ) : (
            currentFiles.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}>
                <div style={{ fontSize:40, marginBottom:10 }}>{currentCat.icon}</div>
                <p style={{ margin:0, fontSize:14 }}>No {currentCat.label.toLowerCase()} uploaded yet</p>
                {isManufacturer && <p style={{ margin:"6px 0 0", fontSize:12, color:"#4b5563" }}>Use the upload zone above to add files. Only your uploads are shown here.</p>}
              </div>
            ) : (
              <div>
                {!isManufacturer && <p style={{ margin:"0 0 10px", fontSize:11, color:"#4b5563" }}>Drag ⠿ to reorder</p>}
                {currentFiles.map(file => renderFileRow(file))}
              </div>
            )
          )}

          {/* Legacy Dropbox link */}
          {!isManufacturer && files.legacyDropboxLink && (
            <div style={{ marginTop:20, padding:"12px 16px", background:"#0f0f0f", border:"1px solid #2d2d2d", borderRadius:7 }}>
              <p style={{ margin:"0 0 6px", fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.05em" }}>Legacy Dropbox Link</p>
              <a href={files.legacyDropboxLink} target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:"#dc2626", wordBreak:"break-all" }}>
                {files.legacyDropboxLink} ↗
              </a>
            </div>
          )}
        </div>

        {/* Delete confirm modal */}
        {deleteConfirm && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}
            onClick={() => setDeleteConfirm(null)}>
            <div style={{ background:"#1a1a1a", border:"1px solid #2d2d2d", borderRadius:10, padding:"28px 32px", maxWidth:460, width:"90%" }}
              onClick={e => e.stopPropagation()}>
              <h3 style={{ margin:"0 0 12px", fontSize:18, fontWeight:600, color:"#fff" }}>Delete file?</h3>
              <p style={{ margin:"0 0 20px", fontSize:14, color:"#9ca3af" }}>
                <strong style={{ color:"#e4e4e4" }}>"{deleteConfirm.name}"</strong> will be permanently deleted and cannot be recovered.
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
