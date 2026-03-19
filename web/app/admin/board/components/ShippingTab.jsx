"use client";

import { useState, useEffect } from "react";
import { Ship } from "lucide-react";

export default function ShippingTab({ item, order, localItem, setLocalItem, getAuthHeaders, onUpdate }) {
  const [shipments,            setShipments]            = useState([]);
  const [loading,              setLoading]              = useState(false);
  const [showCreateForm,       setShowCreateForm]       = useState(false);
  const [createLoading,        setCreateLoading]        = useState(false);
  const [shipmentError,        setShipmentError]        = useState(null);
  const [newShipment,          setNewShipment]          = useState({ containerNumber: "", billOfLading: "", etaDate: "", vesselName: "", portOfOrigin: "", portOfDestination: "" });

  const loadShipments = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/shipments/active", { headers: getAuthHeaders() });
      if (res.ok) setShipments(await res.json());
    } catch (e) { console.error("Failed to load shipments:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadShipments(); }, []);

  const handleLink = async (shipmentId) => {
    if (!shipmentId) return;
    setLoading(true); setShipmentError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/link-item`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to link item"); }
      const sr = await fetch(`/api/shipments/${shipmentId}`, { headers: getAuthHeaders() });
      if (sr.ok) { const sd = await sr.json(); setLocalItem(prev => ({ ...prev, shipmentId, shipment: sd })); }
      if (onUpdate) await onUpdate();
      await loadShipments();
    } catch (e) { setShipmentError(e.message); }
    finally { setLoading(false); }
  };

  const handleUnlink = async () => {
    if (!localItem.shipmentId) return;
    setLoading(true); setShipmentError(null);
    try {
      const res = await fetch(`/api/shipments/${localItem.shipmentId}/unlink-item`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to unlink"); }
      setLocalItem(prev => ({ ...prev, shipmentId: null, shipment: null }));
      if (onUpdate) await onUpdate();
      await loadShipments();
    } catch (e) { setShipmentError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newShipment.containerNumber && !newShipment.billOfLading) { setShipmentError("Container number or Bill of Lading is required"); return; }
    setCreateLoading(true); setShipmentError(null);
    try {
      const cr = await fetch("/api/shipments", { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(newShipment) });
      if (!cr.ok) { const d = await cr.json(); throw new Error(d.error || "Failed to create shipment"); }
      const shipment = await cr.json();
      const lr = await fetch(`/api/shipments/${shipment.id}/link-item`, { method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
      if (!lr.ok) { const d = await lr.json(); throw new Error(d.error || "Created but failed to link"); }
      setLocalItem(prev => ({ ...prev, shipmentId: shipment.id, shipment }));
      setNewShipment({ containerNumber: "", billOfLading: "", etaDate: "", vesselName: "", portOfOrigin: "", portOfDestination: "" });
      setShowCreateForm(false);
      if (onUpdate) await onUpdate();
      await loadShipments();
    } catch (e) { setShipmentError(e.message); }
    finally { setCreateLoading(false); }
  };

  const field = (val, onChange, placeholder, label) => (
    <div>
      <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>{label}</label>
      <input type="text" value={val} onChange={onChange} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", fontSize: "14px", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "6px", color: "#fff" }} />
    </div>
  );

  if (loading) return <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "1.5rem", maxHeight: "60vh", overflowY: "auto" }}>
      {localItem?.shipmentId && localItem?.shipment ? (
        // Linked state
        <div style={{ padding: "20px", backgroundColor: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}><Ship size={20} color="#dc2626" /><span style={{ fontWeight: "600", fontSize: "16px", color: "#dc2626" }}>Linked to Shared Shipment</span></div>
              <p style={{ fontSize: "13px", color: "#e4e4e4", margin: 0 }}>Sharing documents with other items in the same container.</p>
            </div>
            <button onClick={handleUnlink} disabled={loading} style={{ padding: "8px 16px", fontSize: "13px", backgroundColor: "transparent", border: "1px solid #ef4444", color: "#ef4444", borderRadius: "6px", cursor: "pointer" }}>Unlink</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", padding: "16px", backgroundColor: "#1f1f1f", borderRadius: "6px" }}>
            <div><div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>Container Number</div><div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.containerNumber || "—"}</div></div>
            <div><div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>Bill of Lading</div><div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.billOfLading || "—"}</div></div>
            <div><div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>Vessel Name</div><div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.vesselName || "—"}</div></div>
            <div><div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>ETA</div><div style={{ fontSize: "14px", color: "#fff" }}>{localItem.shipment.etaDate ? new Date(localItem.shipment.etaDate).toLocaleDateString() : "—"}</div></div>
          </div>
          {localItem.shipment.items?.length > 1 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>Other items in this shipment:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {localItem.shipment.items.filter(i => i.id !== item.id).map(i => (
                  <span key={i.id} style={{ padding: "4px 10px", backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "4px", fontSize: "12px", color: "#e4e4e4" }}>{i.productCode || "Unnamed Item"}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Unlinked state
        <div>
          <div style={{ marginBottom: "20px" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600, color: "#fff" }}><Ship size={18} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />Shared Shipment</h4>
            <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>Link this item to a shared shipment when multiple items are shipping in the same container.</p>
          </div>

          {shipmentError && <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", color: "#ef4444", fontSize: "13px" }}>{shipmentError}</div>}

          {!showCreateForm ? (
            <div style={{ padding: "20px", backgroundColor: "#252525", borderRadius: "8px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", color: "#e4e4e4", marginBottom: "8px" }}>Link to existing shipment:</label>
                <select onChange={(e) => handleLink(e.target.value)} defaultValue="" style={{ width: "100%", padding: "10px 12px", fontSize: "14px", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "6px", color: "#fff" }}>
                  <option value="">Select a shipment...</option>
                  {shipments.map(s => <option key={s.id} value={s.id}>{s.containerNumber || s.billOfLading} ({s._count?.items || 0} items)</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                <div style={{ flex: 1, height: "1px", backgroundColor: "#404040" }} /><span style={{ color: "#6b7280", fontSize: "13px" }}>or</span><div style={{ flex: 1, height: "1px", backgroundColor: "#404040" }} />
              </div>
              <button onClick={() => setShowCreateForm(true)} style={{ width: "100%", padding: "12px", fontSize: "14px", backgroundColor: "#dc2626", border: "none", color: "#fff", borderRadius: "6px", cursor: "pointer", fontWeight: 500 }}>+ Create New Shipment</button>
            </div>
          ) : (
            <form onSubmit={handleCreate} style={{ padding: "20px", backgroundColor: "#252525", borderRadius: "8px" }}>
              <h5 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#fff" }}>Create New Shipment</h5>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                {field(newShipment.containerNumber, (e) => setNewShipment(s => ({ ...s, containerNumber: e.target.value })), "e.g., MSKU1234567", "Container Number *")}
                {field(newShipment.billOfLading,    (e) => setNewShipment(s => ({ ...s, billOfLading:    e.target.value })), "e.g., BOL-2024-ABC", "Bill of Lading *")}
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>ETA Date</label>
                  <input type="date" value={newShipment.etaDate} onChange={(e) => setNewShipment(s => ({ ...s, etaDate: e.target.value }))} style={{ width: "100%", padding: "10px 12px", fontSize: "14px", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "6px", color: "#fff" }} />
                </div>
                {field(newShipment.vesselName, (e) => setNewShipment(s => ({ ...s, vesselName: e.target.value })), "e.g., Ever Given", "Vessel Name")}
              </div>
              <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "16px" }}>* At least one of Container Number or Bill of Lading is required</p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowCreateForm(false)} style={{ padding: "10px 20px", fontSize: "14px", backgroundColor: "transparent", border: "1px solid #404040", color: "#9ca3af", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={createLoading} style={{ padding: "10px 20px", fontSize: "14px", backgroundColor: "#dc2626", border: "none", color: "#fff", borderRadius: "6px", cursor: createLoading ? "not-allowed" : "pointer", opacity: createLoading ? 0.7 : 1, fontWeight: 500 }}>{createLoading ? "Creating..." : "Create & Link"}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
