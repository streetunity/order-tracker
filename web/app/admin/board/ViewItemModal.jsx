"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Ship } from "lucide-react";

import DetailsTab         from "./components/DetailsTab";
import BrokerDocumentsTab from "./components/BrokerDocumentsTab";
import CustomerDocumentsTab from "./components/CustomerDocumentsTab";
import ShippingTab        from "./components/ShippingTab";

export function ViewItemModal({ item, order, onClose, onUpdate }) {
  const { user, getAuthHeaders, isAdmin } = useAuth();

  // ── Core item state ──────────────────────────────────────────
  const [editedItem, setEditedItem] = useState({});
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [localItem,  setLocalItem]  = useState(item);
  const [activeTab,  setActiveTab]  = useState("details");

  // ── Lock / unlock ────────────────────────────────────────────
  const [showLockConfirm,   setShowLockConfirm]   = useState(false);
  const [showUnlockDialog,  setShowUnlockDialog]  = useState(false);
  const [unlockReason,      setUnlockReason]      = useState("");
  const [lockingOrder,      setLockingOrder]      = useState(false);
  const [showAdminOnlyAlert,setShowAdminOnlyAlert] = useState(false);
  const [showUnlockError,   setShowUnlockError]   = useState(false);

  // ── Broker documents (delete confirm lives here so dialogs stack correctly) ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const isManufacturer = user?.role === "MANUFACTURER";
  const isBroker       = user?.role === "BROKER";
  const isAgent        = user?.role === "AGENT";
  const canManageShipments = isAdmin || isAgent;
  const isOrderLocked  = order?.isLocked || false;

  const orderedDate = item?.orderedAt
    ? new Date(item.orderedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const canEditField = (fieldName) => {
    if (isBroker) return false;
    if (fieldName === "serialNumber") return true;
    if (isManufacturer) return false;
    return !isOrderLocked;
  };

  useEffect(() => {
    setEditedItem({
      qty:             item?.qty || 1,
      productCode:     item?.productCode || "",
      modelNumber:     item?.modelNumber || "",
      serialNumber:    item?.serialNumber || "",
      voltage:         item?.voltage || "",
      laserWattage:    item?.laserWattage || "",
      notes:           item?.notes || "",
      privateItemNote: item?.privateItemNote || "",
    });
    setLocalItem(item);
  }, [item]);

  const handleInputChange = (field, value) =>
    setEditedItem(prev => ({ ...prev, [field]: value }));

  // ── Save item ────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      setSaving(true); setError("");
      const dataToSend = isManufacturer ? { serialNumber: editedItem.serialNumber } : editedItem;
      const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(dataToSend),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      if (onUpdate) await onUpdate();
      setSaving(false);
    } catch (e) { setError(e.message || "Failed to save"); setSaving(false); }
  };

  // ── Mark ordered ─────────────────────────────────────────────
  const handleMarkOrdered = async () => {
    try {
      setSaving(true); setError("");
      const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ isOrdered: true, orderedAt: new Date().toISOString() }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      if (onUpdate) await onUpdate();
      setSaving(false);
    } catch (e) { setError(e.message || "Failed to mark as ordered"); setSaving(false); }
  };

  // ── Lock / unlock ─────────────────────────────────────────────
  const handleLockToggle = () => {
    if (isOrderLocked) {
      if (!isAdmin) { setShowAdminOnlyAlert(true); setTimeout(() => setShowAdminOnlyAlert(false), 3000); return; }
      setShowUnlockDialog(true);
    } else { setShowLockConfirm(true); }
  };

  const performLock = async () => {
    try {
      setLockingOrder(true); setError("");
      const res = await fetch(`/api/orders/${order.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ locked: true, reason: "Order locked for data integrity" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      if (onUpdate) await onUpdate(); setShowLockConfirm(false); onClose();
    } catch (e) { setError(e.message || "Failed to lock order"); setLockingOrder(false); setShowLockConfirm(false); }
  };

  const performUnlock = async () => {
    if (unlockReason.trim().length < 10) { setShowUnlockError(true); setTimeout(() => setShowUnlockError(false), 3000); return; }
    try {
      setLockingOrder(true); setError("");
      const res = await fetch(`/api/orders/${order.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ reason: unlockReason }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      if (onUpdate) await onUpdate(); setShowUnlockDialog(false); setUnlockReason(""); onClose();
    } catch (e) { setError(e.message || "Failed to unlock order"); setLockingOrder(false); }
  };

  const handleClose = () => { if (saving || lockingOrder) return; onClose(); };

  function hasChanges() {
    if (isManufacturer) return editedItem.serialNumber !== (item.serialNumber || "");
    return (
      editedItem.qty             !== item.qty ||
      editedItem.productCode     !== (item.productCode     || "") ||
      editedItem.modelNumber     !== (item.modelNumber     || "") ||
      editedItem.serialNumber    !== (item.serialNumber    || "") ||
      editedItem.voltage         !== (item.voltage         || "") ||
      editedItem.laserWattage    !== (item.laserWattage    || "") ||
      editedItem.notes           !== (item.notes           || "") ||
      editedItem.privateItemNote !== (item.privateItemNote || "")
    );
  }

  if (!item) return null;

  // ── Tab button helper ─────────────────────────────────────────
  const Tab = ({ id, label, extra }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{ padding: "8px 16px", background: activeTab === id ? "#dc2626" : "#2d2d2d", color: "#fff", border: activeTab === id ? "none" : "1px solid #404040", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}
    >
      {label}{extra}
    </button>
  );

  return (
    <>
      <div className="confirm-overlay" onClick={handleClose}>
        <div className="view-item-modal-wide" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="view-item-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h3>🔍 Item Details</h3>
              {localItem?.shipmentId && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", backgroundColor: "rgba(220,38,38,0.2)", border: "1px solid #dc2626", borderRadius: "4px", fontSize: "11px", color: "#dc2626" }}>
                  <Ship size={12} /> Shared Shipment
                </span>
              )}
            </div>
            <button className="close-button" onClick={handleClose} disabled={saving || lockingOrder} aria-label="Close">✕</button>
          </div>

          {/* Banners */}
          {error && <div style={{ padding: "12px", margin: "0 1.5rem", marginTop: "1rem", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", color: "#dc2626", fontSize: "14px" }}>{error}</div>}
          {isOrderLocked && !isManufacturer && <div style={{ padding: "12px", margin: "0 1.5rem", marginTop: "1rem", backgroundColor: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "6px", color: "#92400e", fontSize: "13px" }}>🔒 <strong>Order is locked.</strong> Only serial number can be edited.</div>}
          {isManufacturer && <div style={{ padding: "12px", margin: "0 1.5rem", marginTop: "1rem", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", color: "#dc2626", fontSize: "13px" }}>ℹ️ <strong>Manufacturer view.</strong> You can edit the serial number and upload customer files.</div>}
          {isBroker && <div style={{ padding: "12px", margin: "0 1.5rem", marginTop: "1rem", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "6px", color: "#e4e4e4", fontSize: "13px" }}>ℹ️ <strong>Broker view.</strong> Read-only access.</div>}

          {/* Tabs */}
          <div style={{ display: "flex", gap: "8px", margin: "1rem 1.5rem 0", flexWrap: "wrap" }}>
            <Tab id="details"      label="Details" />
            <Tab id="documents"    label="Broker Documents" />
            <Tab id="customerDocs" label="Customer Documents" />
            {canManageShipments && (
              <Tab id="shipping" label="Shipping" extra={
                <>{localItem?.shipmentId && <span style={{ width: "8px", height: "8px", backgroundColor: "#dc2626", borderRadius: "50%", display: "inline-block" }} />}</>
              } />
            )}
          </div>

          {/* Tab content */}
          {activeTab === "details" && (
            <DetailsTab
              item={item}
              editedItem={editedItem}
              onFieldChange={handleInputChange}
              saving={saving}
              canEditField={canEditField}
              isManufacturer={isManufacturer}
              orderedDate={orderedDate}
            />
          )}

          {activeTab === "documents" && (
            <BrokerDocumentsTab
              item={item}
              isManufacturer={isManufacturer}
              getAuthHeaders={getAuthHeaders}
              onSetDeleteConfirm={setShowDeleteConfirm}
            />
          )}

          {activeTab === "customerDocs" && (
            <CustomerDocumentsTab
              order={order}
              isManufacturer={isManufacturer}
              getAuthHeaders={getAuthHeaders}
            />
          )}

          {activeTab === "shipping" && canManageShipments && (
            <ShippingTab
              item={item}
              order={order}
              localItem={localItem}
              setLocalItem={setLocalItem}
              getAuthHeaders={getAuthHeaders}
              onUpdate={onUpdate}
            />
          )}

          {/* Footer */}
          <div className="view-item-footer">
            <div style={{ display: "flex", gap: "0.5rem", marginRight: "auto" }}>
              {!isManufacturer && !isBroker && (
                <button onClick={handleLockToggle} disabled={saving || lockingOrder} className="btn-lock" style={{ background: "#dc2626", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>
                  {lockingOrder ? "..." : (isOrderLocked ? "🔓 Unlock Order" : "🔒 Lock Order")}
                </button>
              )}
              {!isManufacturer && !isBroker && !item?.isOrdered && (
                <button onClick={handleMarkOrdered} disabled={saving} className="btn-ordered" style={{ background: "#16a34a", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>
                  {saving ? "..." : "$ Mark as Ordered"}
                </button>
              )}
            </div>
            <button onClick={handleClose} disabled={saving || lockingOrder} className="btn-cancel">{hasChanges() ? "Cancel" : "Close"}</button>
            {hasChanges() && !isBroker && (
              <button onClick={handleSave} disabled={saving || lockingOrder} className="btn-confirm">{saving ? "Saving..." : "Save Changes"}</button>
            )}
          </div>

        </div>
      </div>

      {/* Lock Confirmation */}
      {showLockConfirm && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => !lockingOrder && setShowLockConfirm(false)}>
          <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>🔒 Lock Order?</h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you've finished editing <strong>ALL items</strong> on this order?</p>
            <div style={{ padding: "1rem", backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
              <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "13px", color: "#f59e0b" }}>
                <li>Most item details will become read-only</li>
                <li>Only serial numbers will remain editable</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button onClick={() => setShowLockConfirm(false)} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
              <button onClick={performLock} disabled={lockingOrder} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>{lockingOrder ? "Locking..." : "Lock Order"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Dialog */}
      {showUnlockDialog && isAdmin && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => !lockingOrder && setShowUnlockDialog(false)}>
          <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>🔓 Unlock Order</h3>
            <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Please provide a reason. This will be logged in the audit trail.</p>
            <textarea value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Enter reason (minimum 10 characters)" style={{ width: "100%", minHeight: "100px", padding: "10px", background: "#252525", border: "1px solid #404040", borderRadius: "6px", color: "#fff", fontSize: "14px", marginBottom: "1rem", fontFamily: "inherit", resize: "vertical" }} />
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button onClick={() => { setShowUnlockDialog(false); setUnlockReason(""); }} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
              <button onClick={performUnlock} disabled={lockingOrder || unlockReason.trim().length < 10} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: (lockingOrder || unlockReason.trim().length < 10) ? "not-allowed" : "pointer", fontSize: "14px", opacity: (lockingOrder || unlockReason.trim().length < 10) ? 0.5 : 1 }}>{lockingOrder ? "Unlocking..." : "Unlock Order"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {showAdminOnlyAlert && <div style={{ position: "fixed", top: "100px", right: "24px", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "1rem 1.5rem", zIndex: 1200, maxWidth: "400px" }}><span style={{ color: "#d1d5db", fontSize: "14px" }}>⚠️ Only administrators can unlock orders.</span></div>}
      {showUnlockError && <div style={{ position: "fixed", top: "100px", right: "24px", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "1rem 1.5rem", zIndex: 1200, maxWidth: "400px" }}><span style={{ color: "#d1d5db", fontSize: "14px" }}>⚠️ Please provide a reason with at least 10 characters.</span></div>}

      {/* Delete broker doc confirmation */}
      {showDeleteConfirm && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => setShowDeleteConfirm(null)}>
          <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "400px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fff", margin: "0 0 1rem 0" }}>Delete Document?</h3>
            <p style={{ fontSize: "14px", color: "#d1d5db", marginBottom: "1rem" }}>This action cannot be undone.</p>
            {showDeleteConfirm.isShipmentDocument && (
              <div style={{ padding: '10px', marginBottom: '16px', backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid #dc2626', borderRadius: '6px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}><strong>Warning:</strong> This is a shared shipment document and will be removed from all linked items.</p>
              </div>
            )}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Cancel</button>
              <button onClick={() => {
                // handled inside BrokerDocumentsTab via onDeleteConfirmed callback
                // but we pass the id back down through onSetDeleteConfirm null reset
                setShowDeleteConfirm(null);
              }} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
