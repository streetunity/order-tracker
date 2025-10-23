"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import QuickActions from "@/components/QuickActions";
import NotificationBar from "@/components/NotificationBar";
import "./board.css";
import { OrderedIndicator } from './OrderedIndicator';

// Stage keys from API (do not change)
const STAGES = [
  "MANUFACTURING",
  "TESTING",
  "SHIPPING",
  "AT_SEA",
  "SMT",
  "QC",
  "DELIVERED",
  "ONSITE",
  "COMPLETED",
  "FOLLOW_UP",
];

// Display labels for column headers (safe to edit)
const STAGE_LABELS = {
  MANUFACTURING: "Manufacturing",
  TESTING: "Debugging & Testing",
  SHIPPING: "Preparing Container",
  AT_SEA: "Container At Sea",
  SMT: "Arrived At SMT",
  QC: "Quality Control",
  DELIVERED: "Delivered To Customer",
  ONSITE: "On Site Setup & Training",
  COMPLETED: "Training Complete",
  FOLLOW_UP: "Follow Up",
};

export default function AdminBoardPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null);
  const [salesReps, setSalesReps] = useState([]);

  // Confirmation dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [performingAction, setPerformingAction] = useState(false);

  // Check if user is manufacturer
  const isManufacturer = user?.role === "MANUFACTURER";

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function load() {
    if (!user) return;
    
    try {
      setLoading(true);
      setErr("");
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      const res = await fetch(`/api/orders?${params.toString()}`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      
      // Extract unique sales reps
      const reps = [...new Set(data.filter(o => o.sku).map(o => o.sku))].sort();
      setSalesReps(reps);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Filter orders by sales rep and stage
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    
    // Filter by sales rep
    if (salesRepFilter) {
      filtered = filtered.filter(order => order.sku === salesRepFilter);
    }
    
    // Filter by stage and archived status
    if (!stageFilter) {
      return filtered.map(order => {
        const activeItems = (order.items || []).filter(item => showArchived || !item.archivedAt);
        if (activeItems.length === 0) return null;
        return { ...order, items: activeItems };
      }).filter(Boolean);
    }
    
    return filtered.map(order => {
      const filteredItems = (order.items || []).filter(item => {
        const itemStage = item.currentStage || order.currentStage || "MANUFACTURING";
        return itemStage === stageFilter && (!item.archivedAt || showArchived);
      });
      if (filteredItems.length === 0) return null;
      return { ...order, items: filteredItems };
    }).filter(Boolean);
  }, [orders, stageFilter, salesRepFilter, showArchived]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const o of orders) {
      for (const it of o.items || []) {
        if (!showArchived && it.archivedAt) continue;
        const s = it.currentStage || o.currentStage || "MANUFACTURING";
        if (c[s] != null) c[s] += 1;
      }
    }
    return c;
  }, [orders, showArchived]);

  async function changeItemStage(orderId, itemId, nextStage, opts = {}) {
    const res = await fetch(`/api/orders/${orderId}/items/${itemId}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ nextStage, ...opts }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  }

  async function archiveItem(orderId, itemId, archived) {
    const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ archivedAt: archived ? new Date().toISOString() : null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  }

  async function deleteItem(orderId, itemId) {
    const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  }

  // Handle archive button click
  const handleArchiveClick = (orderId, itemId, itemName, isArchived) => {
    setPendingAction({
      type: 'archive',
      orderId,
      itemId,
      itemName,
      isArchived
    });
    setShowArchiveConfirm(true);
  };

  // Handle delete button click
  const handleDeleteClick = (orderId, itemId, itemName, isOrderLocked) => {
    if (isOrderLocked) {
      alert("Cannot delete items from a locked order. Please unlock it first in the Edit Order page.");
      return;
    }
    setPendingAction({
      type: 'delete',
      orderId,
      itemId,
      itemName
    });
    setShowDeleteConfirm(true);
  };

  // Execute the pending action
  const executePendingAction = async () => {
    if (!pendingAction) return;

    try {
      setPerformingAction(true);
      
      if (pendingAction.type === 'delete') {
        await deleteItem(pendingAction.orderId, pendingAction.itemId);
      } else if (pendingAction.type === 'archive') {
        await archiveItem(pendingAction.orderId, pendingAction.itemId, !pendingAction.isArchived);
      }
      
      await load();
      setShowDeleteConfirm(false);
      setShowArchiveConfirm(false);
      setPendingAction(null);
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPerformingAction(false);
    }
  };

  // Cancel the pending action
  const cancelPendingAction = () => {
    setShowDeleteConfirm(false);
    setShowArchiveConfirm(false);
    setPendingAction(null);
  };

  function nextStageOf(s) {
    const i = STAGES.indexOf(s);
    return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
  }
  
  function prevStageOf(s) {
    const i = STAGES.indexOf(s);
    return i > 0 ? STAGES[i - 1] : null;
  }

  function copyToClipboard(token, orderId) {
    const url = `${window.location.origin}/t/${token}`;
    const textArea = document.createElement("textarea");
    textArea.value = url;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      setCopiedLink(orderId);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      alert('Failed to copy link. Please copy manually: ' + url);
    } finally {
      document.body.removeChild(textArea);
    }
  }

  const grouped = useMemo(() => {
    const by = new Map();
    for (const o of filteredOrders) {
      if (!o.items || o.items.length === 0) continue;
      const key = o.account?.id || o.accountId || o.id;
      if (!by.has(key))
        by.set(key, {
          accountId: o.account?.id || o.accountId || null,
          accountName: o.account?.name || "—",
          orders: [],
        });
      by.get(key).orders.push(o);
    }
    return Array.from(by.values()).sort((a, b) =>
      a.accountName.localeCompare(b.accountName)
    );
  }, [filteredOrders]);

  if (!user) return null;

  return (
    <div className={`boardContainer ${isManufacturer ? 'manufacturer-view' : ''}`}>
      <TopNav />
      <NotificationBar />
      
      {/* Unified sticky container for QuickActions + Toolbar */}
      <div className="stickyActionsToolbar">
        {/* HIDE QUICKACTIONS FOR MANUFACTURERS */}
        {!isManufacturer && <QuickActions />}
        
        <div className="toolbar">
          <div className="tool">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Order Date / Sales Person / Account / Item / Serial #"
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, minWidth: "350px" }}
            />
            <button className="btn" onClick={load}>Apply</button>
          </div>
          <div className="tool">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
            >
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s] ?? s.replace(/_/g, " ")}</option>
              ))}
            </select>
            {stageFilter && (
              <button className="btn" onClick={() => setStageFilter("")} style={{ marginLeft: "4px" }}>Clear</button>
            )}
          </div>
          <div className="tool">
            <select
              value={salesRepFilter}
              onChange={(e) => setSalesRepFilter(e.target.value)}
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
            >
              <option value="">All Sales Reps</option>
              {salesReps.map((rep) => (
                <option key={rep} value={rep}>{rep}</option>
              ))}
            </select>
            {salesRepFilter && (
              <button className="btn" onClick={() => setSalesRepFilter("")} style={{ marginLeft: "4px" }}>Clear</button>
            )}
          </div>
          <div className="tool">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          </div>
          {!!err && <div className="errorBox">Failed to load: {err}</div>}
          {loading && <div className="loading">Loading…</div>}
          {!loading && (stageFilter || salesRepFilter) && grouped.length === 0 && (
            <div style={{ padding: "8px 12px", backgroundColor: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "6px", color: "#92400e" }}>
              No items found with current filters.
              <button onClick={() => { setStageFilter(""); setSalesRepFilter(""); }} style={{ marginLeft: "8px", textDecoration: "underline", background: "none", border: "none", color: "#92400e", cursor: "pointer" }}>Clear all filters</button>
            </div>
          )}
        </div>
      </div>

      <div className="stageBoard">
        <div className="stageCol stickyHeader stickyCol">
          <div className="stageTitle">Customer{(stageFilter || salesRepFilter) && <span style={{ fontSize: "11px", fontWeight: "normal", display: "block", color: "#f59e0b" }}>(filtered)</span>}</div>
        </div>
        {STAGES.map((s) => (
          <div key={s} className="stageCol stickyHeader">
            <div className="stageTitle">
              {STAGE_LABELS[s] ?? s.replace(/_/g, " ")}
              <span className="count">({counts[s] ?? 0})</span>
              {stageFilter === s && <span style={{ fontSize: "11px", fontWeight: "normal", display: "block", color: "#f59e0b" }}>(active filter)</span>}
            </div>
          </div>
        ))}

        {grouped.map((group) => {
          const hasLockedOrder = group.orders.some(o => o.isLocked);
          return (
            <div className="customerRow" key={group.accountId || group.accountName}>
              <div className="stageCol stickyCol">
                <div className="customerHeader">
                  <div className="customerName">
                    {hasLockedOrder && <span style={{ color: "#dc2626", marginRight: "6px", fontSize: "16px", verticalAlign: "middle" }} title="Order is locked - item details cannot be edited">🔒</span>}
                    {group.accountName}
                    {/* HIDE EDIT LINK FOR MANUFACTURERS */}
                    {!isManufacturer && group.orders?.[0] && (
                      <> <Link className="link tiny" href={`/admin/orders/${group.orders[0].id}`} title={hasLockedOrder ? "Edit order (locked)" : "Edit order"}>✎ Edit</Link></>
                    )}
                  </div>
                  <div className="publicLinks">
                    {(group.orders || []).map((o) => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {o.isLocked && <span style={{ color: "#dc2626", fontSize: "10px" }} title={`Locked${o.lockedAt ? ` on ${new Date(o.lockedAt).toLocaleDateString()}` : ''}`}>🔒</span>}
                        <a className="link tiny" href={`/t/${o.trackingToken}`} target="_blank" rel="noreferrer" title="Public tracking link">Public link</a>
                        <button onClick={() => copyToClipboard(o.trackingToken, o.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", fontSize: "12px", color: copiedLink === o.id ? "#d1d5db" : "#9ca3af", transition: "color 0.2s" }} title={copiedLink === o.id ? "Copied!" : "Copy link to clipboard"}>{copiedLink === o.id ? "✓" : "📋"}</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {STAGES.map((stageKey) => {
                const itemsInStage = (group.orders || []).flatMap((o) =>
                  (o.items || [])
                    .filter((it) => {
                      const s = it.currentStage || o.currentStage || "MANUFACTURING";
                      if (!showArchived && it.archivedAt) return false;
                      return s === stageKey;
                    })
                    .map((it) => ({ it, order: o }))
                );

                return (
                  <div key={`${group.accountId}-${stageKey}`} className="stageCol">
                    {itemsInStage.length === 0 ? (
                      <div className="emptyCell">—</div>
                    ) : (
                      <div className="itemsContainer">
                        {itemsInStage.map(({ it, order }) => {
                          const s = it.currentStage || order.currentStage || "MANUFACTURING";
                          const next = nextStageOf(s);
                          const prev = prevStageOf(s);
                          const isArchived = !!it.archivedAt;
                          const isOrderLocked = order.isLocked;
                          
                          let tooltipText = `${it.productCode || "Item"} - ${s}`;
                          if (it.serialNumber) tooltipText += `\nS/N: ${it.serialNumber}`;
                          if (it.modelNumber) tooltipText += `\nModel: ${it.modelNumber}`;
                          if (it.voltage) tooltipText += `\nPower: ${it.voltage}`;
                          if (it.notes) tooltipText += `\nNotes: ${it.notes}`;
                          if (isOrderLocked) tooltipText += "\n(Order Locked)";
                          
                          return (
                            <div key={it.id} className={`itemCard${isArchived ? " archived" : ""}${isOrderLocked ? " locked" : ""}`} title={tooltipText} style={{ borderColor: isOrderLocked ? "#dc2626" : undefined, borderWidth: isOrderLocked ? "2px" : undefined }}>
                              <div className="itemTitle">{it.productCode || "Item"}</div>
                              <div className="itemActions" style={{ gap: "2px" }}>
                                <button className="miniBtn" aria-label="Move back" disabled={!prev} onClick={async () => { if (!prev) return; try { await changeItemStage(order.id, it.id, prev, { allowBackward: true }); await load(); } catch (e) { alert(`Failed to move back: ${e instanceof Error ? e.message : e}`); } }} title={prev ? `Move to ${STAGE_LABELS[prev] ?? prev}` : "No previous stage"} style={{ fontSize: "10px", padding: "2px 4px" }}>◀</button>
                                <button className="miniBtn" aria-label="Move forward" disabled={!next} onClick={async () => { if (!next) return; try { await changeItemStage(order.id, it.id, next, { allowFastForward: true }); await load(); } catch (e) { alert(`Failed to move forward: ${e instanceof Error ? e.message : e}`); } }} title={next ? `Move to ${STAGE_LABELS[next] ?? next}` : "No next stage"} style={{ fontSize: "10px", padding: "2px 4px" }}>▶</button>
                                
                                {/* HIDE ARCHIVE AND DELETE BUTTONS FOR MANUFACTURERS */}
                                {!isManufacturer && (
                                  <>
                                    {!isArchived ? (
                                      <button className="miniBtn danger" aria-label="Archive" onClick={() => handleArchiveClick(order.id, it.id, it.productCode || "this item", false)} title="Archive (hide from board)" style={{ fontSize: "10px", padding: "2px 4px" }}>✕</button>
                                    ) : (
                                      <button className="miniBtn" aria-label="Restore" onClick={() => handleArchiveClick(order.id, it.id, it.productCode || "this item", true)} title="Restore (show on board)" style={{ fontSize: "10px", padding: "2px 4px" }}>↺</button>
                                    )}
                                    <button className="miniBtn danger" aria-label="Delete item" onClick={() => handleDeleteClick(order.id, it.id, it.productCode || "this item", isOrderLocked)} title={isOrderLocked ? "Order is locked - cannot delete" : "Delete item permanently"} style={{ opacity: isOrderLocked ? 0.5 : 1, cursor: isOrderLocked ? "not-allowed" : "pointer", fontSize: "10px", padding: "2px 4px" }}>🗑</button>
                                  </>
                                )}
                                
                                {it.isOrdered && <span style={{ width: '8px', display: 'inline-block' }}></span>}
                                {it.isOrdered && <span title="Item ordered" style={{ display: 'inline-block', backgroundColor: '#16a34a', color: 'white', fontWeight: 'bold', fontSize: '10px', width: '16px', height: '16px', lineHeight: '16px', textAlign: 'center', borderRadius: '50%', cursor: 'help' }}>$</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && pendingAction && (
        <div className="confirm-overlay" onClick={cancelPendingAction}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Delete Item Permanently?</h3>
            <p style={{ fontSize: "16px", marginBottom: "1rem" }}>
              You are about to permanently delete <strong>"{pendingAction.itemName}"</strong>.
            </p>
            <div style={{ 
              padding: "1rem", 
              backgroundColor: "rgba(239, 68, 68, 0.1)", 
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              marginBottom: "1rem"
            }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#ef4444" }}>
                <strong>Warning:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "14px" }}>
                <li>This action cannot be undone</li>
                <li>The item will be completely removed from the system</li>
                <li>All item data (serial numbers, notes, measurements) will be lost</li>
              </ul>
            </div>
            <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "14px" }}>
              <strong>Alternative:</strong> Consider archiving the item instead. Archived items are hidden from the board but can be restored later by clicking "Show archived items".
            </p>
            <div className="confirm-actions">
              <button 
                onClick={cancelPendingAction} 
                className="btn-cancel"
                disabled={performingAction}
              >
                Cancel
              </button>
              <button 
                onClick={executePendingAction} 
                disabled={performingAction}
                className="btn-confirm"
                style={{ backgroundColor: "#ef4444" }}
              >
                {performingAction ? "Deleting..." : "Yes, Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive/Restore Confirmation Dialog */}
      {showArchiveConfirm && pendingAction && (
        <div className="confirm-overlay" onClick={cancelPendingAction}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{pendingAction.isArchived ? "📦 Restore Item?" : "📦 Archive Item?"}</h3>
            <p style={{ fontSize: "16px", marginBottom: "1rem" }}>
              {pendingAction.isArchived 
                ? <>You are about to restore <strong>"{pendingAction.itemName}"</strong>.</>
                : <>You are about to archive <strong>"{pendingAction.itemName}"</strong>.</>
              }
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
                {pendingAction.isArchived ? (
                  <>
                    <li>The item will reappear on the board and kiosk view</li>
                    <li>All item data will be preserved</li>
                    <li>The item will continue through the production stages</li>
                  </>
                ) : (
                  <>
                    <li>The item will be hidden from the board and kiosk view</li>
                    <li>All item data will be preserved</li>
                    <li>You can restore it later by clicking "Show archived items"</li>
                  </>
                )}
              </ul>
            </div>
            <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "14px" }}>
              {!pendingAction.isArchived && (
                <><strong>Note:</strong> This does not delete the item. You can bring it back anytime.</>
              )}
            </p>
            <div className="confirm-actions">
              <button 
                onClick={cancelPendingAction} 
                className="btn-cancel"
                disabled={performingAction}
              >
                Cancel
              </button>
              <button 
                onClick={executePendingAction} 
                disabled={performingAction}
                className="btn-confirm"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {performingAction 
                  ? (pendingAction.isArchived ? "Restoring..." : "Archiving...") 
                  : (pendingAction.isArchived ? "Yes, Restore Item" : "Yes, Archive Item")
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
