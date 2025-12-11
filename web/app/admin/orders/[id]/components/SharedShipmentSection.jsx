"use client";

import { useState, useEffect } from "react";

/**
 * SharedShipmentSection - Component for linking items to shared shipments
 * Can be used in item edit forms to create/link/unlink shipments
 */
export default function SharedShipmentSection({ 
  item, 
  onShipmentChange,
  disabled = false,
  getAuthHeaders 
}) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // New shipment form
  const [newShipment, setNewShipment] = useState({
    containerNumber: "",
    billOfLading: "",
    etaDate: "",
    vesselName: "",
    portOfOrigin: "",
    portOfDestination: ""
  });

  // Load existing shipments for dropdown
  useEffect(() => {
    loadShipments();
  }, []);

  async function loadShipments() {
    try {
      // Use /active endpoint to exclude archived shipments from dropdown
      const res = await fetch("/api/shipments/active", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setShipments(data);
      }
    } catch (err) {
      console.error("Failed to load shipments:", err);
    }
  }

  async function handleLinkToShipment(shipmentId) {
    if (!shipmentId) return;
    
    setLoading(true);
    setError(null);
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
      
      // Notify parent to refresh
      if (onShipmentChange) onShipmentChange();
      await loadShipments();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    if (!item.shipmentId) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${item.shipmentId}/unlink-item`, {
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
      
      if (onShipmentChange) onShipmentChange();
      await loadShipments();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateShipment(e) {
    e.preventDefault();
    
    if (!newShipment.containerNumber && !newShipment.billOfLading) {
      setError("Container number or Bill of Lading is required");
      return;
    }
    
    setCreateLoading(true);
    setError(null);
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
      
      // Reset form and refresh
      setNewShipment({
        containerNumber: "",
        billOfLading: "",
        etaDate: "",
        vesselName: "",
        portOfOrigin: "",
        portOfDestination: ""
      });
      setShowCreateForm(false);
      if (onShipmentChange) onShipmentChange();
      await loadShipments();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  // If item is already linked to a shipment
  if (item.shipmentId && item.shipment) {
    const shipment = item.shipment;
    const otherItemCount = (shipment._count?.items || shipment.items?.length || 1) - 1;
    
    return (
      <div style={{
        padding: "12px",
        backgroundColor: "rgba(220, 38, 38, 0.1)",
        border: "1px solid rgba(220, 38, 38, 0.3)",
        borderRadius: "6px",
        marginTop: "8px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px",
              marginBottom: "4px"
            }}>
              <span style={{ fontSize: "16px" }}>🔗</span>
              <span style={{ fontWeight: "600", color: "#dc2626" }}>Shared Shipment</span>
              {otherItemCount > 0 && (
                <span style={{ 
                  fontSize: "11px", 
                  backgroundColor: "#dc2626", 
                  color: "#fff", 
                  padding: "2px 6px", 
                  borderRadius: "10px" 
                }}>
                  +{otherItemCount} other item{otherItemCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#9ca3af" }}>
              {shipment.containerNumber && (
                <span style={{ marginRight: "12px" }}>
                  <strong>Container:</strong> {shipment.containerNumber}
                </span>
              )}
              {shipment.billOfLading && (
                <span>
                  <strong>BOL:</strong> {shipment.billOfLading}
                </span>
              )}
            </div>
            {shipment.items && shipment.items.length > 1 && (
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                Items: {shipment.items.map(i => i.productCode).join(", ")}
              </div>
            )}
          </div>
          <button
            onClick={handleUnlink}
            disabled={disabled || loading}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              backgroundColor: "transparent",
              border: "1px solid #ef4444",
              color: "#ef4444",
              borderRadius: "4px",
              cursor: disabled || loading ? "not-allowed" : "pointer",
              opacity: disabled || loading ? 0.5 : 1
            }}
          >
            {loading ? "..." : "Unlink"}
          </button>
        </div>
        {error && (
          <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>{error}</div>
        )}
      </div>
    );
  }

  // Item not linked - show link/create options
  return (
    <div style={{
      padding: "12px",
      backgroundColor: "rgba(75, 85, 99, 0.2)",
      border: "1px solid rgba(75, 85, 99, 0.3)",
      borderRadius: "6px",
      marginTop: "8px"
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "8px",
        marginBottom: "8px"
      }}>
        <span style={{ fontSize: "14px" }}>📦</span>
        <span style={{ fontWeight: "500", fontSize: "13px" }}>Shared Shipment</span>
        <span style={{ fontSize: "11px", color: "#9ca3af" }}>
          (Link items shipping in the same container)
        </span>
      </div>

      {!showCreateForm ? (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            onChange={(e) => handleLinkToShipment(e.target.value)}
            disabled={disabled || loading}
            defaultValue=""
            style={{
              padding: "6px 10px",
              fontSize: "12px",
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "4px",
              color: "#fff",
              minWidth: "200px"
            }}
          >
            <option value="">Link to existing shipment...</option>
            {shipments.map(s => (
              <option key={s.id} value={s.id}>
                {s.containerNumber || s.billOfLading} ({s._count?.items || 0} items)
              </option>
            ))}
          </select>
          
          <span style={{ color: "#6b7280", fontSize: "12px" }}>or</span>
          
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={disabled}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              backgroundColor: "#dc2626",
              border: "none",
              color: "#fff",
              borderRadius: "4px",
              cursor: disabled ? "not-allowed" : "pointer"
            }}
          >
            + Create New Shipment
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreateShipment} style={{ marginTop: "8px" }}>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            gap: "8px",
            marginBottom: "12px"
          }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                Container Number *
              </label>
              <input
                type="text"
                value={newShipment.containerNumber}
                onChange={(e) => setNewShipment(s => ({ ...s, containerNumber: e.target.value }))}
                placeholder="e.g., MSKU1234567"
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: "12px",
                  backgroundColor: "#1f1f1f",
                  border: "1px solid #404040",
                  borderRadius: "4px",
                  color: "#fff"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                Bill of Lading *
              </label>
              <input
                type="text"
                value={newShipment.billOfLading}
                onChange={(e) => setNewShipment(s => ({ ...s, billOfLading: e.target.value }))}
                placeholder="e.g., BOL-2024-ABC"
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: "12px",
                  backgroundColor: "#1f1f1f",
                  border: "1px solid #404040",
                  borderRadius: "4px",
                  color: "#fff"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                ETA Date
              </label>
              <input
                type="date"
                value={newShipment.etaDate}
                onChange={(e) => setNewShipment(s => ({ ...s, etaDate: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: "12px",
                  backgroundColor: "#1f1f1f",
                  border: "1px solid #404040",
                  borderRadius: "4px",
                  color: "#fff"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                Vessel Name
              </label>
              <input
                type="text"
                value={newShipment.vesselName}
                onChange={(e) => setNewShipment(s => ({ ...s, vesselName: e.target.value }))}
                placeholder="e.g., Ever Given"
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: "12px",
                  backgroundColor: "#1f1f1f",
                  border: "1px solid #404040",
                  borderRadius: "4px",
                  color: "#fff"
                }}
              />
            </div>
          </div>
          
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                backgroundColor: "transparent",
                border: "1px solid #404040",
                color: "#9ca3af",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLoading}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                backgroundColor: "#dc2626",
                border: "none",
                color: "#fff",
                borderRadius: "4px",
                cursor: createLoading ? "not-allowed" : "pointer",
                opacity: createLoading ? 0.7 : 1
              }}
            >
              {createLoading ? "Creating..." : "Create & Link"}
            </button>
          </div>
        </form>
      )}
      
      {error && (
        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>{error}</div>
      )}
      
      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "8px" }}>
        * At least one of Container Number or BOL is required
      </div>
    </div>
  );
}
