"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function ViewItemModal({ item, order, onClose, onUpdate }) {
  const { user, getAuthHeaders, isAdmin } = useAuth();
  const [editedItem, setEditedItem] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [lockingOrder, setLockingOrder] = useState(false);

  const isManufacturer = user?.role === "MANUFACTURER";
  const isOrderLocked = order?.isLocked || false;
  
  // Format ordered date if it exists
  const orderedDate = item?.orderedAt 
    ? new Date(item.orderedAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      })
    : null;
  
  // Manufacturers can only edit serial number
  // Admin/Agents can edit all fields if order is not locked
  const canEditField = (fieldName) => {
    if (fieldName === "serialNumber") {
      // Serial number is always editable by everyone, even if order is locked
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
      
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
      setSaving(false);
    }
  };

  const handleLockToggle = () => {
    if (isOrderLocked) {
      // Show unlock dialog with reason requirement
      if (!isAdmin) {
        alert("Only administrators can unlock orders.");
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

  const performUnlock = async () => {
    if (unlockReason.trim().length < 10) {
      alert("Please provide a reason with at least 10 characters");
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
      
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark as ordered");
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <>
      <div className="confirm-overlay" onClick={handleClose}>
        <div className="view-item-modal-wide" onClick={(e) => e.stopPropagation()}>
          <div className="view-item-header">
            <h3>🔍 Item Details</h3>
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
            </div>
          </div>

          <div className="view-item-footer">
            <div style={{ display: "flex", gap: "0.5rem", marginRight: "auto" }}>
              {!isManufacturer && (
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
              
              {!isManufacturer && !item?.isOrdered && (
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
            {hasChanges() && (
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
        <div className="confirm-overlay" onClick={() => !lockingOrder && setShowLockConfirm(false)} style={{ zIndex: 1100 }}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 Lock Order?</h3>
            <p style={{ fontSize: "16px", marginBottom: "1rem" }}>
              Are you sure you've finished editing <strong>ALL items</strong> on this order?
            </p>
            <div style={{ 
              padding: "1rem", 
              backgroundColor: "rgba(255, 170, 0, 0.1)", 
              border: "1px solid rgba(255, 170, 0, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>
                <strong>What will happen:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "14px" }}>
                <li>Most item details will become read-only</li>
                <li>Only serial numbers will remain editable</li>
                <li>You can unlock the order later if needed</li>
              </ul>
            </div>
            <div className="confirm-actions">
              <button 
                onClick={() => setShowLockConfirm(false)} 
                className="btn-cancel"
                disabled={lockingOrder}
              >
                Cancel
              </button>
              <button 
                onClick={performLock} 
                disabled={lockingOrder}
                className="btn-confirm"
                style={{ backgroundColor: "#dc2626" }}
              >
                {lockingOrder ? "Locking..." : "Lock Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Reason Dialog */}
      {showUnlockDialog && isAdmin && (
        <div className="confirm-overlay" onClick={() => !lockingOrder && setShowUnlockDialog(false)} style={{ zIndex: 1100 }}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>🔓 Unlock Order</h3>
            <p style={{ fontSize: "16px", marginBottom: "1rem", color: "var(--text-dim)" }}>
              Please provide a reason for unlocking this order. This will be logged in the audit trail.
            </p>
            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Enter reason for unlocking (minimum 10 characters)"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                marginBottom: "16px",
                fontSize: "14px",
                fontFamily: "inherit",
                backgroundColor: "var(--input-bg)",
                color: "var(--text)",
                resize: "vertical"
              }}
            />
            <div className="confirm-actions">
              <button 
                onClick={() => {
                  setShowUnlockDialog(false);
                  setUnlockReason("");
                }} 
                className="btn-cancel"
                disabled={lockingOrder}
              >
                Cancel
              </button>
              <button 
                onClick={performUnlock} 
                disabled={lockingOrder || unlockReason.trim().length < 10}
                className="btn-confirm"
                style={{ backgroundColor: "#dc2626" }}
              >
                {lockingOrder ? "Unlocking..." : "Unlock Order"}
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
