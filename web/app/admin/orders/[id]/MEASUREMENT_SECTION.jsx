// EDIT ORDER PAGE - MEASUREMENTS SECTION
// Add this to your web/app/admin/orders/[id]/page.jsx file

// ====================================
// STEP 1: ADD STATE VARIABLES
// ====================================
// Add these near your other useState declarations:
const [measurements, setMeasurements] = useState({});
const [measurementUnit, setMeasurementUnit] = useState('in');
const [weightUnit, setWeightUnit] = useState('lbs');
const [savingMeasurements, setSavingMeasurements] = useState(false);

// ====================================
// STEP 2: INITIALIZE MEASUREMENTS
// ====================================
// Add this to your existing useEffect that loads the order:
useEffect(() => {
  if (order?.items) {
    const initialMeasurements = {};
    order.items.forEach(item => {
      initialMeasurements[item.id] = {
        height: item.height || '',
        width: item.width || '',
        length: item.length || '',
        weight: item.weight || ''
      };
    });
    setMeasurements(initialMeasurements);
    
    // Set units from first item that has them
    const itemWithUnits = order.items.find(item => item.measurementUnit || item.weightUnit);
    if (itemWithUnits) {
      setMeasurementUnit(itemWithUnits.measurementUnit || 'in');
      setWeightUnit(itemWithUnits.weightUnit || 'lbs');
    }
  }
}, [order]);

// ====================================
// STEP 3: ADD HANDLER FUNCTIONS
// ====================================
const handleMeasurementChange = (itemId, field, value) => {
  setMeasurements(prev => ({
    ...prev,
    [itemId]: {
      ...prev[itemId],
      [field]: value
    }
  }));
};

const saveMeasurements = async () => {
  setSavingMeasurements(true);
  
  try {
    const token = localStorage.getItem('token');
    const updates = [];
    
    // Collect all items with changed measurements
    Object.keys(measurements).forEach(itemId => {
      const itemMeasurements = measurements[itemId];
      if (itemMeasurements.height !== '' || itemMeasurements.width !== '' || 
          itemMeasurements.length !== '' || itemMeasurements.weight !== '') {
        updates.push({
          id: itemId,
          ...itemMeasurements
        });
      }
    });
    
    if (updates.length === 0) {
      alert('No measurements to save');
      setSavingMeasurements(false);
      return;
    }
    
    // Use bulk update endpoint
    const response = await fetch(`/api/orders/${id}/measurements/bulk`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items: updates,
        measurementUnit,
        weightUnit
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save measurements');
    }
    
    alert('Measurements saved successfully');
    // Reload order to show updated data
    await loadOrder();
  } catch (error) {
    console.error('Error saving measurements:', error);
    alert('Failed to save measurements: ' + error.message);
  } finally {
    setSavingMeasurements(false);
  }
};

const saveSingleMeasurement = async (itemId) => {
  try {
    const token = localStorage.getItem('token');
    const itemMeasurements = measurements[itemId];
    
    const response = await fetch(`/api/orders/${id}/items/${itemId}/measurements`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...itemMeasurements,
        measurementUnit,
        weightUnit
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save measurement');
    }
    
    // Update the item in state
    const updatedItem = await response.json();
    setOrder(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId ? { ...item, ...updatedItem } : item
      )
    }));
    
    alert('Measurement saved');
  } catch (error) {
    console.error('Error saving measurement:', error);
    alert('Failed to save measurement: ' + error.message);
  }
};

// ====================================
// STEP 4: ADD MEASUREMENTS SECTION JSX
// ====================================
// Add this after your items table but before the save button:

<div className="measurements-section">
  <div className="section-header">
    <h2>📏 Measurements</h2>
    {order?.isLocked && (
      <span className="always-editable-badge">
        Always Editable - Even When Order is Locked
      </span>
    )}
  </div>
  
  {order?.isLocked && (
    <div className="info-box">
      <span className="info-icon">ℹ️</span>
      <span>This order is locked, but measurements can still be updated at any time.</span>
    </div>
  )}
  
  <div className="unit-controls">
    <div className="unit-group">
      <label>Dimension Unit:</label>
      <select 
        value={measurementUnit} 
        onChange={(e) => setMeasurementUnit(e.target.value)}
      >
        <option value="in">Inches</option>
        <option value="cm">Centimeters</option>
      </select>
    </div>
    <div className="unit-group">
      <label>Weight Unit:</label>
      <select 
        value={weightUnit} 
        onChange={(e) => setWeightUnit(e.target.value)}
      >
        <option value="lbs">Pounds</option>
        <option value="kg">Kilograms</option>
      </select>
    </div>
  </div>
  
  <table className="measurements-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Serial #</th>
        <th>Height</th>
        <th>Width</th>
        <th>Length</th>
        <th>Weight</th>
        <th>Last Updated</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {order?.items?.map(item => (
        <tr key={item.id}>
          <td>
            <strong>{item.productCode}</strong>
            <span className="qty-small"> (Qty: {item.qty})</span>
          </td>
          <td className="serial-cell">
            {item.serialNumber || '-'}
          </td>
          <td>
            <input
              type="number"
              step="0.01"
              className="measurement-input"
              value={measurements[item.id]?.height || ''}
              onChange={(e) => handleMeasurementChange(item.id, 'height', e.target.value)}
              placeholder="0.00"
            />
          </td>
          <td>
            <input
              type="number"
              step="0.01"
              className="measurement-input"
              value={measurements[item.id]?.width || ''}
              onChange={(e) => handleMeasurementChange(item.id, 'width', e.target.value)}
              placeholder="0.00"
            />
          </td>
          <td>
            <input
              type="number"
              step="0.01"
              className="measurement-input"
              value={measurements[item.id]?.length || ''}
              onChange={(e) => handleMeasurementChange(item.id, 'length', e.target.value)}
              placeholder="0.00"
            />
          </td>
          <td>
            <input
              type="number"
              step="0.01"
              className="measurement-input"
              value={measurements[item.id]?.weight || ''}
              onChange={(e) => handleMeasurementChange(item.id, 'weight', e.target.value)}
              placeholder="0.00"
            />
          </td>
          <td className="updated-cell">
            {item.measuredAt ? (
              <div>
                <div>{new Date(item.measuredAt).toLocaleDateString()}</div>
                <div className="measured-by">{item.measuredBy}</div>
              </div>
            ) : (
              <span className="not-measured">Never</span>
            )}
          </td>
          <td>
            <button 
              className="btn-save-single"
              onClick={() => saveSingleMeasurement(item.id)}
              title="Save this item's measurements"
            >
              💾
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  
  <div className="measurement-actions">
    <button 
      className="btn btn-primary"
      onClick={saveMeasurements}
      disabled={savingMeasurements}
    >
      {savingMeasurements ? 'Saving All...' : 'Save All Measurements'}
    </button>
  </div>
</div>