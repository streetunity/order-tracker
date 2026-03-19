"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import {
  Upload,
  Trash2,
  Edit2,
  Download,
  Image,
  Video,
  FileText,
  BookOpen,
  X,
  Check,
  Bell,
  ArrowLeft,
  AlertCircle,
  GripVertical,
  Eye,
} from "lucide-react";

const CATEGORIES = [
  { id: "photos",    label: "Photos",    icon: Image,    accept: "image/*" },
  { id: "videos",    label: "Videos",    icon: Video,    accept: "video/*" },
  { id: "manuals",   label: "Manuals",   icon: BookOpen, accept: ".pdf,.doc,.docx" },
  { id: "documents", label: "Documents", icon: FileText, accept: ".pdf,.doc,.docx,.xls,.xlsx" },
];

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB — must match backend

export default function CustomerFilesPage() {
  const { id: orderId } = useParams(); // route is /admin/orders/[id]/customer-files
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [files, setFiles] = useState({ photos: [], videos: [], manuals: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("photos");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: "", description: "" });
  const [notifying, setNotifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef(null);

  // ─── Fetch files ────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/customer-documents/${orderId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error("Error fetching files:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId, getAuthHeaders]);

  useEffect(() => {
    if (user) fetchFiles();
  }, [user, fetchFiles]);

  // ─── Upload (multipart) ─────────────────────────────────────
  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus("Preparing upload...");
    setError("");

    let documentId = null;
    let uploadId = null;
    let s3Key = null;

    try {
      // Step 1 — initiate multipart upload
      const initRes = await fetch(`/api/customer-documents/${orderId}/initiate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          category: selectedCategory,
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(err.error || "Failed to initiate upload");
      }

      const initData = await initRes.json();
      documentId = initData.documentId;
      uploadId   = initData.uploadId;
      s3Key      = initData.s3Key;
      const totalParts = initData.totalParts;

      // Step 2 — upload each chunk
      const parts = [];
      for (let part = 1; part <= totalParts; part++) {
        setUploadStatus(`Uploading part ${part} of ${totalParts}...`);
        setUploadProgress(Math.round(((part - 1) / totalParts) * 90));

        const start = (part - 1) * CHUNK_SIZE;
        const chunk = file.slice(start, start + CHUNK_SIZE);

        const signRes = await fetch(`/api/customer-documents/${orderId}/sign-part`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, uploadId, partNumber: part, s3Key }),
        });
        if (!signRes.ok) throw new Error("Failed to get signed URL");
        const { presignedUrl } = await signRes.json();

        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: chunk,
        });
        if (!uploadRes.ok) throw new Error(`Part ${part} upload failed`);

        const etag = uploadRes.headers.get("ETag");
        parts.push({ PartNumber: part, ETag: etag });
      }

      // Step 3 — complete
      setUploadStatus("Finalizing...");
      setUploadProgress(95);

      const completeRes = await fetch(`/api/customer-documents/${orderId}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, uploadId, s3Key, parts }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");

      setUploadProgress(100);
      setUploadStatus("Done!");
      setSuccess("File uploaded successfully.");
      setTimeout(() => setSuccess(""), 4000);
      await fetchFiles();
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Upload failed");
      if (documentId && uploadId && s3Key) {
        fetch(`/api/customer-documents/${orderId}/abort`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, uploadId, s3Key }),
        }).catch(() => {});
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Delete ─────────────────────────────────────────────────
  const handleDelete = async (fileId, displayName) => {
    if (!confirm(`Delete "${displayName}"? This cannot be undone.`)) return;
    setError("");
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/${fileId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchFiles();
    } catch (err) {
      setError(err.message);
    }
  };

  // ─── Edit / rename ───────────────────────────────────────────
  const startEdit = (file) => {
    setEditingId(file.id);
    setEditForm({ displayName: file.displayName || file.fileName, description: file.description || "" });
  };

  const saveEdit = async (fileId) => {
    setError("");
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/${fileId}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null);
      await fetchFiles();
    } catch (err) {
      setError(err.message);
    }
  };

  // ─── Notify customer ─────────────────────────────────────────
  const handleNotify = async () => {
    if (!confirm("Send an email to the customer letting them know files are available?")) return;
    setNotifying(true);
    setError("");
    try {
      const res = await fetch(`/api/customer-documents/${orderId}/notify`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSuccess("Customer notified by email.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setNotifying(false);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────
  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  const totalCount = Object.values(files).reduce(
    (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
    0
  );

  if (!user) return null;

  if (loading) {
    return (
      <>
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
        </div>
      </>
    );
  }

  const currentCat = CATEGORIES.find((c) => c.id === selectedCategory);
  const currentFiles = files[selectedCategory] || [];

  return (
    <>
      <TopNav />
      <div className="p-6 bg-black min-h-screen text-white" style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/admin/orders/${orderId}`)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Customer Files</h1>
              <p className="text-sm text-gray-400">{totalCount} file{totalCount !== 1 ? "s" : ""} uploaded</p>
            </div>
          </div>

          <button
            onClick={handleNotify}
            disabled={notifying || totalCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            <Bell size={16} />
            {notifying ? "Sending..." : "Notify Customer"}
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError("")} className="ml-auto"><X size={14} /></button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg text-sm text-green-400">
            <Check size={16} />
            {success}
          </div>
        )}

        {/* Category tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = files[cat.id]?.length || 0;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? "border-red-600 text-red-500"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {cat.label}
                {count > 0 && (
                  <span className="bg-gray-700 text-xs px-1.5 py-0.5 rounded-full text-gray-300">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Upload area */}
        <label className="block mb-6 cursor-pointer">
          <input
            ref={fileInputRef}
            type="file"
            accept={currentCat.accept}
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          <div
            className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl transition-colors ${
              uploading
                ? "border-gray-700 bg-gray-900/50 cursor-not-allowed"
                : "border-gray-700 hover:border-red-600 hover:bg-gray-900/50"
            }`}
          >
            {uploading ? (
              <>
                <div className="w-full max-w-xs bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-red-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400">{uploadStatus} {uploadProgress}%</p>
              </>
            ) : (
              <>
                <Upload size={24} className="text-gray-500" />
                <p className="text-sm text-gray-400">
                  Click to upload {currentCat.label.toLowerCase()}
                </p>
                <p className="text-xs text-gray-600">{currentCat.accept}</p>
              </>
            )}
          </div>
        </label>

        {/* File list */}
        {currentFiles.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <currentCat.icon size={48} className="mx-auto mb-3 opacity-30" />
            <p>No {currentCat.label.toLowerCase()} uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <GripVertical size={18} className="text-gray-700 flex-shrink-0" />

                {/* Thumbnail or icon */}
                <div className="w-14 h-14 flex-shrink-0 bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
                  {file.mimeType?.startsWith("image/") ? (
                    <img
                      src={file.url}
                      alt={file.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : file.mimeType?.startsWith("video/") ? (
                    <Video size={22} className="text-gray-500" />
                  ) : (
                    <FileText size={22} className="text-gray-500" />
                  )}
                </div>

                {/* File info / edit form */}
                <div className="flex-1 min-w-0">
                  {editingId === file.id ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={editForm.displayName}
                        onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                        placeholder="Display name"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-red-600"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="Description (optional)"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-red-600"
                      />
                    </div>
                  ) : (
                    <>
                      <p className="font-medium truncate">{file.displayName}</p>
                      {file.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{file.description}</p>
                      )}
                      <p className="text-xs text-gray-600 mt-0.5">
                        {formatSize(file.fileSize)}
                        {file.uploadedBy?.name ? ` · ${file.uploadedBy.name}` : ""}
                      </p>
                    </>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {editingId === file.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(file.id)}
                        className="p-1.5 hover:bg-green-900/40 rounded text-green-500 transition-colors"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 hover:bg-gray-800 rounded text-gray-400 transition-colors"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-gray-800 rounded text-gray-400 transition-colors"
                        title="View / Download"
                      >
                        <Eye size={16} />
                      </a>
                      <button
                        onClick={() => startEdit(file)}
                        className="p-1.5 hover:bg-gray-800 rounded text-gray-400 transition-colors"
                        title="Rename"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(file.id, file.displayName)}
                        className="p-1.5 hover:bg-red-900/40 rounded text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legacy Dropbox fallback notice */}
        {files.legacyDropboxLink && (
          <div className="mt-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Legacy Dropbox link (still active):</p>
            <a
              href={files.legacyDropboxLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-red-500 hover:text-red-400 underline break-all"
            >
              {files.legacyDropboxLink}
            </a>
          </div>
        )}
      </div>
    </>
  );
}
