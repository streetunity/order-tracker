"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import MeasurementSection from "@/components/MeasurementSection";

export default function EditOrderPage({ params }) {
  const { id } = params;
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newItem, setNewItem] = useState({ 
    productCode: "", 
    qty: 1, 
    serialNumber: "", 
    modelNumber: "", 
    voltage: "", 
    laserWattage: "", 
    notes: "",
    hasExtendedShipping: false
  });
  const [saving, setSaving] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [internalNotesSaving, setInternalNotesSaving] = useState(false);
  const [internalNotesChanged, setInternalNotesChanged] = useState(false);
  
  const [showUnorderDialog, setShowUnorderDialog] = useState(false);
  const [unorderReason, setUnorderReason] = useState("");
  const [unorderingItemId, setUnorderingItemId] = useState(null);
  
  const [customerDocsLink, setCustomerDocsLink] = useState("");
  const [isSavingDocsLink, setIsSavingDocsLink] = useState(false);

  const [orderDate, setOrderDate] = useState("");
  const [isSavingOrderDate, setIsSavingOrderDate] = useState(false);

  // Track item edits
  const [itemEdits, setItemEdits] = useState({});

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function load() {
    if (!user) return;
    
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { 
        cache: "no-store",
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const orderData = await res.json();
      setOrder(orderData);
      setCustomerDocsLink(orderData.customerDocsLink || "");
      setInternalNotes(orderData.internalNotes || "");
      setInternalNotesChanged(false);
      setItemEdits({});  // Clear item edits after load
      
      if (orderData.orderDate) {
        const date = new Date(orderData.orderDate);
        const formatted = date.toISOString().split('T')[0];
        setOrderDate(formatted);
      } else {
        setOrderDate("");
      }
      
      setErr("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }
  
  useEffect(() => { 
    if (user) {
      load(); 
    }
  }, [id, user]);

  const hasUnsavedChanges = Object.keys(itemEdits).length > 0;

  async function saveAllChanges() {
    if (!hasUnsavedChanges) return;
    
    try {
      setSaving(true);
      const errors = [];
      
      for (const [itemId, changes] of Object.entries(itemEdits)) {
        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
            method: "PATCH",
            headers: { 
              "content-type": "application/json",
              ...getAuthHeaders()
            },
            body: JSON.stringify(changes),
          });
          
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `HTTP ${res.status}`);
          }
        } catch (e) {
          errors.push(`Item ${itemId}: ${e.message}`);
        }
      }
      
      if (errors.length > 0) {
        alert(`Some items failed to save:\n${errors.join('\n')}`);
      }
      
      await load();
    } catch (e) {
      alert(`Failed to save changes: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function updateItemEdit(itemId, field, value) {
    setItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [field]: value
      }
    }));
  }

  async function saveInternalNotes() {
    try {
      setInternalNotesSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/internal-notes`, {
        method: "PATCH",
        headers: { 
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ internalNotes }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setInternalNotesChanged(false);
      alert("Internal notes saved successfully");
    } catch (e) {
      alert(`Failed to save internal notes: ${e.message}`);
    } finally {
      setInternalNotesSaving(false);
    }
  }

  async function saveOrderDate() {
    if (!orderDate) {
      alert("Please select a valid date");
      return;
    }
    
    const currentOrderDate = order?.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : "";
    if (orderDate === currentOrderDate) {
      return;
    }
    
    try {
      setIsSavingOrderDate(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ orderDate: orderDate })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setOrder(prev => ({ ...prev, orderDate: orderDate }));
      alert("Order date updated successfully");
    } catch (err) {
      alert(`Failed to update order date: ${err.message}`);
      if (order?.orderDate) {
        const date = new Date(order.orderDate);
        setOrderDate(date.toISOString().split('T')[0]);
      }
    } finally {
      setIsSavingOrderDate(false);
    }
  }

  async function markItemOrdered(itemId) {
    if (!isAdmin) {
      alert("Only administrators can mark items as ordered.");
      return;
    }
    
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/ordered`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      await load();
    } catch (e) {
      alert(`Failed to mark item as ordered: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function unmarkItemOrdered() {
    if (!isAdmin) {
      alert("Only administrators can unmark items as ordered.");
      return;
    }
    
    if (!unorderReason || unorderReason.trim().length < 10) {
      alert("Please provide a reason with at least 10 characters");
      return;
    }
    
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(unorderingItemId)}/unordered`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ reason: unorderReason.trim() })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setShowUnorderDialog(false);
      setUnorderReason("");
      setUnorderingItemId(null);
      await load();
    } catch (e) {
      alert(`Failed to unmark item as ordered: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomerDocsLink() {
    if (customerDocsLink === (order?.customerDocsLink || "")) {
      return;
    }
    
    try {
      setIsSavingDocsLink(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ customerDocsLink: customerDocsLink })
      });
      
      if (!res.ok) throw new Error("Failed to update");
      
      setOrder(prev => ({ ...prev, customerDocsLink: customerDocsLink }));
    } catch (err) {
      alert("Failed to update documents link");
      setCustomerDocsLink(order?.customerDocsLink || "");
    } finally {
      setIsSavingDocsLink(false);
    }
  }

  async function lockOrder() {
    try {
      setLockLoading(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/lock`, {
        method: "POST",
        headers: { 
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          reason: "Order locked for data integrity"
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      await load();
      alert("Order has been locked. No changes to item details can be made until unlocked.");
    } catch (e) {
      alert(`Failed to lock order: ${e.message}`);
    } finally {
      setLockLoading(false);
    }
  }

  async function unlockOrder() {
    if (!isAdmin) {
      alert("Only administrators can unlock orders.");
      return;
    }
    
    if (unlockReason.trim().length < 10) {
      alert("Please provide a reason with at least 10 characters");
      return;
    }
    
    try {
      setLockLoading(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/unlock`, {
        method: "POST",
        headers: { 
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          reason: unlockReason
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setShowUnlockDialog(false);
      setUnlockReason("");
      await load();
      alert("Order has been unlocked. You can now edit item details.");
    } catch (e) {
      alert(`Failed to unlock order: ${e.message}`);
    } finally {
      setLockLoading(false);
    }
  }

  async function deleteItem(itemId) {
    if (!confirm("Permanently delete this item? This cannot be undone.")) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      await load();
    } catch (e) {
      alert(`Failed to delete item: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function addItem(e) {
    e.preventDefault();
    const productCode = newItem.productCode.trim();
    const qty = Number(newItem.qty || 1);
    const serialNumber = newItem.serialNumber.trim();
    const modelNumber = newItem.modelNumber.trim();
    const voltage = newItem.voltage.trim();
    const laserWattage = newItem.laserWattage.trim();
    const notes = newItem.notes.trim();
    const hasExtendedShipping = newItem.hasExtendedShipping || false;
    
    if (!productCode) return alert("Item name is required");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantity must be a positive number");
    
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/items`, {
        method: "POST",
        headers: { 
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          productCode, 
          qty, 
          serialNumber, 
          modelNumber, 
          voltage, 
          laserWattage: laserWattage || null,
          notes,
          hasExtendedShipping,
          containers: []
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setNewItem({ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", laserWattage: "", notes: "", hasExtendedShipping: false });
      await load();
    } catch (e) {
      alert(`Failed to add item: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return null;
  }

  const hasExtendedShipping = order?.items?.some(item => item.hasExtendedShipping === true) || false;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <header className="header" style={{ position: "static", paddingLeft: 0, paddingRight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="h1">Edit Order</h1>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {user?.name} ({user?.role})
            </span>
            {isAdmin && (
              <Link href="/admin/users" className="btn">
                Manage Users
              </Link>
            )}
            <Link href="/admin/orders" className="btn">Back to Orders</Link>
            <Link href="/admin/board" className="btn">Back to Board</Link>
            <button 
              onClick={logout} 
              className="btn"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {loading ? <div className="status">Loading…</div> : err ? (
        <div className="status" style={{ color: "#dc2626" }}>Failed to load: {err}</div>
      ) : !order ? (
        <div className="status">Order not found.</div>
      ) : (
        <>
          {hasExtendedShipping && (
            <div style={{
              padding: "12px",
              marginBottom: "16px",
              backgroundColor: "rgba(0, 255, 170, 0.1)",
              border: "1px solid var(--success)",
              borderRadius: "6px",
              color: "var(--success)"
            }}>
              ⭐ <strong>Extended Shipping Active:</strong> This order contains items marked for extended shipping. 
              The customer tracking page will show an extended ETA.
            </div>
          )}

          {order.isLocked && (
            <div style={{
              padding: "12px",
              marginBottom: "16px",
              backgroundColor: "#7f1d1d",
              border: "1px solid #991b1b",
              borderRadius: "6px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <strong style={{ color: "#fecaca" }}>🔒 This order is locked</strong>
                <div style={{ color: "#fca5a5", fontSize: "12px", marginTop: "4px" }}>
                  Item details cannot be edited while the order is locked. Admin fields (price/purchasing notes) and extended shipping remain editable.
                  {order.lockedAt && (
                    <span> Locked on {new Date(order.lockedAt).toLocaleDateString()} by {order.lockedBy || "Admin"}</span>
                  )}
                </div>
              </div>
              {isAdmin ? (
                <button
                  className="btn"
                  onClick={() => setShowUnlockDialog(true)}
                  disabled={lockLoading}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#fff",
                    border: "none"
                  }}
                >
                  Unlock Order
                </button>
              ) : (
                <div style={{ color: "#fca5a5", fontSize: "12px" }}>
                  Only admins can unlock
                </div>
              )}
            </div>
          )}

          <section style={{ marginTop: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: "#6b7280", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Customer:</strong> {order.account?.name ?? "—"}
                {" · "}
                <strong>Public link:</strong>{" "}
                <a className="link" href={`/t/${order.trackingToken}`} target="_blank" rel="noreferrer">Open ↗</a>
                {order.createdBy && (
                  <>
                    {" · "}
                    <strong>Created by:</strong> {order.createdBy.name}
                  </>
                )}
                {order.customerDocsLink && (
                  <>
                    {" · "}
                    <strong>Documents:</strong>{" "}
                    <a className="link" href={order.customerDocsLink} target="_blank" rel="noreferrer">View Files ↗</a>
                  </>
                )}
              </div>
              {!order.isLocked && (
                <button
                  className="btn"
                  onClick={lockOrder}
                  disabled={lockLoading}
                  style={{
                    backgroundColor: "#ef4444",
                    color: "#fff",
                    border: "none"
                  }}
                >
                  🔒 Lock Order
                </button>
              )}
            </div>
          </section>

          <section style={{ marginTop: 16, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Order Information</h3>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
                  Order Date *
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    onBlur={saveOrderDate}
                    className="input"
                    style={{ 
                      width: "150px",
                      padding: "8px 12px"
                    }}
                    disabled={isSavingOrderDate}
                  />
                  {isSavingOrderDate && (
                    <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
                  )}
                </div>
              </div>
              {order.poNumber && (
                <div>
                  <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
                    PO Number
                  </label>
                  <div style={{ 
                    padding: "8px 12px",
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    fontSize: "14px",
                    color: "#e4e4e4"
                  }}>
                    {order.poNumber}
                  </div>
                </div>
              )}
              {order.sku && (
                <div>
                  <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
                    Sales Person
                  </label>
                  <div style={{ 
                    padding: "8px 12px",
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    fontSize: "14px",
                    color: "#e4e4e4"
                  }}>
                    {order.sku}
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
              The order date is used for ETA calculations and sales reports. Change it if it was entered incorrectly. Press Tab or click outside to save.
            </div>
          </section>

          <section style={{ marginTop: 16, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Customer Documents Link</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="input"
                type="url"
                value={customerDocsLink}
                onChange={(e) => setCustomerDocsLink(e.target.value)}
                onBlur={saveCustomerDocsLink}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="https://www.dropbox.com/..."
                style={{ width: "400px" }}
                disabled={isSavingDocsLink}
              />
              {isSavingDocsLink && (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
              )}
              {order.customerDocsLink && (
                <a className="btn" href={order.customerDocsLink} target="_blank" rel="noreferrer">
                  Open Link ↗
                </a>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
              Dropbox or other document link for customer files. Press Enter or click outside to save.
            </div>
          </section>

          <section style={{
            marginTop: 16,
            marginBottom: 16,
            padding: "16px",
            backgroundColor: "#2d2d2d",
            border: "1px solid #404040",
            borderRadius: "8px"
          }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#e4e4e4" }}>
              Shipping Information
            </h3>
            
            {order.account?.address && (
              <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #404040" }}>
                <div style={{ color: "#e4e4e4", fontSize: "14px" }}>
                  {order.account.address}
                </div>
              </div>
            )}
            
            {(order.etaDate || order.shippingCarrier || order.trackingNumber) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                {order.etaDate && (
                  <div>
                    <strong style={{ color: "#ef4444", fontSize: "12px" }}>ETA:</strong>
                    <div style={{ color: "#e4e4e4", marginTop: "4px", fontSize: "14px" }}>
                      {new Date(order.etaDate).toLocaleDateString()}
                      {hasExtendedShipping && (
                        <span style={{ fontSize: "11px", color: "var(--success)", marginLeft: "8px" }}>
                          (Extended)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {order.shippingCarrier && (
                  <div>
                    <strong style={{ color: "#ef4444", fontSize: "12px" }}>Carrier:</strong>
                    <div style={{ color: "#e4e4e4", marginTop: "4px", fontSize: "14px" }}>
                      {order.shippingCarrier}
                    </div>
                  </div>
                )}
                {order.trackingNumber && (
                  <div>
                    <strong style={{ color: "#ef4444", fontSize: "12px" }}>Tracking Number:</strong>
                    <div style={{ color: "#e4e4e4", marginTop: "4px", fontSize: "14px" }}>
                      {order.trackingNumber}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Items</h2>
              {hasUnsavedChanges && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    padding: "8px 16px",
                    backgroundColor: "#fef3c7",
                    border: "2px solid #f59e0b",
                    borderRadius: "6px",
                    color: "#92400e",
                    fontSize: "14px",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <span style={{ fontSize: "18px" }}>⚠️</span>
                    You have unsaved changes to {Object.keys(itemEdits).length} item{Object.keys(itemEdits).length > 1 ? 's' : ''}
                  </div>
                  <button
                    className="btn primary"
                    onClick={saveAllChanges}
                    disabled={saving}
                    style={{
                      backgroundColor: "#dc2626",
                      color: "#fff",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: "600",
                      padding: "10px 20px",
                      boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                    }}
                  >
                    {saving ? "Saving..." : "💾 Save All Changes"}
                  </button>
                </div>
              )}
            </div>
            {order.isLocked && (
              <div style={{ 
                fontSize: "12px", 
                color: "#dc2626", 
                marginBottom: "8px",
                fontStyle: "italic"
              }}>
                Note: Item editing is disabled while order is locked. Extended shipping and admin fields (price/purchasing notes) remain editable.
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: "1150px", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "150px" }}>Item name</th>
                    <th style={{ width: "50px" }}>Qty</th>
                    <th style={{ width: "100px" }}>Serial #</th>
                    <th style={{ width: "100px" }}>Model #</th>
                    <th style={{ width: "70px" }}>Voltage</th>
                    <th style={{ width: "90px" }}>Power</th>
                    <th style={{ width: "100px" }}>Ordered</th>
                    <th style={{ width: "180px" }}>Notes</th>
                    <th style={{ width: "160px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).length === 0 ? (
                    <tr><td colSpan={9} style={{ color: "#6b7280" }}>No items yet.</td></tr>
                  ) : (
                    order.items.map((it) => (
                      <EditableRow
                        key={it.id}
                        item={it}
                        itemEdits={itemEdits[it.id] || {}}
                        onFieldChange={(field, value) => updateItemEdit(it.id, field, value)}
                        onDelete={() => deleteItem(it.id)}
                        onMarkOrdered={() => markItemOrdered(it.id)}
                        onUnmarkOrdered={() => {
                          setUnorderingItemId(it.id);
                          setShowUnorderDialog(true);
                        }}
                        disabled={saving}
                        isLocked={order.isLocked}
                        isAdmin={isAdmin}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!order.isLocked && (
              <form onSubmit={addItem} style={{ marginTop: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Add New Item</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Product *</label>
                    <input
                      className="input"
                      placeholder="Product name"
                      value={newItem.productCode}
                      onChange={e => setNewItem(v => ({ ...v, productCode: e.target.value }))}
                      style={{ width: "200px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Qty *</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={newItem.qty}
                      onChange={e => setNewItem(v => ({ ...v, qty: e.target.value }))}
                      style={{ width: "80px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Serial #</label>
                    <input
                      className="input"
                      placeholder="Optional"
                      value={newItem.serialNumber}
                      onChange={e => setNewItem(v => ({ ...v, serialNumber: e.target.value }))}
                      style={{ width: "130px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Model #</label>
                    <input
                      className="input"
                      placeholder="Optional"
                      value={newItem.modelNumber}
                      onChange={e => setNewItem(v => ({ ...v, modelNumber: e.target.value }))}
                      style={{ width: "130px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Voltage</label>
                    <input
                      className="input"
                      placeholder="Optional"
                      value={newItem.voltage}
                      onChange={e => setNewItem(v => ({ ...v, voltage: e.target.value }))}
                      style={{ width: "90px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Power</label>
                    <input
                      className="input"
                      placeholder="HP / Wattage"
                      value={newItem.laserWattage}
                      onChange={e => setNewItem(v => ({ ...v, laserWattage: e.target.value }))}
                      style={{ width: "120px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Notes</label>
                    <input
                      className="input"
                      placeholder="Optional notes"
                      value={newItem.notes}
                      onChange={e => setNewItem(v => ({ ...v, notes: e.target.value }))}
                      style={{ width: "180px" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      id="extendedShipping"
                      checked={newItem.hasExtendedShipping}
                      onChange={e => setNewItem(v => ({ ...v, hasExtendedShipping: e.target.checked }))}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <label htmlFor="extendedShipping" style={{ fontSize: "12px", color: newItem.hasExtendedShipping ? "var(--success)" : "#6b7280" }}>
                      ⭐ Extended
                    </label>
                  </div>
                  <button className="btn primary" type="submit" disabled={saving}>Add Item</button>
                </div>
              </form>
            )}
          </section>

          <section style={{ marginTop: 32 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Internal Notes</h2>
            {order.isLocked && (
              <div style={{ 
                fontSize: "12px", 
                color: "#dc2626", 
                marginBottom: "8px",
                fontStyle: "italic"
              }}>
                🔒 Internal notes are locked and cannot be edited while the order is locked.
              </div>
            )}
            <div style={{
              backgroundColor: "#2d2d2d",
              border: "1px solid #4b5563",
              borderRadius: "6px",
              padding: "12px"
            }}>
              <textarea
                value={internalNotes}
                onChange={(e) => {
                  if (!order.isLocked) {
                    setInternalNotes(e.target.value);
                    setInternalNotesChanged(true);
                  }
                }}
                placeholder="Internal notes only, payment / ordering information."
                disabled={order.isLocked}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "8px",
                  border: "1px solid #4b5563",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  backgroundColor: order.isLocked ? "#1a1a1a" : "#2d2d2d",
                  color: order.isLocked ? "#6b7280" : "#e5e7eb",
                  opacity: order.isLocked ? 0.7 : 1,
                  cursor: order.isLocked ? "not-allowed" : "text"
                }}
              />
              <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>
                  These notes are private and will not be visible to customers.
                </div>
                {!order.isLocked && (
                  <button
                    className="btn primary"
                    onClick={saveInternalNotes}
                    disabled={!internalNotesChanged || internalNotesSaving}
                    style={{
                      opacity: !internalNotesChanged ? 0.5 : 1,
                      cursor: !internalNotesChanged ? "not-allowed" : "pointer"
                    }}
                  >
                    {internalNotesSaving ? "Saving..." : "Save Internal Notes"}
                  </button>
                )}
              </div>
            </div>
          </section>

          <MeasurementSection 
            order={order}
            items={order.items}
            onRefresh={load}
            getAuthHeaders={getAuthHeaders}
          />

          {order.auditLogs && order.auditLogs.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Lock/Unlock History</h2>
              <div style={{
                backgroundColor: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                padding: "12px",
                maxHeight: "200px",
                overflowY: "auto"
              }}>
                {order.auditLogs
                  .filter(log => log.action === "LOCKED" || log.action === "UNLOCKED")
                  .map((log) => (
                  <div key={log.id} style={{
                    paddingBottom: "8px",
                    marginBottom: "8px",
                    borderBottom: "1px solid #e5e7eb"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <strong style={{ color: log.action === "LOCKED" ? "#059669" : "#dc2626" }}>
                          {log.action}
                        </strong>
                        {log.metadata && (() => {
                          try {
                            const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                            return metadata.message ? (
                              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                                Reason: {metadata.message}
                              </div>
                            ) : null;
                          } catch {
                            return null;
                          }
                        })()}
                        {log.parsedReason?.message && (
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                            Reason: {log.parsedReason.message}
                          </div>
                        )}
                        <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                          By: {log.performedByName || log.performedBy?.name || "System"}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", whiteSpace: "nowrap" }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {showUnlockDialog && isAdmin && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            padding: "24px",
            maxWidth: "500px",
            width: "90%"
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Unlock Order</h3>
            <p style={{ marginBottom: "16px", color: "#6b7280" }}>
              Please provide a reason for unlocking this order. This will be logged in the audit trail.
            </p>
            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Enter reason for unlocking (minimum 10 characters)"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "8px",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                marginBottom: "16px"
              }}
            />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => {
                  setShowUnlockDialog(false);
                  setUnlockReason("");
                }}
                disabled={lockLoading}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={unlockOrder}
                disabled={lockLoading || unlockReason.trim().length < 10}
                style={{
                  backgroundColor: "#dc2626",
                  color: "#fff",
                  border: "none"
                }}
              >
                {lockLoading ? "Unlocking..." : "Unlock Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnorderDialog && isAdmin && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            padding: "24px",
            maxWidth: "500px",
            width: "90%"
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Unmark Item as Ordered</h3>
            <p style={{ marginBottom: "16px", color: "#6b7280" }}>
              Please provide a reason for unmarking this item as ordered. This will be logged in the audit trail.
            </p>
            <textarea
              value={unorderReason}
              onChange={(e) => setUnorderReason(e.target.value)}
              placeholder="Enter reason for unmarking as ordered (minimum 10 characters)"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "8px",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                marginBottom: "16px"
              }}
            />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => {
                  setShowUnorderDialog(false);
                  setUnorderReason("");
                  setUnorderingItemId(null);
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={unmarkItemOrdered}
                disabled={saving || unorderReason.trim().length < 10}
                style={{
                  backgroundColor: "#dc2626",
                  color: "#fff",
                  border: "none"
                }}
              >
                {saving ? "Processing..." : "Unmark as Ordered"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function EditableRow({ item, itemEdits, onFieldChange, onDelete, onMarkOrdered, onUnmarkOrdered, disabled, isLocked, isAdmin }) {
  // Use itemEdits for current values, fallback to item's original values
  const getValue = (field) => {
    if (itemEdits.hasOwnProperty(field)) {
      return itemEdits[field];
    }
    return item[field] ?? (field === 'qty' ? 1 : (field === 'hasExtendedShipping' ? false : (field === 'itemPrice' && item[field] !== null && item[field] !== undefined ? item[field].toString() : "")));
  };

  const name = getValue('productCode') || "";
  const qty = getValue('qty') || 1;
  const serialNumber = getValue('serialNumber') || "";
  const modelNumber = getValue('modelNumber') || "";
  const voltage = getValue('voltage') || "";
  const laserWattage = getValue('laserWattage') || "";
  const notes = getValue('notes') || "";
  const itemPrice = getValue('itemPrice') === null || getValue('itemPrice') === undefined || getValue('itemPrice') === "" ? "" : String(getValue('itemPrice'));
  const privateItemNote = getValue('privateItemNote') || "";
  const hasExtendedShipping = getValue('hasExtendedShipping') || false;

  const hasChanges = Object.keys(itemEdits).length > 0;
  const isOrdered = item.isOrdered;
  const orderedDate = item.orderedAt ? new Date(item.orderedAt).toLocaleDateString() : null;

  const handlePriceChange = (e) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      onFieldChange('itemPrice', value === "" ? null : value);
    }
  };

  return (
    <>
      <tr style={{ 
        backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent",
        ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
      }}>
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input 
              className="input" 
              value={name} 
              onChange={e => onFieldChange('productCode', e.target.value)} 
              disabled={isLocked}
              style={{ width: "125px", opacity: isLocked ? 0.6 : 1 }}
            />
            {hasExtendedShipping && (
              <span style={{ color: "var(--success)", fontSize: "16px" }} title="Extended Shipping">⭐</span>
            )}
          </div>
        </td>
        <td>
          <input 
            className="input" 
            type="number" 
            min={1} 
            value={qty} 
            onChange={e => onFieldChange('qty', Number(e.target.value))} 
            style={{ width: "45px", opacity: isLocked ? 0.6 : 1 }} 
            disabled={isLocked}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={serialNumber} 
            onChange={e => onFieldChange('serialNumber', e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "95px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={modelNumber} 
            onChange={e => onFieldChange('modelNumber', e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "95px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={voltage} 
            onChange={e => onFieldChange('voltage', e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "65px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={laserWattage} 
            onChange={e => onFieldChange('laserWattage', e.target.value)} 
            placeholder="HP / Wattage"
            disabled={isLocked}
            style={{ width: "85px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          {isOrdered ? (
            <div style={{ 
              color: "#059669", 
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}>
              <span>✓</span>
              {orderedDate && (
                <span title={`Ordered on ${orderedDate}`} style={{ cursor: "help" }}>
                  {orderedDate}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: "#6b7280", fontSize: "12px" }}>—</span>
          )}
        </td>
        <td>
          <input 
            className="input" 
            value={notes} 
            onChange={e => onFieldChange('notes', e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "175px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td style={{ paddingLeft: "8px" }}>
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "flex-start" }}>
            <button 
              className="btn danger" 
              onClick={onDelete} 
              disabled={disabled || isLocked} 
              style={{ borderColor: "#ef4444", color: "#b91c1c", fontSize: "11px", padding: "2px 5px" }}
              title={isLocked ? "Order is locked" : "Delete item"}
            >
              Delete
            </button>
            {isAdmin && (
              isOrdered ? (
                <button
                  className="btn"
                  onClick={onUnmarkOrdered}
                  disabled={disabled}
                  style={{ 
                    backgroundColor: "#059669", 
                    color: "#fff", 
                    border: "none",
                    fontSize: "11px", 
                    padding: "2px 5px"
                  }}
                  title="Item is ordered - click to unmark"
                >
                  Ordered
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={onMarkOrdered}
                  disabled={disabled}
                  style={{ 
                    backgroundColor: "#dc2626", 
                    color: "#fff", 
                    border: "none",
                    fontSize: "11px", 
                    padding: "2px 5px"
                  }}
                  title="Mark as ordered"
                >
                  Order
                </button>
              )
            )}
          </div>
        </td>
      </tr>
      <tr style={{ 
        backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent", 
        borderBottom: "2px solid #404040",
        ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
      }}>
        <td colSpan="9" style={{ padding: "8px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id={`extended-${item.id}`}
                checked={hasExtendedShipping}
                onChange={e => onFieldChange('hasExtendedShipping', e.target.checked)}
                disabled={isLocked}
                style={{ width: "16px", height: "16px", cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.6 : 1 }}
              />
              <label 
                htmlFor={`extended-${item.id}`} 
                style={{ 
                  fontSize: "12px", 
                  color: hasExtendedShipping ? "var(--success)" : "#6b7280",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  fontWeight: hasExtendedShipping ? "500" : "normal",
                  opacity: isLocked ? 0.6 : 1
                }}
              >
                ⭐ Extended Shipping
              </label>
            </div>
            
            {isAdmin && (
              <>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <input
                    className="input"
                    value={privateItemNote}
                    onChange={e => onFieldChange('privateItemNote', e.target.value)}
                    placeholder="Purchasing notes (private, admin only)"
                    style={{ 
                      width: "100%"
                    }}
                  />
                </div>
                <div style={{ width: "120px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "14px", color: "#9ca3af" }}>$</span>
                    <input
                      className="input"
                      type="text"
                      value={itemPrice}
                      onChange={handlePriceChange}
                      placeholder="0.00"
                      style={{ 
                        width: "90px", 
                        textAlign: "right"
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          {hasExtendedShipping && (
            <div style={{ 
              marginTop: "4px", 
              fontSize: "11px", 
              color: "var(--success)", 
              fontStyle: "italic" 
            }}>
              This item requires extended lead time and will add extra days to the ETA
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
