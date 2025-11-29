"use client";

// NOTE: Uses Next.js API routes (/api/customs/*) which proxy to backend
// This follows the same pattern as all other pages in the app
// Backend routes are at /customs/* (changed from /broker/ to avoid ad blocker interference)

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import { CheckCircle, XCircle, Circle, Upload, File, Download, Trash2 } from "lucide-react";
import "./item.css";

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

export default function BrokerItemDetail() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const itemId = params.id;

  const [item, setItem] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  // Document state
  const [documents, setDocuments] = useState([]);
  const [docChecklist, setDocChecklist] = useState(null);
  const [docStats, setDocStats] = useState(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user || (user.role !== 'BROKER' && user.role !== 'SUPER_ADMIN')) {
      router.push('/login');
      return;
    }

    loadItem();
    loadActivityLog();
  }, [user, itemId, router]);

  async function loadItem() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/customs/item/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setItem(data);
        setNewStatus(data.customsDocumentStatus || 'PENDING');
        setNotes(data.customsNotes || '');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading item:', error);
      setLoading(false);
    }
  }

  async function loadActivityLog() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/customs/activity-log/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setActivityLog(data);
      }
    } catch (error) {
      console.error('Error loading activity log:', error);
    }
  }

  async function loadDocuments() {
    setDocumentsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/customs/item/${itemId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
        setDocChecklist(data.checklist);
        setDocStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
    setDocumentsLoading(false);
  }

  async function handleDocumentUpload() {
    if (!selectedFile) return;

    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/customs/item/${itemId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadDocuments();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to upload');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload document');
    }
    setUploadingDoc(false);
  }

  async function handleDownload(doc) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/customs/item/${itemId}/documents/${doc.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        window.open(data.downloadUrl, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

  async function handleDeleteDoc(doc) {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/customs/item/${itemId}/documents/${doc.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        setDeleteConfirm(null);
        await loadDocuments();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setDeleting(false);
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

  // Load documents when switching to documents tab
  useEffect(() => {
    if (activeTab === 'documents' && documents.length === 0 && !documentsLoading) {
      loadDocuments();
    }
  }, [activeTab]);

  async function handleUpdateStatus() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/customs/update-status/${itemId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus,
          notes: notes
        })
      });

      if (res.ok) {
        await loadItem();
        await loadActivityLog();
        alert('Status updated successfully');
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error updating status');
    }
    setSaving(false);
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="loading-state">
          <div>Loading item details...</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="empty-state">
          <div>Item not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="broker-container">
      <TopNav />
      <NotificationBar />

      <div className="broker-content">
        {/* Header */}
        <div className="item-header">
          <button
            onClick={() => router.push('/customs/dashboard')}
            className="back-button"
          >
            ← Back to Dashboard
          </button>
          <div className="header-row">
            <h1 className="item-title">
              {item.order.poNumber || 'N/A'} - {item.productCode}
            </h1>
            {item.order.brokerDocsLink && item.order.brokerDocsLink.trim() !== '' && (
              <a
                href={
                  item.order.brokerDocsLink.startsWith('http://') ||
                  item.order.brokerDocsLink.startsWith('https://')
                    ? item.order.brokerDocsLink
                    : `https://${item.order.brokerDocsLink}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="docs-button-header"
              >
                Open Documents →
              </a>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Documents
          </button>
          <button
            className={`tab-button ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Activity Log
          </button>
        </div>

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="item-grid">
          {/* Left Column - Item Details */}
          <div className="item-column">
            {/* Order Information */}
            <div className="info-card">
              <h2>Order Information</h2>
              <div className="info-row">
                <span className="info-label">Order Number:</span>
                <span className="info-value mono">{item.order.poNumber || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Customer:</span>
                <span className="info-value">{item.order.account.name}</span>
              </div>
              {item.order.account.email && (
                <div className="info-row">
                  <span className="info-label">Email:</span>
                  <a href={`mailto:${item.order.account.email}`} className="info-link">
                    {item.order.account.email}
                  </a>
                </div>
              )}
              {item.order.account.phone && (
                <div className="info-row">
                  <span className="info-label">Phone:</span>
                  <a href={`tel:${item.order.account.phone}`} className="info-link">
                    {item.order.account.phone}
                  </a>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Sales Person:</span>
                <span className="info-value">{item.order.sku || 'N/A'}</span>
              </div>
            </div>

            {/* Shipment Details */}
            <div className="info-card">
              <h2>Shipment Details</h2>
              <div className="info-row">
                <span className="info-label">Product Code:</span>
                <span className="info-value">{item.productCode || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Serial Number:</span>
                <span className="info-value mono">{item.serialNumber || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Bill of Lading:</span>
                <span className="info-value mono">{item.billOfLading || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Expected Arrival:</span>
                <span className="info-value">
                  {item.order.etaDate
                    ? new Date(item.order.etaDate).toLocaleDateString()
                    : 'TBD'
                  }
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Current Stage:</span>
                <span className="info-value">{item.currentStage}</span>
              </div>
            </div>
          </div>

          {/* Right Column - Status Management */}
          <div className="item-column">
            {/* Status Update */}
            <div className="info-card customs-card">
              <h2>Customs Status</h2>

              <div className="form-group">
                <label className="form-label">Current Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="form-select"
                >
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="FILED">Filed</option>
                  <option value="CLEARED">Cleared</option>
                  <option value="ISSUES">Issues</option>
                </select>
              </div>

              <div className="form-group notes-group">
                <label className="form-label">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about customs processing, issues, or special instructions..."
                  className="form-textarea notes-textarea"
                />
              </div>

              <button
                onClick={handleUpdateStatus}
                disabled={saving}
                className="broker-btn broker-btn-primary full-width"
              >
                {saving ? 'Saving...' : 'Update Status'}
              </button>

              {/* Status Dates */}
              <div className="status-dates">
                {item.customsFiledDate && (
                  <div className="info-row-small">
                    <span>Filed Date:</span>
                    <span>{new Date(item.customsFiledDate).toLocaleDateString()}</span>
                  </div>
                )}
                {item.customsClearedDate && (
                  <div className="info-row-small">
                    <span>Cleared Date:</span>
                    <span>{new Date(item.customsClearedDate).toLocaleDateString()}</span>
                  </div>
                )}
                {item.brokerLastViewedDate && (
                  <div className="info-row-small">
                    <span>Last Viewed:</span>
                    <span>{new Date(item.brokerLastViewedDate).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="activity-tab-content">
            <div className="info-card">
              <h2>Activity Log</h2>

              {activityLog.length === 0 ? (
                <div className="no-activity">No activity recorded yet</div>
              ) : (
                <div className="activity-log">
                  {activityLog.map(log => (
                    <div key={log.id} className="activity-item">
                      <div className="activity-header">
                        <span className="activity-action">{log.action}</span>
                        <span className="activity-time">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="activity-user">
                        by {log.user.name}
                      </div>
                      {log.oldStatus && log.newStatus && (
                        <div className="activity-status-change">
                          <span className="old-status">{log.oldStatus}</span>
                          <span className="arrow">→</span>
                          <span className="new-status">{log.newStatus}</span>
                        </div>
                      )}
                      {log.notes && (
                        <div className="activity-notes">
                          "{log.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="activity-tab-content">
            {documentsLoading ? (
              <div className="info-card">
                <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
                  Loading documents...
                </div>
              </div>
            ) : (
              <>
                {/* Document Checklist */}
                {docChecklist && (
                  <div className="info-card">
                    <h2>Document Checklist</h2>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>
                      {docStats?.uploadedRequired} of {docStats?.totalRequired} required documents uploaded
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {Object.entries(docChecklist).map(([type, data]) => {
                        const isRequired = REQUIRED_TYPES.includes(type);
                        return (
                          <div key={type} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            background: '#1a1a1a',
                            borderRadius: '6px'
                          }}>
                            <span style={{ color: data.uploaded ? '#22c55e' : (isRequired ? '#ef4444' : '#6b7280') }}>
                              {data.uploaded ? <CheckCircle size={18} /> : isRequired ? <XCircle size={18} /> : <Circle size={18} />}
                            </span>
                            <span style={{ flex: 1, fontSize: '13px', color: '#e5e7eb' }}>{data.label}</span>
                            <span style={{ fontSize: '12px', color: data.uploaded ? '#9ca3af' : (isRequired ? '#ef4444' : '#9ca3af') }}>
                              {data.uploaded ? `${data.count} file${data.count > 1 ? 's' : ''}` : 'Missing'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Upload Section */}
                <div className="info-card">
                  <h2>Upload Additional Documents</h2>
                  <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '16px' }}>
                    Brokers can upload supplementary documents here. Required documents are uploaded by the vendor or admin.
                  </p>

                  <div
                    style={{
                      border: `2px dashed ${dragActive ? '#dc2626' : selectedFile ? '#22c55e' : '#404040'}`,
                      borderRadius: '6px',
                      padding: '20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      marginBottom: '12px',
                      background: dragActive ? 'rgba(220, 38, 38, 0.05)' : selectedFile ? 'rgba(34, 197, 94, 0.05)' : 'transparent'
                    }}
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
                      <span style={{ color: '#22c55e' }}>{selectedFile.name}</span>
                    ) : (
                      <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <Upload size={20} />
                        Drag file here or click to browse
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleDocumentUpload}
                    disabled={!selectedFile || uploadingDoc}
                    className="broker-btn broker-btn-primary full-width"
                  >
                    {uploadingDoc ? 'Uploading...' : 'Upload as "Other"'}
                  </button>
                </div>

                {/* Document List */}
                <div className="info-card">
                  <h2>All Documents</h2>

                  {documents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                      No documents uploaded yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {documents.map(doc => (
                        <div key={doc.id} style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '12px',
                          background: '#1a1a1a',
                          borderRadius: '6px'
                        }}>
                          <File size={20} style={{ color: '#9ca3af', marginTop: '2px' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff', marginBottom: '4px', wordBreak: 'break-word' }}>
                              {doc.fileName}
                            </div>
                            <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
                              {DOCUMENT_TYPE_LABELS[doc.documentType]}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              {formatFileSize(doc.fileSize)} - Uploaded by {doc.uploadedBy} - {new Date(doc.uploadedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleDownload(doc)}
                              style={{
                                padding: '8px',
                                background: 'transparent',
                                border: '1px solid #404040',
                                borderRadius: '6px',
                                color: '#9ca3af',
                                cursor: 'pointer'
                              }}
                            >
                              <Download size={16} />
                            </button>
                            {doc.uploadedBy === user?.name && (
                              <button
                                onClick={() => setDeleteConfirm(doc)}
                                style={{
                                  padding: '8px',
                                  background: 'transparent',
                                  border: '1px solid #404040',
                                  borderRadius: '6px',
                                  color: '#9ca3af',
                                  cursor: 'pointer'
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
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
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              style={{
                backgroundColor: '#1f1f1f',
                border: '1px solid #404040',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '400px',
                width: '90%'
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff' }}>Delete Document?</h3>
              <p style={{ margin: '0 0 20px 0', color: '#9ca3af', fontSize: '14px' }}>
                Are you sure you want to delete "{deleteConfirm.fileName}"?
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  style={{
                    padding: '8px 16px',
                    background: '#374151',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteDoc(deleteConfirm)}
                  disabled={deleting}
                  style={{
                    padding: '8px 16px',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
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
    </div>
  );
}
