"use client";

import { useState, useEffect } from "react";
import { Upload, File, Download, Trash2, AlertCircle, CheckCircle } from "lucide-react";

export default function DocumentUpload({ orderId, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, [orderId]);

  async function loadDocuments() {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/orders/${orderId}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("File type not allowed. Please upload PDF, JPG, PNG, WEBP, DOCX, or XLSX");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccessMessage(null);

      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/orders/${orderId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        setSuccessMessage(`${file.name} uploaded successfully`);
        await loadDocuments();
        if (onUploadComplete) onUploadComplete();

        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to upload file");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = null;
    }
  }

  async function handleDownload(documentId, fileName) {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/documents/${documentId}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        // Open signed URL in new tab
        window.open(data.downloadUrl, '_blank');
      } else {
        setError("Failed to download file");
      }
    } catch (err) {
      console.error("Download error:", err);
      setError("Failed to download file");
    }
  }

  function handleDeleteClick(doc) {
    setDocumentToDelete(doc);
    setShowDeleteConfirm(true);
  }

  async function handleDeleteConfirm() {
    if (!documentToDelete) return;

    try {
      setDeleting(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/documents/${documentToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccessMessage("Document deleted successfully");
        await loadDocuments();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete document");
      }
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete document");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDocumentToDelete(null);
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Documents</h3>

        {/* Upload Button */}
        <label className={`
          px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2
          ${uploading
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-700'
          }
          text-white transition-colors
        `}>
          <Upload className="w-4 h-4" />
          {uploading ? 'Uploading...' : 'Upload Document'}
          <input
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
          />
        </label>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-900/20 border border-green-600 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-green-400 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Document List */}
      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-gray-400 text-center py-8">
          No documents uploaded yet
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{doc.fileName}</p>
                  <p className="text-gray-400 text-sm">
                    {formatFileSize(doc.fileSize)} &bull; Uploaded by {doc.uploadedBy} &bull; {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleDownload(doc.id, doc.fileName)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteClick(doc)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Instructions */}
      <div className="text-gray-400 text-xs">
        Accepted file types: PDF, JPG, PNG, WEBP, DOCX, XLSX &bull; Max size: 10MB
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && documentToDelete && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => {
            setShowDeleteConfirm(false);
            setDocumentToDelete(null);
          }}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              Delete Document?
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Are you sure you want to delete this document?
            </p>
            <p style={{ fontSize: "14px", marginBottom: "1.5rem", color: "#9ca3af", wordBreak: "break-all" }}>
              <strong>{documentToDelete.fileName}</strong>
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDocumentToDelete(null);
                }}
                disabled={deleting}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: deleting ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: deleting ? 0.5 : 1
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
