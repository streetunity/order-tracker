"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import TopNav from "@/components/TopNav";

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

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && !["SUPER_ADMIN", "ADMIN", "AGENT"].includes(user.role)) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadShipments();
      loadStats();
    }
  }, [user, viewFilter, statusFilter, searchQuery]);

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

  // Count total documents from linked items
  const getItemDocsCount = (items) => {
    if (!items) return 0;
    return items.reduce((total, item) => total + (item._count?.documents || 0), 0);
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
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ef4444", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "32px" }}>🚢</span>
              Shipment Management
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "14px" }}>
              Manage shared shipments and track customs clearance
            </p>
          </div>
          
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
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
              <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.5)" }}>Linked Items</div>
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

        {/* Error Message */}
        {error && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>{error}</span>
            <button 
              onClick={() => setError("")}
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "18px" }}
            >
              ×
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "250px" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)" }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search container, BOL, vessel..."
              style={{ ...inputStyle, paddingLeft: 40 }}
            />
          </div>
          
          <select
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: "150px", cursor: "pointer" }}
          >
            <option value="active">Active Only</option>
            <option value="archived">Archived Only</option>
            <option value="all">All Shipments</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: "150px", cursor: "pointer" }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="FILED">Filed</option>
            <option value="CLEARED">Cleared</option>
            <option value="ISSUES">Issues</option>
          </select>
        </div>

        {/* Create Form Modal */}
        {showCreateForm && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100
          }} onClick={() => setShowCreateForm(false)}>
            <div style={{
              backgroundColor: "#1a1a1a",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "600px",
              margin: "20px"
            }} onClick={e => e.stopPropagation()}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
              }}>
                <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#fff", margin: 0 }}>Create New Shipment</h2>
                <button 
                  onClick={() => setShowCreateForm(false)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "24px" }}
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleCreateShipment} style={{ padding: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Container Number</label>
                    <input
                      type="text"
                      value={formData.containerNumber}
                      onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                      placeholder="MSKU1234567"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Bill of Lading</label>
                    <input
                      type="text"
                      value={formData.billOfLading}
                      onChange={(e) => setFormData({ ...formData, billOfLading: e.target.value })}
                      placeholder="BOL-123456"
                      style={inputStyle}
                    />
                  </div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
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
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
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
                
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    style={{
                      padding: "10px 20px",
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "rgba(255, 255, 255, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === "create"}
                    style={{
                      padding: "10px 20px",
                      background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: actionLoading === "create" ? "not-allowed" : "pointer",
                      opacity: actionLoading === "create" ? 0.7 : 1,
                      fontWeight: "600"
                    }}
                  >
                    {actionLoading === "create" ? "Creating..." : "Create Shipment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Shipments List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "rgba(255, 255, 255, 0.5)" }}>
            Loading shipments...
          </div>
        ) : shipments.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "rgba(255, 255, 255, 0.5)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚢</div>
            <p>No shipments found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {shipments.map((shipment) => {
              const statusStyle = getStatusStyle(shipment.customsDocumentStatus);
              const itemCount = shipment._count?.items || 0;
              const shipmentDocCount = shipment._count?.documents || 0;
              
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
                        <span>{itemCount} items</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255, 255, 255, 0.5)", fontSize: 13 }}>
                        <span>📄</span>
                        <span>{shipmentDocCount} docs</span>
                      </div>
                      <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 16 }}>
                        {expandedShipment === shipment.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedShipment === shipment.id && (
                    <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", padding: "20px" }}>
                      {editingShipment === shipment.id ? (
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
                          {shipment.items && shipment.items.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <h4 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", marginBottom: 12 }}>
                                Linked Items ({shipment.items.length})
                              </h4>
                              <div style={{
                                background: "rgba(255, 255, 255, 0.02)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: 8,
                                overflow: "hidden"
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
                                    <div>
                                      <span style={{ fontWeight: 600, color: "#fff" }}>{item.productCode}</span>
                                      <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 13, marginLeft: 12 }}>
                                        {item.order?.account?.name} • {item.order?.poNumber || "No PO"}
                                      </span>
                                      <span style={{
                                        marginLeft: 10,
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
                                    </div>
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
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
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
