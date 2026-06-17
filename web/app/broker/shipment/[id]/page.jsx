"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import { ChevronDown, ChevronRight, Package, CheckCircle, XCircle, Circle, Upload, File, Download, Trash2 } from "lucide-react";
import "./shipment.css";

// Document type labels
const DOCUMENT_TYPE_LABELS = {
  ISF: 'ISF (International Security Filing)',
  ARRIVAL_NOTICE: 'Arrival Notice',
  BILL_OF_LADING: 'Bill of Lading',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  PACKING_LIST: 'Packing List',
  DELIVERY_ORDER: 'Delivery Order',
  ISF_REPORT: 'ISF Report',
  ENTRY_SUMMARY: 'Entry Summary',
  BROKER_INVOICE: 'Broker Invoice',
  OTHER: 'Other'
};

const BROKER_DOCUMENT_TYPES = ['ISF_REPORT', 'ENTRY_SUMMARY', 'DELIVERY_ORDER', 'BROKER_INVOICE', 'OTHER'];
const REQUIRED_TYPES = ['ISF', 'ARRIVAL_NOTICE', 'BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'DELIVERY_ORDER'];

export default function BrokerShipmentDetail() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const shipmentId = params.id;

  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});
  const [activeTab, setActiveTab] = useState('details');

  // Status update state
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Document state
  const [documents, setDocuments] = useState([]);
  const [docChecklist, setDocChecklist] = useState(null);
  const [docStats, setDocStats] = useState(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('ISF_REPORT');
  const [dragActive, setDragActive] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user || (user.role !== 'BROKER' && user.role !== 'SUPER_ADMIN')) {
      router.push('/login');
      return;
    }
    loadShipment();
  }, [user, shipmentId, router]);

  async function loadShipment() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setShipment(data);
        setNewStatus(data.customsDocumentStatus || 'PENDING');
        setNotes(data.customsNotes || '');
      } else {
        console.error('Failed to load shipment');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading shipment:', error);
      setLoading(false);
    }
  }

  async function handleUpdateStatus() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customsDocumentStatus: newStatus,
          customsNotes: notes
        })
      });

      if (res.ok) {
        await loadShipment();
        alert('Status updated successfully — synced to all items in this shipment.');
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error updating status');
    }
    setSaving(false);
  }

  // Document functions
  async function loadDocuments() {
    setDocumentsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/shipments/${shipmentId}/documents`, {
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
      formData.append('documentType', selectedDocType);

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/shipments/${shipmentId}/documents`, {
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
        `/api/shipments/${shipmentId}/documents/${doc.id}/download`,
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
        `/api/shipments/${shipmentId}/documents/${doc.id}`,
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
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
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

  function getFirstDocOfType(type) {
    return documents.find(d => d.documentType === type);
  }

  // Load documents when switching to tab
  useEffect(() => {
    if (activeTab === 'documents' && documents.length === 0 && !documentsLoading) {
      loadDocuments();
    }
  }, [activeTab]);

  function toggleItem(itemId) {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  }

  function expandAll() {
    if (!shipment?.items) return;
    const all = {};
    shipment.items.forEach(item => { all[item.id] = true; });
    setExpandedItems(all);
  }

  function collapseAll() {
    setExpandedItems({});
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="loading-state">
          <div>Loading shipment details...</div>
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="broker-container">
        <TopNav />
        <NotificationBar />
        <div className="empty-state">
          <div>Shipment not found</div>
        </div>
      </div>
    );
  }

  // Distinct manufacturer name(s) across all items in this shipment.
  const manufacturerNames = Array.from(
    new Set((shipment.items || []).map(i => i.manufacturer?.name).filter(Boolean))
  );
  const manufacturerLabel = manufacturerNames.length ? manufacturerNames.join(', ') : 'N/A';

  return (
    <div className="broker-container">
      <TopNav />
      <NotificationBar />

      <div className="broker-content">
        {/* Header */}
        <div className="shipment-header">
          <button
            onClick={() => router.push('/broker/dashboard')}
            className="back-button"
          >
            ← Back to Dashboard
          </button>
          <div className="shipment-title-row">
            <div className="shipment-title-left">
              <Package size={24} className="shipment-title-icon" />
              <h1>{shipment.containerNumber || shipment.billOfLading || 'Unnamed Shipment'}</h1>
              <span className="shipment-badge">{shipment.items?.length || 0} items</span>
            </div>
          </div>

          {/* Shipment Info Bar */}
          <div className="shipment-info-bar">
            {shipment.billOfLading && (
              <div className="shipment-info-item">
                <span className="shipment-info-label">BOL:</span>
                <span className="shipment-info-value">{shipment.billOfLading}</span>
              </div>
            )}
            {shipment.vesselName && (
              <div className="shipment-info-item">
                <span className="shipment-info-label">Vessel:</span>
                <span className="shipment-info-value">{shipment.vesselName}</span>
              </div>
            )}
            {shipment.portOfOrigin && (
              <div className="shipment-info-item">
                <span className="shipment-info-label">Origin:</span>
                <span className="shipment-info-value">{shipment.portOfOrigin}</span>
              </div>
            )}
            {shipment.portOfDestination && (
              <div className="shipment-info-item">
                <span className="shipment-info-label">Destination:</span>
                <span className="shipment-info-value">{shipment.portOfDestination}</span>
              </div>
            )}
            {shipment.etaDate && (
              <div className="shipment-info-item">
                <span className="shipment-info-label">ETA:</span>
                <span className="shipment-info-value">{new Date(shipment.etaDate).toLocaleDateString()}</span>
              </div>
            )}
            <div className="shipment-info-item">
              <span className="shipment-info-label">Status:</span>
              <span className={`status-text ${(shipment.customsDocumentStatus || 'pending').toLowerCase().replace('_', '-')}`}>
                {shipment.customsDocumentStatus || 'PENDING'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation - 3 tabs only, no Status Management */}
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

        {/* Details Tab - Status + Items */}
        {activeTab === 'details' && (
          <div className="tab-content">
            {/* Two-column layout: Status on left, Shipment summary on right */}
            <div className="item-grid">
              {/* Left Column - Customs Status (matches individual item layout) */}
              <div className="item-column">
                <div className="info-card customs-card">
                  <h2>Customs Status</h2>
                  <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '16px' }}>
                    Updates apply to the entire shipment and all {shipment.items?.length || 0} items within it.
                  </p>

                  <div className="form-group">
                    <label className="form-label">Current Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="form-select"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="FILED">Filed</option>
                      <option value="RELEASED">Released</option>
                      <option value="UNDER_EXAM">Under Exam</option>
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
                    {shipment.customsFiledDate && (
                      <div className="info-row-small">
                        <span>Filed Date:</span>
                        <span>{new Date(shipment.customsFiledDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {shipment.customsClearedDate && (
                      <div className="info-row-small">
                        <span>Released Date:</span>
                        <span>{new Date(shipment.customsClearedDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Shipment Details summary */}
              <div className="item-column">
                <div className="info-card">
                  <h2>Shipment Details</h2>
                  <div className="info-row">
                    <span className="info-label">Container:</span>
                    <span className="info-value mono">{shipment.containerNumber || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{manufacturerNames.length > 1 ? 'Manufacturers' : 'Manufacturer'}:</span>
                    <span className="info-value">{manufacturerLabel}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Bill of Lading:</span>
                    <span className="info-value mono">{shipment.billOfLading || 'N/A'}</span>
                  </div>
                  {shipment.vesselName && (
                    <div className="info-row">
                      <span className="info-label">Vessel:</span>
                      <span className="info-value">{shipment.vesselName}</span>
                    </div>
                  )}
                  {shipment.portOfOrigin && (
                    <div className="info-row">
                      <span className="info-label">Port of Origin:</span>
                      <span className="info-value">{shipment.portOfOrigin}</span>
                    </div>
                  )}
                  {shipment.portOfDestination && (
                    <div className="info-row">
                      <span className="info-label">Port of Destination:</span>
                      <span className="info-value">{shipment.portOfDestination}</span>
                    </div>
                  )}
                  {shipment.etaDate && (
                    <div className="info-row">
                      <span className="info-label">ETA:</span>
                      <span className="info-value">{new Date(shipment.etaDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="info-row">
                    <span className="info-label">Total Items:</span>
                    <span className="info-value">{shipment.items?.length || 0}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Documents:</span>
                    <span className="info-value">{shipment.totalDocCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Items Accordion - below the two-column grid */}
            <div style={{ marginTop: '24px' }}>
              <div className="accordion-controls">
                <h2 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Items in Shipment</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={expandAll} className="broker-btn broker-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                    Expand All
                  </button>
                  <button onClick={collapseAll} className="broker-btn broker-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                    Collapse All
                  </button>
                </div>
              </div>

              {(!shipment.items || shipment.items.length === 0) ? (
                <div className="info-card">
                  <div className="empty-state" style={{ padding: '40px' }}>No items in this shipment</div>
                </div>
              ) : (
                shipment.items.map(item => {
                  const isExpanded = expandedItems[item.id] || false;
                  return (
                    <div key={item.id} className="accordion-item">
                      <button
                        className="accordion-header"
                        onClick={() => toggleItem(item.id)}
                      >
                        <div className="accordion-header-left">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          <span className="accordion-product-code">{item.productCode || 'Unnamed Item'}</span>
                          <span className="accordion-customer">{item.order?.account?.name || 'Unknown Customer'}</span>
                          {item.order?.poNumber && (
                            <span className="accordion-po">PO: {item.order.poNumber}</span>
                          )}
                        </div>
                        <div className="accordion-header-right">
                          <span className={`item-stage-badge ${item.currentStage?.toLowerCase().replace(/\s+/g, '-')}`}>
                            {item.currentStage}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="accordion-body">
                          <div className="accordion-grid">
                            {/* Order Information */}
                            <div className="info-card">
                              <h3>Order Information</h3>
                              <div className="info-row">
                                <span className="info-label">Customer:</span>
                                <span className="info-value">{item.order?.account?.name || 'N/A'}</span>
                              </div>
                              {item.order?.account?.contactName && (
                                <div className="info-row">
                                  <span className="info-label">Contact:</span>
                                  <span className="info-value">{item.order.account.contactName}</span>
                                </div>
                              )}
                              {item.order?.account?.email && (
                                <div className="info-row">
                                  <span className="info-label">Email:</span>
                                  <a href={`mailto:${item.order.account.email}`} className="info-link">{item.order.account.email}</a>
                                </div>
                              )}
                              {item.order?.account?.phone && (
                                <div className="info-row">
                                  <span className="info-label">Phone:</span>
                                  <a href={`tel:${item.order.account.phone}`} className="info-link">{item.order.account.phone}</a>
                                </div>
                              )}
                              {item.order?.poNumber && (
                                <div className="info-row">
                                  <span className="info-label">PO Number:</span>
                                  <span className="info-value">{item.order.poNumber}</span>
                                </div>
                              )}
                              {item.order?.sku && (
                                <div className="info-row">
                                  <span className="info-label">Sales Person:</span>
                                  <span className="info-value">{item.order.sku}</span>
                                </div>
                              )}
                            </div>

                            {/* Item Details */}
                            <div className="info-card">
                              <h3>Item Details</h3>
                              <div className="info-row">
                                <span className="info-label">Product Code:</span>
                                <span className="info-value">{item.productCode || 'N/A'}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Qty:</span>
                                <span className="info-value">{item.qty || 1}</span>
                              </div>
                              {item.serialNumber && (
                                <div className="info-row">
                                  <span className="info-label">Serial Number:</span>
                                  <span className="info-value mono">{item.serialNumber}</span>
                                </div>
                              )}
                              {item.modelNumber && (
                                <div className="info-row">
                                  <span className="info-label">Model Number:</span>
                                  <span className="info-value mono">{item.modelNumber}</span>
                                </div>
                              )}
                              <div className="info-row">
                                <span className="info-label">Current Stage:</span>
                                <span className="info-value">{item.currentStage}</span>
                              </div>
                              {item._count?.documents > 0 && (
                                <div className="info-row">
                                  <span className="info-label">Item Documents:</span>
                                  <span className="info-value">{item._count.documents} file{item._count.documents !== 1 ? 's' : ''}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="tab-content">
            {documentsLoading ? (
              <div className="info-card">
                <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>Loading documents...</div>
              </div>
            ) : (
              <>
                {/* Shared Notice */}
                <div className="shared-notice">
                  <Package size={20} className="shared-notice-icon" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', marginBottom: '2px' }}>Shared Shipment Documents</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                      Documents uploaded here are shared across all {shipment.items?.length || 0} items in this shipment.
                      Documents uploaded to individual items on the board also appear here.
                    </div>
                  </div>
                </div>

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
                        const firstDoc = getFirstDocOfType(type);
                        return (
                          <div key={type} className="checklist-row">
                            <span style={{ color: data.uploaded ? '#22c55e' : (isRequired ? '#ef4444' : '#6b7280') }}>
                              {data.uploaded ? <CheckCircle size={18} /> : isRequired ? <XCircle size={18} /> : <Circle size={18} />}
                            </span>
                            <span style={{ flex: 1, fontSize: '13px', color: '#e5e7eb' }}>{data.label}</span>
                            {data.uploaded && firstDoc ? (
                              <button onClick={() => handleDownload(firstDoc)} className="checklist-download-btn">
                                <Download size={14} />
                                {data.count} file{data.count > 1 ? 's' : ''}
                              </button>
                            ) : (
                              <span style={{ fontSize: '12px', color: isRequired ? '#ef4444' : '#9ca3af' }}>Missing</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Upload Section */}
                <div className="info-card">
                  <h2>Upload Document</h2>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '6px' }}>Document Type</label>
                    <select
                      value={selectedDocType}
                      onChange={(e) => setSelectedDocType(e.target.value)}
                      className="form-select"
                    >
                      {BROKER_DOCUMENT_TYPES.map(type => (
                        <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={`drop-zone ${dragActive ? 'active' : ''} ${selectedFile ? 'has-file' : ''}`}
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
                        <Upload size={20} /> Drag file here or click to browse
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleDocumentUpload}
                    disabled={!selectedFile || uploadingDoc}
                    className="broker-btn broker-btn-primary full-width"
                    style={{ marginTop: '12px' }}
                  >
                    {uploadingDoc ? 'Uploading...' : `Upload as "${DOCUMENT_TYPE_LABELS[selectedDocType]}"`}
                  </button>
                </div>

                {/* Document List */}
                <div className="info-card">
                  <h2>All Documents</h2>
                  {documents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>No documents uploaded yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {documents.map(doc => (
                        <div key={doc.id} className="doc-row" style={{
                          borderLeft: doc.isItemDocument ? '3px solid #f59e0b' : undefined
                        }}>
                          <File size={20} style={{ color: '#9ca3af', marginTop: '2px', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff', marginBottom: '4px', wordBreak: 'break-word' }}>
                              {doc.fileName}
                              {doc.isItemDocument && (
                                <span style={{
                                  marginLeft: '8px',
                                  padding: '1px 6px',
                                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  color: '#f59e0b'
                                }}>
                                  From: {doc.fromItemProductCode || 'Item'}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
                              {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              {formatFileSize(doc.fileSize)} - Uploaded by {doc.uploadedBy} - {new Date(doc.uploadedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => handleDownload(doc)} className="doc-action-btn">
                              <Download size={16} />
                            </button>
                            {(doc.uploadedBy === user?.name || user?.role === 'SUPER_ADMIN') && (
                              <button onClick={() => setDeleteConfirm(doc)} className="doc-action-btn">
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

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="tab-content">
            <div className="info-card">
              <h2>Activity Log</h2>
              {(!shipment.activityLogs || shipment.activityLogs.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>No activity recorded yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shipment.activityLogs.map(log => (
                    <div key={log.id} className="activity-item">
                      <div className="activity-header">
                        <span className="activity-action">{log.action.replace(/_/g, ' ')}</span>
                        <span className="activity-time">{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="activity-user">by {log.userName}</div>
                      {log.oldStatus && log.newStatus && (
                        <div className="activity-status-change">
                          <span className="old-status">{log.oldStatus}</span>
                          <span className="arrow">→</span>
                          <span className="new-status">{log.newStatus}</span>
                        </div>
                      )}
                      {log.notes && <div className="activity-notes">"{log.notes}"</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff' }}>Delete Document?</h3>
              <p style={{ margin: '0 0 20px 0', color: '#9ca3af', fontSize: '14px' }}>
                Are you sure you want to delete "{deleteConfirm.fileName}"?
                <span style={{ display: 'block', marginTop: '8px', color: '#dc2626' }}>
                  This will remove the document from all items in this shipment.
                </span>
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="broker-btn broker-btn-secondary">
                  Cancel
                </button>
                <button onClick={() => handleDeleteDoc(deleteConfirm)} disabled={deleting} className="broker-btn broker-btn-primary">
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
