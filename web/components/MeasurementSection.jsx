"use client";
import { useState } from "react";

export default function MeasurementSection({ order, items, onRefresh, getAuthHeaders }) {
  const [editingItem, setEditingItem] = useState(null);
  const [measurements, setMeasurements] = useState({});
  const [saving, setSaving] = useState(false);
  const [editingContainer, setEditingContainer] = useState(null);
  const [containerSaving, setContainerSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());

  const startEdit = (item) => {
    setEditingItem(item.id);
    setMeasurements({
      height: item.height || '',
      width: item.width || '',
      length: item.length || '',
      weight: item.weight || '',
      measurementUnit: item.measurementUnit || 'in',
      weightUnit: item.weightUnit || 'lbs'
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setMeasurements({});
  };

  const saveMeasurements = async (itemId) => {
    try {
      setSaving(true);
      
      // Get token directly from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found. Please login again.');
      }
      
      console.log('Saving measurements with token:', token.substring(0, 20) + '...');
      
      const response = await fetch(
        `/api/orders/${order.id}/items/${itemId}/measurements`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(measurements)
        }
      );
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `Failed to update measurements (${response.status})`);
      }
      
      setEditingItem(null);
      setMeasurements({});
      if (onRefresh) {
        await onRefresh();
      }
      alert('Measurements saved successfully!');
    } catch (error) {
      console.error('Failed to save measurements:', error);
      alert(`Failed to save measurements: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Container management functions
  const saveContainers = async (itemId, updatedContainers) => {
    try {
      setContainerSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(itemId)}`, {
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
      
      if (onRefresh) await onRefresh();
    } catch (e) {
      alert(`Failed to save containers: ${e.message}`);
    } finally {
      setContainerSaving(false);
    }
  };

  const addContainer = (item) => {
    const containers = item.containers ? 
      (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : [];
    
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
    saveContainers(item.id, updated);
  };

  const updateContainer = (item, containerId, field, value) => {
    const containers = item.containers ? 
      (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : [];
    
    const updated = containers.map(c => 
      c.id === containerId 
        ? { ...c, [field]: field === 'height' || field === 'width' || field === 'length' || field === 'weight' 
            ? (value === "" ? null : parseFloat(value)) 
            : value }
        : c
    );
    saveContainers(item.id, updated);
  };

  const deleteContainer = (item, containerId) => {
    if (!confirm("Delete this container?")) return;
    const containers = item.containers ? 
      (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : [];
    
    const updated = containers.filter(c => c.id !== containerId);
    saveContainers(item.id, updated);
  };

  const toggleItemExpanded = (itemId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8
      }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Measurements & Containers</h2>
        <span style={{ 
          backgroundColor: '#6b7280', 
          color: '#fff', 
          padding: '4px 8px', 
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 'bold'
        }}>
          Always Editable
        </span>
      </div>
      
      {order?.isLocked && (
        <div style={{ 
          fontSize: "12px", 
          color: "#6b7280", 
          marginBottom: "12px",
          fontStyle: "italic"
        }}>
          ℹ️ Measurements and containers can be updated even when the order is locked
        </div>
      )}
      
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: "900px" }}>
          <thead>
            <tr>
              <th style={{ width: "200px" }}>Item</th>
              <th style={{ width: "80px" }}>Height</th>
              <th style={{ width: "80px" }}>Width</th>
              <th style={{ width: "80px" }}>Length</th>
              <th style={{ width: "60px" }}>Unit</th>
              <th style={{ width: "80px" }}>Weight</th>
              <th style={{ width: "60px" }}>Unit</th>
              <th style={{ width: "100px" }}>Containers</th>
              <th style={{ width: "120px" }}>Last Updated</th>
              <th style={{ width: "120px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!items || items.length === 0) ? (
              <tr><td colSpan={10} style={{ color: "#6b7280" }}>No items to measure.</td></tr>
            ) : (
              items.map((item) => {
                const isEditing = editingItem === item.id;
                const isExpanded = expandedItems.has(item.id);
                const containers = item.containers ? 
                  (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : [];
                const totalContainerWeight = containers.reduce((sum, c) => sum + (c.weight || 0), 0);
                
                return (
                  <>
                    <tr key={item.id}>
                      <td>
                        <strong>{item.productCode}</strong>
                        {item.serialNumber && (
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>
                            S/N: {item.serialNumber}
                          </div>
                        )}
                      </td>
                      
                      {/* Height */}
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={measurements.height}
                            onChange={(e) => setMeasurements({
                              ...measurements,
                              height: e.target.value
                            })}
                            style={{ width: '60px', padding: '4px' }}
                          />
                        ) : (
                          <span>{item.height || '—'}</span>
                        )}
                      </td>
                      
                      {/* Width */}
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={measurements.width}
                            onChange={(e) => setMeasurements({
                              ...measurements,
                              width: e.target.value
                            })}
                            style={{ width: '60px', padding: '4px' }}
                          />
                        ) : (
                          <span>{item.width || '—'}</span>
                        )}
                      </td>
                      
                      {/* Length */}
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={measurements.length}
                            onChange={(e) => setMeasurements({
                              ...measurements,
                              length: e.target.value
                            })}
                            style={{ width: '60px', padding: '4px' }}
                          />
                        ) : (
                          <span>{item.length || '—'}</span>
                        )}
                      </td>
                      
                      {/* Dimension Unit */}
                      <td>
                        {isEditing ? (
                          <select
                            value={measurements.measurementUnit}
                            onChange={(e) => setMeasurements({
                              ...measurements,
                              measurementUnit: e.target.value
                            })}
                            style={{ width: '55px', padding: '4px' }}
                          >
                            <option value="in">in</option>
                            <option value="cm">cm</option>
                          </select>
                        ) : (
                          <span>{item.measurementUnit || 'in'}</span>
                        )}
                      </td>
                      
                      {/* Weight */}
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={measurements.weight}
                            onChange={(e) => setMeasurements({
                              ...measurements,
                              weight: e.target.value
                            })}
                            style={{ width: '60px', padding: '4px' }}
                          />
                        ) : (
                          <span>{item.weight || '—'}</span>
                        )}
                      </td>
                      
                      {/* Weight Unit */}
                      <td>
                        {isEditing ? (
                          <select
                            value={measurements.weightUnit}
                            onChange={(e) => setMeasurements({
                              ...measurements,
                              weightUnit: e.target.value
                            })}
                            style={{ width: '55px', padding: '4px' }}
                          >
                            <option value="lbs">lbs</option>
                            <option value="kg">kg</option>
                          </select>
                        ) : (
                          <span>{item.weightUnit || 'lbs'}</span>
                        )}
                      </td>
                      
                      {/* Containers Summary */}
                      <td>
                        <button
                          className="btn"
                          onClick={() => toggleItemExpanded(item.id)}
                          style={{ 
                            fontSize: '11px', 
                            padding: '2px 6px',
                            backgroundColor: containers.length > 0 ? '#1e40af' : '#4b5563'
                          }}
                        >
                          📦 {containers.length} {isExpanded ? '−' : '+'}
                        </button>
                        {totalContainerWeight > 0 && (
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                            {totalContainerWeight.toFixed(1)} lbs
                          </div>
                        )}
                      </td>
                      
                      {/* Last Updated */}
                      <td style={{ fontSize: '11px', color: '#6b7280' }}>
                        {item.measuredAt ? (
                          <>
                            <div>{new Date(item.measuredAt).toLocaleDateString()}</div>
                            <div>by {item.measuredBy || 'Unknown'}</div>
                          </>
                        ) : (
                          'Never'
                        )}
                      </td>
                      
                      {/* Actions */}
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              className="btn" 
                              onClick={() => saveMeasurements(item.id)}
                              disabled={saving}
                              style={{ fontSize: '11px', padding: '2px 8px' }}
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              className="btn" 
                              onClick={cancelEdit}
                              disabled={saving}
                              style={{ fontSize: '11px', padding: '2px 8px' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn"
                            onClick={() => startEdit(item)}
                            style={{ 
                              fontSize: '11px', 
                              padding: '2px 8px'
                            }}
                            title="Edit measurements (always allowed)"
                          >
                            📏 Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded Container Details */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ 
                          padding: '12px', 
                          backgroundColor: '#2d2d2d',
                          borderTop: '1px solid #404040'
                        }}>
                          <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: '#e4e4e4' }}>
                            📦 Containers for {item.productCode}
                          </div>
                          
                          {containers.length === 0 ? (
                            <div style={{ 
                              color: '#6b7280', 
                              fontSize: '12px', 
                              fontStyle: 'italic',
                              marginBottom: '8px'
                            }}>
                              No containers added. Single shipment assumed.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                              {containers.map((container) => (
                                <div 
                                  key={container.id}
                                  style={{
                                    padding: '8px',
                                    backgroundColor: '#1a1a1a',
                                    border: '1px solid #4b5563',
                                    borderRadius: '4px'
                                  }}
                                >
                                  {editingContainer === container.id ? (
                                    /* Container Edit Mode */
                                    <div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                          className="input"
                                          value={container.label}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, label: e.target.value };
                                            // Update local state for immediate feedback
                                          }}
                                          placeholder="Label"
                                          style={{ fontSize: '12px' }}
                                        />
                                        <input
                                          className="input"
                                          value={container.tracking}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, tracking: e.target.value };
                                          }}
                                          placeholder="Tracking number"
                                          style={{ fontSize: '12px' }}
                                        />
                                        <select
                                          className="input"
                                          value={container.unit}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, unit: e.target.value };
                                          }}
                                          style={{ fontSize: '12px' }}
                                        >
                                          <option value="in">Inches</option>
                                          <option value="cm">Centimeters</option>
                                        </select>
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                          className="input"
                                          type="number"
                                          value={container.length || ""}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, length: e.target.value ? parseFloat(e.target.value) : null };
                                          }}
                                          placeholder="Length"
                                          style={{ fontSize: '12px' }}
                                        />
                                        <input
                                          className="input"
                                          type="number"
                                          value={container.width || ""}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, width: e.target.value ? parseFloat(e.target.value) : null };
                                          }}
                                          placeholder="Width"
                                          style={{ fontSize: '12px' }}
                                        />
                                        <input
                                          className="input"
                                          type="number"
                                          value={container.height || ""}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, height: e.target.value ? parseFloat(e.target.value) : null };
                                          }}
                                          placeholder="Height"
                                          style={{ fontSize: '12px' }}
                                        />
                                        <input
                                          className="input"
                                          type="number"
                                          value={container.weight || ""}
                                          onChange={(e) => {
                                            const newContainers = [...containers];
                                            const idx = newContainers.findIndex(c => c.id === container.id);
                                            newContainers[idx] = { ...container, weight: e.target.value ? parseFloat(e.target.value) : null };
                                          }}
                                          placeholder="Weight (lbs)"
                                          style={{ fontSize: '12px' }}
                                        />
                                      </div>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                          className="btn primary"
                                          onClick={() => {
                                            // Save the edited container
                                            setEditingContainer(null);
                                          }}
                                          disabled={containerSaving}
                                          style={{ fontSize: '11px', padding: '2px 8px' }}
                                        >
                                          Save
                                        </button>
                                        <button
                                          className="btn"
                                          onClick={() => setEditingContainer(null)}
                                          disabled={containerSaving}
                                          style={{ fontSize: '11px', padding: '2px 8px' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Container View Mode */
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '500', fontSize: '12px', marginBottom: '2px', color: '#e4e4e4' }}>
                                          {container.label}
                                        </div>
                                        {container.tracking && (
                                          <div style={{ fontSize: '11px', color: '#60a5fa', marginBottom: '2px' }}>
                                            📍 {container.tracking}
                                          </div>
                                        )}
                                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                          {container.length && container.width && container.height ? (
                                            <>
                                              📐 {container.length} × {container.width} × {container.height} {container.unit}
                                            </>
                                          ) : (
                                            <span style={{ fontStyle: 'italic' }}>No dimensions</span>
                                          )}
                                          {container.weight && (
                                            <> · ⚖️ {container.weight} lbs</>
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                          className="btn"
                                          onClick={() => setEditingContainer(container.id)}
                                          disabled={containerSaving}
                                          style={{ fontSize: '10px', padding: '1px 6px' }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          className="btn danger"
                                          onClick={() => deleteContainer(item, container.id)}
                                          disabled={containerSaving}
                                          style={{ 
                                            fontSize: '10px', 
                                            padding: '1px 6px',
                                            borderColor: '#ef4444',
                                            color: '#ef4444'
                                          }}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <button
                            className="btn primary"
                            onClick={() => addContainer(item)}
                            disabled={containerSaving}
                            style={{ 
                              fontSize: '12px',
                              padding: '4px 12px'
                            }}
                          >
                            + Add Container
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
