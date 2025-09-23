"use client";
import { useState } from "react";

export default function MeasurementSection({ order, items, onRefresh, getAuthHeaders }) {
  const [editingItem, setEditingItem] = useState(null);
  const [measurements, setMeasurements] = useState({});
  const [saving, setSaving] = useState(false);

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
      const response = await fetch(
        `/api/orders/${order.id}/items/${itemId}/measurements`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(measurements)
        }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update measurements');
      }
      
      setEditingItem(null);
      setMeasurements({});
      await onRefresh();
    } catch (error) {
      alert(`Failed to save measurements: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8
      }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Measurements</h2>
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
      
      {order.isLocked && (
        <div style={{ 
          fontSize: "12px", 
          color: "#6b7280", 
          marginBottom: "12px",
          fontStyle: "italic"
        }}>
          ℹ️ Measurements can be updated even when the order is locked
        </div>
      )}
      
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: "800px" }}>
          <thead>
            <tr>
              <th style={{ width: "180px" }}>Item</th>
              <th style={{ width: "80px" }}>Height</th>
              <th style={{ width: "80px" }}>Width</th>
              <th style={{ width: "80px" }}>Length</th>
              <th style={{ width: "60px" }}>Unit</th>
              <th style={{ width: "80px" }}>Weight</th>
              <th style={{ width: "60px" }}>Unit</th>
              <th style={{ width: "120px" }}>Last Updated</th>
              <th style={{ width: "120px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).length === 0 ? (
              <tr><td colSpan={9} style={{ color: "#6b7280" }}>No items to measure.</td></tr>
            ) : (
              items.map((item) => {
                const isEditing = editingItem === item.id;
                
                return (
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
                            Save
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
