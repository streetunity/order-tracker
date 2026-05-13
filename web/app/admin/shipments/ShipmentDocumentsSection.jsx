"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, File, Download, Trash2, CheckCircle, XCircle } from "lucide-react";

const ALL_DOCUMENT_TYPE_LABELS = {
  ISF: "ISF (International Security Filing)",
  ARRIVAL_NOTICE: "Arrival Notice",
  BILL_OF_LADING: "Bill of Lading",
  COMMERCIAL_INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  DELIVERY_ORDER: "Delivery Order",
  ISF_REPORT: "ISF Report",
  ENTRY_SUMMARY: "Entry Summary",
  BROKER_INVOICE: "Broker Invoice",
  OTHER: "Other",
};

// Mirrors api/src/services/documentService.js REQUIRED_DOCUMENT_TYPES.
// Manufacturers are limited to these 6 types at both item and shipment level.
const MANUFACTURER_DOCUMENT_TYPES = [
  "ISF",
  "ARRIVAL_NOTICE",
  "BILL_OF_LADING",
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "DELIVERY_ORDER",
];

// Required document types for the shipment checklist (same as manufacturer set).
const REQUIRED_TYPES = MANUFACTURER_DOCUMENT_TYPES;

export default function ShipmentDocumentsSection({ shipment, user, getAuthHeaders, onChange }) {
  const [documents, setDocuments] = useState([]);
  const [checklist, setChecklist] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const isManufacturer = user?.role === "MANUFACTURER";
  const isAdminOrSuper = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isArchived = !!shipment?.archivedAt;

  // Allowed document types in the dropdown, by role.
  const allowedTypeKeys = isManufacturer
    ? MANUFACTURER_DOCUMENT_TYPES
    : Object.keys(ALL_DOCUMENT_TYPE_LABELS);

  // Mirrors backend rule: original uploader OR admin/super-admin can delete.
  const canDeleteDoc = (doc) =>
    isAdminOrSuper || (doc?.uploadedBy && doc.uploadedBy === user?.name);

  const loadDocuments = useCallback(async () => {
    if (!shipment?.id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/shipments/${shipment.id}/documents`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data?.documents) ? data.documents : []);
        setChecklist(data?.checklist || {});
      } else {
        setDocuments([]);
        setChecklist({});
      }
    } catch (e) {
      console.error("Failed to load shipment documents:", e);
      setDocuments([]);
      setChecklist({});
    } finally {
      setLoading(false);
    }
  }, [shipment?.id, getAuthHeaders]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async () => {
    if (!selectedFile || !selectedType) return;
    try {
      setUploading(true);
      setError("");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", selectedType);
      const res = await fetch(`/api/shipments/${shipment.id}/documents`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload failed");
      }
      setSelectedFile(null);
      setSelectedType("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
      if (typeof onChange === "function") onChange();
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const res = await fetch(
        `/api/shipments/${shipment.id}/documents/${doc.id}/download`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
      }
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleDelete = async (doc) => {
    if (typeof window === "undefined") return;
    if (!window.confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/shipments/${shipment.id}/documents/${doc.id}`,
        { method: "DELETE", headers: getAuthHeaders() }
      );
      if (res.ok) {
        await loadDocuments();
        if (typeof onChange === "function") onChange();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Delete failed");
      }
    } catch (e) {
      console.error("Delete failed:", e);
      setError("Delete failed");
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", margin: "0 0 12px 0" }}>
        Documents ({documents.length})
      </h4>

      {/* Document checklist (required broker docs) */}
      <div style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>Document Checklist</span>
          <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 12 }}>
            {REQUIRED_TYPES.filter(t => checklist[t]?.uploaded).length}/{REQUIRED_TYPES.length} Complete
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {REQUIRED_TYPES.map(type => {
            const entry = checklist[type] || {};
            const has = !!entry.uploaded;
            return (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "rgba(0, 0, 0, 0.25)",
                  borderRadius: 6,
                }}
              >
                {has
                  ? <CheckCircle size={15} color="#22c55e" />
                  : <XCircle size={15} color="#ef4444" />
                }
                <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb" }}>
                  {ALL_DOCUMENT_TYPE_LABELS[type] || type}
                </span>
                {entry.count > 0 && (
                  <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>
                    {entry.count} file{entry.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload panel \u2014 hidden when shipment is archived */}
      {!isArchived && (
        <div style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 8,
          padding: 14,
          marginBottom: 12,
        }}>
          {error && (
            <div style={{
              padding: "8px 12px",
              background: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              borderRadius: 6,
              color: "#fca5a5",
              fontSize: 13,
              marginBottom: 10,
            }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={{
                flex: "0 0 240px",
                padding: "9px 12px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 6,
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: 13,
              }}
            >
              <option value="">Select document type...</option>
              {allowedTypeKeys.map((key) => (
                <option key={key} value={key}>
                  {ALL_DOCUMENT_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) setSelectedFile(f);
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 14,
                border: `2px dashed ${isDragging ? "#dc2626" : selectedFile ? "#22c55e" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 6,
                color: selectedFile ? "#22c55e" : "rgba(255,255,255,0.55)",
                fontSize: 13,
                cursor: "pointer",
                background: isDragging
                  ? "rgba(220,38,38,0.05)"
                  : selectedFile
                  ? "rgba(34,197,94,0.05)"
                  : "transparent",
              }}
            >
              <Upload size={16} />
              {selectedFile ? selectedFile.name : "Drop file or click to browse"}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => setSelectedFile(e.target.files[0])}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedType || uploading}
              style={{
                padding: "8px 18px",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  !selectedFile || !selectedType || uploading
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  !selectedFile || !selectedType || uploading ? 0.5 : 1,
              }}
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div style={{
          padding: 16,
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 8,
          textAlign: "center",
          color: "rgba(255,255,255,0.4)",
          fontSize: 13,
        }}>
          No shipment documents uploaded yet
        </div>
      ) : (
        <div style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          {documents.map((doc, idx) => {
            const showDelete = canDeleteDoc(doc);
            const isItemDoc = !!doc.itemId;
            return (
              <div
                key={doc.id}
                style={{
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}
              >
                <File size={16} color="rgba(255,255,255,0.5)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 2, wordBreak: "break-word", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{doc.fileName}</span>
                    {isItemDoc && doc.fromItemProductCode && (
                      <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", borderRadius: 3 }}>
                        from {doc.fromItemProductCode}
                      </span>
                    )}
                    {!isItemDoc && (
                      <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(220,38,38,0.18)", color: "#dc2626", borderRadius: 3 }}>
                        Shipment
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 2 }}>
                    {ALL_DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {(Number(doc.fileSize) / 1024).toFixed(1)} KB · {new Date(doc.uploadedAt).toLocaleDateString()}
                    {doc.uploadedBy && <span> · {doc.uploadedBy}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handleDownload(doc)}
                    title="Download"
                    style={{
                      padding: 6,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 4,
                      color: "rgba(255,255,255,0.6)",
                      cursor: "pointer",
                    }}
                  >
                    <Download size={13} />
                  </button>
                  {showDelete && (
                    <button
                      onClick={() => handleDelete(doc)}
                      title="Delete"
                      style={{
                        padding: 6,
                        background: "transparent",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: 4,
                        color: "#fca5a5",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
