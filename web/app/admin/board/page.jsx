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
import { ViewItemModal } from './ViewItemModal';
import { CustomerOrdersModal } from './CustomerOrdersModal';
import BoardFilters, { STAGES, STAGE_LABELS } from './BoardFilters';
import { DeleteItemDialog, ArchiveItemDialog, ArchiveOrderDialog, StageChangeDialog, NotificationToast } from './BoardConfirmDialogs';

// Helper to check if a container has complete measurement info
const containerHasMeasurements = (container) => {
  const hasAllDimensions =
    container.height != null &&
    container.width != null &&
    container.length != null &&
    container.weight != null;
  const hasWeightAndNotes =
    container.weight != null &&
    container.notes != null &&
    container.notes.trim() !== '';
  return hasAllDimensions || hasWeightAndNotes;
};

const hasMeasurements = (item) => {
  try {
    const containers = typeof item.containers === 'string'
      ? JSON.parse(item.containers)
      : (item.containers || []);
    if (!Array.isArray(containers) || containers.length === 0) return false;
    return containers.some(containerHasMeasurements);
  } catch { return false; }
};

const getMeasurementSummary = (item) => {
  try {
    const containers = typeof item.containers === 'string'
      ? JSON.parse(item.containers)
      : (item.containers || []);
    if (!Array.isArray(containers) || containers.length === 0) return null;
    const measured = containers.filter(containerHasMeasurements);
    if (measured.length === 0) return null;
    const c = measured[0];
    const hasAllDimensions = c.height != null && c.width != null && c.length != null && c.weight != null;
    if (hasAllDimensions) {
      const unit = c.unit || 'in';
      return `${c.length}x${c.width}x${c.height} ${unit}, ${c.weight} lbs${measured.length > 1 ? ` (+${measured.length - 1} more)` : ''}`;
    }
    return `${c.weight} lbs (${c.notes})${measured.length > 1 ? ` (+${measured.length - 1} more)` : ''}`;
  } catch { return null; }
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
  const [copiedLink, setCopiedLink] = useState(null);
  const [salesReps, setSalesReps] = useState([]);

  // Item action dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [performingAction, setPerformingAction] = useState(false);

  // Archive Order confirmation
  const [showArchiveOrderConfirm, setShowArchiveOrderConfirm] = useState(false);
  const [pendingArchiveOrder, setPendingArchiveOrder] = useState(null);
  const [archiveOrderLoading, setArchiveOrderLoading] = useState(false);

  // Stage change confirmation
  const [showStageConfirm, setShowStageConfirm] = useState(false);
  const [pendingStageChange, setPendingStageChange] = useState(null);
  const [stageChanging, setStageChanging] = useState(false);

  // View item modal
  const [viewItemModal, setViewItemModal] = useState({ show: false, item: null, order: null });

  // Customer orders modal
  const [customerOrdersModal, setCustomerOrdersModal] = useState({ show: false, customerName: "", orders: [] });

  // Notification
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  function showNotif(message) {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  }

  const isManufacturer = user?.role === "MANUFACTURER";
  const isBroker = user?.role === "BROKER";
  const isLimitedAccess = isManufacturer || isBroker;

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  // Accept optional searchOverride so clearSearch can pass "" before state updates
  async function load(searchOverride) {
    if (!user) return;
    try {
      setLoading(true);
      setErr("");
      const params = new URLSearchParams();
      const searchTerm = searchOverride !== undefined ? searchOverride : search;
      if (searchTerm) params.set("search", searchTerm);
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
      const reps = [...new Set(data.filter(o => o.sku).map(o => o.sku))].sort();
      setSalesReps(reps);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setSearch("");
    load("");
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;
    if (salesRepFilter) filtered = filtered.filter(order => order.sku === salesRepFilter);
    if (!stageFilter) {
      return filtered.map(order => {
        const activeItems = (order.items || []).filter(item => !item.archivedAt);
        if (activeItems.length === 0) return null;
        return { ...order, items: activeItems };
      }).filter(Boolean);
    }
    return filtered.map(order => {
      const filteredItems = (order.items || []).filter(item => {
        const itemStage = item.currentStage || order.currentStage || "MANUFACTURING";
        return itemStage === stageFilter && !item.archivedAt;
      });
      if (filteredItems.length === 0) return null;
      return { ...order, items: filteredItems };
    }).filter(Boolean);
  }, [orders, stageFilter, salesRepFilter]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const o of orders) {
      for (const it of o.items || []) {
        if (it.archivedAt) continue;
        const s = it.currentStage || o.currentStage || "MANUFACTURING";
        if (c[s] != null) c[s] += 1;
      }
    }
    return c;
  }, [orders]);

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

  const handleViewItem = (item, order) => setViewItemModal({ show: true, item, order });
  const closeViewItemModal = () => setViewItemModal({ show: false, item: null, order: null });

  const handleCustomerOrdersClick = (group) => {
    if (group.orders.length === 1) {
      router.push(`/admin/orders/${group.orders[0].id}`);
    } else {
      setCustomerOrdersModal({ show: true, customerName: group.accountName, orders: group.orders });
    }
  };
  const closeCustomerOrdersModal = () => setCustomerOrdersModal({ show: false, customerName: "", orders: [] });

  const handleArchiveClick = (orderId, itemId, itemName, isArchived) => {
    setPendingAction({ type: 'archive', orderId, itemId, itemName, isArchived });
    setShowArchiveConfirm(true);
  };

  const handleDeleteClick = (orderId, itemId, itemName, isOrderLocked) => {
    if (isOrderLocked) {
      showNotif("Cannot delete items from a locked order. Please unlock it first in the Edit Order page.");
      return;
    }
    setPendingAction({ type: 'delete', orderId, itemId, itemName });
    setShowDeleteConfirm(true);
  };

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
      showNotif(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPerformingAction(false);
    }
  };

  const cancelPendingAction = () => {
    setShowDeleteConfirm(false);
    setShowArchiveConfirm(false);
    setPendingAction(null);
  };

  const handleArchiveOrderClick = (order) => {
    setPendingArchiveOrder(order);
    setShowArchiveOrderConfirm(true);
  };

  const confirmArchiveOrderToggle = async () => {
    if (!pendingArchiveOrder) return;
    const action = pendingArchiveOrder.isArchived ? "unarchive" : "archive";
    try {
      setArchiveOrderLoading(true);
      const response = await fetch(`/api/orders/${pendingArchiveOrder.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isArchived: !pendingArchiveOrder.isArchived })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${action} order`);
      }
      setShowArchiveOrderConfirm(false);
      setPendingArchiveOrder(null);
      showNotif(`Order ${pendingArchiveOrder.isArchived ? 'unarchived' : 'archived'} successfully`);
      await load();
    } catch (e) {
      showNotif(`Failed to ${action} order: ${e.message}`);
    } finally {
      setArchiveOrderLoading(false);
    }
  };

  // Stage change: request confirmation
  const requestStageChange = (orderId, itemId, itemName, nextStage, opts = {}) => {
    setPendingStageChange({ orderId, itemId, itemName, nextStage, opts });
    setShowStageConfirm(true);
  };

  // Stage change: execute after confirmation
  const confirmStageChange = async () => {
    if (!pendingStageChange) return;
    try {
      setStageChanging(true);
      await changeItemStage(
        pendingStageChange.orderId,
        pendingStageChange.itemId,
        pendingStageChange.nextStage,
        pendingStageChange.opts
      );
      await load();
      setShowStageConfirm(false);
      setPendingStageChange(null);
    } catch (e) {
      showNotif(`Failed to move item: ${e instanceof Error ? e.message : e}`);
    } finally {
      setStageChanging(false);
    }
  };

  const cancelStageChange = () => {
    setShowStageConfirm(false);
    setPendingStageChange(null);
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
      showNotif('Failed to copy link. Please copy manually: ' + url);
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
        by.set(key, { accountId: o.account?.id || o.accountId || null, accountName: o.account?.name || "—", orders: [] });
      by.get(key).orders.push(o);
    }
    return Array.from(by.values()).sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [filteredOrders]);

  if (!user) return null;

  return (
    <div className={`boardContainer ${isLimitedAccess ? 'manufacturer-view' : ''}`}>
      <TopNav />
      <NotificationBar />

      <div className="stickyActionsToolbar">
        {!isLimitedAccess && <QuickActions />}
        <BoardFilters
          search={search}
          setSearch={setSearch}
          stageFilter={stageFilter}
          setStageFilter={setStageFilter}
          salesRepFilter={salesRepFilter}
          setSalesRepFilter={setSalesRepFilter}
          salesReps={salesReps}
          onApply={load}
          onClear={handleClear}
          loading={loading}
          err={err}
          hasResults={grouped.length > 0}
        />
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
          const orderCount = group.orders.length;
          return (
            <div className="customerRow" key={group.accountId || group.accountName}>
              <div className="stageCol stickyCol">
                <div className="customerHeader">
                  {!isLimitedAccess && group.orders?.[0] && (
                    <button
                      onClick={() => handleCustomerOrdersClick(group)}
                      title={orderCount > 1 ? `View ${orderCount} orders` : (hasLockedOrder ? "Edit order (locked)" : "Edit order")}
                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '22px', lineHeight: 1, opacity: 0.7, transition: 'opacity 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                      🔍
                      {orderCount > 1 && (
                        <span style={{ position: 'absolute', top: '-4px', right: '-6px', backgroundColor: '#dc2626', color: 'white', fontSize: '10px', fontWeight: 'bold', minWidth: '16px', height: '16px', lineHeight: '16px', textAlign: 'center', borderRadius: '50%', padding: '0 3px' }}>
                          {orderCount}
                        </span>
                      )}
                    </button>
                  )}

                  {!isLimitedAccess && group.orders?.[0] && (
                    <button
                      onClick={() => handleArchiveOrderClick(group.orders[0])}
                      title={group.orders[0].isArchived ? "Unarchive order" : "Archive order"}
                      style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '18px', lineHeight: 1, opacity: 0.7, transition: 'opacity 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                      🗑️
                    </button>
                  )}

                  <div className="customerName">
                    {hasLockedOrder && <span style={{ color: "#dc2626", marginRight: "6px", fontSize: "16px", verticalAlign: "middle" }} title="Order is locked">🔒</span>}
                    {group.accountName}
                    {group.orders?.[0]?.account?.contactName && (
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px", fontWeight: "normal" }}>
                        {group.orders[0].account.contactName}
                      </div>
                    )}
                  </div>

                  {!isManufacturer && (
                    <div className="publicLinks">
                      {(group.orders || []).map((o) => (
                        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          {o.isLocked && <span style={{ color: "#dc2626", fontSize: "10px" }} title={`Locked${o.lockedAt ? ` on ${new Date(o.lockedAt).toLocaleDateString()}` : ''}`}>🔒</span>}
                          <a className="link tiny" href={`/t/${o.trackingToken}`} target="_blank" rel="noreferrer" title="Public tracking link">Public link</a>
                          <button onClick={() => copyToClipboard(o.trackingToken, o.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", fontSize: "12px", color: copiedLink === o.id ? "#d1d5db" : "#9ca3af", transition: "color 0.2s" }} title={copiedLink === o.id ? "Copied!" : "Copy link to clipboard"}>{copiedLink === o.id ? "✓" : "📋"}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {STAGES.map((stageKey) => {
                const itemsInStage = (group.orders || []).flatMap((o) =>
                  (o.items || [])
                    .filter((it) => {
                      const s = it.currentStage || o.currentStage || "MANUFACTURING";
                      if (it.archivedAt) return false;
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
                          const measurementsComplete = hasMeasurements(it);
                          const measurementSummary = getMeasurementSummary(it);

                          let tooltipText = `${it.productCode || "Item"} - ${s}`;
                          if (it.serialNumber) tooltipText += `\nS/N: ${it.serialNumber}`;
                          if (it.modelNumber) tooltipText += `\nModel: ${it.modelNumber}`;
                          if (it.voltage) tooltipText += `\nPower: ${it.voltage}`;
                          if (it.notes) tooltipText += `\nNotes: ${it.notes}`;
                          if (measurementSummary) tooltipText += `\n📐 Measurements: ${measurementSummary}`;
                          if (isOrderLocked) tooltipText += "\n(Order Locked)";

                          const itemName = it.productCode || "Item";

                          return (
                            <div key={it.id} className={`itemCard${isArchived ? " archived" : ""}${isOrderLocked ? " locked" : ""}`} title={tooltipText} style={{ borderColor: isOrderLocked ? "#dc2626" : undefined, borderWidth: isOrderLocked ? "2px" : undefined, position: 'relative' }}>
                              {it.isOrdered && (
                                <span title="Item ordered" style={{ position: 'absolute', top: '2px', left: '2px', display: 'inline-block', backgroundColor: '#16a34a', color: 'white', fontWeight: 'bold', fontSize: '10px', width: '16px', height: '16px', lineHeight: '16px', textAlign: 'center', borderRadius: '50%', cursor: 'help' }}>$</span>
                              )}

                              <div className="itemTitle" style={{ display: "flex", alignItems: 'center', justifyContent: 'center', paddingRight: '24px', paddingLeft: (it.isOrdered || !isLimitedAccess) ? '24px' : '0', textAlign: 'center', minHeight: '100%' }}>
                                <span style={{ wordBreak: 'break-word', color: measurementsComplete ? '#dc2626' : undefined }}>
                                  {itemName}
                                </span>
                              </div>

                              <button
                                aria-label="View item details"
                                onClick={() => handleViewItem(it, order)}
                                title="View item details"
                                style={{ position: 'absolute', top: '2px', right: '2px', fontSize: '16px', padding: '0', margin: '0', lineHeight: 1, opacity: 0.7, transition: 'opacity 0.2s', border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', boxShadow: 'none' }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                              >
                                🔍
                              </button>

                              {!isLimitedAccess && (
                                <>
                                  {/* Move back */}
                                  <button
                                    aria-label="Move back"
                                    disabled={!prev}
                                    onClick={() => {
                                      if (!prev) return;
                                      requestStageChange(order.id, it.id, itemName, prev, { allowBackward: true });
                                    }}
                                    title={prev ? `Move to ${STAGE_LABELS[prev] ?? prev}` : "No previous stage"}
                                    style={{ position: 'absolute', bottom: '2px', left: '2px', fontSize: '13px', padding: '0', margin: '0', lineHeight: 1, opacity: prev ? 0.7 : 0.3, transition: 'opacity 0.2s', border: 'none', outline: 'none', background: 'transparent', cursor: prev ? 'pointer' : 'not-allowed', color: 'inherit', boxShadow: 'none' }}
                                    onMouseEnter={(e) => prev && (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={(e) => prev && (e.currentTarget.style.opacity = '0.7')}
                                  >
                                    ◀
                                  </button>

                                  {/* Move forward */}
                                  <button
                                    aria-label="Move forward"
                                    disabled={!next}
                                    onClick={() => {
                                      if (!next) return;
                                      requestStageChange(order.id, it.id, itemName, next, { allowFastForward: true });
                                    }}
                                    title={next ? `Move to ${STAGE_LABELS[next] ?? next}` : "No next stage"}
                                    style={{ position: 'absolute', bottom: '2px', right: '2px', fontSize: '13px', padding: '0', margin: '0', lineHeight: 1, opacity: next ? 0.7 : 0.3, transition: 'opacity 0.2s', border: 'none', outline: 'none', background: 'transparent', cursor: next ? 'pointer' : 'not-allowed', color: 'inherit', boxShadow: 'none' }}
                                    onMouseEnter={(e) => next && (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={(e) => next && (e.currentTarget.style.opacity = '0.7')}
                                  >
                                    ▶
                                  </button>
                                </>
                              )}
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

      {/* View Item Modal */}
      {viewItemModal.show && (
        <ViewItemModal
          item={viewItemModal.item}
          order={viewItemModal.order}
          onClose={closeViewItemModal}
          onUpdate={load}
        />
      )}

      {/* Customer Orders Modal */}
      {customerOrdersModal.show && (
        <CustomerOrdersModal
          customerName={customerOrdersModal.customerName}
          orders={customerOrdersModal.orders}
          onClose={closeCustomerOrdersModal}
        />
      )}

      {/* Item action dialogs */}
      <DeleteItemDialog
        show={showDeleteConfirm}
        pendingAction={pendingAction}
        performingAction={performingAction}
        onCancel={cancelPendingAction}
        onConfirm={executePendingAction}
      />
      <ArchiveItemDialog
        show={showArchiveConfirm}
        pendingAction={pendingAction}
        performingAction={performingAction}
        onCancel={cancelPendingAction}
        onConfirm={executePendingAction}
      />
      <ArchiveOrderDialog
        show={showArchiveOrderConfirm}
        pendingOrder={pendingArchiveOrder}
        loading={archiveOrderLoading}
        onCancel={() => setShowArchiveOrderConfirm(false)}
        onConfirm={confirmArchiveOrderToggle}
      />

      {/* Stage change confirmation */}
      <StageChangeDialog
        show={showStageConfirm}
        pendingStageChange={pendingStageChange}
        loading={stageChanging}
        onCancel={cancelStageChange}
        onConfirm={confirmStageChange}
        stageLabels={STAGE_LABELS}
      />

      <NotificationToast show={showNotification} message={notificationMessage} />
    </div>
  );
}
