"use client";
import { useState } from "react";

export default function MeasurementModal({ item, orderId, onClose, onSave }) {
  const [measurements, setMeasurements] = useState({
    height: item.height || '',
    width: item.width || '',
    length: item.length || '',
    weight: item.weight || '',
    measurementUnit: item.measurementUnit || 'in',
    weightUnit: item.weightUnit || 'lbs'
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(
        `/api/orders/${orderId}/items/${item.id}/measurements`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(measurements)
        }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update measurements');
      }
      
      onSave();
      onClose();
    } catch (error) {
      alert(`Failed to save measurements: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        color: '#e5e5e5',
        border: '1px solid #383838'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#e5e5e5' }}>
          📏 Update Measurements - {item.productCode}
        </h3>
        
        <div style={{ 
          backgroundColor: '#10b981', 
          color: '#fff', 
          padding: '8px 12px', 
          borderRadius: '4px', 
          marginBottom: '16px',
          fontSize: '12px'
        }}>
          ✓ Measurements can be updated even when the order is locked
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Dimensions */}
          <div>
            <h4 style={{ marginTop: 0, marginBottom: '8px', fontSize: '14px', color: '#e5e5e5' }}>
              Dimensions ({measurements.measurementUnit})
            </h4>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: '#9ca3af' }}>Height</label>
              <input
                type="number"
                step="0.01"
                value={measurements.height}
                onChange={(e) => setMeasurements({
                  ...measurements, 
                  height: e.target.value ? parseFloat(e.target.value) : ''
                })}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #383838',
                  borderRadius: '4px',
                  color: '#e5e5e5'
                }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: '#9ca3af' }}>Width</label>
              <input
                type="number"
                step="0.01"
                value={measurements.width}
                onChange={(e) => setMeasurements({
                  ...measurements,
                  width: e.target.value ? parseFloat(e.target.value) : ''
                })}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #383838',
                  borderRadius: '4px',
                  color: '#e5e5e5'
                }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: '#9ca3af' }}>Length</label>
              <input
                type="number"
                step="0.01"
                value={measurements.length}
                onChange={(e) => setMeasurements({
                  ...measurements,
                  length: e.target.value ? parseFloat(e.target.value) : ''
                })}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #383838',
                  borderRadius: '4px',
                  color: '#e5e5e5'
                }}
              />
            </div>
          </div>
          
          {/* Weight and Units */}
          <div>
            <h4 style={{ marginTop: 0, marginBottom: '8px', fontSize: '14px', color: '#e5e5e5' }}>Weight</h4>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: '#9ca3af' }}>Weight ({measurements.weightUnit})</label>
              <input
                type="number"
                step="0.01"
                value={measurements.weight}
                onChange={(e) => setMeasurements({
                  ...measurements,
                  weight: e.target.value ? parseFloat(e.target.value) : ''
                })}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #383838',
                  borderRadius: '4px',
                  color: '#e5e5e5'
                }}
              />
            </div>
            
            <h4 style={{ marginTop: '16px', marginBottom: '8px', fontSize: '14px', color: '#e5e5e5' }}>Units</h4>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: '#9ca3af' }}>Dimension Unit</label>
              <select
                value={measurements.measurementUnit}
                onChange={(e) => setMeasurements({
                  ...measurements,
                  measurementUnit: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #383838',
                  borderRadius: '4px',
                  color: '#e5e5e5'
                }}
              >
                <option value="in">Inches (in)</option>
                <option value="cm">Centimeters (cm)</option>
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: '#9ca3af' }}>Weight Unit</label>
              <select
                value={measurements.weightUnit}
                onChange={(e) => setMeasurements({
                  ...measurements,
                  weightUnit: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #383838',
                  borderRadius: '4px',
                  color: '#e5e5e5'
                }}
              >
                <option value="lbs">Pounds (lbs)</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px',
              backgroundColor: '#383838',
              color: '#e5e5e5',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Save Measurements'}
          </button>
        </div>
      </div>
    </div>
  );
}