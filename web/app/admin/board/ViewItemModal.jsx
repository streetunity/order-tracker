"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function ViewItemModal({ item, order, onClose, onUpdate }) {
  const { user, getAuthHeaders } = useAuth();
  const [editedItem, setEditedItem] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isManufacturer = user?.role === "MANUFACTURER";
  const isOrderLocked = order?.isLocked || false;
  
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
      laserWattage: item?.laserWattage || ""
    });
  }, [item]);

  const handleInputChange = (field, value) => {
    setEditedItem(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");

      const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(editedItem)
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

  const handleClose = () => {
    if (saving) return; // Prevent closing while saving
    onClose();
  };

  if (!item) return null;

  return (
    <div className="confirm-overlay" onClick={handleClose}>
      <div className="view-item-modal" onClick={(e) => e.stopPropagation()}>
        <div className="view-item-header">
          <h3>🔍 Item Details</h3>
          <button 
            className="close-button" 
            onClick={handleClose}
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            padding: "12px",
            marginBottom: "16px",
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
            marginBottom: "16px",
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
            marginBottom: "16px",
            backgroundColor: "#eff6ff",
            border: "1px solid #93c5fd",
            borderRadius: "6px",
            color: "#1e40af",
            fontSize: "13px"
          }}>
            ℹ️ <strong>Manufacturer view.</strong> You can only edit the serial number field.
          </div>
        )}

        <div className="view-item-body">
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
            <label>Laser Wattage (Optional)</label>
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

        <div className="view-item-footer">
          <button
            onClick={handleClose}
            disabled={saving}
            className="btn-cancel"
          >
            {hasChanges() ? "Cancel" : "Close"}
          </button>
          {hasChanges() && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-confirm"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  function hasChanges() {
    return (
      editedItem.qty !== item.qty ||
      editedItem.productCode !== (item.productCode || "") ||
      editedItem.modelNumber !== (item.modelNumber || "") ||
      editedItem.serialNumber !== (item.serialNumber || "") ||
      editedItem.voltage !== (item.voltage || "") ||
      editedItem.laserWattage !== (item.laserWattage || "")
    );
  }
}
