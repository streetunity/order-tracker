"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import ShipmentFilters from "./ShipmentFilters";
import ShipmentFormModal from "./ShipmentFormModal";
import ShipmentDocumentsSection from "./ShipmentDocumentsSection";

export default function ShipmentManagementPage() {
  const { user, getAuthHeaders, loading: authLoading } = useAuth();
  const router = useRouter();

  const [shipments, setShipments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("active");
  const [statusFilter, setStatusFilter] = useState("");
  
  // UI State
  const [expandedShipment, setExpandedShipment] = useState(null);
  const [editingShipment, setEditingShipment] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Add Item state
  const [addingItemToShipment, setAddingItemToShipment] = useState(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemSearchResults, setItemSearchResults] = useState([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);
  
  // Create/Edit form
  const [formData, setFormData] = useState({
    containerNumber: "",
    billOfLading: "",
    vesselName: "",
    etaDate: "",
    portOfOrigin: "",
    portOfDestination: ""
  });

  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const isManufacturer = user?.role === "MANUFACTURER";
  // Manufacturers see this page in read-only mode — no create, edit, link, unlink, archive, delete.
  const canManage = !isManufacturer;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && !["SUPER_ADMIN", "ADMIN", "AGENT", "MANUFACTURER"].includes(user.role)) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadShipments();
      loadStats();
    }
  }, [user, viewFilter, statusFilter, searchQuery]);

  // Debounced item search
  useEffect(() => {
    if (addingItemToShipment === null) return;
    const timer = setTimeout(() => {
      searchUnlinkedItems(itemSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch, addingItemToShipment]);

  async function loadShipments() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (viewFilter === "archived") {
        params.append("archivedOnly", "true");
      } else if (viewFilter === "all") {
        params.append("includeArchived", "true");
      }
      
      if (statusFilter) {
        params.append("status", statusFilter);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const res = await fetch(`/api/shipments?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      
      if (res.ok) {
        const data = await res.json();
        setShipments(data);
      } else {
        setError("Failed to load shipments");
      }
    } catch (err) {
      console.error("Error loading shipments:", err);
      setError("Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/shipments/stats", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  }

  async function searchUnlinkedItems(query) {
    try {
      setItemSearchLoading(true);
      const params = new URLSearchParams();
      if (query) params.append("search", query);
      const res = await fetch(`/api/shipments/search-items?${params}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setItemSearchResults(data);
      }
    } catch (err) {
      console.error("Error searching items:", err);
    } finally {
      setItemSearchLoading(false);
    }
  }

  async function handleLinkItem(shipmentId, itemId) {
    try {
      setActionLoading(itemId);
      const res = await fetch(`/api/shipments/${shipmentId}/link-item`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ itemId })
      });
      if (res.ok) {
        setAddingItemToShipment(null);
        setItemSearch("");
        setItemSearchResults([]);
        loadShipments();
        loadStats();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to link item");
      }
    } catch (err) {
      setError("Failed to link item");
    } finally {
      setActionLoading(null);
    }
  }

  function openAddItem(shipmentId) {
    setAddingItemToShipment(shipmentId);
    setItemSearch("");
    setItemSearchResults([]);
    searchUnlinkedItems("");
  }

  function closeAddItem() {
    setAddingItemToShipment(null);
    setItemSearch("");
    setItemSearchResults([]);
  }

  async function handleCreateShipment(e) {
    e.preventDefault();
    
    if (!formData.containerNumber && !formData.billOfLading) {
      setError("Container number or Bill of Lading is required");
      return;
    }

    try {
      setActionLoading("create");
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setShowCreateForm(false);
        setFormData({
          containerNumber: "",
          billOfLading: "",
          vesselName: "",
          etaDate: "",
          portOfOrigin: "",
          portOfDestination: ""
        });
        loadShipments();
        loadStats();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create shipment");
      }
    } catch (err) {
      setError("Failed to create shipment");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUpdateShipment(id) {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/shipments/${id}`, {
        method: "PUT",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setEditingShipment(null);
        loadShipments();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update shipment");
      }
    } catch (err) {
      setError("Failed to update shipment");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleArchive(id) {
    if (!confirm("Archive this shipment? It will be hidden from dropdown lists.")) return;
    
    try {
      setActionLoading(id);
      const res = await fetch(`/api/shipments/${id}/archive`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      if (res.ok) {
        loadShipments();
        loadStats();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to archive shipment");
      }
    } catch (err) {
      setError("Failed to archive shipment");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnarchive(id) {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/shipments/${id}/unarchive`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      if (res.ok) {
        loadShipments();
        loadStats();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to restore shipment");
      }
    } catch (err) {
      setError("Failed to restore shipment");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id, itemCount) {
    if (itemCount > 0) {
      setError("Cannot delete shipment with linked items. Unlink all items first.");
      return;
    }
    
    if (!confirm("Permanently delete this shipment? This cannot be undone.")) return;
    
    try {
      setActionLoading(id);
      const res = await fetch(`/api/shipments/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (res.ok) {
        loadShipments();
        loadStats();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete shipment");
      }
    } catch (err) {
      setError("Failed to delete shipment");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnlinkItem(shipmentId, itemId) {
    if (!confirm("Unlink this item from the shipment?")) return;
    
    try {
      setActionLoading(itemId);
      const res = await fetch(`/api/shipments/${shipmentId}/unlink-item`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ itemId })
      });

      if (res.ok) {
        loadShipments();
        loadStats();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to unlink item");
      }
    } catch (err) {
      setError("Failed to unlink item");
    } finally {
      setActionLoading(null);
    }
  }

  function startEdit(shipment) {
    setEditingShipment(shipment.id);
    setFormData({
      containerNumber: shipment.containerNumber || "",
      billOfLading: shipment.billOfLading || "",
      vesselName: shipment.vesselName || "",
      etaDate: shipment.etaDate ? new Date(shipment.etaDate).toISOString().split('T')[0] : "",
      portOfOrigin: shipment.portOfOrigin || "",
      portOfDestination: shipment.portOfDestination || ""
    });
  }

  function cancelEdit() {
    setEditingShipment(null);
    setFormData({
      containerNumber: "",
      billOfLading: "",
      vesselName: "",
      etaDate: "",
      portOfOrigin: "",
      portOfDestination: ""
    });
  }

  const getStatusStyle = (status) => {
    const styles = {
      PENDING: { background: "rgba(107, 114, 128, 0.3)", color: "#9ca3af" },
      IN_PROGRESS: { background: "rgba(59, 130, 246, 0.3)", color: "#60a5fa" },
      FILED: { background: "rgba(234, 179, 8, 0.3)", color: "#fbbf24" },
      CLEARED: { background: "rgba(34, 197, 94, 0.3)", color: "#4ade80" },
      ISSUES: { background: "rgba(239, 68, 68, 0.3)", color: "#f87171" }
    };
    return styles[status] || styles.PENDING;
  };

  if (authLoading || !user) {
    return (
      <>
        <TopNav />
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: 24 }}>
          <div style={{ color: "rgba(255, 255, 255, 0.6)" }}>Loading...</div>
        </div>
      </>
    );
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px"
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)"
  };

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "32px" }}>🚢</span>
              {isManufacturer ? "Shared Shipments" : "Shipment Management"}
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "14px" }}>
              {isManufacturer
                ? "Read-only view of shipments containing items assigned to you. You can upload shipment-level documents."
                : "Manage shared shipments and track customs clearance"}
            </p>
          </div>

          {canManage && (
            <button
              onClick={() => setShowCreateForm(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 20px",
                background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px"
              }}
            >
              <span style={{ fontSize: "18px" }}>+</span>
              New Shipment
            </button>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "20px"
            }}>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff", marginBottom: 4 }}>{stats.active}</div>
              <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.5)" }}>Active Shipments</div>
            </div>
            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "20px"
            }}>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff", marginBottom: 4 }}>{stats.archived}</div>
              <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.5)" }}>Archived</div>
            </div>
            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "20px"
            }}>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff", marginBottom: 4 }}>{stats.linkedItems}</div>
              <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.5)" }}>{isManufacturer ? "My Linked Items" : "Linked Items"}</div>
            </div>
            <div style={{
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "12px",
              padding: "20px"
            }}>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#4ade80", marginBottom: 4 }}>{stats.byStatus?.CLEARED || 0}</div>
              <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.5)" }}>Cleared</div>
            </div>
          </div>
        )}

        <ShipmentFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewFilter={viewFilter}
          setViewFilter={setViewFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          error={error}
          setError={setError}
        />

        {canManage && (
          <ShipmentFormModal
            show={showCreateForm}
            onClose={() => setShowCreateForm(false)}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreateShipment}
            loading={actionLoading === "create"}
          />
        )}

        {/* Shipments List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "rgba(255, 255, 255, 0.5)" }}>
            Loading shipments...
          </div>
        ) : shipments.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "rgba(255, 255, 255, 0.5)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚢</div>
            <p>{isManufacturer ? "No shipments contain items assigned to you yet." : "No shipments found"}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {shipments.map((shipment) => {
              const statusStyle = getStatusStyle(shipment.customsDocumentStatus);
              const itemCount = shipment._count?.items || 0;
              const totalDocCount = shipment.totalDocCount || shipment._count?.documents || 0;
              const isAddingItem = addingItemToShipment === shipment.id;
              
              return (
                <div
                  key={shipment.id}
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    background: shipment.archivedAt ? "rgba(255, 255, 255, 0.01)" : "rgba(255, 255, 255, 0.03)",
                    opacity: shipment.archivedAt ? 0.7 : 1,
                    overflow: "hidden"
                  }}
                >
                  {/* Shipment Header */}
                  <div
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer"
                    }}
                    onClick={() => setExpandedShipment(expandedShipment === shipment.id ? null : shipment.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span style={{ fontSize: 24, opacity: shipment.archivedAt ? 0.5 : 1 }}>🚢</span>
                      
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: "600", fontSize: 16, color: "#fff" }}>
                            {shipment.containerNumber || shipment.billOfLading || "No identifier"}
                          </span>
                          {shipment.archivedAt && (
                            <span style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              background: "rgba(107, 114, 128, 0.3)",
                              color: "#9ca3af",
                              borderRadius: 4
                            }}>
                              Archived
                            </span>
                          )}
                          <span style={{
                            fontSize: 11,
                            padding: "3px 10px",
                            borderRadius: 4,
                            fontWeight: 500,
                            ...statusStyle
                          }}>
                            {shipment.customsDocumentStatus}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.5)", display: "flex", gap: 16 }}>
                          {shipment.vesselName && (
                            <span>⚓ {shipment.vesselName}</span>
                          )}
                          {shipment.etaDate && (
                            <span>📅 ETA: {new Date(shipment.etaDate).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255, 255, 255, 0.5)", fontSize: 13 }}>
                        <span>📦</span>
                        <span>{itemCount} {isManufacturer ? "of yours" : "items"}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255, 255, 255, 0.5)", fontSize: 13 }}>
                        <span>📄</span>
                        <span>{totalDocCount} docs</span>
                      </div>
                      <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 16 }}>
                        {expandedShipment === shipment.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedShipment === shipment.id && (
                    <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", padding: "20px" }}>
                      {canManage && editingShipment === shipment.id ? (
                        /* Edit Form */
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
                            <div>
                              <label style={labelStyle}>Container Number</label>
                              <input
                                type="text"
                                value={formData.containerNumber}
                                onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Bill of Lading</label>
                              <input
                                type="text"
                                value={formData.billOfLading}
                                onChange={(e) => setFormData({ ...formData, billOfLading: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Vessel Name</label>
                              <input
                                type="text"
                                value={formData.vesselName}
                                onChange={(e) => setFormData({ ...formData, vesselName: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>ETA Date</label>
                              <input
                                type="date"
                                value={formData.etaDate}
                                onChange={(e) => setFormData({ ...formData, etaDate: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Port of Origin</label>
                              <input
                                type="text"
                                value={formData.portOfOrigin}
                                onChange={(e) => setFormData({ ...formData, portOfOrigin: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Port of Destination</label>
                              <input
                                type="text"
                                value={formData.portOfDestination}
                                onChange={(e) => setFormData({ ...formData, portOfDestination: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 10 }}>
                            <button
                              onClick={() => handleUpdateShipment(shipment.id)}
                              disabled={actionLoading === shipment.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "8px 16px",
                                background: "rgba(34, 197, 94, 0.2)",
                                border: "1px solid rgba(34, 197, 94, 0.4)",
                                color: "#4ade80",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontSize: 13
                              }}
                            >
                              ✓ Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "8px 16px",
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                color: "rgba(255, 255, 255, 0.7)",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontSize: 13
                              }}
                            >
                              ✕ Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View Details */
                        <div>
                          {/* Details Grid */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>Container</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{shipment.containerNumber || "—"}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>BOL</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{shipment.billOfLading || "—"}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>Vessel</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{shipment.vesselName || "—"}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>ETA</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>
                                {shipment.etaDate ? new Date(shipment.etaDate).toLocaleDateString() : "—"}
                              </div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>Origin</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{shipment.portOfOrigin || "—"}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>Destination</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{shipment.portOfDestination || "—"}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>Created</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{new Date(shipment.createdAt).toLocaleDateString()}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>By</span>
                              <div style={{ color: "#fff", marginTop: 4 }}>{shipment.createdByName || "—"}</div>
                            </div>
                          </div>

                          {/* Linked Items */}
                          <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                              <h4 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", margin: 0 }}>
                                {isManufacturer ? "Your Items" : "Linked Items"} ({shipment.items?.length || 0})
                              </h4>
                              {canManage && !shipment.archivedAt && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAddingItem) {
                                      closeAddItem();
                                    } else {
                                      openAddItem(shipment.id);
                                    }
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "5px 12px",
                                    background: isAddingItem ? "rgba(255, 255, 255, 0.05)" : "rgba(220, 38, 38, 0.15)",
                                    border: isAddingItem ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(220, 38, 38, 0.4)",
                                    color: isAddingItem ? "rgba(255, 255, 255, 0.6)" : "#dc2626",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    fontSize: 12,
                                    fontWeight: 500
                                  }}
                                >
                                  {isAddingItem ? "✕ Cancel" : "+ Add Item"}
                                </button>
                              )}
                            </div>

                            {/* Existing linked items */}
                            {shipment.items && shipment.items.length > 0 && (
                              <div style={{
                                background: "rgba(255, 255, 255, 0.02)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: 8,
                                overflow: "hidden",
                                marginBottom: isAddingItem ? 12 : 0
                              }}>
                                {shipment.items.map((item, idx) => (
                                  <div 
                                    key={item.id} 
                                    style={{
                                      padding: "12px 16px",
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      borderTop: idx > 0 ? "1px solid rgba(255, 255, 255, 0.06)" : "none"
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontWeight: 600, color: "#fff" }}>{item.productCode}</span>
                                      <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 13 }}>
                                        {item.order?.account?.name} • {item.order?.poNumber || "No PO"}
                                      </span>
                                      <span style={{
                                        fontSize: 11,
                                        padding: "2px 8px",
                                        borderRadius: 4,
                                        background: item.currentStage === "AT_SEA" ? "rgba(59, 130, 246, 0.3)" :
                                                   item.currentStage === "Delivered" ? "rgba(34, 197, 94, 0.3)" : 
                                                   "rgba(107, 114, 128, 0.3)",
                                        color: item.currentStage === "AT_SEA" ? "#60a5fa" :
                                               item.currentStage === "Delivered" ? "#4ade80" : "#9ca3af"
                                      }}>
                                        {item.currentStage}
                                      </span>
                                      {item._count?.documents > 0 && (
                                        <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)" }}>
                                          📄 {item._count.documents}
                                        </span>
                                      )}
                                    </div>
                                    {canManage && (
                                      <div style={{ display: "flex", gap: 8 }}>
                                        <Link
                                          href={`/admin/orders/${item.order?.id}`}
                                          style={{
                                            padding: "4px 10px",
                                            background: "rgba(255, 255, 255, 0.05)",
                                            border: "1px solid rgba(255, 255, 255, 0.1)",
                                            borderRadius: 4,
                                            color: "rgba(255, 255, 255, 0.7)",
                                            textDecoration: "none",
                                            fontSize: 12
                                          }}
                                          title="View Order"
                                        >
                                          View →
                                        </Link>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleUnlinkItem(shipment.id, item.id);
                                          }}
                                          disabled={actionLoading === item.id}
                                          style={{
                                            padding: "4px 10px",
                                            background: "rgba(239, 68, 68, 0.1)",
                                            border: "1px solid rgba(239, 68, 68, 0.3)",
                                            borderRadius: 4,
                                            color: "#ef4444",
                                            cursor: "pointer",
                                            fontSize: 12
                                          }}
                                          title="Unlink Item"
                                        >
                                          Unlink
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add Item Panel */}
                            {canManage && isAddingItem && (
                              <div style={{
                                background: "rgba(220, 38, 38, 0.05)",
                                border: "1px solid rgba(220, 38, 38, 0.2)",
                                borderRadius: 8,
                                padding: 16
                              }}>
                                <div style={{ marginBottom: 12 }}>
                                  <input
                                    type="text"
                                    placeholder="Search by product code, PO number, customer name..."
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      width: "100%",
                                      padding: "9px 14px",
                                      background: "rgba(255, 255, 255, 0.07)",
                                      border: "1px solid rgba(220, 38, 38, 0.3)",
                                      borderRadius: 6,
                                      color: "rgba(255, 255, 255, 0.9)",
                                      fontSize: 13,
                                      boxSizing: "border-box"
                                    }}
                                  />
                                </div>

                                {itemSearchLoading ? (
                                  <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                                    Searching...
                                  </div>
                                ) : itemSearchResults.length === 0 ? (
                                  <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                                    {itemSearch ? "No unlinked items match your search" : "No unlinked items available"}
                                  </div>
                                ) : (
                                  <div style={{
                                    maxHeight: 280,
                                    overflowY: "auto",
                                    border: "1px solid rgba(255, 255, 255, 0.08)",
                                    borderRadius: 6,
                                    background: "rgba(0,0,0,0.2)"
                                  }}>
                                    {itemSearchResults.map((item, idx) => (
                                      <div
                                        key={item.id}
                                        style={{
                                          padding: "10px 14px",
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                                          transition: "background 0.15s"
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                          <span style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>{item.productCode}</span>
                                          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                                            {item.order?.account?.name}
                                          </span>
                                          {item.order?.poNumber && (
                                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                                              • {item.order.poNumber}
                                            </span>
                                          )}
                                          <span style={{
                                            fontSize: 11,
                                            padding: "1px 7px",
                                            borderRadius: 4,
                                            background: "rgba(107, 114, 128, 0.3)",
                                            color: "#9ca3af"
                                          }}>
                                            {item.currentStage}
                                          </span>
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleLinkItem(shipment.id, item.id);
                                          }}
                                          disabled={actionLoading === item.id}
                                          style={{
                                            padding: "4px 12px",
                                            background: "rgba(220, 38, 38, 0.2)",
                                            border: "1px solid rgba(220, 38, 38, 0.4)",
                                            borderRadius: 4,
                                            color: "#dc2626",
                                            cursor: "pointer",
                                            fontSize: 12,
                                            fontWeight: 500,
                                            whiteSpace: "nowrap"
                                          }}
                                        >
                                          {actionLoading === item.id ? "Linking..." : "+ Add to Shipment"}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Documents (shipment-level + item-level unified view) */}
                          <ShipmentDocumentsSection
                            shipment={shipment}
                            user={user}
                            getAuthHeaders={getAuthHeaders}
                            onChange={loadShipments}
                          />

                          {/* Actions */}
                          {canManage && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 16, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                              <button
                                onClick={() => startEdit(shipment)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "8px 16px",
                                  background: "rgba(255, 255, 255, 0.05)",
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                  color: "rgba(255, 255, 255, 0.9)",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontSize: 13
                                }}
                              >
                                ✏️ Edit
                              </button>
                              
                              {isAdmin && (
                                <>
                                  {shipment.archivedAt ? (
                                    <button
                                      onClick={() => handleUnarchive(shipment.id)}
                                      disabled={actionLoading === shipment.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "8px 16px",
                                        background: "rgba(34, 197, 94, 0.2)",
                                        border: "1px solid rgba(34, 197, 94, 0.4)",
                                        color: "#4ade80",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        fontSize: 13
                                      }}
                                    >
                                      📤 Restore
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleArchive(shipment.id)}
                                      disabled={actionLoading === shipment.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "8px 16px",
                                        background: "rgba(234, 179, 8, 0.2)",
                                        border: "1px solid rgba(234, 179, 8, 0.4)",
                                        color: "#fbbf24",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        fontSize: 13
                                      }}
                                    >
                                      📥 Archive
                                    </button>
                                  )}
                                  
                                  <button
                                    onClick={() => handleDelete(shipment.id, itemCount)}
                                    disabled={actionLoading === shipment.id || itemCount > 0}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "8px 16px",
                                      background: "rgba(239, 68, 68, 0.2)",
                                      border: "1px solid rgba(239, 68, 68, 0.4)",
                                      color: "#ef4444",
                                      borderRadius: 6,
                                      cursor: itemCount > 0 ? "not-allowed" : "pointer",
                                      opacity: itemCount > 0 ? 0.5 : 1,
                                      fontSize: 13
                                    }}
                                    title={itemCount > 0 ? "Unlink all items first" : "Delete shipment"}
                                  >
                                    🗑️ Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
