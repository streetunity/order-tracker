"use client";
import { useState } from "react";

export default function ContainersSection({ item, orderId, isAdmin, isLocked, getAuthHeaders, onUpdate }) {
  const [containers, setContainers] = useState(
    item.containers ? (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : []
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Calculate total weight and box count
  const totalWeight = containers.reduce((sum, c) => sum + (c.weight || 0), 0);
  const boxCount = containers.length;

  // Save containers to backend
  async function saveContainers(updatedContainers) {
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { 
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ 
          containers: updatedContainers
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      setContainers(updatedContainers);
      if (onUpdate) onUpdate();
    } catch (e) {
      alert(`Failed to save containers: ${e.message}`);
      // Revert on error
      setContainers(
        item.containers ? (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : []
      );
    } finally {
      setSaving(false);
    }
  }

  // Add new container
  function addContainer() {
    const newContainer = {
      id: `box-${Date.now()}`,
      label: `Box ${containers.length + 1}`,
      tracking: "",
      height: null,
      width: null,
      length: null,
      weight: null,
      unit: "in"
    };
    const updated = [...containers, newContainer];
    saveContainers(updated);
    setEditingId(newContainer.id);
  }

  // Update container
  function updateContainer(containerId, field, value) {
    const updated = containers.map(c => 
      c.id === containerId 
        ? { ...c, [field]: field === 'height' || field === 'width' || field === 'length' || field === 'weight' 
            ? (value === "" ? null : parseFloat(value)) 
            : value }
        : c
    );
    setContainers(updated);
  }

  // Save container edits
  function saveContainerEdits(containerId) {
    saveContainers(containers);
    setEditingId(null);
  }

  // Delete container
  function deleteContainer(containerId) {
    if (!confirm("Delete this container?")) return;
    const updated = containers.filter(c => c.id !== containerId);
    saveContainers(updated);
  }

  // Can only edit if admin or not locked
  const canEdit = isAdmin || !isLocked;

  return (
    <div style={{
      marginTop: "8px",
      padding: "12px",
      backgroundColor: "#2d2d2d",
      border: "1px solid #404040",
      borderRadius: "6px"
    }}>
      {/* Header */}
      <div 
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer"
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
            📦 Containers / Boxes
          </span>
          {boxCount > 0 && (
            <>
              <span style={{ 
                fontSize: "12px", 
                padding: "2px 8px", 
                backgroundColor: "#1e40af", 
                borderRadius: "12px",
                color: "#fff"
              }}>
                {boxCount} {boxCount === 1 ? 'box' : 'boxes'}
              </span>
              {totalWeight > 0 && (
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                  Total: {totalWeight.toFixed(1)} lbs
                </span>
              )}
            </>
          )}
        </div>
        <span style={{ fontSize: "18px", color: "#9ca3af" }}>
          {isExpanded ? '−' : '+'}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ marginTop: "16px" }}>
          {containers.length === 0 ? (
            <div style={{ 
              color: "#6b7280", 
              fontSize: "13px", 
              fontStyle: "italic",
              marginBottom: "12px"
            }}>
              No containers added yet. Single shipment assumed.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {containers.map((container, index) => (
                <div 
                  key={container.id}
                  style={{
                    padding: "12px",
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #4b5563",
                    borderRadius: "4px"
                  }}
                >
                  {editingId === container.id ? (
                    /* Edit mode */
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "8px", marginBottom: "8px" }}>
                        <input
                          className="input"
                          value={container.label}
                          onChange={(e) => updateContainer(container.id, 'label', e.target.value)}
                          placeholder="Label"
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        />
                        <input
                          className="input"
                          value={container.tracking}
                          onChange={(e) => updateContainer(container.id, 'tracking', e.target.value)}
                          placeholder="Tracking number"
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        />
                        <select
                          className="input"
                          value={container.unit}
                          onChange={(e) => updateContainer(container.id, 'unit', e.target.value)}
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        >
                          <option value="in">Inches</option>
                          <option value="cm">Centimeters</option>
                        </select>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                        <input
                          className="input"
                          type="number"
                          value={container.length || ""}
                          onChange={(e) => updateContainer(container.id, 'length', e.target.value)}
                          placeholder="Length"
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        />
                        <input
                          className="input"
                          type="number"
                          value={container.width || ""}
                          onChange={(e) => updateContainer(container.id, 'width', e.target.value)}
                          placeholder="Width"
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        />
                        <input
                          className="input"
                          type="number"
                          value={container.height || ""}
                          onChange={(e) => updateContainer(container.id, 'height', e.target.value)}
                          placeholder="Height"
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        />
                        <input
                          className="input"
                          type="number"
                          value={container.weight || ""}
                          onChange={(e) => updateContainer(container.id, 'weight', e.target.value)}
                          placeholder="Weight (lbs)"
                          style={{ fontSize: "12px" }}
                          disabled={saving}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          className="btn primary"
                          onClick={() => saveContainerEdits(container.id)}
                          disabled={saving}
                          style={{ fontSize: "11px", padding: "2px 8px" }}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="btn"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                          style={{ fontSize: "11px", padding: "2px 8px" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "500", fontSize: "13px", marginBottom: "4px", color: "#e4e4e4" }}>
                          {container.label}
                        </div>
                        {container.tracking && (
                          <div style={{ fontSize: "12px", color: "#60a5fa", marginBottom: "4px" }}>
                            📍 {container.tracking}
                          </div>
                        )}
                        <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                          {container.length && container.width && container.height ? (
                            <>
                              📐 {container.length} × {container.width} × {container.height} {container.unit}
                            </>
                          ) : (
                            <span style={{ fontStyle: "italic" }}>No dimensions</span>
                          )}
                          {container.weight && (
                            <> · ⚖️ {container.weight} lbs</>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            className="btn"
                            onClick={() => setEditingId(container.id)}
                            disabled={saving}
                            style={{ fontSize: "10px", padding: "1px 6px" }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => deleteContainer(container.id)}
                            disabled={saving}
                            style={{ 
                              fontSize: "10px", 
                              padding: "1px 6px",
                              borderColor: "#ef4444",
                              color: "#ef4444"
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add container button */}
          {canEdit && (
            <button
              className="btn primary"
              onClick={addContainer}
              disabled={saving}
              style={{ 
                marginTop: "12px",
                fontSize: "12px",
                padding: "4px 12px"
              }}
            >
              + Add Container
            </button>
          )}
        </div>
      )}
    </div>
  );
}
