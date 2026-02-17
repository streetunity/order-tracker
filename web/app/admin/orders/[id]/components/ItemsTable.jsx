// Component for displaying and managing order items
import { useState } from "react";
import EditableRow from "./EditableRow";

export default function ItemsTable({ 
  order,
  items,
  itemEdits,
  onFieldChange,
  onDelete,
  onMarkOrdered,
  onUnmarkOrdered,
  onSaveAllChanges,
  onAddItem,
  onRefresh,
  disabled,
  isAdmin,
  isAgent,
  manufacturers,
  getAuthHeaders
}) {
  const [newItem, setNewItem] = useState({ 
    productCode: "", 
    qty: 1, 
    serialNumber: "", 
    modelNumber: "", 
    voltage: "", 
    laserWattage: "", 
    notes: "",
    hasExtendedShipping: false,
    manufacturerId: "",
    itemPrice: ""
  });

  const hasUnsavedChanges = Object.keys(itemEdits).length > 0;

  async function handleAddItem(e) {
    e.preventDefault();
    const productCode = newItem.productCode.trim();
    const qty = Number(newItem.qty || 1);
    const serialNumber = newItem.serialNumber.trim();
    const modelNumber = newItem.modelNumber.trim();
    const voltage = newItem.voltage.trim();
    const laserWattage = newItem.laserWattage.trim();
    const notes = newItem.notes.trim();
    const hasExtendedShipping = newItem.hasExtendedShipping || false;
    const manufacturerId = newItem.manufacturerId || null;
    const itemPrice = newItem.itemPrice ? parseFloat(newItem.itemPrice) : null;
    
    if (!productCode) return alert("Item name is required");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantity must be a positive number");
    if (newItem.itemPrice && (isNaN(itemPrice) || itemPrice < 0)) return alert("Price must be a valid positive number");
    
    const success = await onAddItem({
      productCode, 
      qty, 
      serialNumber, 
      modelNumber, 
      voltage, 
      laserWattage: laserWattage || null,
      notes,
      hasExtendedShipping,
      manufacturerId,
      itemPrice,
      containers: []
    });
    
    if (success) {
      setNewItem({ 
        productCode: "", 
        qty: 1, 
        serialNumber: "", 
        modelNumber: "", 
        voltage: "", 
        laserWattage: "", 
        notes: "",
        hasExtendedShipping: false,
        manufacturerId: "",
        itemPrice: ""
      });
    }
  }

  return (
    <section style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Items</h2>
        {hasUnsavedChanges && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              padding: "8px 16px",
              backgroundColor: "#fef3c7",
              border: "2px solid #f59e0b",
              borderRadius: "6px",
              color: "#92400e",
              fontSize: "14px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span style={{ fontSize: "18px" }}>⚠️</span>
              You have unsaved changes to {Object.keys(itemEdits).length} item{Object.keys(itemEdits).length > 1 ? 's' : ''}
            </div>
            <button
              className="btn primary"
              onClick={onSaveAllChanges}
              disabled={disabled}
              style={{
                backgroundColor: "#dc2626",
                color: "#fff",
                border: "none",
                fontSize: "14px",
                fontWeight: "600",
                padding: "10px 20px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
              }}
            >
              {disabled ? "Saving..." : "💾 Save All Changes"}
            </button>
          </div>
        )}
      </div>
      
      {order.isLocked && (
        <div style={{ 
          fontSize: "12px", 
          color: "#dc2626", 
          marginBottom: "8px",
          fontStyle: "italic"
        }}>
          Note: Item editing is disabled while order is locked. Extended shipping and admin fields (price/purchasing notes) remain editable.
        </div>
      )}
      
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: "1045px", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "25px", textAlign: "center" }}></th>
              <th style={{ width: "320px" }}>Item name</th>
              <th style={{ width: "50px" }}>Qty</th>
              <th style={{ width: "230px" }}>Model #</th>
              <th style={{ width: "90px" }}>Ordered</th>
              <th style={{ width: "200px" }}>Manufacturer</th>
              <th style={{ width: "130px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).length === 0 ? (
              <tr><td colSpan={7} style={{ color: "#6b7280" }}>No items yet.</td></tr>
            ) : (
              items.map((item) => (
                <EditableRow
                  key={item.id}
                  item={item}
                  itemEdits={itemEdits[item.id] || {}}
                  onFieldChange={(field, value) => onFieldChange(item.id, field, value)}
                  onDelete={() => onDelete(item.id, item.productCode)}
                  onMarkOrdered={() => onMarkOrdered(item.id)}
                  onUnmarkOrdered={() => onUnmarkOrdered(item.id)}
                  disabled={disabled}
                  isLocked={order.isLocked}
                  isAdmin={isAdmin}
                  isAgent={isAgent}
                  manufacturers={manufacturers}
                  getAuthHeaders={getAuthHeaders}
                  onRefresh={onRefresh}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {!order.isLocked && (
        <form onSubmit={handleAddItem} style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Add New Item</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Product *</label>
              <input
                className="input"
                placeholder="Product name"
                value={newItem.productCode}
                onChange={e => setNewItem(v => ({ ...v, productCode: e.target.value }))}
                style={{ width: "200px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Qty *</label>
              <input
                className="input"
                type="number"
                min={1}
                value={newItem.qty}
                onChange={e => setNewItem(v => ({ ...v, qty: e.target.value }))}
                style={{ width: "80px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Model # *</label>
              <input
                className="input"
                placeholder="Model number"
                value={newItem.modelNumber}
                onChange={e => setNewItem(v => ({ ...v, modelNumber: e.target.value }))}
                style={{ width: "130px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Price ($)</label>
              <input
                className="input"
                type="text"
                placeholder="0.00"
                value={newItem.itemPrice}
                onChange={e => {
                  const value = e.target.value;
                  if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
                    setNewItem(v => ({ ...v, itemPrice: value }));
                  }
                }}
                style={{ width: "110px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Manufacturer</label>
              <select
                className="input"
                value={newItem.manufacturerId}
                onChange={e => setNewItem(v => ({ ...v, manufacturerId: e.target.value }))}
                style={{ width: "150px" }}
              >
                <option value="">Select...</option>
                {manufacturers.map(mfg => (
                  <option key={mfg.id} value={mfg.id}>{mfg.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Voltage *</label>
              <input
                className="input"
                placeholder="e.g., 120V"
                value={newItem.voltage}
                onChange={e => setNewItem(v => ({ ...v, voltage: e.target.value }))}
                style={{ width: "90px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Power *</label>
              <input
                className="input"
                placeholder="HP / Wattage"
                value={newItem.laserWattage}
                onChange={e => setNewItem(v => ({ ...v, laserWattage: e.target.value }))}
                style={{ width: "120px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Serial #</label>
              <input
                className="input"
                placeholder="Optional"
                value={newItem.serialNumber}
                onChange={e => setNewItem(v => ({ ...v, serialNumber: e.target.value }))}
                style={{ width: "130px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Public Notes</label>
              <input
                className="input"
                placeholder="Optional notes"
                value={newItem.notes}
                onChange={e => setNewItem(v => ({ ...v, notes: e.target.value }))}
                style={{ width: "180px" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="extendedShipping"
                checked={newItem.hasExtendedShipping}
                onChange={e => setNewItem(v => ({ ...v, hasExtendedShipping: e.target.checked }))}
                style={{ width: "16px", height: "16px" }}
              />
              <label htmlFor="extendedShipping" style={{ fontSize: "12px", color: newItem.hasExtendedShipping ? "var(--success)" : "#6b7280" }}>
                ⭐ Extended
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={disabled}>Add Item</button>
          </div>
        </form>
      )}
    </section>
  );
}
