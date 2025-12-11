"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { 
  Ship, Package, FileText, Search, Plus, Archive, ArchiveRestore, 
  Trash2, ChevronDown, ChevronUp, Edit2, X, Check, Link2, Unlink,
  Calendar, Anchor, MapPin, AlertCircle, ExternalLink
} from "lucide-react";

export default function ShipmentManagementPage() {
  const { user, getAuthHeaders, loading: authLoading } = useAuth();
  const router = useRouter();

  const [shipments, setShipments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("active"); // active, archived, all
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
      // active is default (no params needed)
      
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

  const statusColors = {
    PENDING: "bg-gray-600",
    IN_PROGRESS: "bg-blue-600",
    FILED: "bg-yellow-600",
    CLEARED: "bg-green-600",
    ISSUES: "bg-red-600"
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-400 hover:text-white">
              ← Back to Admin
            </Link>
            <div className="flex items-center gap-2">
              <Ship className="w-6 h-6 text-red-500" />
              <h1 className="text-xl font-bold">Shipment Management</h1>
            </div>
          </div>
          
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            New Shipment
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">{stats.active}</div>
              <div className="text-sm text-gray-400">Active Shipments</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">{stats.archived}</div>
              <div className="text-sm text-gray-400">Archived</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">{stats.linkedItems}</div>
              <div className="text-sm text-gray-400">Linked Items</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-500">{stats.byStatus?.CLEARED || 0}</div>
              <div className="text-sm text-gray-400">Cleared</div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg flex items-center justify-between">
            <span className="text-red-300">{error}</span>
            <button onClick={() => setError("")} className="text-red-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search container, BOL, vessel..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500"
            />
          </div>
          
          <select
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value)}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
          >
            <option value="active">Active Only</option>
            <option value="archived">Archived Only</option>
            <option value="all">All Shipments</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
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
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b border-zinc-700">
                <h2 className="text-lg font-semibold">Create New Shipment</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateShipment} className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Container Number</label>
                    <input
                      type="text"
                      value={formData.containerNumber}
                      onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                      placeholder="MSKU1234567"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Bill of Lading</label>
                    <input
                      type="text"
                      value={formData.billOfLading}
                      onChange={(e) => setFormData({ ...formData, billOfLading: e.target.value })}
                      placeholder="BOL-123456"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Vessel Name</label>
                    <input
                      type="text"
                      value={formData.vesselName}
                      onChange={(e) => setFormData({ ...formData, vesselName: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ETA Date</label>
                    <input
                      type="date"
                      value={formData.etaDate}
                      onChange={(e) => setFormData({ ...formData, etaDate: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Port of Origin</label>
                    <input
                      type="text"
                      value={formData.portOfOrigin}
                      onChange={(e) => setFormData({ ...formData, portOfOrigin: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Port of Destination</label>
                    <input
                      type="text"
                      value={formData.portOfDestination}
                      onChange={(e) => setFormData({ ...formData, portOfDestination: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === "create"}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
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
          <div className="text-center py-12 text-gray-400">Loading shipments...</div>
        ) : shipments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Ship className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No shipments found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shipments.map((shipment) => (
              <div
                key={shipment.id}
                className={`bg-zinc-900 border rounded-lg overflow-hidden ${
                  shipment.archivedAt ? "border-zinc-700 opacity-75" : "border-zinc-800"
                }`}
              >
                {/* Shipment Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50"
                  onClick={() => setExpandedShipment(expandedShipment === shipment.id ? null : shipment.id)}
                >
                  <div className="flex items-center gap-4">
                    <Ship className={`w-5 h-5 ${shipment.archivedAt ? "text-gray-500" : "text-red-500"}`} />
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {shipment.containerNumber || shipment.billOfLading || "No identifier"}
                        </span>
                        {shipment.archivedAt && (
                          <span className="text-xs px-2 py-0.5 bg-zinc-700 text-gray-400 rounded">
                            Archived
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[shipment.customsDocumentStatus]}`}>
                          {shipment.customsDocumentStatus}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 flex items-center gap-3 mt-1">
                        {shipment.vesselName && (
                          <span className="flex items-center gap-1">
                            <Anchor className="w-3 h-3" />
                            {shipment.vesselName}
                          </span>
                        )}
                        {shipment.etaDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            ETA: {new Date(shipment.etaDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Package className="w-4 h-4" />
                      {shipment._count?.items || 0} items
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <FileText className="w-4 h-4" />
                      {shipment._count?.documents || 0} docs
                    </div>
                    {expandedShipment === shipment.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedShipment === shipment.id && (
                  <div className="border-t border-zinc-800 p-4">
                    {editingShipment === shipment.id ? (
                      /* Edit Form */
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Container Number</label>
                            <input
                              type="text"
                              value={formData.containerNumber}
                              onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Bill of Lading</label>
                            <input
                              type="text"
                              value={formData.billOfLading}
                              onChange={(e) => setFormData({ ...formData, billOfLading: e.target.value })}
                              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Vessel Name</label>
                            <input
                              type="text"
                              value={formData.vesselName}
                              onChange={(e) => setFormData({ ...formData, vesselName: e.target.value })}
                              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">ETA Date</label>
                            <input
                              type="date"
                              value={formData.etaDate}
                              onChange={(e) => setFormData({ ...formData, etaDate: e.target.value })}
                              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Port of Origin</label>
                            <input
                              type="text"
                              value={formData.portOfOrigin}
                              onChange={(e) => setFormData({ ...formData, portOfOrigin: e.target.value })}
                              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Port of Destination</label>
                            <input
                              type="text"
                              value={formData.portOfDestination}
                              onChange={(e) => setFormData({ ...formData, portOfDestination: e.target.value })}
                              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateShipment(shipment.id)}
                            disabled={actionLoading === shipment.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm"
                          >
                            <Check className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Details */
                      <div className="space-y-4">
                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Container:</span>
                            <span className="ml-2">{shipment.containerNumber || "—"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">BOL:</span>
                            <span className="ml-2">{shipment.billOfLading || "—"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Vessel:</span>
                            <span className="ml-2">{shipment.vesselName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">ETA:</span>
                            <span className="ml-2">
                              {shipment.etaDate ? new Date(shipment.etaDate).toLocaleDateString() : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Origin:</span>
                            <span className="ml-2">{shipment.portOfOrigin || "—"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Destination:</span>
                            <span className="ml-2">{shipment.portOfDestination || "—"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Created:</span>
                            <span className="ml-2">{new Date(shipment.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">By:</span>
                            <span className="ml-2">{shipment.createdByName || "—"}</span>
                          </div>
                        </div>

                        {/* Linked Items */}
                        {shipment.items && shipment.items.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Linked Items ({shipment.items.length})</h4>
                            <div className="bg-zinc-800 rounded-lg divide-y divide-zinc-700">
                              {shipment.items.map((item) => (
                                <div key={item.id} className="p-3 flex items-center justify-between">
                                  <div>
                                    <span className="font-medium">{item.productCode}</span>
                                    <span className="text-gray-400 text-sm ml-2">
                                      {item.order?.account?.name} • {item.order?.poNumber || "No PO"}
                                    </span>
                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                      item.currentStage === "AT_SEA" ? "bg-blue-600" :
                                      item.currentStage === "Delivered" ? "bg-green-600" : "bg-zinc-600"
                                    }`}>
                                      {item.currentStage}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/admin/orders/${item.order?.id}`}
                                      className="text-gray-400 hover:text-white p-1"
                                      title="View Order"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </Link>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnlinkItem(shipment.id, item.id);
                                      }}
                                      disabled={actionLoading === item.id}
                                      className="text-gray-400 hover:text-red-400 p-1"
                                      title="Unlink Item"
                                    >
                                      <Unlink className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                          <button
                            onClick={() => startEdit(shipment)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </button>
                          
                          {isAdmin && (
                            <>
                              {shipment.archivedAt ? (
                                <button
                                  onClick={() => handleUnarchive(shipment.id)}
                                  disabled={actionLoading === shipment.id}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm"
                                >
                                  <ArchiveRestore className="w-4 h-4" />
                                  Restore
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleArchive(shipment.id)}
                                  disabled={actionLoading === shipment.id}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
                                >
                                  <Archive className="w-4 h-4" />
                                  Archive
                                </button>
                              )}
                              
                              <button
                                onClick={() => handleDelete(shipment.id, shipment._count?.items || 0)}
                                disabled={actionLoading === shipment.id || (shipment._count?.items || 0) > 0}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title={shipment._count?.items > 0 ? "Unlink all items first" : "Delete shipment"}
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
