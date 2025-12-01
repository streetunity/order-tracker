"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle, XCircle, Circle, ChevronDown, ChevronUp,
  Upload, File, Download, Trash2, AlertCircle
} from "lucide-react";

const DOCUMENT_TYPE_LABELS = {
  ISF: 'ISF (International Security Filing)',
  ARRIVAL_NOTICE: 'Arrival Notice',
  BILL_OF_LADING: 'Bill of Lading',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  PACKING_LIST: 'Packing List',
  DELIVERY_ORDER: 'Delivery Order',
  OTHER: 'Other'
};

const REQUIRED_TYPES = ['ISF', 'ARRIVAL_NOTICE', 'BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'DELIVERY_ORDER'];

export default function ItemDocumentSection({ item, defaultExpanded = false, onDocumentChange }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [documents, setDocuments] = useState([]);
  const [checklist, setChecklist] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (expanded) {
      loadDocuments();
    }
  }, [expanded, item.id]);

  async function loadDocuments() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      // Use Next.js API proxy route instead of calling backend directly
      const res = await fetch(`/api/items/${item.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
        setChecklist(data.checklist);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!selectedFile || !selectedType) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', selectedType);

      const token = localStorage.getItem('token');
      // Use Next.js API proxy route instead of calling backend directly
      const res = await fetch(`/api/items/${item.id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        setSelectedFile(null);
        setSelectedType('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadDocuments();
        // Note: We intentionally don't call onDocumentChange() here
        // The component already refreshes its own documents list
        // Calling onDocumentChange would reload the entire order page and collapse all sections
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to upload');
      }
    } catch (err) {
      setError('Failed to upload document');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    try {
      const token = localStorage.getItem('token');
      // Use Next.js API proxy route instead of calling backend directly
      const res = await fetch(
        `/api/items/${item.id}/documents/${doc.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        window.open(data.downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  async function handleDelete(doc) {
    try {
      setDeleting(true);
      const token = localStorage.getItem('token');
      // Use Next.js API proxy route instead of calling backend directly
      const res = await fetch(
        `/api/items/${item.id}/documents/${doc.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        setDeleteConfirm(null);
        await loadDocuments();
        // Note: We intentionally don't call onDocumentChange() here
        // The component already refreshes its own documents list
        // Calling onDocumentChange would reload the entire order page and collapse all sections
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  }

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const manufacturerName = item.manufacturer?.name || 'No manufacturer';
  const itemName = item.productCode || 'Unnamed Item';

  return (
    <div className="item-document-card">
      {/* Header */}
      <div
        className="item-document-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="item-document-title">
          <span className="item-name">{itemName}</span>
          <span className="item-manufacturer">({manufacturerName})</span>
        </div>
        <div className="item-document-header-right">
          {stats && (
            <span className={`completion-badge ${stats.complete ? 'complete' : ''}`}>
              {stats.uploadedRequired} of {stats.totalRequired}
            </span>
          )}
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="item-document-content">
          {loading ? (
            <div className="loading-text">Loading documents...</div>
          ) : (
            <>
              {/* Checklist */}
              {checklist && (
                <div className="document-checklist">
                  <div className="checklist-header">
                    <span className="checklist-title">Document Checklist</span>
                    <span className="checklist-progress">
                      {stats?.uploadedRequired} of {stats?.totalRequired} complete
                    </span>
                  </div>
                  <div className="checklist-grid">
                    {Object.entries(checklist).map(([type, data]) => {
                      const isRequired = REQUIRED_TYPES.includes(type);
                      const statusClass = data.uploaded ? 'complete' : (isRequired ? 'missing' : 'optional');
                      const docsOfType = documents.filter(d => d.documentType === type);

                      return (
                        <div key={type} className={`checklist-item ${statusClass}`}>
                          <span className="checklist-icon">
                            {data.uploaded ? (
                              <CheckCircle size={18} />
                            ) : isRequired ? (
                              <XCircle size={18} />
                            ) : (
                              <Circle size={18} />
                            )}
                          </span>
                          <span className="checklist-label">{data.label}</span>
                          {data.uploaded ? (
                            <span
                              className="checklist-count checklist-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (docsOfType.length > 0) {
                                  handleDownload(docsOfType[0]);
                                }
                              }}
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              {data.count} file{data.count > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className={`checklist-count ${isRequired ? 'missing' : ''}`}>
                              Missing
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upload Section */}
              <div className="upload-section">
                <h4 className="upload-title">Upload Document</h4>

                {error && (
                  <div className="upload-error">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                <div className="upload-controls">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="type-select"
                  >
                    <option value="">Select document type...</option>
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>

                  <div
                    className={`dropzone ${dragActive ? 'active' : ''} ${selectedFile ? 'has-file' : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={(e) => setSelectedFile(e.target.files[0])}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
                      style={{ display: 'none' }}
                    />
                    {selectedFile ? (
                      <span className="selected-file">{selectedFile.name}</span>
                    ) : (
                      <>
                        <Upload size={20} />
                        <span>Choose file or drag here</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="upload-actions">
                  <button
                    onClick={handleUpload}
                    disabled={!selectedFile || !selectedType || uploading}
                    className="upload-btn"
                  >
                    {uploading ? 'Uploading...' : 'Upload Document'}
                  </button>
                </div>
              </div>

              {/* Document List */}
              <div className="documents-list">
                <h4 className="documents-list-title">Uploaded Documents</h4>

                {documents.length === 0 ? (
                  <div className="no-documents">No documents uploaded yet</div>
                ) : (
                  <div className="documents-items">
                    {documents.map(doc => (
                      <div key={doc.id} className="document-item">
                        <File size={20} className="document-icon" />
                        <div className="document-info">
                          <div className="document-name">{doc.fileName}</div>
                          <div className="document-type">{DOCUMENT_TYPE_LABELS[doc.documentType]}</div>
                          <div className="document-meta">
                            {formatFileSize(doc.fileSize)} - Uploaded by {doc.uploadedBy} - {new Date(doc.uploadedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="document-actions">
                          <button onClick={() => handleDownload(doc)} className="action-btn download">
                            <Download size={16} />
                          </button>
                          <button onClick={() => setDeleteConfirm(doc)} className="action-btn delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
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
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%"
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "18px", color: "#fff" }}>Delete Document?</h3>
            <p style={{ margin: "0 0 20px 0", color: "#9ca3af", fontSize: "14px" }}>
              Are you sure you want to delete "{deleteConfirm.fileName}"?
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  padding: "8px 16px",
                  background: "#374151",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                style={{
                  padding: "8px 16px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: deleting ? "not-allowed" : "pointer",
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
