"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import MeasurementSection from "@/components/MeasurementSection";

// Import modularized components
import UnlockDialog from "./components/UnlockDialog";
import UnorderDialog from "./components/UnorderDialog";
import ItemsTable from "./components/ItemsTable";
import OrderInformation from "./components/OrderInformation";
import InternalNotesSection from "./components/InternalNotesSection";

// Import API services
import { orderApi, itemApi } from "./services/orderApi";

export default function EditOrderPage({ params }) {
  const { id } = params;
  const { user, getAuthHeaders, isAdmin } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
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

  const [onsiteInstallationDate, setOnsiteInstallationDate] = useState("");
  const [isSavingInstallationDate, setIsSavingInstallationDate] = useState(false);

  const [discount, setDiscount] = useState("");
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);

  const [salesAgent, setSalesAgent] = useState("");
  const [salesAgents, setSalesAgents] = useState([]);
  const [isSavingSalesAgent, setIsSavingSalesAgent] = useState(false);

  const [itemEdits, setItemEdits] = useState({});
  const [manufacturers, setManufacturers] = useState([]);

  // Block manufacturers from accessing edit order page
  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    
    if (user.role === "MANUFACTURER") {
      alert("Access denied. Manufacturers can only move items between stages on the board.");
      router.push("/admin/board");
    }
  }, [user, router]);

  // Load manufacturers and sales agents
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const [mfgData, agentsData] = await Promise.all([
          orderApi.getManufacturers(getAuthHeaders),
          orderApi.getSalesAgents(getAuthHeaders)
        ]);
        setManufacturers(mfgData);
        setSalesAgents(agentsData);
      } catch (e) {
        console.error('Failed to load data:', e);
      }
    }
    loadData();
  }, [user]);

  async function load() {
    if (!user) return;
    
    try {
      setLoading(true);
      const orderData = await orderApi.getOrder(id, getAuthHeaders);
      setOrder(orderData);
      setCustomerDocsLink(orderData.customerDocsLink || "");
      setInternalNotes(orderData.internalNotes || "");
      setInternalNotesChanged(false);
      setItemEdits({});
      setDiscount(orderData.discount ? String(orderData.discount) : "");
      setSalesAgent(orderData.sku || "");
      
      if (orderData.orderDate) {
        const date = new Date(orderData.orderDate);
        const formatted = date.toISOString().split('T')[0];
        setOrderDate(formatted);
      } else {
        setOrderDate("");
      }
      
      if (orderData.onsiteInstallationDate) {
        const date = new Date(orderData.onsiteInstallationDate);
        const formatted = date.toISOString().split('T')[0];
        setOnsiteInstallationDate(formatted);
      } else {
        setOnsiteInstallationDate("");
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

  function updateItemEdit(itemId, field, value) {
    setItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [field]: value
      }
    }));
  }

  async function saveAllChanges() {
    if (!Object.keys(itemEdits).length) return;
    
    try {
      setSaving(true);
      const errors = [];
      
      for (const [itemId, changes] of Object.entries(itemEdits)) {
        try {
          await itemApi.updateItem(id, itemId, changes, getAuthHeaders);
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

  async function saveInternalNotes() {
    try {
      setInternalNotesSaving(true);
      await orderApi.updateInternalNotes(id, internalNotes, getAuthHeaders);
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
    if (orderDate === currentOrderDate) return;
    
    try {
      setIsSavingOrderDate(true);
      await orderApi.updateOrder(id, { orderDate }, getAuthHeaders);
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

  async function saveOnsiteInstallationDate() {
    const currentInstallationDate = order?.onsiteInstallationDate ? new Date(order.onsiteInstallationDate).toISOString().split('T')[0] : "";
    if (onsiteInstallationDate === currentInstallationDate) return;
    
    try {
      setIsSavingInstallationDate(true);
      await orderApi.updateOrder(id, { onsiteInstallationDate: onsiteInstallationDate || null }, getAuthHeaders);
      setOrder(prev => ({ ...prev, onsiteInstallationDate: onsiteInstallationDate || null }));
      alert("Onsite installation date updated successfully");
    } catch (err) {
      alert(`Failed to update installation date: ${err.message}`);
      if (order?.onsiteInstallationDate) {
        const date = new Date(order.onsiteInstallationDate);
        setOnsiteInstallationDate(date.toISOString().split('T')[0]);
      } else {
        setOnsiteInstallationDate("");
      }
    } finally {
      setIsSavingInstallationDate(false);
    }
  }

  async function saveSalesAgent() {
    const currentSalesAgent = order?.sku || "";
    if (salesAgent === currentSalesAgent) return;
    
    try {
      setIsSavingSalesAgent(true);
      await orderApi.updateOrder(id, { sku: salesAgent }, getAuthHeaders);
      setOrder(prev => ({ ...prev, sku: salesAgent }));
      alert("Sales agent updated successfully");
    } catch (err) {
      alert(`Failed to update sales agent: ${err.message}`);
      setSalesAgent(currentSalesAgent);
    } finally {
      setIsSavingSalesAgent(false);
    }
  }

  async function saveDiscount() {
    const currentDiscount = order?.discount ? String(order.discount) : "";
    if (discount === currentDiscount) return;
    
    try {
      setIsSavingDiscount(true);
      const discountValue = discount.trim() === "" ? 0 : parseFloat(discount);
      
      if (isNaN(discountValue) || discountValue < 0) {
        alert("Please enter a valid discount amount (0 or greater)");
        setDiscount(currentDiscount);
        return;
      }
      
      await orderApi.updateOrder(id, { discount: discountValue }, getAuthHeaders);
      setOrder(prev => ({ ...prev, discount: discountValue }));
    } catch (err) {
      alert(`Failed to update discount: ${err.message}`);
      setDiscount(currentDiscount);
    } finally {
      setIsSavingDiscount(false);
    }
  }

  async function saveCustomerDocsLink() {
    if (customerDocsLink === (order?.customerDocsLink || "")) return;
    
    try {
      setIsSavingDocsLink(true);
      await orderApi.updateOrder(id, { customerDocsLink }, getAuthHeaders);
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
      await orderApi.lockOrder(id, "Order locked for data integrity", getAuthHeaders);
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
      await orderApi.unlockOrder(id, unlockReason, getAuthHeaders);
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

  async function markItemOrdered(itemId) {
    if (!isAdmin) {
      alert("Only administrators can mark items as ordered.");
      return;
    }
    
    try {
      setSaving(true);
      await itemApi.markItemOrdered(id, itemId, getAuthHeaders);
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
      await itemApi.unmarkItemOrdered(id, unorderingItemId, unorderReason, getAuthHeaders);
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

  async function deleteItem(itemId) {
    if (!confirm("Permanently delete this item? This cannot be undone.")) return;
    try {
      setSaving(true);
      await itemApi.deleteItem(id, itemId, getAuthHeaders);
      await load();
    } catch (e) {
      alert(`Failed to delete item: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function addItem(item) {
    try {
      setSaving(true);
      await itemApi.addItem(id, item, getAuthHeaders);
      await load();
      return true;
    } catch (e) {
      alert(`Failed to add item: ${e.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return null;
  }

  const hasExtendedShipping = order?.items?.some(item => item.hasExtendedShipping === true) || false;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Edit Order</h1>
        </div>

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

            <OrderInformation
              order={order}
              orderDate={orderDate}
              setOrderDate={setOrderDate}
              salesAgent={salesAgent}
              setSalesAgent={setSalesAgent}
              salesAgents={salesAgents}
              onSaveOrderDate={saveOrderDate}
              onSaveSalesAgent={saveSalesAgent}
              isSavingOrderDate={isSavingOrderDate}
              isSavingSalesAgent={isSavingSalesAgent}
            />

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
              
              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
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
                </div>
                
                <div style={{ 
                  minWidth: "200px",
                  paddingLeft: "24px",
                  borderLeft: "1px solid #404040"
                }}>
                  <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#ef4444", fontWeight: "500" }}>
                    Onsite Installation Date
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="date"
                      value={onsiteInstallationDate}
                      onChange={(e) => setOnsiteInstallationDate(e.target.value)}
                      onBlur={saveOnsiteInstallationDate}
                      className="input"
                      style={{ 
                        width: "160px",
                        padding: "6px 10px"
                      }}
                      disabled={isSavingInstallationDate}
                    />
                    {isSavingInstallationDate && (
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
                    )}
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                    Date when installation will occur onsite
                  </div>
                </div>
              </div>
            </section>

            <ItemsTable
              order={order}
              items={order.items}
              itemEdits={itemEdits}
              onFieldChange={updateItemEdit}
              onDelete={deleteItem}
              onMarkOrdered={markItemOrdered}
              onUnmarkOrdered={(itemId) => {
                setUnorderingItemId(itemId);
                setShowUnorderDialog(true);
              }}
              onSaveAllChanges={saveAllChanges}
              onAddItem={addItem}
              disabled={saving}
              isAdmin={isAdmin}
              manufacturers={manufacturers}
            />

            <section style={{ marginTop: 32 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Discount</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: "18px", color: "#9ca3af" }}>$</span>
                <input
                  className="input"
                  type="text"
                  value={discount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
                      setDiscount(value);
                    }
                  }}
                  onBlur={saveDiscount}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="0.00"
                  style={{ width: "120px", textAlign: "right" }}
                  disabled={isSavingDiscount}
                />
                {isSavingDiscount && (
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                Discount amount will be subtracted from order total when calculating commissions. Press Enter or click outside to save.
              </div>
            </section>

            <InternalNotesSection
              order={order}
              internalNotes={internalNotes}
              setInternalNotes={setInternalNotes}
              internalNotesChanged={internalNotesChanged}
              setInternalNotesChanged={setInternalNotesChanged}
              onSaveInternalNotes={saveInternalNotes}
              internalNotesSaving={internalNotesSaving}
            />

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
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : new Date(log.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <UnlockDialog
          show={showUnlockDialog && isAdmin}
          unlockReason={unlockReason}
          setUnlockReason={setUnlockReason}
          onCancel={() => {
            setShowUnlockDialog(false);
            setUnlockReason("");
          }}
          onUnlock={unlockOrder}
          loading={lockLoading}
        />

        <UnorderDialog
          show={showUnorderDialog && isAdmin}
          unorderReason={unorderReason}
          setUnorderReason={setUnorderReason}
          onCancel={() => {
            setShowUnorderDialog(false);
            setUnorderReason("");
            setUnorderingItemId(null);
          }}
          onUnorder={unmarkItemOrdered}
          saving={saving}
        />
      </div>
    </>
  );
}
