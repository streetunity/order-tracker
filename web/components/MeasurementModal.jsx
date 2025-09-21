'use client';

import { useState, useEffect } from 'react';
import './MeasurementModal.css';

export default function MeasurementModal({ item, orderId, isOpen, onClose, onSave }) {
  const [measurements, setMeasurements] = useState({
    height: '',
    width: '',
    length: '',
    weight: '',
    measurementUnit: 'in',
    weightUnit: 'lbs'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item && isOpen) {
      setMeasurements({
        height: item.height || '',
        width: item.width || '',
        length: item.length || '',
        weight: item.weight || '',
        measurementUnit: item.measurementUnit || 'in',
        weightUnit: item.weightUnit || 'lbs'
      });
      setError('');
    }
  }, [item, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/orders/${orderId}/items/${item.id}/measurements`,
        {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(measurements)
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update measurements');
      }

      const updatedItem = await response.json();
      onSave(updatedItem);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setMeasurements(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatDimensions = () => {
    const dims = [];
    if (measurements.height) dims.push(`H:${measurements.height}`);
    if (measurements.width) dims.push(`W:${measurements.width}`);
    if (measurements.length) dims.push(`L:${measurements.length}`);
    return dims.length > 0 ? dims.join(' × ') : 'No dimensions set';
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-container">
        <div className="modal-header">
          <h2>📏 Update Measurements</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-subheader">
          <div className="item-info">
            <strong>{item.productCode}</strong>
            <span className="qty-badge">Qty: {item.qty}</span>
            {item.serialNumber && (
              <span className="serial-badge">S/N: {item.serialNumber}</span>
            )}
          </div>
        </div>

        <div className="modal-body">
          <div className="measurement-notice">
            <span className="notice-icon">ℹ️</span>
            <span>Measurements can be updated even when the order is locked</span>
          </div>

          <div className="measurement-grid">
            <div className="measurement-section">
              <h3>Dimensions</h3>
              <div className="measurement-inputs">
                <div className="input-group">
                  <label htmlFor="height">Height</label>
                  <input
                    id="height"
                    type="number"
                    step="0.01"
                    value={measurements.height}
                    onChange={(e) => handleInputChange('height', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="width">Width</label>
                  <input
                    id="width"
                    type="number"
                    step="0.01"
                    value={measurements.width}
                    onChange={(e) => handleInputChange('width', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="length">Length</label>
                  <input
                    id="length"
                    type="number"
                    step="0.01"
                    value={measurements.length}
                    onChange={(e) => handleInputChange('length', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="measurementUnit">Unit</label>
                  <select
                    id="measurementUnit"
                    value={measurements.measurementUnit}
                    onChange={(e) => handleInputChange('measurementUnit', e.target.value)}
                  >
                    <option value="in">Inches</option>
                    <option value="cm">Centimeters</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="measurement-section">
              <h3>Weight</h3>
              <div className="measurement-inputs">
                <div className="input-group">
                  <label htmlFor="weight">Weight</label>
                  <input
                    id="weight"
                    type="number"
                    step="0.01"
                    value={measurements.weight}
                    onChange={(e) => handleInputChange('weight', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="weightUnit">Unit</label>
                  <select
                    id="weightUnit"
                    value={measurements.weightUnit}
                    onChange={(e) => handleInputChange('weightUnit', e.target.value)}
                  >
                    <option value="lbs">Pounds</option>
                    <option value="kg">Kilograms</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="measurement-preview">
            <strong>Preview:</strong> {formatDimensions()} {measurements.measurementUnit}
            {measurements.weight && ` | ${measurements.weight} ${measurements.weightUnit}`}
          </div>

          {item.measuredAt && (
            <div className="last-measured">
              Last measured: {new Date(item.measuredAt).toLocaleString()}
              {item.measuredBy && ` by ${item.measuredBy}`}
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Measurements'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}