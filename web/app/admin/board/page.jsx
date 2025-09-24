"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import "./board.css";

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
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

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
      setErr("");
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      // REMOVED: Don't send stage filter to backend - filter on frontend instead
      // if (stageFilter) params.set("stage", stageFilter);

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

  // Filter orders on the frontend based on stage filter - ITEM-LEVEL FILTERING
  const filteredOrders = useMemo(() => {
    if (!stageFilter) return orders;
    
    // Filter orders and their items to only show items in the selected stage
    return orders.map(order => {
      // Filter items to only those in the selected stage
      const filteredItems = (order.items || []).filter(item => {
        const itemStage = item.currentStage || order.currentStage || "MANUFACTURING";
        return itemStage === stageFilter && (!item.archivedAt || showArchived);
      });
      
      // Only include the order if it has filtered items
      if (filteredItems.length === 0) return null;
      
      // Return order with only the filtered items
      return {
        ...order,
        items: filteredItems
      };
    }).filter(Boolean); // Remove null entries
  }, [orders, stageFilter, showArchived]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0]));
    // Use ALL orders for counts, not filtered ones
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
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders(),
      },
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
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders(),
      },
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

  function nextStageOf(s) {
    const i = STAGES.indexOf(s);
    return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
  }
  function prevStageOf(s) {
    const i = STAGES.indexOf(s);
    return i > 0 ? STAGES[i - 1] : null;
  }

  // Use filteredOrders instead of orders for grouping
  const grouped = useMemo(() => {
    const by = new Map();
    // Use filteredOrders to only show customers with items matching the filter
    for (const o of filteredOrders) {
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

  // Don't render content until authentication is checked
  if (!user) {
    return null;
  }

  return (
    <main>
      {/* Top header with user navigation */}
      <div className="header">
        <h1 className="h1">Orders Board</h1>
        <nav className="headerNav">
          <Link href="/admin/customers/new" className="btn">
            Add Customer
          </Link>
          <Link href="/admin/orders/new" className="btn primary">
            Add Order
          </Link>
          <Link href="/admin/customers" className="btn">
            Manage Customers
          </Link>
          <Link href="/admin/orders" className="btn">
            Manage Orders
          </Link>
          {/* User menu */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            alignItems: 'center',
            marginLeft: '20px',
            paddingLeft: '20px',
            borderLeft: '1px solid #ddd'
          }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Welcome, {user?.name} ({user?.role})
            </span>
            {isAdmin && (
              <Link href="/admin/users" className="btn">
                Manage Users
              </Link>
            )}
            <button 
              onClick={logout} 
              className="btn"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              Logout
            </button>
          </div>
        </nav>
      </div>

      {/* Filter toolbar */}
      <div className="toolbar">
        <div className="tool">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Order Date / Sales Person / Account / Item / Serial #"
            style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6 }}
          />
          <button className="btn" onClick={load}>
            Apply
          </button>
        </div>
        <div className="tool">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6 }}
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s] ?? s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {/* Show Clear button when filter is active */}
          {stageFilter && (
            <button 
              className="btn" 
              onClick={() => setStageFilter("")}
              style={{ marginLeft: "4px" }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="tool">
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
        {/* Admin-only Audit button */}
        {isAdmin && (
          <div className="tool">
            <Link href="/history" className="btn">
              Audit
            </Link>
          </div>
        )}
        {!!err && <div className="errorBox">Failed to load: {err}</div>}
        {loading && <div className="loading">Loading…</div>}
        {/* Show message when filter results in no matches */}
        {!loading && stageFilter && grouped.length === 0 && (
          <div style={{ 
            padding: "8px 12px", 
            backgroundColor: "#fef3c7", 
            border: "1px solid #f59e0b",
            borderRadius: "6px",
            color: "#92400e"
          }}>
            No items found in "{STAGE_LABELS[stageFilter] ?? stageFilter}". 
            <button 
              onClick={() => setStageFilter("")}
              style={{
                marginLeft: "8px",
                textDecoration: "underline",
                background: "none",
                border: "none",
                color: "#92400e",
                cursor: "pointer"
              }}
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Stage grid */}
      <div className="stageBoard">
        {/* First column header cell */}
        <div className="stageCol stickyHeader stickyCol">
          <div className="stageTitle">
            Customer
            {stageFilter && (
              <span style={{ 
                fontSize: "11px", 
                fontWeight: "normal",
                display: "block",
                color: "#f59e0b"
              }}>
                (filtered)
              </span>
            )}
          </div>
        </div>
        {/* Stage headers with display labels */}
        {STAGES.map((s) => (
          <div key={s} className="stageCol stickyHeader">
            <div className="stageTitle">
              {STAGE_LABELS[s] ?? s.replace(/_/g, " ")}
              <span className="count">({counts[s] ?? 0})</span>
              {stageFilter === s && (
                <span style={{ 
                  fontSize: "11px", 
                  fontWeight: "normal",
                  display: "block",
                  color: "#f59e0b"
                }}>
                  (active filter)
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Rows by customer; items are placed into their current stage col */}
        {grouped.map((group) => {
          // Check if any order for this customer is locked
          const hasLockedOrder = group.orders.some(o => o.isLocked);
          
          return (
            <div className="customerRow" key={group.accountId || group.accountName}>
              {/* Sticky customer cell */}
              <div className="stageCol stickyCol">
                <div className="customerHeader">
                  <div className="customerName">
                    {hasLockedOrder && (
                      <span 
                        style={{ 
                          color: "#dc2626", 
                          marginRight: "6px",
                          fontSize: "16px",
                          verticalAlign: "middle"
                        }}
                        title="Order is locked - item details cannot be edited"
                      >
                        🔒
                      </span>
                    )}
                    {group.accountName}
                    {group.orders?.[0] && (
                      <>
                        {" "}
                        <Link
                          className="link tiny"
                          href={`/admin/orders/${group.orders[0].id}`}
                          title={hasLockedOrder ? "Edit order (locked)" : "Edit order"}
                        >
                          ✎ Edit
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="publicLinks">
                    {(group.orders || []).map((o) => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {o.isLocked && (
                          <span 
                            style={{ 
                              color: "#dc2626", 
                              fontSize: "10px"
                            }}
                            title={`Locked${o.lockedAt ? ` on ${new Date(o.lockedAt).toLocaleDateString()}` : ''}`}
                          >
                            🔒
                          </span>
                        )}
                        <a
                          className="link tiny"
                          href={`/t/${o.trackingToken}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Public tracking link"
                        >
                          Public link
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* For each stage column, render that customer's items in that stage */}
              {STAGES.map((stageKey) => {
                const itemsInStage = (group.orders || [])
                  .flatMap((o) =>
                    (o.items || [])
                      .filter((it) => {
                        const s = it.currentStage || o.currentStage || "MANUFACTURING";
                        if (!showArchived && it.archivedAt) return false;
                        // When filter is active, items are already pre-filtered
                        // Just match the current stage column
                        return s === stageKey;
                      })
                      .map((it) => ({ it, order: o }))
                  );

                return (
                  <div key={`${group.accountId}-${stageKey}`} className="stageCol">
                    {itemsInStage.length === 0 ? (
                      <div className="emptyCell">—</div>
                    ) : (
                      itemsInStage.map(({ it, order }) => {
                        const s = it.currentStage || order.currentStage || "MANUFACTURING";
                        const next = nextStageOf(s);
                        const prev = prevStageOf(s);
                        const isArchived = !!it.archivedAt;
                        const isOrderLocked = order.isLocked;
                        
                        // Create display text with all item details for tooltip
                        let tooltipText = `${it.productCode || "Item"} - ${s}`;
                        if (it.serialNumber) tooltipText += `\nS/N: ${it.serialNumber}`;
                        if (it.modelNumber) tooltipText += `\nModel: ${it.modelNumber}`;
                        if (it.voltage) tooltipText += `\nVoltage: ${it.voltage}`;
                        if (it.notes) tooltipText += `\nNotes: ${it.notes}`;
                        if (isOrderLocked) tooltipText += "\n(Order Locked)";
                        
                        return (
                          <div
                            key={it.id}
                            className={`itemCard${isArchived ? " archived" : ""}${isOrderLocked ? " locked" : ""}`}
                            title={tooltipText}
                            style={{
                              borderColor: isOrderLocked ? "#dc2626" : undefined,
                              borderWidth: isOrderLocked ? "2px" : undefined
                            }}
                          >
                            <div className="itemTitle">
                              {it.productCode || "Item"}
                            </div>
                            
                            <div className="itemActions" style={{ gap: "2px" }}>
                              {/* Back (icon) */}
                              <button
                                className="miniBtn"
                                aria-label="Move back"
                                disabled={!prev}
                                onClick={async () => {
                                  if (!prev) return;
                                  try {
                                    await changeItemStage(order.id, it.id, prev, {
                                      allowBackward: true,
                                    });
                                    await load();
                                  } catch (e) {
                                    alert(
                                      `Failed to move back: ${
                                        e instanceof Error ? e.message : e
                                      }`
                                    );
                                  }
                                }}
                                title={
                                  prev
                                    ? `Move to ${STAGE_LABELS[prev] ?? prev}`
                                    : "No previous stage"
                                }
                                style={{ fontSize: "10px", padding: "2px 4px" }}
                              >
                                ◀
                              </button>

                              {/* Forward (icon) */}
                              <button
                                className="miniBtn"
                                aria-label="Move forward"
                                disabled={!next}
                                onClick={async () => {
                                  if (!next) return;
                                  try {
                                    await changeItemStage(order.id, it.id, next, {
                                      allowFastForward: true,
                                    });
                                    await load();
                                  } catch (e) {
                                    alert(
                                      `Failed to move forward: ${
                                        e instanceof Error ? e.message : e
                                      }`
                                    );
                                  }
                                }}
                                title={
                                  next
                                    ? `Move to ${STAGE_LABELS[next] ?? next}`
                                    : "No next stage"
                                }
                                style={{ fontSize: "10px", padding: "2px 4px" }}
                              >
                                ▶
                              </button>

                              {/* Archive / Restore (icons) */}
                              {!isArchived ? (
                                <button
                                  className="miniBtn danger"
                                  aria-label="Archive"
                                  onClick={async () => {
                                    try {
                                      await archiveItem(order.id, it.id, true);
                                      await load();
                                    } catch (e) {
                                      alert(
                                        `Failed to archive: ${
                                          e instanceof Error ? e.message : e
                                        }`
                                      );
                                    }
                                  }}
                                  title="Archive (hide from board)"
                                  style={{ fontSize: "10px", padding: "2px 4px" }}
                                >
                                  ✕
                                </button>
                              ) : (
                                <button
                                  className="miniBtn"
                                  aria-label="Restore"
                                  onClick={async () => {
                                    try {
                                      await archiveItem(order.id, it.id, false);
                                      await load();
                                    } catch (e) {
                                      alert(
                                        `Failed to restore: ${
                                          e instanceof Error ? e.message : e
                                        }`
                                      );
                                    }
                                  }}
                                  title="Restore (show on board)"
                                  style={{ fontSize: "10px", padding: "2px 4px" }}
                                >
                                  ↺
                                </button>
                              )}

                              {/* Delete item (icon) */}
                              <button
                                className="miniBtn danger"
                                aria-label="Delete item"
                                onClick={async () => {
                                  if (isOrderLocked) {
                                    alert("Cannot delete items from a locked order. Please unlock it first in the Edit Order page.");
                                    return;
                                  }
                                  if (!confirm("Delete this item permanently?")) return;
                                  try {
                                    await deleteItem(order.id, it.id);
                                    await load();
                                  } catch (e) {
                                    alert(
                                      `Failed to delete: ${
                                        e instanceof Error ? e.message : e
                                      }`
                                    );
                                  }
                                }}
                                title={isOrderLocked ? "Order is locked - cannot delete" : "Delete item permanently"}
                                style={{
                                  opacity: isOrderLocked ? 0.5 : 1,
                                  cursor: isOrderLocked ? "not-allowed" : "pointer",
                                  fontSize: "10px", 
                                  padding: "2px 4px"
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </main>
  );
}
