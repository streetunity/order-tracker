// MeasurementSection.jsx - Much better use of space with horizontal layout
"use client";
import { useState, useEffect } from "react";

export default function MeasurementSection({ order, items, onRefresh, getAuthHeaders }) {
  const [containerSaving, setContainerSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [editingContainer, setEditingContainer] = useState(null);
  const [localContainers, setLocalContainers] = useState({});

  // Helper function to check if an item has container data
  const itemHasContainerData = (item) => {
    const containers = getContainersForItem(item);
    return containers.some(c => 
      c.tracking || c.height || c.width || c.length || c.weight || !c.id.startsWith('default-')
    );
  };

  // Auto-expand items with container data on mount
  useEffect(() => {
    if (items) {
      const itemsWithData = new Set();
      items.forEach(item => {
        if (itemHasContainerData(item)) {
          itemsWithData.add(item.id);
        }
      });
      setExpandedItems(itemsWithData);
    }
  }, [items]);

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
      
      // Clear local state for this item
      setLocalContainers(prev => {
        const newState = { ...prev };
        delete newState[itemId];
        return newState;
      });
      
      if (onRefresh) await onRefresh();
    } catch (e) {
      alert(`Failed to save containers: ${e.message}`);
      // Revert local changes on error
      setLocalContainers(prev => {
        const newState = { ...prev };
        delete newState[itemId];
        return newState;
      });
    } finally {
      setContainerSaving(false);
      setEditingContainer(null);
    }
  };

  const getContainersForItem = (item) => {
    // Use local state if editing, otherwise use item data
    if (localContainers[item.id]) {
      return localContainers[item.id];
    }
    const containers = item.containers ? 
      (typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers) : [];
    
    // If no containers exist, return a default one
    if (containers.length === 0) {
      return [{
        id: `default-${item.id}`,
        label: 'Container 1',
        tracking: '',
        height: null,
        width: null,
        length: null,
        weight: null,
        unit: 'in'
      }];
    }
    
    return containers;
  };

  const addContainer = (item) => {
    const containers = getContainersForItem(item);
    
    const newContainer = {
      id: `container-${Date.now()}`,
      label: `Container ${containers.length + 1}`,
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

  const startEditContainer = (item, container) => {
    const containers = getContainersForItem(item);
    setLocalContainers(prev => ({
      ...prev,
      [item.id]: [...containers]
    }));
    setEditingContainer(container.id);
  };

  const updateContainer = (itemId, containerId, field, value) => {
    setLocalContainers(prev => {
      const containers = prev[itemId] || getContainersForItem({ id: itemId, containers: items.find(i => i.id === itemId)?.containers });
      const updated = containers.map(c => 
        c.id === containerId 
          ? { ...c, [field]: field === 'height' || field === 'width' || field === 'length' || field === 'weight' 
              ? (value === "" ? null : parseFloat(value)) 
              : value }
          : c
      );
      return {
        ...prev,
        [itemId]: updated
      };
    });
  };

  const saveContainerEdits = (itemId) => {
    const containers = localContainers[itemId];
    if (containers) {
      // Filter out default containers if they haven't been edited
      const containersToSave = containers.filter(c => {
        if (c.id.startsWith('default-')) {
          // Only save the default container if it has been edited
          return c.tracking || c.height || c.width || c.length || c.weight;
        }
        return true;
      });
      saveContainers(itemId, containersToSave);
    }
  };

  const cancelContainerEdit = (itemId) => {
    setLocalContainers(prev => {
      const newState = { ...prev };
      delete newState[itemId];
      return newState;
    });
    setEditingContainer(null);
  };

  const deleteContainer = (item, containerId) => {
    if (!confirm("Delete this container?")) return;
    const containers = getContainersForItem(item);
    
    // Don't delete if it's the only container and it's the default
    if (containers.length === 1 && containers[0].id.startsWith('default-')) {
      alert("Cannot delete the default container. Add another container first.");
      return;
    }
    
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
        <h2 style={{ margin: 0, fontSize: 16 }}>Shipping Containers</h2>
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
          ℹ️ Container measurements can be updated even when the order is locked
        </div>
      )}

      <div style={{ 
        fontSize: "12px", 
        color: "#9ca3af", 
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: "#1a1a1a",
        borderRadius: "6px",
        border: "1px solid #404040"
      }}>
        <strong>📦 How containers work:</strong>
        <ul style={{ margin: "8px 0 0 20px", paddingLeft: "0" }}>
          <li>Each container represents a physical box or unit that will be shipped</li>
          <li>Single items should use "Container 1" only unless shipping in multiple boxes</li>
          <li>Add additional containers only when items ship in multiple boxes</li>
          <li>Each container can have its own tracking number and dimensions</li>
        </ul>
      </div>
      
      <div>
        {(!items || items.length === 0) ? (
          <div style={{ color: "#6b7280", padding: "16px" }}>No items in this order.</div>
        ) : (
          items.map((item) => {
            const isExpanded = expandedItems.has(item.id);
            const containers = getContainersForItem(item);
            const totalWeight = containers.reduce((sum, c) => sum + (c.weight || 0), 0);
            const realContainerCount = containers.filter(c => !c.id.startsWith('default-') || c.tracking || c.height || c.width || c.length || c.weight).length;
            
            return (
              <div key={item.id} style={{ 
                backgroundColor: '#1a1a1a',
                border: '1px solid #404040',
                borderRadius: '6px',
                marginBottom: '12px',
                overflow: 'hidden'
              }}>
                {/* Item Header */}
                <div style={{ 
                  padding: '16px',
                  borderBottom: isExpanded ? '1px solid #404040' : 'none',
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'start'
                }}>
                  <div>
                    <strong style={{ fontSize: '15px', color: '#e4e4e4' }}>{item.productCode}</strong>
                    {item.serialNumber && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        S/N: {item.serialNumber}
                      </div>
                    )}
                    {item.qty > 1 && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                        Quantity: {item.qty}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ 
                        padding: '4px 8px',
                        backgroundColor: realContainerCount > 0 ? '#374151' : '#4b5563',
                        color: '#fff',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        📦 {realContainerCount || 1} {realContainerCount === 1 ? 'container' : 'containers'}
                      </span>
                      {totalWeight > 0 && (
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                          Total: {totalWeight.toFixed(1)} lbs
                        </div>
                      )}
                    </div>
                    
                    <button
                      className="btn"
                      onClick={() => toggleItemExpanded(item.id)}
                      style={{ 
                        fontSize: '11px', 
                        padding: '4px 8px',
                        backgroundColor: isExpanded ? '#6b7280' : '#404040',
                        color: '#fff',
                        border: 'none',
                        minWidth: '70px'
                      }}
                    >
                      {isExpanded ? '▼ Hide' : '▶ Edit'}
                    </button>
                  </div>
                </div>
                
                {/* Container Details - Only show when expanded */}
                {isExpanded && (
                  <div style={{ padding: '16px', backgroundColor: '#262626' }}>
                    {item.qty > 1 && (
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#fbbf24',
                        marginBottom: '16px',
                        padding: '8px 12px',
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        ⚠️ This item has quantity {item.qty} - make sure to account for all units in your containers
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {containers.map((container, index) => {
                        const isEditingThis = editingContainer === container.id;
                        const currentContainer = localContainers[item.id]?.find(c => c.id === container.id) || container;
                        const isDefaultEmpty = container.id.startsWith('default-') && 
                          !container.tracking && !container.height && !container.width && !container.length && !container.weight;
                        
                        return (
                          <div 
                            key={container.id}
                            style={{
                              padding: '16px',
                              backgroundColor: '#2d2d2d',
                              border: isDefaultEmpty ? '2px dashed #4b5563' : '2px solid #4b5563',
                              borderRadius: '6px'
                            }}
                          >
                            {isEditingThis ? (
                              /* Container Edit Mode */
                              <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px', gap: '12px', marginBottom: '12px' }}>
                                  <input
                                    className="input"
                                    value={currentContainer.label}
                                    onChange={(e) => updateContainer(item.id, container.id, 'label', e.target.value)}
                                    placeholder="Label"
                                    style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                  />
                                  <input
                                    className="input"
                                    value={currentContainer.tracking}
                                    onChange={(e) => updateContainer(item.id, container.id, 'tracking', e.target.value)}
                                    placeholder="Tracking number (optional)"
                                    style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                  />
                                  <select
                                    className="input"
                                    value={currentContainer.unit}
                                    onChange={(e) => updateContainer(item.id, container.id, 'unit', e.target.value)}
                                    style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                  >
                                    <option value="in">Inches</option>
                                    <option value="cm">Centimeters</option>
                                  </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Length</label>
                                    <input
                                      className="input"
                                      type="number"
                                      step="0.1"
                                      value={currentContainer.length || ""}
                                      onChange={(e) => updateContainer(item.id, container.id, 'length', e.target.value)}
                                      placeholder="0"
                                      style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Width</label>
                                    <input
                                      className="input"
                                      type="number"
                                      step="0.1"
                                      value={currentContainer.width || ""}
                                      onChange={(e) => updateContainer(item.id, container.id, 'width', e.target.value)}
                                      placeholder="0"
                                      style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Height</label>
                                    <input
                                      className="input"
                                      type="number"
                                      step="0.1"
                                      value={currentContainer.height || ""}
                                      onChange={(e) => updateContainer(item.id, container.id, 'height', e.target.value)}
                                      placeholder="0"
                                      style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Weight (lbs)</label>
                                    <input
                                      className="input"
                                      type="number"
                                      step="0.1"
                                      value={currentContainer.weight || ""}
                                      onChange={(e) => updateContainer(item.id, container.id, 'weight', e.target.value)}
                                      placeholder="0"
                                      style={{ fontSize: '13px', backgroundColor: '#2a2a2a' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    className="btn primary"
                                    onClick={() => saveContainerEdits(item.id)}
                                    disabled={containerSaving}
                                    style={{ fontSize: '12px', padding: '6px 16px' }}
                                  >
                                    {containerSaving ? 'Saving...' : 'Save Container'}
                                  </button>
                                  <button
                                    className="btn"
                                    onClick={() => cancelContainerEdit(item.id)}
                                    disabled={containerSaving}
                                    style={{ fontSize: '12px', padding: '6px 16px', backgroundColor: '#404040', color: '#fff', border: 'none' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Container View Mode - HORIZONTAL LAYOUT FOR MAXIMUM READABILITY */
                              <div>
                                <div style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  marginBottom: isDefaultEmpty ? '0' : '16px'
                                }}>
                                  <div style={{ 
                                    fontWeight: '600', 
                                    fontSize: '16px', 
                                    color: '#e4e4e4' 
                                  }}>
                                    {container.label}
                                    {isDefaultEmpty && (
                                      <span style={{ 
                                        fontSize: '13px', 
                                        color: '#6b7280',
                                        fontStyle: 'italic',
                                        fontWeight: 'normal',
                                        marginLeft: '12px'
                                      }}>
                                        (not configured)
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      className="btn"
                                      onClick={() => startEditContainer(item, container)}
                                      disabled={containerSaving}
                                      style={{ fontSize: '11px', padding: '4px 12px', backgroundColor: '#404040', color: '#fff', border: 'none' }}
                                    >
                                      ✏️ Edit
                                    </button>
                                    {(!container.id.startsWith('default-') || containers.length > 1) && (
                                      <button
                                        className="btn danger"
                                        onClick={() => deleteContainer(item, container.id)}
                                        disabled={containerSaving}
                                        style={{ 
                                          fontSize: '11px', 
                                          padding: '4px 12px',
                                          borderColor: '#ef4444',
                                          color: '#ef4444'
                                        }}
                                      >
                                        🗑️ Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Container Info - FULL WIDTH HORIZONTAL LAYOUT */}
                                {!isDefaultEmpty && (
                                  <div style={{ 
                                    display: 'flex',
                                    gap: '32px',
                                    alignItems: 'center',
                                    flexWrap: 'wrap'
                                  }}>
                                    {/* Dimensions */}
                                    {(container.length || container.width || container.height) && (
                                      <div style={{ 
                                        flex: '0 0 auto',
                                        padding: '12px 20px',
                                        backgroundColor: '#1a1a1a',
                                        borderRadius: '6px',
                                        border: '1px solid #404040'
                                      }}>
                                        <div style={{ color: '#9ca3af', fontSize: '11px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          📐 DIMENSIONS
                                        </div>
                                        <div style={{ color: '#e4e4e4', fontSize: '18px', fontWeight: '500' }}>
                                          {container.length || '0'} × {container.width || '0'} × {container.height || '0'} {container.unit}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Weight */}
                                    {container.weight && (
                                      <div style={{ 
                                        flex: '0 0 auto',
                                        padding: '12px 20px',
                                        backgroundColor: '#1a1a1a',
                                        borderRadius: '6px',
                                        border: '1px solid #404040'
                                      }}>
                                        <div style={{ color: '#9ca3af', fontSize: '11px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          ⚖️ WEIGHT
                                        </div>
                                        <div style={{ color: '#e4e4e4', fontSize: '18px', fontWeight: '500' }}>
                                          {container.weight} lbs
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Tracking */}
                                    {container.tracking && (
                                      <div style={{ 
                                        flex: '1 1 auto',
                                        padding: '12px 20px',
                                        backgroundColor: '#1a1a1a',
                                        borderRadius: '6px',
                                        border: '1px solid #404040'
                                      }}>
                                        <div style={{ color: '#9ca3af', fontSize: '11px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          📍 TRACKING NUMBER
                                        </div>
                                        <div style={{ color: '#60a5fa', fontSize: '16px', fontWeight: '500', wordBreak: 'break-all' }}>
                                          {container.tracking}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {/* Empty state message */}
                                {isDefaultEmpty && (
                                  <div style={{ 
                                    color: '#6b7280', 
                                    fontSize: '14px',
                                    fontStyle: 'italic',
                                    textAlign: 'center',
                                    padding: '20px'
                                  }}>
                                    Click "Edit" to add dimensions, weight, and tracking information
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <button
                      className="btn"
                      onClick={() => addContainer(item)}
                      disabled={containerSaving}
                      style={{ 
                        fontSize: '12px',
                        padding: '8px 16px',
                        backgroundColor: '#404040',
                        color: '#fff',
                        border: 'none',
                        marginTop: '12px'
                      }}
                    >
                      + Add Container
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
