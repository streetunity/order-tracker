"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, XCircle, Upload, File, Download, Trash2, Ship } from "lucide-react";

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
  OTHER: 'Other',
};

const REQUIRED_TYPES = ['ISF', 'ARRIVAL_NOTICE', 'BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'DELIVERY_ORDER'];

export default function BrokerDocumentsTab({ item, isManufacturer, getAuthHeaders, onSetDeleteConfirm }) {
  const [documents,        setDocuments]        = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [selectedDocType,  setSelectedDocType]  = useState("ISF");
  const [selectedFile,     setSelectedFile]     = useState(null);
  const [uploading,        setUploading]        = useState(false);
  const [uploadError,      setUploadError]      = useState("");
  const [isDragging,       setIsDragging]       = useState(false);
  const [isSharedShipment, setIsSharedShipment] = useState(false);
  const [shipmentInfo,     setShipmentInfo]     = useState(null);
  const fileInputRef = useRef(null);

  const loadDocuments = async () => {
    if (!item?.id) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const endpoint = isManufacturer
        ? `/api/manufacturer/item/${item.id}/documents`
        : `/api/items/${item.id}/documents`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        setIsSharedShipment(data.isSharedShipment || false);
        setShipmentInfo(data.shipmentInfo || null);
      }
    } catch (e) { console.error("Failed to load documents:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDocuments(); }, [item?.id]);

  const handleUpload = async () => {
    if (!selectedFile || !selectedDocType) return;
    try {
      setUploading(true); setUploadError("");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", selectedDocType);
      const token = localStorage.getItem('token');
      const endpoint = isManufacturer ? `/api/manufacturer/item/${item.id}/documents` : `/api/items/${item.id}/documents`;
      const res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Upload failed"); }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
    } catch (e) { setUploadError(e.message); }
    finally { setUploading(false); }
  };

  const handleDownload = async (doc) => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = isManufacturer ? `/api/manufacturer/item/${item.id}/documents/${doc.id}/download` : `/api/items/${item.id}/documents/${doc.id}/download`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); window.open(data.downloadUrl, "_blank"); }
    } catch (e) { console.error("Download failed:", e); }
  };

  const handleDelete = async (docId) => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = isManufacturer ? `/api/manufacturer/item/${item.id}/documents/${docId}` : `/api/items/${item.id}/documents/${docId}`;
      const res = await fetch(endpoint, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { onSetDeleteConfirm(null); await loadDocuments(); }
    } catch (e) { console.error("Delete failed:", e); }
  };

  const checklist = REQUIRED_TYPES.map(type => {
    const docs = documents.filter(d => d.documentType === type);
    return { type, label: DOCUMENT_TYPE_LABELS[type], count: docs.length, hasDoc: docs.length > 0 };
  });

  if (loading) return <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Loading documents...</div>;

  return (
    <div style={{ padding: "1.5rem", maxHeight: "60vh", overflowY: "auto" }}>

      {/* Shared shipment notice */}
      {isSharedShipment && shipmentInfo && (
        <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "rgba(220,38,38,0.1)", border: "1px solid #dc2626", borderRadius: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}><Ship size={18} color="#dc2626" /><strong style={{ color: "#dc2626" }}>Shared Shipment Documents</strong></div>
          <p style={{ fontSize: "13px", color: "#e4e4e4", margin: "0 0 8px 0" }}>This item is part of a shared shipment. Some documents may be shared with other items.</p>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            <div><strong>Container:</strong> {shipmentInfo.containerNumber || '—'}</div>
            {shipmentInfo.billOfLading && <div><strong>BOL:</strong> {shipmentInfo.billOfLading}</div>}
            {shipmentInfo.linkedItems?.length > 0 && <div style={{ marginTop: "4px" }}><strong>Also in this shipment:</strong> {shipmentInfo.linkedItems.map(i => i.productCode || 'Item').join(', ')}</div>}
          </div>
        </div>
      )}

      {/* Checklist */}
      <div style={{ background: "#252525", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontWeight: 600, color: "#fff" }}>Document Checklist</span>
          <span style={{ color: "#9ca3af", fontSize: "13px" }}>{checklist.filter(c => c.hasDoc).length}/{REQUIRED_TYPES.length} Complete</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {checklist.map(c => (
            <div key={c.type} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "#1a1a1a", borderRadius: "6px" }}>
              {c.hasDoc ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
              <span style={{ flex: 1, fontSize: "13px", color: "#e5e7eb" }}>{c.label}</span>
              {c.count > 0 && <span style={{ fontSize: "12px", color: "#9ca3af" }}>{c.count} file(s)</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Upload */}
      <div style={{ background: "#252525", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600, color: "#fff" }}>Upload Document</h4>
        {uploadError && <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{uploadError}</div>}
        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); }}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "16px", border: `2px dashed ${isDragging ? "#dc2626" : selectedFile ? "#22c55e" : "#404040"}`, borderRadius: "6px", color: selectedFile ? "#22c55e" : "#9ca3af", fontSize: "13px", cursor: "pointer", background: isDragging ? "rgba(220,38,38,0.05)" : selectedFile ? "rgba(34,197,94,0.05)" : "transparent" }}
          >
            <Upload size={16} />{selectedFile ? selectedFile.name : "Drop file or click to browse"}
          </div>
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => setSelectedFile(e.target.files[0])} />
          <select value={selectedDocType} onChange={(e) => setSelectedDocType(e.target.value)} style={{ flex: "0 0 250px", padding: "10px 12px", background: "#1a1a1a", border: "1px solid #404040", borderRadius: "6px", color: "#fff", fontSize: "13px" }}>
            {REQUIRED_TYPES.map(type => <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleUpload} disabled={!selectedFile || uploading} style={{ padding: "10px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: (!selectedFile || uploading) ? "not-allowed" : "pointer", opacity: (!selectedFile || uploading) ? 0.5 : 1 }}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      {/* Document list */}
      <div style={{ background: "#252525", borderRadius: "8px", overflow: "hidden" }}>
        <h4 style={{ margin: 0, padding: "16px", borderBottom: "1px solid #404040", fontSize: "14px", fontWeight: 600, color: "#fff" }}>Uploaded Documents ({documents.length})</h4>
        {documents.length === 0
          ? <div style={{ padding: "30px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>No documents uploaded yet</div>
          : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {documents.map(doc => (
                <div key={doc.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", borderBottom: "1px solid #404040", borderLeft: doc.isShipmentDocument ? "3px solid #dc2626" : "none" }}>
                  <File size={18} color="#9ca3af" style={{ marginTop: "2px" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", marginBottom: "4px", wordBreak: "break-word" }}>
                      {doc.fileName}
                      {doc.isShipmentDocument && <span style={{ marginLeft: "8px", padding: "1px 6px", backgroundColor: "rgba(220,38,38,0.2)", borderRadius: "3px", fontSize: "10px", color: "#dc2626" }}>Shared</span>}
                    </div>
                    <div style={{ fontSize: "12px", color: "#dc2626", marginBottom: "4px" }}>{DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{(doc.fileSize / 1024).toFixed(1)} KB • {new Date(doc.uploadedAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => handleDownload(doc)} style={{ padding: "8px", background: "transparent", border: "1px solid #404040", borderRadius: "6px", color: "#9ca3af", cursor: "pointer" }}><Download size={14} /></button>
                    <button onClick={() => onSetDeleteConfirm({ ...doc, _onConfirm: () => handleDelete(doc.id) })} style={{ padding: "8px", background: "transparent", border: "1px solid #404040", borderRadius: "6px", color: "#9ca3af", cursor: "pointer" }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}
