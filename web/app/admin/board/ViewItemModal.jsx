"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, XCircle, Circle, Upload, File, Download, Trash2, Ship } from "lucide-react";

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

const REQUIRED_TYPES = ['ISF', 'ARRIVAL_NOTICE', 'BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'DELIVERY_ORDER'];

export function ViewItemModal({ item, order, onClose, onUpdate }) {
  const { user, getAuthHeaders, isAdmin } = useAuth();
  const [editedItem, setEditedItem] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [lockingOrder, setLockingOrder] = useState(false);

  // Tab and document state
  const [activeTab, setActiveTab] = useState("details");
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("ISF");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const fileInputRef = useRef(null);
  
  // Shared shipment document info
  const [isSharedShipment, setIsSharedShipment] = useState(false);
  const [shipmentInfo, setShipmentInfo] = useState(null);

  // Shipping tab state
  const [shipments, setShipments] = useState([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [showCreateShipmentForm, setShowCreateShipmentForm] = useState(false);
  const [createShipmentLoading, setCreateShipmentLoading] = useState(false);
  const [shipmentError, setShipmentError] = useState(null);
  const [newShipment, setNewShipment] = useState({
    containerNumber: "",
    billOfLading: "",
    etaDate: "",
    vesselName: "",
    portOfOrigin: "",
    portOfDestination: ""
  });
  // Local item state to track shipment changes
  const [localItem, setLocalItem] = useState(item);

  const isManufacturer = user?.role === "MANUFACTURER";
  const isBroker = user?.role === "BROKER";
  const isAgent = user?.role === "AGENT";
  const canSeeBrokerLink = user?.role === "SUPER_ADMIN" || user?.role === "BROKER";
  const canManageShipments = isAdmin || isAgent;
  const isOrderLocked = order?.isLocked || false;
  
  // Format ordered date if it exists
  const orderedDate = item?.orderedAt 
    ? new Date(item.orderedAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      })
    : null;
  
  // Brokers cannot edit anything (read-only)
  // Manufacturers can only edit serial number
  // Admin/Agents can edit all fields if order is not locked
  const canEditField = (fieldName) => {
    // Brokers cannot edit anything
    if (isBroker) {
      return false;
    }

    if (fieldName === "serialNumber") {
      // Serial number is always editable by everyone except brokers, even if order is locked
      return true;
    }

    if (isManufacturer) {
      // Manufacturers can ONLY edit serial number
      return false;
    }

    // Admin/Agents can edit if order is not locked
    return !isOrderLocked;
  };

  useEffect(() => {
    // Initialize edited state with current item values
    setEditedItem({
      qty: item?.qty || 1,
      productCode: item?.productCode || "",
      modelNumber: item?.modelNumber || "",
      serialNumber: item?.serialNumber || "",
      voltage: item?.voltage || "",
      laserWattage: item?.laserWattage || "",
      notes: item?.notes || "",
      privateItemNote: item?.privateItemNote || ""
    });
    setLocalItem(item);
  }, [item]);

  const handleInputChange = (field, value) => {
    setEditedItem(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");

      // For manufacturers, ONLY send serialNumber field
      let dataToSend;
      if (isManufacturer) {
        dataToSend = {
          serialNumber: editedItem.serialNumber
        };
      } else {
        // For non-manufacturers, send all edited fields
        dataToSend = editedItem;
      }

      const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(dataToSend)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updatedItem = await res.json();
      
      // Call the parent update callback to refresh the board
      if (onUpdate) {
        await onUpdate();
      }
      
      // Don't close the modal - let user close it manually
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
      setSaving(false);
    }
  };

  const [showAdminOnlyAlert, setShowAdminOnlyAlert] = useState(false);

  const handleLockToggle = () => {
    if (isOrderLocked) {
      // Show unlock dialog with reason requirement
      if (!isAdmin) {
        setShowAdminOnlyAlert(true);
        setTimeout(() => setShowAdminOnlyAlert(false), 3000);
        return;
      }
      setShowUnlockDialog(true);
    } else {
      // Show lock confirmation
      setShowLockConfirm(true);
    }
  };

  const performLock = async () => {
    try {
      setLockingOrder(true);
      setError("");

      const res = await fetch(`/api/orders/${order.id}/lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          locked: true,
          reason: "Order locked for data integrity"
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Refresh the board
      if (onUpdate) {
        await onUpdate();
      }
      
      setShowLockConfirm(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to lock order");
      setLockingOrder(false);
      setShowLockConfirm(false);
    }
  };

  const [showUnlockError, setShowUnlockError] = useState(false);

  const performUnlock = async () => {
    if (unlockReason.trim().length < 10) {
      setShowUnlockError(true);
      setTimeout(() => setShowUnlockError(false), 3000);
      return;
    }

    try {
      setLockingOrder(true);
      setError("");

      const res = await fetch(`/api/orders/${order.id}/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          reason: unlockReason
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Refresh the board
      if (onUpdate) {
        await onUpdate();
      }
      
      setShowUnlockDialog(false);
      setUnlockReason("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlock order");
      setLockingOrder(false);
    }
  };

  const handleClose = () => {
    if (saving || lockingOrder) return; // Prevent closing while saving
    onClose();
  };

  const handleMarkOrdered = async () => {
    try {
      setSaving(true);
      setError("");

      const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          isOrdered: true,
          orderedAt: new Date().toISOString()
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Refresh the board
      if (onUpdate) {
        await onUpdate();
      }
      
      // Don't close the modal - let user close it manually
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark as ordered");
      setSaving(false);
    }
  };

  // Document functions - using Next.js API proxy routes
  const loadDocuments = async () => {
    if (!item?.id) return;
    try {
      setLoadingDocs(true);
      const token = localStorage.getItem('token');
      // Use Next.js API proxy routes instead of calling backend directly
      const endpoint = isManufacturer
        ? `/api/manufacturer/item/${item.id}/documents`
        : `/api/items/${item.id}/documents`;
      const res = await fetch(endpoint, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // API returns { documents, checklist, stats, isSharedShipment, shipmentInfo }
        setDocuments(data.documents || []);
        setIsSharedShipment(data.isSharedShipment || false);
        setShipmentInfo(data.shipmentInfo || null);
      }
    } catch (e) {
      console.error("Failed to load documents:", e);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (activeTab === "documents") {
      loadDocuments();
    }
  }, [activeTab, item?.id]);

  const handleDocumentUpload = async () => {
    if (!selectedFile || !selectedDocType) return;
    try {
      setUploading(true);
      setUploadError("");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", selectedDocType);

      const token = localStorage.getItem('token');
      // Use Next.js API proxy routes instead of calling backend directly
      const endpoint = isManufacturer
        ? `/api/manufacturer/item/${item.id}/documents`
        : `/api/items/${item.id}/documents`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const token = localStorage.getItem('token');
      // Use Next.js API proxy routes instead of calling backend directly
      const endpoint = isManufacturer
        ? `/api/manufacturer/item/${item.id}/documents/${doc.id}/download`
        : `/api/items/${item.id}/documents/${doc.id}/download`;
      const res = await fetch(endpoint, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // API returns { downloadUrl, fileName } - use downloadUrl
        window.open(data.downloadUrl, "_blank");
      }
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      const token = localStorage.getItem('token');
      // Use Next.js API proxy routes instead of calling backend directly
      const endpoint = isManufacturer
        ? `/api/manufacturer/item/${item.id}/documents/${docId}`
        : `/api/items/${item.id}/documents/${docId}`;
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setShowDeleteConfirm(null);
        await loadDocuments();
      }
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  // Calculate checklist
  const getChecklist = () => {
    return REQUIRED_TYPES.map(type => {
      const docs = documents.filter(d => d.documentType === type);
      return { type, label: DOCUMENT_TYPE_LABELS[type], count: docs.length, hasDoc: docs.length > 0 };
    });
  };

  // Shipping tab functions - use /active endpoint to exclude archived shipments
  const loadShipments = async () => {
    try {
      setLoadingShipments(true);
      const res = await fetch("/api/shipments/active", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setShipments(data);
      }
    } catch (err) {
      console.error("Failed to load shipments:", err);
    } finally {
      setLoadingShipments(false);
    }
  };

  useEffect(() => {
    if (activeTab === "shipping" && canManageShipments) {
      loadShipments();
    }
  }, [activeTab]);

  const handleLinkToShipment = async (shipmentId) => {
    if (!shipmentId) return;
    
    setLoadingShipments(true);
    setShipmentError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/link-item`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ itemId: item.id })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to link item");
      }
      
      // Get the shipment details
      const shipmentRes = await fetch(`/api/shipments/${shipmentId}`, {
        headers: getAuthHeaders()
      });
      if (shipmentRes.ok) {
        const shipmentData = await shipmentRes.json();
        setLocalItem(prev => ({ ...prev, shipmentId, shipment: shipmentData }));
      }
      
      if (onUpdate) await onUpdate();
      await loadShipments();
    } catch (err) {
      setShipmentError(err.message);
    } finally {
      setLoadingShipments(false);
    }
  };

  const handleUnlinkShipment = async () => {
    if (!localItem.shipmentId) return;
    
    setLoadingShipments(true);
    setShipmentError(null);
    try {
      const res = await fetch(`/api/shipments/${localItem.shipmentId}/unlink-item`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ itemId: item.id })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to unlink item");
      }
      
      setLocalItem(prev => ({ ...prev, shipmentId: null, shipment: null }));
      if (onUpdate) await onUpdate();
      await loadShipments();
    } catch (err) {
      setShipmentError(err.message);
    } finally {
      setLoadingShipments(false);
    }
  };

  const handleCreateShipment = async (e) => {
    e.preventDefault();
    
    if (!newShipment.containerNumber && !newShipment.billOfLading) {
      setShipmentError("Container number or Bill of Lading is required");
      return;
    }
    
    setCreateShipmentLoading(true);
    setShipmentError(null);
    try {
      // Create the shipment
      const createRes = await fetch("/api/shipments", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newShipment)
      });
      
      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || "Failed to create shipment");
      }
      
      const shipment = await createRes.json();
      
      // Link the current item to it
      const linkRes = await fetch(`/api/shipments/${shipment.id}/link-item`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ itemId: item.id })
      });
      
      if (!linkRes.ok) {
        const data = await linkRes.json();
        throw new Error(data.error || "Shipment created but failed to link item");
      }
      
      // Update local item state
      setLocalItem(prev => ({ ...prev, shipmentId: shipment.id, shipment }));
      
      // Reset form
      setNewShipment({
        containerNumber: "",
        billOfLading: "",
        etaDate: "",
        vesselName: "",
        portOfOrigin: "",
        portOfDestination: ""
      });
      setShowCreateShipmentForm(false);
      if (onUpdate) await onUpdate();
      await loadShipments();
    } catch (err) {
      setShipmentError(err.message);
    } finally {
      setCreateShipmentLoading(false);
    }
  };

  if (!item) return null;

  return (
    <>
      <div className="confirm-overlay" onClick={handleClose}>
        <div className="view-item-modal-wide" onClick={(e) => e.stopPropagation()}>
          <div className="view-item-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h3>🔍 Item Details</h3>
              {localItem?.shipmentId && (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  backgroundColor: "rgba(220, 38, 38, 0.2)",
                  border: "1px solid #dc2626",
                  borderRadius: "4px",
                  fontSize: "11px",
                  color: "#dc2626"
                }}>
                  <Ship size={12} />
                  Shared Shipment
                </span>
              )}
            </div>
            <button 
              className="close-button" 
              onClick={handleClose}
              disabled={saving || lockingOrder}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {error && (
            <div style={{
              padding: "12px",
              margin: "0 1.5rem",
              marginTop: "1rem",
              backgroundColor: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "6px",
              color: "#dc2626",
              fontSize: "14px"
            }}>
              {error}
            </div>
          )}

          {isOrderLocked && !isManufacturer && (
            <div style={{
              padding: "12px",
              margin: "0 1.5rem",
              marginTop: "1rem",
              backgroundColor: "#fef3c7",
              border: "1px solid #fbbf24",
              borderRadius: "6px",
              color: "#92400e",
              fontSize: "13px"
            }}>
              🔒 <strong>Order is locked.</strong> Only serial number can be edited. Unlock the order to edit other fields.
            </div>
          )}

          {isManufacturer && (
            <div style={{
              padding: "12px",
              margin: "0 1.5rem",
              marginTop: "1rem",
              backgroundColor: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "6px",
              color: "#dc2626",
              fontSize: "13px"
            }}>
              ℹ️ <strong>Manufacturer view.</strong> You can edit the serial number and view financial notes.
            </div>
          )}

          {isBroker && (
            <div style={{
              padding: "12px",
              margin: "0 1.5rem",
              marginTop: "1rem",
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "6px",
              color: "#e4e4e4",
              fontSize: "13px"
            }}>
              ℹ️ <strong>Broker view.</strong> You have read-only access and can view the broker documents link.
            </div>
          )}

          {/* Tab Navigation */}
          <div style={{ display: "flex", gap: "8px", margin: "1rem 1.5rem 0" }}>
            <button
              onClick={() => setActiveTab("details")}
              style={{
                padding: "8px 16px",
                background: activeTab === "details" ? "#dc2626" : "#2d2d2d",
                color: "#fff",
                border: activeTab === "details" ? "none" : "1px solid #404040",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500
              }}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              style={{
                padding: "8px 16px",
                background: activeTab === "documents" ? "#dc2626" : "#2d2d2d",
                color: "#fff",
                border: activeTab === "documents" ? "none" : "1px solid #404040",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500
              }}
            >
              Documents
            </button>
            {canManageShipments && (
              <button
                onClick={() => setActiveTab("shipping")}
                style={{
                  padding: "8px 16px",
                  background: activeTab === "shipping" ? "#dc2626" : "#2d2d2d",
                  color: "#fff",
                  border: activeTab === "shipping" ? "none" : "1px solid #404040",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Ship size={14} />
                Shipping
                {localItem?.shipmentId && (
                  <span style={{
                    width: "8px",
                    height: "8px",
                    backgroundColor: "#dc2626",
                    borderRadius: "50%"
                  }} />
                )}
              </button>
            )}
          </div>

          {activeTab === "details" && (
          <div className="view-item-body-wide">
            {/* Left column - Item details */}
            <div className="view-item-left-col">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                <div className="form-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editedItem.qty}
                    onChange={(e) => handleInputChange("qty", parseInt(e.target.value) || 1)}
                    disabled={!canEditField("qty") || saving}
                    className={canEditField("qty") ? "" : "field-readonly"}
                  />
                </div>

                <div className="form-field">
                  <label>Ordered Date</label>
                  <div style={{
                    padding: "10px 12px",
                    background: item?.isOrdered ? "rgba(5, 150, 105, 0.1)" : "rgba(107, 114, 128, 0.1)",
                    border: `1px solid ${item?.isOrdered ? "#059669" : "rgba(107, 114, 128, 0.2)"}`,
                    borderRadius: "6px",
                    color: item?.isOrdered ? "#059669" : "#6b7280",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    {item?.isOrdered ? (
                      <>
                        <span>✓</span>
                        <span>{orderedDate}</span>
                      </>
                    ) : (
                      <span style={{ fontStyle: "italic" }}>Not ordered yet</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-field">
                <label>Item Name / Product Code</label>
                <input
                  type="text"
                  value={editedItem.productCode}
                  onChange={(e) => handleInputChange("productCode", e.target.value)}
                  disabled={!canEditField("productCode") || saving}
                  className={canEditField("productCode") ? "" : "field-readonly"}
                  placeholder="e.g., Laser Cutter XL-2000"
                />
              </div>

              <div className="form-field">
                <label>Model Number</label>
                <input
                  type="text"
                  value={editedItem.modelNumber}
                  onChange={(e) => handleInputChange("modelNumber", e.target.value)}
                  disabled={!canEditField("modelNumber") || saving}
                  className={canEditField("modelNumber") ? "" : "field-readonly"}
                  placeholder="e.g., XL-2000-PRO"
                />
              </div>

              <div className="form-field serial-number-field">
                <label>
                  Serial Number
                  {canEditField("serialNumber") && (
                    <span className="field-badge editable">Always Editable</span>
                  )}
                </label>
                <input
                  type="text"
                  value={editedItem.serialNumber}
                  onChange={(e) => handleInputChange("serialNumber", e.target.value)}
                  disabled={!canEditField("serialNumber") || saving}
                  className={canEditField("serialNumber") ? "" : "field-readonly"}
                  placeholder="e.g., SN123456789"
                />
              </div>

              <div className="form-field">
                <label>Voltage / Power</label>
                <input
                  type="text"
                  value={editedItem.voltage}
                  onChange={(e) => handleInputChange("voltage", e.target.value)}
                  disabled={!canEditField("voltage") || saving}
                  className={canEditField("voltage") ? "" : "field-readonly"}
                  placeholder="e.g., 220V or 110V"
                />
              </div>

              <div className="form-field">
                <label>Power</label>
                <input
                  type="text"
                  value={editedItem.laserWattage}
                  onChange={(e) => handleInputChange("laserWattage", e.target.value)}
                  disabled={!canEditField("laserWattage") || saving}
                  className={canEditField("laserWattage") ? "" : "field-readonly"}
                  placeholder="e.g., 100W"
                />
              </div>
            </div>

            {/* Right column - Notes */}
            <div className="view-item-right-col">
              <div className="form-field">
                <label>Public Notes</label>
                <textarea
                  value={editedItem.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  disabled={!canEditField("notes") || saving}
                  className={canEditField("notes") ? "" : "field-readonly"}
                  placeholder="Add any public notes about this item..."
                  rows={8}
                  style={{
                    padding: "10px 12px",
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text)",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    resize: "vertical",
                    minHeight: "180px",
                    height: "180px"
                  }}
                />
              </div>

              <div className="form-field">
                <label>Financial Notes (Internal)</label>
                <textarea
                  value={editedItem.privateItemNote}
                  onChange={(e) => handleInputChange("privateItemNote", e.target.value)}
                  disabled={isManufacturer ? true : (!canEditField("privateItemNote") || saving)}
                  className={isManufacturer || !canEditField("privateItemNote") ? "field-readonly" : ""}
                  placeholder="Internal financial notes (manufacturers can view but not edit)..."
                  rows={8}
                  style={{
                    padding: "10px 12px",
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text)",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    resize: "vertical",
                    minHeight: "180px",
                    height: "180px"
                  }}
                />
              </div>

              {canSeeBrokerLink && (
                <div style={{
                  padding: "12px",
                  backgroundColor: "#1f1f1f",
                  border: "1px solid #404040",
                  borderRadius: "6px",
                  fontSize: "13px",
                  marginTop: "1rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>📎</span>
                    <strong style={{ color: "#e4e4e4" }}>Broker Documents</strong>
                  </div>
                  {order?.brokerDocsLink ? (
                    <a
                      href={order.brokerDocsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#dc2626",
                        textDecoration: "underline",
                        fontSize: "12px",
                        wordBreak: "break-all"
                      }}
                    >
                      {order.brokerDocsLink}
                    </a>
                  ) : (
                    <span style={{ fontSize: "12px", color: "#a0a0a0", fontStyle: "italic" }}>
                      No broker documents link set. {user?.role === "SUPER_ADMIN" && "Edit this order to add a link."}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <div style={{ padding: "1.5rem", maxHeight: "60vh", overflowY: "auto" }}>
              {loadingDocs ? (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Loading documents...</div>
              ) : (
                <>
                  {/* Shared Shipment Notice */}
                  {isSharedShipment && shipmentInfo && (
                    <div style={{
                      padding: "12px",
                      marginBottom: "16px",
                      backgroundColor: "rgba(220, 38, 38, 0.1)",
                      border: "1px solid #dc2626",
                      borderRadius: "6px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <Ship size={18} color="#dc2626" />
                        <strong style={{ color: "#dc2626" }}>Shared Shipment Documents</strong>
                      </div>
                      <p style={{ fontSize: "13px", color: "#e4e4e4", margin: "0 0 8px 0" }}>
                        This item is part of a shared shipment. Some documents may be shared with other items.
                      </p>
                      <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                        <div><strong>Container:</strong> {shipmentInfo.containerNumber || '—'}</div>
                        {shipmentInfo.billOfLading && (
                          <div><strong>BOL:</strong> {shipmentInfo.billOfLading}</div>
                        )}
                        {shipmentInfo.linkedItems && shipmentInfo.linkedItems.length > 0 && (
                          <div style={{ marginTop: "4px" }}>
                            <strong>Also in this shipment:</strong>{' '}
                            {shipmentInfo.linkedItems.map(i => i.productCode || 'Item').join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Checklist */}
                  <div style={{ background: "#252525", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                      <span style={{ fontWeight: 600, color: "#fff" }}>Document Checklist</span>
                      <span style={{ color: "#9ca3af", fontSize: "13px" }}>
                        {getChecklist().filter(c => c.hasDoc).length}/{REQUIRED_TYPES.length} Complete
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {getChecklist().map(item => (
                        <div key={item.type} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "#1a1a1a", borderRadius: "6px" }}>
                          {item.hasDoc ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                          <span style={{ flex: 1, fontSize: "13px", color: "#e5e7eb" }}>{item.label}</span>
                          {item.count > 0 && <span style={{ fontSize: "12px", color: "#9ca3af" }}>{item.count} file(s)</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Upload Section */}
                  <div style={{ background: "#252525", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600, color: "#fff" }}>Upload Document</h4>
                    {uploadError && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>
                        {uploadError}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{
                          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                          padding: "16px", border: `2px dashed ${isDragging ? "#dc2626" : selectedFile ? "#22c55e" : "#404040"}`,
                          borderRadius: "6px", color: selectedFile ? "#22c55e" : "#9ca3af", fontSize: "13px", cursor: "pointer",
                          background: isDragging ? "rgba(220, 38, 38, 0.05)" : selectedFile ? "rgba(34, 197, 94, 0.05)" : "transparent"
                        }}
                      >
                        <Upload size={16} />
                        {selectedFile ? selectedFile.name : "Drop file or click to browse"}
                      </div>
                      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => setSelectedFile(e.target.files[0])} />
                      <select
                        value={selectedDocType}
                        onChange={(e) => setSelectedDocType(e.target.value)}
                        style={{ flex: "0 0 250px", padding: "10px 12px", background: "#1a1a1a", border: "1px solid #404040", borderRadius: "6px", color: "#fff", fontSize: "13px" }}
                      >
                        {REQUIRED_TYPES.map(type => (
                          <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={handleDocumentUpload}
                        disabled={!selectedFile || uploading}
                        style={{
                          padding: "10px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px",
                          fontSize: "13px", fontWeight: 500, cursor: (!selectedFile || uploading) ? "not-allowed" : "pointer",
                          opacity: (!selectedFile || uploading) ? 0.5 : 1
                        }}
                      >
                        {uploading ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>

                  {/* Documents List */}
                  <div style={{ background: "#252525", borderRadius: "8px", overflow: "hidden" }}>
                    <h4 style={{ margin: 0, padding: "16px", borderBottom: "1px solid #404040", fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                      Uploaded Documents ({documents.length})
                    </h4>
                    {documents.length === 0 ? (
                      <div style={{ padding: "30px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>No documents uploaded yet</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {documents.map(doc => (
                          <div key={doc.id} style={{ 
                            display: "flex", 
                            alignItems: "flex-start", 
                            gap: "12px", 
                            padding: "14px 16px", 
                            borderBottom: "1px solid #404040",
                            borderLeft: doc.isShipmentDocument ? "3px solid #dc2626" : "none"
                          }}>
                            <File size={18} color="#9ca3af" style={{ marginTop: "2px" }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", marginBottom: "4px", wordBreak: "break-word" }}>
                                {doc.fileName}
                                {doc.isShipmentDocument && (
                                  <span style={{
                                    marginLeft: "8px",
                                    padding: "1px 6px",
                                    backgroundColor: "rgba(220, 38, 38, 0.2)",
                                    borderRadius: "3px",
                                    fontSize: "10px",
                                    color: "#dc2626"
                                  }}>
                                    Shared
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "12px", color: "#dc2626", marginBottom: "4px" }}>{DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}</div>
                              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                {(doc.fileSize / 1024).toFixed(1)} KB • {new Date(doc.uploadedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button onClick={() => handleDownload(doc)} style={{ padding: "8px", background: "transparent", border: "1px solid #404040", borderRadius: "6px", color: "#9ca3af", cursor: "pointer" }}>
                                <Download size={14} />
                              </button>
                              <button onClick={() => setShowDeleteConfirm(doc)} style={{ padding: "8px", background: "transparent", border: "1px solid #404040", borderRadius: "6px", color: "#9ca3af", cursor: "pointer" }}>
                                <Trash2 size={14} />
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

          {/* Shipping Tab */}
          {activeTab === "shipping" && canManageShipments && (
            <div style={{ padding: "1.5rem", maxHeight: "60vh", overflowY: "auto" }}>
              {loadingShipments ? (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Loading...</div>
              ) : localItem?.shipmentId && localItem?.shipment ? (
                // Item is linked to a shipment
                <div style={{
                  padding: "20px",
                  backgroundColor: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  borderRadius: "8px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <Ship size={20} color="#dc2626" />
                        <span style={{ fontWeight: "600", fontSize: "16px", color: "#dc2626" }}>Linked to Shared Shipment</span>
                      </div>
                      <p style={{ fontSize: "13px", color: "#e4e4e4", margin: 0 }}>
                        This item is sharing shipping documents with other items in the same container.
                      </p>
                    </div>
                    <button
                      onClick={handleUnlinkShipment}
                      disabled={loadingShipments}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        backgroundColor: "transparent",
                        border: "1px solid #ef4444",
                        color: "#ef4444",
                        borderRadius: "6px",
                        cursor: loadingShipments ? "not-allowed" : "pointer",
                        opacity: loadingShipments ? 0.5 : 1
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                  
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "1fr 1fr", 
                    gap: "16px",
                    padding: "16px",
                    backgroundColor: "#1f1f1f",
                    borderRadius: "6px"
                  }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>Container Number</div>
                      <div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.containerNumber || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>Bill of Lading</div>
                      <div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.billOfLading || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>Vessel Name</div>
                      <div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.vesselName || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>ETA</div>
                      <div style={{ fontSize: "14px", color: "#fff" }}>
                        {localItem.shipment.etaDate ? new Date(localItem.shipment.etaDate).toLocaleDateString() : "—"}
                      </div>
                    </div>
                  </div>
                  
                  {localItem.shipment.items && localItem.shipment.items.length > 1 && (
                    <div style={{ marginTop: "16px" }}>
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>Other items in this shipment:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {localItem.shipment.items
                          .filter(i => i.id !== item.id)
                          .map(i => (
                            <span key={i.id} style={{
                              padding: "4px 10px",
                              backgroundColor: "#2d2d2d",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              fontSize: "12px",
                              color: "#e4e4e4"
                            }}>
                              {i.productCode || "Unnamed Item"}
                            </span>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Item not linked - show link/create options
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600, color: "#fff" }}>
                      <Ship size={18} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                      Shared Shipment
                    </h4>
                    <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>
                      Link this item to a shared shipment when multiple items are shipping in the same container.
                      Documents uploaded to the shipment will be shared across all linked items.
                    </p>
                  </div>

                  {shipmentError && (
                    <div style={{
                      padding: "12px",
                      marginBottom: "16px",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "6px",
                      color: "#ef4444",
                      fontSize: "13px"
                    }}>
                      {shipmentError}
                    </div>
                  )}

                  {!showCreateShipmentForm ? (
                    <div style={{
                      padding: "20px",
                      backgroundColor: "#252525",
                      borderRadius: "8px"
                    }}>
                      <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", fontSize: "13px", color: "#e4e4e4", marginBottom: "8px" }}>
                          Link to existing shipment:
                        </label>
                        <select
                          onChange={(e) => handleLinkToShipment(e.target.value)}
                          disabled={loadingShipments}
                          defaultValue=""
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            fontSize: "14px",
                            backgroundColor: "#1f1f1f",
                            border: "1px solid #404040",
                            borderRadius: "6px",
                            color: "#fff"
                          }}
                        >
                          <option value="">Select a shipment...</option>
                          {shipments.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.containerNumber || s.billOfLading} ({s._count?.items || 0} items)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                        <div style={{ flex: 1, height: "1px", backgroundColor: "#404040" }} />
                        <span style={{ color: "#6b7280", fontSize: "13px" }}>or</span>
                        <div style={{ flex: 1, height: "1px", backgroundColor: "#404040" }} />
                      </div>

                      <button
                        onClick={() => setShowCreateShipmentForm(true)}
                        style={{
                          width: "100%",
                          padding: "12px",
                          fontSize: "14px",
                          backgroundColor: "#dc2626",
                          border: "none",
                          color: "#fff",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontWeight: 500
                        }}
                      >
                        + Create New Shipment
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateShipment} style={{
                      padding: "20px",
                      backgroundColor: "#252525",
                      borderRadius: "8px"
                    }}>
                      <h5 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                        Create New Shipment
                      </h5>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                            Container Number *
                          </label>
                          <input
                            type="text"
                            value={newShipment.containerNumber}
                            onChange={(e) => setNewShipment(s => ({ ...s, containerNumber: e.target.value }))}
                            placeholder="e.g., MSKU1234567"
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              fontSize: "14px",
                              backgroundColor: "#1f1f1f",
                              border: "1px solid #404040",
                              borderRadius: "6px",
                              color: "#fff"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                            Bill of Lading *
                          </label>
                          <input
                            type="text"
                            value={newShipment.billOfLading}
                            onChange={(e) => setNewShipment(s => ({ ...s, billOfLading: e.target.value }))}
                            placeholder="e.g., BOL-2024-ABC"
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              fontSize: "14px",
                              backgroundColor: "#1f1f1f",
                              border: "1px solid #404040",
                              borderRadius: "6px",
                              color: "#fff"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                            ETA Date
                          </label>
                          <input
                            type="date"
                            value={newShipment.etaDate}
                            onChange={(e) => setNewShipment(s => ({ ...s, etaDate: e.target.value }))}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              fontSize: "14px",
                              backgroundColor: "#1f1f1f",
                              border: "1px solid #404040",
                              borderRadius: "6px",
                              color: "#fff"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                            Vessel Name
                          </label>
                          <input
                            type="text"
                            value={newShipment.vesselName}
                            onChange={(e) => setNewShipment(s => ({ ...s, vesselName: e.target.value }))}
                            placeholder="e.g., Ever Given"
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              fontSize: "14px",
                              backgroundColor: "#1f1f1f",
                              border: "1px solid #404040",
                              borderRadius: "6px",
                              color: "#fff"
                            }}
                          />
                        </div>
                      </div>
                      
                      <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "16px" }}>
                        * At least one of Container Number or Bill of Lading is required
                      </p>
                      
                      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => setShowCreateShipmentForm(false)}
                          style={{
                            padding: "10px 20px",
                            fontSize: "14px",
                            backgroundColor: "transparent",
                            border: "1px solid #404040",
                            color: "#9ca3af",
                            borderRadius: "6px",
                            cursor: "pointer"
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={createShipmentLoading}
                          style={{
                            padding: "10px 20px",
                            fontSize: "14px",
                            backgroundColor: "#dc2626",
                            border: "none",
                            color: "#fff",
                            borderRadius: "6px",
                            cursor: createShipmentLoading ? "not-allowed" : "pointer",
                            opacity: createShipmentLoading ? 0.7 : 1,
                            fontWeight: 500
                          }}
                        >
                          {createShipmentLoading ? "Creating..." : "Create & Link"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="view-item-footer">
            <div style={{ display: "flex", gap: "0.5rem", marginRight: "auto" }}>
              {!isManufacturer && !isBroker && (
                <button
                  onClick={handleLockToggle}
                  disabled={saving || lockingOrder}
                  className="btn-lock"
                  style={{
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "opacity 0.2s"
                  }}
                >
                  {lockingOrder ? "..." : (isOrderLocked ? "🔓 Unlock Order" : "🔒 Lock Order")}
                </button>
              )}

              {!isManufacturer && !isBroker && !item?.isOrdered && (
                <button
                  onClick={handleMarkOrdered}
                  disabled={saving}
                  className="btn-ordered"
                  style={{
                    background: "#16a34a",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "opacity 0.2s"
                  }}
                >
                  {saving ? "..." : "$ Mark as Ordered"}
                </button>
              )}
            </div>

            <button
              onClick={handleClose}
              disabled={saving || lockingOrder}
              className="btn-cancel"
            >
              {hasChanges() ? "Cancel" : "Close"}
            </button>
            {hasChanges() && !isBroker && (
              <button
                onClick={handleSave}
                disabled={saving || lockingOrder}
                className="btn-confirm"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lock Confirmation Dialog */}
      {showLockConfirm && (
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
            zIndex: 1100
          }}
          onClick={() => !lockingOrder && setShowLockConfirm(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              🔒 Lock Order?
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Are you sure you've finished editing <strong>ALL items</strong> on this order?
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#f59e0b" }}>
                <strong>What will happen:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
                <li>Most item details will become read-only</li>
                <li>Only serial numbers will remain editable</li>
                <li>You can unlock the order later if needed</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => setShowLockConfirm(false)}
                disabled={lockingOrder}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: lockingOrder ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: lockingOrder ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={performLock}
                disabled={lockingOrder}
                style={{
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: lockingOrder ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: lockingOrder ? 0.5 : 1
                }}
              >
                {lockingOrder ? "Locking..." : "Lock Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Reason Dialog */}
      {showUnlockDialog && isAdmin && (
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
            zIndex: 1100
          }}
          onClick={() => !lockingOrder && setShowUnlockDialog(false)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
              🔓 Unlock Order
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
              Please provide a reason for unlocking this order. This will be logged in the audit trail.
            </p>
            <div style={{
              padding: "1rem",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0", fontSize: "14px", color: "#f59e0b" }}>
                <strong>Note:</strong> This action will be recorded in the order's audit log.
              </p>
            </div>
            <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}>
              <strong>Reason:</strong>
            </p>
            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Enter reason for unlocking (minimum 10 characters)"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "10px",
                background: "#252525",
                border: "1px solid #404040",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "14px",
                marginBottom: "1rem",
                fontFamily: "inherit",
                resize: "vertical"
              }}
            />
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                onClick={() => {
                  setShowUnlockDialog(false);
                  setUnlockReason("");
                }}
                disabled={lockingOrder}
                style={{
                  background: "#2d2d2d",
                  color: "#fff",
                  border: "1px solid #404040",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: lockingOrder ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: lockingOrder ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={performUnlock}
                disabled={lockingOrder || unlockReason.trim().length < 10}
                style={{
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "6px",
                  cursor: (lockingOrder || unlockReason.trim().length < 10) ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: (lockingOrder || unlockReason.trim().length < 10) ? 0.5 : 1
                }}
              >
                {lockingOrder ? "Unlocking..." : "Unlock Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Only Alert */}
      {showAdminOnlyAlert && (
        <div
          style={{
            position: "fixed",
            top: "100px",
            right: "24px",
            backgroundColor: "#1f1f1f",
            border: "1px solid #404040",
            borderRadius: "8px",
            padding: "1rem 1.5rem",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            zIndex: 1200,
            maxWidth: "400px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <span style={{ color: "#d1d5db", fontSize: "14px" }}>Only administrators can unlock orders.</span>
          </div>
        </div>
      )}

      {/* Unlock Error Alert */}
      {showUnlockError && (
        <div
          style={{
            position: "fixed",
            top: "100px",
            right: "24px",
            backgroundColor: "#1f1f1f",
            border: "1px solid #404040",
            borderRadius: "8px",
            padding: "1rem 1.5rem",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            zIndex: 1200,
            maxWidth: "400px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <span style={{ color: "#d1d5db", fontSize: "14px" }}>Please provide a reason with at least 10 characters</span>
          </div>
        </div>
      )}

      {/* Delete Document Confirmation */}
      {showDeleteConfirm && (
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
            zIndex: 1100
          }}
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "400px",
              width: "90%"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fff", margin: "0 0 1rem 0" }}>Delete Document?</h3>
            <p style={{ fontSize: "14px", color: "#d1d5db", marginBottom: "1rem" }}>
              This action cannot be undone. The document will be permanently deleted.
            </p>
            {showDeleteConfirm.isShipmentDocument && (
              <div style={{
                padding: '10px',
                marginBottom: '16px',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid #dc2626',
                borderRadius: '6px'
              }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>
                  <strong>Warning:</strong> This is a shared shipment document. Deleting it will remove it from all items in this shipment.
                </p>
              </div>
            )}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDoc(showDeleteConfirm.id)}
                style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function hasChanges() {
    // For manufacturers, only check if serial number changed
    if (isManufacturer) {
      return editedItem.serialNumber !== (item.serialNumber || "");
    }
    
    // For non-manufacturers, check all fields
    return (
      editedItem.qty !== item.qty ||
      editedItem.productCode !== (item.productCode || "") ||
      editedItem.modelNumber !== (item.modelNumber || "") ||
      editedItem.serialNumber !== (item.serialNumber || "") ||
      editedItem.voltage !== (item.voltage || "") ||
      editedItem.laserWattage !== (item.laserWattage || "") ||
      editedItem.notes !== (item.notes || "") ||
      editedItem.privateItemNote !== (item.privateItemNote || "")
    );
  }
}
