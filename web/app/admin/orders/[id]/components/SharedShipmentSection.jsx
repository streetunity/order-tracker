"use client";

import { useState, useEffect } from "react";

/**
 * SharedShipmentSection - Component for linking items to shared shipments.
 *
 * UI flow (per request from Mr B):
 *  - Pick an existing shipment from the dropdown.
 *  - Click "Add to Shipment" to link the item.
 *  - Selecting a shipment alone does NOT link the item; the explicit
 *    button is required so accidental clicks on the dropdown can't
 *    silently move an item into a shipment.
 *  - There is no longer an inline "Create New Shipment" path here.
 *    New shipments are created on /admin/shipments and then linked here.
 */
export default function SharedShipmentSection({
  item,
  onShipmentChange,
  disabled = false,
  getAuthHeaders
}) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [error, setError] = useState(null);

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

  async function handleLinkToShipment() {
    if (!selectedShipmentId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${selectedShipmentId}/link-item`, {
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

      // Reset the dropdown selection and notify parent to refresh.
      setSelectedShipmentId("");
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
              <span style={{ fontSize: "16px" }}>\uD83D\uDD17</span>
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
                  <strong>Shipment:</strong> {shipment.containerNumber}
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

  // Item not linked - show "select + add" controls.
  const canAdd = !disabled && !loading && !!selectedShipmentId;

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
        <span style={{ fontSize: "14px" }}>\uD83D\uDCE6</span>
        <span style={{ fontWeight: "500", fontSize: "13px" }}>Shared Shipment</span>
        <span style={{ fontSize: "11px", color: "#9ca3af" }}>
          (Link items shipping in the same container)
        </span>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedShipmentId}
          onChange={(e) => setSelectedShipmentId(e.target.value)}
          disabled={disabled || loading}
          style={{
            padding: "6px 10px",
            fontSize: "12px",
            backgroundColor: "#1f1f1f",
            border: "1px solid #404040",
            borderRadius: "4px",
            color: "#fff",
            minWidth: "240px"
          }}
        >
          <option value="">Select a shipment\u2026</option>
          {shipments.map(s => {
            const label = s.containerNumber || s.billOfLading || "(unnamed)";
            const itemCount = s._count?.items || 0;
            return (
              <option key={s.id} value={s.id}>
                {label} ({itemCount} item{itemCount === 1 ? "" : "s"})
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={handleLinkToShipment}
          disabled={!canAdd}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            backgroundColor: canAdd ? "#dc2626" : "#404040",
            border: "none",
            color: canAdd ? "#fff" : "#9ca3af",
            borderRadius: "4px",
            cursor: canAdd ? "pointer" : "not-allowed",
            fontWeight: 600
          }}
        >
          {loading ? "Adding\u2026" : "Add to Shipment"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>{error}</div>
      )}
    </div>
  );
}
