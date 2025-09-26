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
  const [newItem, setNewItem] = useState({ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", laserWattage: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  
  // Local state for customer documents link
  const [customerDocsLink, setCustomerDocsLink] = useState("");
  const [isSavingDocsLink, setIsSavingDocsLink] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function load() {
    if (!user) return; // Don't try to load if not authenticated
    
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { 
        cache: "no-store",
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const orderData = await res.json();
      setOrder(orderData);
      // Update local state with fetched value
      setCustomerDocsLink(orderData.customerDocsLink || "");
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

  // Save customer documents link
  async function saveCustomerDocsLink() {
    // Only save if the value has changed
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
      
      // Update the order state with the new link
      setOrder(prev => ({ ...prev, customerDocsLink: customerDocsLink }));
    } catch (err) {
      alert("Failed to update documents link");
      // Revert to original value on error
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

  async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes) {
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { 
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      await load();
    } catch (e) {
      alert(`Failed to save item: ${e.message}`);
    } finally {
      setSaving(false);
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
        body: JSON.stringify({ productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setNewItem({ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", laserWattage: "", notes: "" });
      await load();
    } catch (e) {
      alert(`Failed to add item: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Don't render content until authentication is checked
  if (!user) {
    return null;
  }

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
          {/* Lock Status Banner */}
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
                  Item details cannot be edited while the order is locked.
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

          {/* Customer Documents Link Section - Fixed with local state */}
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
                    e.currentTarget.blur(); // Trigger save on Enter
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

          <section style={{ marginTop: 8 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Items</h2>
            {order.isLocked && (
              <div style={{ 
                fontSize: "12px", 
                color: "#dc2626", 
                marginBottom: "8px",
                fontStyle: "italic"
              }}>
                Note: Item editing is disabled while order is locked. You can still move items through stages.
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: "1000px", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "170px" }}>Item name</th>
                    <th style={{ width: "60px" }}>Qty</th>
                    <th style={{ width: "110px" }}>Serial #</th>
                    <th style={{ width: "110px" }}>Model #</th>
                    <th style={{ width: "70px" }}>Voltage</th>
                    <th style={{ width: "100px" }}>Laser Wattage</th>
                    <th style={{ width: "210px" }}>Notes</th>
                    <th style={{ width: "120px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).length === 0 ? (
                    <tr><td colSpan={8} style={{ color: "#6b7280" }}>No items yet.</td></tr>
                  ) : (
                    order.items.map((it) => (
                      <EditableRow
                        key={it.id}
                        item={it}
                        onSave={(name, qty, serial, model, voltage, laserWattage, notes) => 
                          saveItem(it.id, name, qty, serial, model, voltage, laserWattage, notes)}
                        onDelete={() => deleteItem(it.id)}
                        disabled={saving || order.isLocked}
                        isLocked={order.isLocked}
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
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Laser Wattage</label>
                    <input
                      className="input"
                      placeholder="Optional"
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
                  <button className="btn primary" type="submit" disabled={saving}>Add Item</button>
                </div>
              </form>
            )}
          </section>

          {/* Measurements Section - Always Editable */}
          <MeasurementSection 
            order={order}
            items={order.items}
            onRefresh={load}
            getAuthHeaders={getAuthHeaders}
          />

          {/* Audit Log Section - Fixed to show unlock reasons */}
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
                        {/* Parse and display reason from metadata */}
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
                        {/* Also check parsedReason for backward compatibility */}
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

      {/* Unlock Dialog - Only for Admins */}
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
    </div>
  );
}

function EditableRow({ item, onSave, onDelete, disabled, isLocked }) {
  const [name, setName] = useState(item.productCode || "");
  const [qty, setQty] = useState(item.qty || 1);
  const [serialNumber, setSerialNumber] = useState(item.serialNumber || "");
  const [modelNumber, setModelNumber] = useState(item.modelNumber || "");
  const [voltage, setVoltage] = useState(item.voltage || "");
  const [laserWattage, setLaserWattage] = useState(item.laserWattage || "");
  const [notes, setNotes] = useState(item.notes || "");
  
  const changed = name.trim() !== (item.productCode || "") || 
                  Number(qty) !== Number(item.qty || 1) ||
                  serialNumber.trim() !== (item.serialNumber || "") ||
                  modelNumber.trim() !== (item.modelNumber || "") ||
                  voltage.trim() !== (item.voltage || "") ||
                  laserWattage.trim() !== (item.laserWattage || "") ||
                  notes.trim() !== (item.notes || "");

  return (
    <tr>
      <td>
        <input 
          className="input" 
          value={name} 
          onChange={e => setName(e.target.value)} 
          disabled={isLocked}
          style={{ width: "165px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>
      <td>
        <input 
          className="input" 
          type="number" 
          min={1} 
          value={qty} 
          onChange={e => setQty(e.target.value)} 
          style={{ width: "50px", opacity: isLocked ? 0.6 : 1 }} 
          disabled={isLocked}
        />
      </td>
      <td>
        <input 
          className="input" 
          value={serialNumber} 
          onChange={e => setSerialNumber(e.target.value)} 
          placeholder="Optional"
          disabled={isLocked}
          style={{ width: "105px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>
      <td>
        <input 
          className="input" 
          value={modelNumber} 
          onChange={e => setModelNumber(e.target.value)} 
          placeholder="Optional"
          disabled={isLocked}
          style={{ width: "105px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>
      <td>
        <input 
          className="input" 
          value={voltage} 
          onChange={e => setVoltage(e.target.value)} 
          placeholder="Optional"
          disabled={isLocked}
          style={{ width: "65px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>
      <td>
        <input 
          className="input" 
          value={laserWattage} 
          onChange={e => setLaserWattage(e.target.value)} 
          placeholder="Optional"
          disabled={isLocked}
          style={{ width: "95px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>
      <td>
        <input 
          className="input" 
          value={notes} 
          onChange={e => setNotes(e.target.value)} 
          placeholder="Optional"
          disabled={isLocked}
          style={{ width: "205px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>
      <td>
        <div style={{ display: "flex", gap: 4 }}>
          <button 
            className="btn" 
            disabled={!changed || disabled} 
            onClick={() => onSave(name.trim(), Number(qty || 1), serialNumber.trim(), modelNumber.trim(), voltage.trim(), laserWattage.trim(), notes.trim())}
            title={isLocked ? "Order is locked" : "Save changes"}
            style={{ fontSize: "12px", padding: "4px 8px" }}
          >
            Save
          </button>
          <button 
            className="btn danger" 
            onClick={onDelete} 
            disabled={disabled} 
            style={{ borderColor: "#ef4444", color: "#b91c1c", fontSize: "12px", padding: "4px 8px" }}
            title={isLocked ? "Order is locked" : "Delete item"}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}