"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import MeasurementSection from "@/components/MeasurementSection";
import CommissionStatusCard from "@/components/CommissionStatusCard";
import DocumentUpload from "@/components/DocumentUpload";

// Import modularized components
import UnlockDialog from "./components/UnlockDialog";
import UnorderDialog from "./components/UnorderDialog";
import ItemsTable from "./components/ItemsTable";
import OrderInformation from "./components/OrderInformation";
import InternalNotesSection from "./components/InternalNotesSection";
import SwitchRepModal from "./components/SwitchRepModal";
import SplitRepModal from "./components/SplitRepModal";
import ManageRepsModal from "./components/ManageRepsModal";

// Import API services
import { orderApi, itemApi } from "./services/orderApi";

// Import PDF generation
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [internalNotesSaving, setInternalNotesSaving] = useState(false);
  const [internalNotesChanged, setInternalNotesChanged] = useState(false);
  
  const [showUnorderDialog, setShowUnorderDialog] = useState(false);
  const [unorderReason, setUnorderReason] = useState("");
  const [unorderingItemId, setUnorderingItemId] = useState(null);

  // Delete confirmation states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState(null);
  const [pendingDeleteItemName, setPendingDeleteItemName] = useState("");

  const [orderDate, setOrderDate] = useState("");
  const [isSavingOrderDate, setIsSavingOrderDate] = useState(false);

  const [onsiteInstallationDate, setOnsiteInstallationDate] = useState("");
  const [isSavingInstallationDate, setIsSavingInstallationDate] = useState(false);

  const [discount, setDiscount] = useState("");
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);

  const [salesAgent, setSalesAgent] = useState("");
  const [salesAgents, setSalesAgents] = useState([]);
  const [isSavingSalesAgent, setIsSavingSalesAgent] = useState(false);

  // Switch Rep modal
  const [showSwitchRep, setShowSwitchRep] = useState(false);
  const [showSplitRep, setShowSplitRep] = useState(false);
  const [showManageReps, setShowManageReps] = useState(false);

  const [itemEdits, setItemEdits] = useState({});
  const [manufacturers, setManufacturers] = useState([]);

  // Manifest selection state
  const [selectedItemsForManifest, setSelectedItemsForManifest] = useState(new Set());

  // Notification and modal states
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Helper to show notification
  function showNotif(message) {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  }

  // Block manufacturers from accessing edit order page
  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (user.role === "MANUFACTURER") {
      showNotif("Access denied. Manufacturers can only move items between stages on the board.");
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

      if (orderData.items) {
        setSelectedItemsForManifest(new Set(orderData.items.map(item => item.id)));
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
        showNotif(`Some items failed to save:\n${errors.join('\n')}`);
      }

      await load();
    } catch (e) {
      showNotif(`Failed to save changes: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveInternalNotes() {
    try {
      setInternalNotesSaving(true);
      await orderApi.updateInternalNotes(id, internalNotes, getAuthHeaders);
      setInternalNotesChanged(false);
      showNotif("Internal notes saved successfully");
    } catch (e) {
      showNotif(`Failed to save internal notes: ${e.message}`);
    } finally {
      setInternalNotesSaving(false);
    }
  }

  async function saveOrderDate() {
    if (!orderDate) {
      showNotif("Please select a valid date");
      return;
    }
    
    const currentOrderDate = order?.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : "";
    if (orderDate === currentOrderDate) return;
    
    try {
      setIsSavingOrderDate(true);
      await orderApi.updateOrder(id, { orderDate }, getAuthHeaders);
      setOrder(prev => ({ ...prev, orderDate: orderDate }));
      showNotif("Order date updated successfully");
    } catch (err) {
      showNotif(`Failed to update order date: ${err.message}`);
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
      showNotif("Onsite installation date updated successfully");
    } catch (err) {
      showNotif(`Failed to update installation date: ${err.message}`);
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
      showNotif("Sales agent updated successfully");
    } catch (err) {
      showNotif(`Failed to update sales agent: ${err.message}`);
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
        showNotif("Please enter a valid discount amount (0 or greater)");
        setDiscount(currentDiscount);
        return;
      }

      await orderApi.updateOrder(id, { discount: discountValue }, getAuthHeaders);
      setOrder(prev => ({ ...prev, discount: discountValue }));
    } catch (err) {
      showNotif(`Failed to update discount: ${err.message}`);
      setDiscount(currentDiscount);
    } finally {
      setIsSavingDiscount(false);
    }
  }

  function handleLockClick() {
    setShowLockConfirm(true);
  }

  async function confirmLockOrder() {
    try {
      setLockLoading(true);
      setShowLockConfirm(false);
      await orderApi.lockOrder(id, "Order locked for data integrity", getAuthHeaders);
      await load();
      showNotif("Order has been locked. No changes to item details can be made until unlocked.");
    } catch (e) {
      showNotif(`Failed to lock order: ${e.message}`);
    } finally {
      setLockLoading(false);
    }
  }

  async function unlockOrder() {
    if (!isAdmin) {
      showNotif("Only administrators can unlock orders.");
      return;
    }

    if (unlockReason.trim().length < 10) {
      showNotif("Please provide a reason with at least 10 characters");
      return;
    }

    try {
      setLockLoading(true);
      await orderApi.unlockOrder(id, unlockReason, getAuthHeaders);
      setShowUnlockDialog(false);
      setUnlockReason("");
      await load();
      showNotif("Order has been unlocked. You can now edit item details.");
    } catch (e) {
      showNotif(`Failed to unlock order: ${e.message}`);
    } finally {
      setLockLoading(false);
    }
  }

  function handleArchiveToggle() {
    setShowArchiveConfirm(true);
  }

  async function confirmArchiveToggle() {
    const action = order.isArchived ? "unarchive" : "archive";

    try {
      setArchiveLoading(true);
      setShowArchiveConfirm(false);
      const response = await fetch(`/api/orders/${id}/archive`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ isArchived: !order.isArchived })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${action} order`);
      }

      await load();
      showNotif(`Order ${order.isArchived ? 'unarchived' : 'archived'} successfully`);
    } catch (e) {
      showNotif(`Failed to ${action} order: ${e.message}`);
    } finally {
      setArchiveLoading(false);
    }
  }

  async function markItemOrdered(itemId) {
    if (!isAdmin) {
      showNotif("Only administrators can mark items as ordered.");
      return;
    }

    try {
      setSaving(true);
      await itemApi.markItemOrdered(id, itemId, getAuthHeaders);
      await load();
    } catch (e) {
      showNotif(`Failed to mark item as ordered: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function unmarkItemOrdered() {
    if (!isAdmin) {
      showNotif("Only administrators can unmark items as ordered.");
      return;
    }

    if (!unorderReason || unorderReason.trim().length < 10) {
      showNotif("Please provide a reason with at least 10 characters");
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
      showNotif(`Failed to unmark item as ordered: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function deleteItem(itemId, itemName) {
    setPendingDeleteItemId(itemId);
    setPendingDeleteItemName(itemName || "this item");
    setShowDeleteConfirm(true);
  }

  async function executeDeleteItem() {
    if (!pendingDeleteItemId) return;

    try {
      setSaving(true);
      await itemApi.deleteItem(id, pendingDeleteItemId, getAuthHeaders);
      setShowDeleteConfirm(false);
      setPendingDeleteItemId(null);
      setPendingDeleteItemName("");
      await load();
    } catch (e) {
      showNotif(`Failed to delete item: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function cancelDeleteItem() {
    setShowDeleteConfirm(false);
    setPendingDeleteItemId(null);
    setPendingDeleteItemName("");
  }

  async function addItem(item) {
    try {
      setSaving(true);
      await itemApi.addItem(id, item, getAuthHeaders);
      await load();
      return true;
    } catch (e) {
      showNotif(`Failed to add item: ${e.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function generateShippingManifest() {
    if (!order) return;

    if (selectedItemsForManifest.size === 0) {
      showNotif("Please select at least one item to include in the manifest");
      return;
    }

    try {
      const orderData = await orderApi.getOrder(id, getAuthHeaders);

      const logoImg = new Image();
      logoImg.src = "/smt-logo.png";

      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      const logoWidth = 30;
      const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
      doc.addImage(logoImg, "PNG", pageWidth - logoWidth - 14, 10, logoWidth, logoHeight);

      // Sender (company) address block, right-aligned under the logo
      const senderRightX = pageWidth - 14;
      let senderY = 10 + logoHeight + 6;
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      doc.text("Stealth Machine Tools", senderRightX, senderY, { align: "right" }); senderY += 5;
      doc.setFont(undefined, "normal");
      doc.text("3266 W Galveston Dr #103", senderRightX, senderY, { align: "right" }); senderY += 5;
      doc.text("Apache Junction, AZ 85120", senderRightX, senderY, { align: "right" });

      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.text("Shipping Manifest", 14, 20);

      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Customer Information", 14, 35);

      doc.setFont(undefined, "normal");
      doc.setFontSize(10);
      let yPos = 42;

      if (orderData.account?.name) { doc.text(`Customer: ${orderData.account.name}`, 14, yPos); yPos += 6; }
      if (orderData.account?.contactName) { doc.text(`Contact: ${orderData.account.contactName}`, 14, yPos); yPos += 6; }
      if (orderData.account?.phone) { doc.text(`Phone: ${orderData.account.phone}`, 14, yPos); yPos += 6; }
      if (orderData.account?.address) { doc.text(`Address: ${orderData.account.address}`, 14, yPos); yPos += 6; }

      yPos += 4;

      let hasAnyContainers = false;

      orderData.items?.filter(item => selectedItemsForManifest.has(item.id)).forEach((item, itemIndex) => {
        try {
          const containers = item.containers ? JSON.parse(item.containers) : [];
          if (containers.length === 0) return;

          hasAnyContainers = true;

          doc.setFontSize(12);
          doc.setFont(undefined, "bold");
          const itemName = item.productCode || `Item ${itemIndex + 1}`;
          const itemSerial = item.serialNumber ? ` (S/N: ${item.serialNumber})` : "";
          doc.text(`${itemName}${itemSerial}`, 14, yPos);
          yPos += 7;

          const tableData = containers.map((container, index) => {
            let dimensionStr = "-";
            if (container.length || container.width || container.height) {
              const parts = [];
              if (container.length) parts.push(`L: ${container.length}\"`);
              if (container.width) parts.push(`W: ${container.width}\"`);
              if (container.height) parts.push(`H: ${container.height}\"`);
              dimensionStr = parts.join(", ");
            }
            const weightStr = container.weight ? `${container.weight}` : "-";
            return [index + 1, container.label || "-", dimensionStr, weightStr, container.tracking || "-"];
          });

          autoTable(doc, {
            startY: yPos,
            head: [["#", "Package", "Dimensions", "Weight", "Notes"]],
            body: tableData,
            theme: "grid",
            headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: "bold" },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 40 }, 2: { cellWidth: 50 }, 3: { cellWidth: 30 }, 4: { cellWidth: 55 } }
          });

          yPos = doc.lastAutoTable.finalY + 10;
        } catch (e) {
          console.error("Error parsing containers for item:", e);
        }
      });

      if (!hasAnyContainers) {
        doc.setFontSize(10);
        doc.setFont(undefined, "italic");
        doc.text("No container information available for this order.", 14, yPos);
      }

      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text(
        `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        14,
        doc.internal.pageSize.getHeight() - 10
      );

      const fileName = `Shipping_Manifest_${orderData.account?.name || "Order"}_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(fileName);

      showNotif("Shipping manifest generated successfully");
    } catch (error) {
      console.error("Error generating manifest:", error);
      showNotif(`Failed to generate manifest: ${error.message}`);
    }
  }

  if (!user) {
    return null;
  }

  const hasExtendedShipping = order?.items?.some(item => item.hasExtendedShipping === true) || false;

  // Safe rep-switching: lock the raw Sales Person dropdown once a commission
  // exists (all roles), and expose the Switch Rep action to Super Admins/Accountants only.
  const canSwitchRep = ["SUPER_ADMIN", "ACCOUNTANT"].includes(user?.role);
  const hasCommission = !!order?.hasCommission;

  // Tab style helper
  const tabStyle = (tab) => ({
    padding: "10px 20px",
    backgroundColor: activeTab === tab ? "#dc2626" : "#2d2d2d",
    color: activeTab === tab ? "#fff" : "#9ca3af",
    border: "1px solid #404040",
    borderBottom: activeTab === tab ? "1px solid #dc2626" : "1px solid #404040",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: activeTab === tab ? "600" : "400",
    marginBottom: "-1px",
    whiteSpace: "nowrap",
  });

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Order Details</h1>
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
                ⭐ <strong>Large Machine Active:</strong> This order contains items marked as large machines. 
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
                    Item details cannot be edited while the order is locked. Admin fields (price/purchasing notes) and large machine flag remain editable.
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
                    style={{ backgroundColor: "#dc2626", color: "#fff", border: "none" }}
                  >
                    Unlock Order
                  </button>
                ) : (
                  <div style={{ color: "#fca5a5", fontSize: "12px" }}>Only admins can unlock</div>
                )}
              </div>
            )}

            {/* Tab Navigation */}
            <div style={{
              display: "flex",
              gap: "4px",
              marginBottom: "16px",
              borderBottom: "1px solid #404040",
              paddingBottom: "0",
              flexWrap: "wrap"
            }}>
              <button onClick={() => setActiveTab("details")} style={tabStyle("details")}>Details</button>
              <button onClick={() => setActiveTab("containers")} style={tabStyle("containers")}>Shipping Containers</button>
              <button onClick={() => setActiveTab("documents")} style={tabStyle("documents")}>Documents</button>
              {/* Customer Files — navigates to sub-page */}
              <button
                onClick={() => router.push(`/admin/orders/${id}/customer-files`)}
                style={{
                  ...tabStyle("customer-files"),
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                📁 Customer Files
                {order._customerFileCount > 0 && (
                  <span style={{ fontSize: "11px", background: "#404040", borderRadius: "999px", padding: "1px 6px", color: "#e4e4e4" }}>
                    {order._customerFileCount}
                  </span>
                )}
              </button>
            </div>

            {/* Details Tab */}
            {activeTab === "details" && (
              <>
                <section style={{
                  marginTop: 12,
                  marginBottom: 16,
                  padding: "16px",
                  backgroundColor: "#2d2d2d",
                  border: "1px solid #404040",
                  borderRadius: "8px"
                }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: 14, color: "#e4e4e4" }}>Shipping & Customer Information</h3>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="btn"
                    onClick={handleArchiveToggle}
                    disabled={archiveLoading}
                    style={{ backgroundColor: order.isArchived ? "#10b981" : "#6b7280", color: "#fff", border: "none", fontSize: "13px", padding: "6px 12px" }}
                  >
                    {archiveLoading ? "..." : (order.isArchived ? "📂 Unarchive" : "📦 Archive")}
                  </button>
                  {!order.isLocked && (
                    <button
                      className="btn"
                      onClick={handleLockClick}
                      disabled={lockLoading}
                      style={{ backgroundColor: "#ef4444", color: "#fff", border: "none", fontSize: "13px", padding: "6px 12px" }}
                    >
                      🔒 Lock Order
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #404040" }}>
                <div style={{ fontSize: 18, color: "#ffffff", fontWeight: 600, marginBottom: 4 }}>
                  {order.account?.name ?? "—"}
                </div>
                {order.account?.contactName && (
                  <div style={{ fontSize: 14, color: "#e4e4e4" }}>Contact: {order.account.contactName}</div>
                )}
              </div>

              {(order.account?.address || order.account?.phone) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #404040" }}>
                  {order.account?.address && (
                    <div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Shipping Address</div>
                      <div style={{ color: "#e4e4e4", fontSize: "14px" }}>{order.account.address}</div>
                    </div>
                  )}
                  {order.account?.phone && (
                    <div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Phone Number</div>
                      <div style={{ color: "#e4e4e4", fontSize: "14px" }}>{order.account.phone}</div>
                    </div>
                  )}
                </div>
              )}

              {(order.shippingCarrier || order.trackingNumber) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
                  {order.shippingCarrier && (
                    <div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Carrier</div>
                      <div style={{ color: "#e4e4e4", fontSize: "14px" }}>{order.shippingCarrier}</div>
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Tracking Number</div>
                      <div style={{ color: "#e4e4e4", fontSize: "14px" }}>{order.trackingNumber}</div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: "12px", color: "#6b7280", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                <span>
                  <strong>Public link:</strong>{" "}
                  <a className="link" href={`/t/${order.trackingToken}`} target="_blank" rel="noreferrer">Open ↗</a>
                </span>
                {order.createdBy && (
                  <span><strong>Created by:</strong> {order.createdBy.name}</span>
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
              onsiteInstallationDate={onsiteInstallationDate}
              setOnsiteInstallationDate={setOnsiteInstallationDate}
              saveOnsiteInstallationDate={saveOnsiteInstallationDate}
              isSavingInstallationDate={isSavingInstallationDate}
              hasExtendedShipping={hasExtendedShipping}
              salesAgentLocked={hasCommission}
              canSwitchRep={canSwitchRep}
              onSwitchRepClick={() => setShowSwitchRep(true)}
              onSplitRepClick={() => setShowSplitRep(true)}
              activeRepCount={order?.activeRepCount || 0}
              onManageRepsClick={() => setShowManageReps(true)}
            />

            <ItemsTable
              order={order}
              items={order.items}
              itemEdits={itemEdits}
              onFieldChange={updateItemEdit}
              onDelete={deleteItem}
              onMarkOrdered={markItemOrdered}
              onUnmarkOrdered={(itemId) => { setUnorderingItemId(itemId); setShowUnorderDialog(true); }}
              onSaveAllChanges={saveAllChanges}
              onAddItem={addItem}
              onRefresh={load}
              disabled={saving}
              isAdmin={isAdmin}
              isAgent={user?.role === "AGENT"}
              manufacturers={manufacturers}
              getAuthHeaders={getAuthHeaders}
            />

            {/* Discount and Total */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, marginBottom: 16 }}>
              <div style={{ maxWidth: "400px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <label style={{ fontSize: "14px", fontWeight: "600", color: "#e4e4e4" }}>Discount:</label>
                  <span style={{ fontSize: "18px", color: "#9ca3af" }}>$</span>
                  <input
                    className="input"
                    type="text"
                    value={discount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) setDiscount(value);
                    }}
                    onBlur={saveDiscount}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    placeholder="0.00"
                    style={{ width: "120px", textAlign: "right" }}
                    disabled={isSavingDiscount}
                  />
                  {isSavingDiscount && (<span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>)}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", textAlign: "right" }}>
                  Press Enter or click outside to save
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <div style={{ padding: "8px 12px", backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "6px", textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "2px" }}>Gross Total</div>
                <div style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff" }}>
                  ${(() => {
                    const subtotal = (order.items || []).reduce((sum, item) => sum + (item.itemPrice || 0) * (item.qty || 1), 0);
                    const discountAmount = parseFloat(discount) || 0;
                    return (subtotal - discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  })()}
                </div>
              </div>
            </div>

            <InternalNotesSection
              order={order}
              internalNotes={internalNotes}
              setInternalNotes={setInternalNotes}
              internalNotesChanged={internalNotesChanged}
              setInternalNotesChanged={setInternalNotesChanged}
              onSaveInternalNotes={saveInternalNotes}
              internalNotesSaving={internalNotesSaving}
            />

            {order && user && (
              <CommissionStatusCard orderId={order.id} user={user} />
            )}

            {order.auditLogs && order.auditLogs.length > 0 && (
              <section style={{ marginTop: 32 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Lock/Unlock History</h2>
                <div style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "12px", maxHeight: "200px", overflowY: "auto" }}>
                  {order.auditLogs
                    .filter(log => log.action === "LOCKED" || log.action === "UNLOCKED")
                    .map((log) => (
                    <div key={log.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                        <div>
                          <strong style={{ color: log.action === "LOCKED" ? "#059669" : "#dc2626" }}>{log.action}</strong>
                          {log.metadata && (() => {
                            try {
                              const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                              return metadata.message ? (<div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>Reason: {metadata.message}</div>) : null;
                            } catch { return null; }
                          })()}
                          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>By: {log.performedByName || log.performedBy?.name || "System"}</div>
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

            {/* Shipping Containers Tab */}
            {activeTab === "containers" && (
              <>
                <MeasurementSection
                  order={order}
                  items={order.items}
                  onRefresh={load}
                  getAuthHeaders={getAuthHeaders}
                  selectedItemsForManifest={selectedItemsForManifest}
                  setSelectedItemsForManifest={setSelectedItemsForManifest}
                />
                <div style={{ marginTop: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={generateShippingManifest}
                    className="btn"
                    style={{ background: "#dc2626", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}
                  >
                    📄 Generate Manifest
                  </button>
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>({selectedItemsForManifest.size} of {order.items.length} items selected)</span>
                </div>
              </>
            )}

            {/* Documents Tab */}
            {activeTab === "documents" && (
              <div style={{ marginTop: 16, marginBottom: 16, padding: "16px", backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "8px" }}>
                <DocumentUpload
                  items={order.items}
                  onDocumentChange={load}
                />
              </div>
            )}
          </>
        )}

        <UnlockDialog
          show={showUnlockDialog && isAdmin}
          unlockReason={unlockReason}
          setUnlockReason={setUnlockReason}
          onCancel={() => { setShowUnlockDialog(false); setUnlockReason(""); }}
          onUnlock={unlockOrder}
          loading={lockLoading}
        />

        <UnorderDialog
          show={showUnorderDialog && isAdmin}
          unorderReason={unorderReason}
          setUnorderReason={setUnorderReason}
          onCancel={() => { setShowUnorderDialog(false); setUnorderReason(""); setUnorderingItemId(null); }}
          onUnorder={unmarkItemOrdered}
          saving={saving}
        />

        <SwitchRepModal
          show={showSwitchRep && canSwitchRep && !!order}
          onClose={() => setShowSwitchRep(false)}
          orderId={order?.id}
          currentRep={salesAgent}
          salesAgents={salesAgents}
          getAuthHeaders={getAuthHeaders}
          onDone={async () => { await load(); }}
        />

        <SplitRepModal
          show={showSplitRep && canSwitchRep && !!order}
          onClose={() => setShowSplitRep(false)}
          orderId={order?.id}
          currentRep={salesAgent}
          salesAgents={salesAgents}
          getAuthHeaders={getAuthHeaders}
          onDone={async () => { await load(); }}
        />

        <ManageRepsModal
          show={showManageReps && canSwitchRep && !!order}
          onClose={() => setShowManageReps(false)}
          orderId={order?.id}
          reps={order?.commissionReps || []}
          salesAgents={salesAgents}
          getAuthHeaders={getAuthHeaders}
          onDone={async () => { await load(); }}
        />

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={cancelDeleteItem}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>⚠️ Delete Item Permanently?</h3>
              <p style={{ fontSize: "16px", marginBottom: "1rem", color: "#d1d5db" }}>You are about to permanently delete <strong>"{pendingDeleteItemName}"</strong>.</p>
              <div style={{ padding: "1rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", marginBottom: "1rem" }}>
                <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "14px", color: "#d1d5db" }}>
                  <li>This action cannot be undone</li>
                  <li>The item will be completely removed from the system</li>
                </ul>
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "2rem" }}>
                <button onClick={cancelDeleteItem} disabled={saving} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                <button onClick={executeDeleteItem} disabled={saving} style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>
                  {saving ? "Deleting..." : "Yes, Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lock Confirmation Modal */}
        {showLockConfirm && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => !lockLoading && setShowLockConfirm(false)}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>🔒 Lock Order?</h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you've finished editing <strong>ALL items</strong> on this order?</p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button onClick={() => setShowLockConfirm(false)} disabled={lockLoading} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                <button onClick={confirmLockOrder} disabled={lockLoading} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>
                  {lockLoading ? "Locking..." : "Lock Order"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Archive Confirmation Modal */}
        {showArchiveConfirm && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={() => !archiveLoading && setShowArchiveConfirm(false)}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "2rem", maxWidth: "500px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                {order.isArchived ? "📂 Unarchive Order?" : "📦 Archive Order?"}
              </h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
                {order.isArchived ? "This order will reappear on the board." : "This order will be hidden from the board."}
              </p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button onClick={() => setShowArchiveConfirm(false)} disabled={archiveLoading} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                <button onClick={confirmArchiveToggle} disabled={archiveLoading} style={{ backgroundColor: order.isArchived ? "#10b981" : "#6b7280", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: "6px", cursor: "pointer" }}>
                  {archiveLoading ? "..." : (order.isArchived ? "Unarchive Order" : "Archive Order")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Toast */}
        {showNotification && (
          <div style={{ position: "fixed", top: "100px", right: "24px", backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: "8px", padding: "1rem 1.5rem", zIndex: 1200, maxWidth: "400px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "20px" }}>ℹ️</span>
              <span style={{ color: "#d1d5db", fontSize: "14px" }}>{notificationMessage}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
