// Component for displaying and editing a single order item row
// Handles both locked and unlocked states, admin-only fields, and large machine flag
import { useState } from "react";
import SharedShipmentSection from "./SharedShipmentSection";

export default function EditableRow({ 
  item, 
  itemEdits, 
  onFieldChange, 
  onDelete, 
  onMarkOrdered, 
  onUnmarkOrdered, 
  disabled, 
  isLocked, 
  isAdmin,
  isAgent,
  manufacturers,
  getAuthHeaders,
  onRefresh
}) {
  // Use itemEdits for current values, fallback to item's original values
  const getValue = (field) => {
    if (itemEdits.hasOwnProperty(field)) {
      return itemEdits[field];
    }
    return item[field] ?? (field === 'qty' ? 1 : (field === 'hasExtendedShipping' ? false : (field === 'itemPrice' && item[field] !== null && item[field] !== undefined ? item[field].toString() : "")));
  };

  const name = getValue('productCode') || "";
  const qty = getValue('qty') || 1;
  const serialNumber = getValue('serialNumber') || "";
  const manufacturerId = getValue('manufacturerId') || "";
  const modelNumber = getValue('modelNumber') || "";
  const voltage = getValue('voltage') || "";
  const laserWattage = getValue('laserWattage') || "";
  const notes = getValue('notes') || "";
  const itemPrice = getValue('itemPrice') === null || getValue('itemPrice') === undefined || getValue('itemPrice') === "" ? "" : String(getValue('itemPrice'));
  const privateItemNote = getValue('privateItemNote') || "";
  const hasExtendedShipping = getValue('hasExtendedShipping') || false;

  const hasChanges = Object.keys(itemEdits).length > 0;
  const isOrdered = item.isOrdered;
  const orderedDate = item.orderedAt ? new Date(item.orderedAt).toLocaleDateString() : null;

  // Check if user can manage shipments (admin or agent)
  const canManageShipments = isAdmin || isAgent;

  const handlePriceChange = (e) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      onFieldChange('itemPrice', value === "" ? null : value);
    }
  };

  return (
    <>
      {/* Line 1: Star, Item name, Qty, Model #, Manufacturer, Ordered, Actions */}
      <tr style={{ 
        backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent",
        ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
      }}>
        <td style={{ textAlign: "center", padding: "8px 3px" }}>
          {hasExtendedShipping && (
            <span style={{ color: "var(--success)", fontSize: "16px" }} title="Large Machine">⭐</span>
          )}
        </td>
        <td>
          <input 
            className="input" 
            value={name} 
            onChange={e => onFieldChange('productCode', e.target.value)} 
            disabled={isLocked}
            style={{ width: "100%", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            type="number" 
            min={1} 
            value={qty} 
            onChange={e => onFieldChange('qty', Number(e.target.value))} 
            style={{ width: "100%", opacity: isLocked ? 0.6 : 1 }} 
            disabled={isLocked}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={modelNumber} 
            onChange={e => onFieldChange('modelNumber', e.target.value)} 
            placeholder="Model #"
            disabled={isLocked}
            style={{ width: "100%", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          {isOrdered ? (
            <div style={{ 
              color: "#059669", 
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}>
              <span>✓</span>
              {orderedDate && (
                <span title={`Ordered on ${orderedDate}`} style={{ cursor: "help" }}>
                  {orderedDate}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: "#6b7280", fontSize: "12px" }}>—</span>
          )}
        </td>
        <td>
          <select
            className="input"
            value={manufacturerId}
            onChange={e => onFieldChange('manufacturerId', e.target.value)}
            disabled={isLocked}
            style={{ width: "100%", opacity: isLocked ? 0.6 : 1 }}
          >
            <option value="">Select...</option>
            {manufacturers.map(mfg => (
              <option key={mfg.id} value={mfg.id}>{mfg.name}</option>
            ))}
          </select>
        </td>
        <td style={{ paddingLeft: "8px" }}>
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "flex-start" }}>
            <button 
              className="btn danger" 
              onClick={onDelete} 
              disabled={disabled || isLocked} 
              style={{ borderColor: "#ef4444", color: "#b91c1c", fontSize: "11px", padding: "2px 5px" }}
              title={isLocked ? "Order is locked" : "Delete item"}
            >
              Delete
            </button>
            {isAdmin && (
              isOrdered ? (
                <button
                  className="btn"
                  onClick={onUnmarkOrdered}
                  disabled={disabled}
                  style={{ 
                    backgroundColor: "#059669", 
                    color: "#fff", 
                    border: "none",
                    fontSize: "11px", 
                    padding: "2px 5px"
                  }}
                  title="Item is ordered - click to unmark"
                >
                  Ordered
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={onMarkOrdered}
                  disabled={disabled}
                  style={{ 
                    backgroundColor: "#dc2626", 
                    color: "#fff", 
                    border: "none",
                    fontSize: "11px", 
                    padding: "2px 5px"
                  }}
                  title="Mark as ordered"
                >
                  Order
                </button>
              )
            )}
          </div>
        </td>
      </tr>
      
      {/* Line 2: Voltage, Power, Serial #, Price */}
      <tr style={{ 
        backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent",
        ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
      }}>
        <td colSpan="7" style={{ padding: "4px 8px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <label style={{ fontSize: "11px", color: "#9ca3af", minWidth: "55px" }}>Voltage *:</label>
              <input 
                className="input" 
                value={voltage} 
                onChange={e => onFieldChange('voltage', e.target.value)} 
                placeholder="Required"
                disabled={isLocked}
                style={{ width: "90px", opacity: isLocked ? 0.6 : 1 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <label style={{ fontSize: "11px", color: "#9ca3af", minWidth: "50px" }}>Power *:</label>
              <input 
                className="input" 
                value={laserWattage} 
                onChange={e => onFieldChange('laserWattage', e.target.value)} 
                placeholder="Required"
                disabled={isLocked}
                style={{ width: "110px", opacity: isLocked ? 0.6 : 1 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <label style={{ fontSize: "11px", color: "#9ca3af", minWidth: "55px" }}>Serial #:</label>
              <input 
                className="input" 
                value={serialNumber} 
                onChange={e => onFieldChange('serialNumber', e.target.value)} 
                placeholder="Optional"
                disabled={isLocked}
                style={{ width: "230px", opacity: isLocked ? 0.6 : 1 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
              <label style={{ fontSize: "11px", color: "#9ca3af" }}>Price:</label>
              <span style={{ fontSize: "14px", color: "#9ca3af" }}>$</span>
              <input
                className="input"
                type="text"
                value={itemPrice}
                onChange={handlePriceChange}
                placeholder="0.00"
                title="usually retail price"
                style={{ 
                  width: "100px", 
                  textAlign: "right"
                }}
              />
            </div>
          </div>
        </td>
      </tr>
      
      {/* Lines 3-4: Public Notes (2 rows) */}
      <tr style={{ 
        backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent",
        ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
      }}>
        <td colSpan="7" style={{ padding: "4px 8px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <label style={{ fontSize: "11px", color: "#9ca3af", minWidth: "85px", paddingTop: "6px" }}>Public Notes:</label>
            <textarea 
              className="input" 
              value={notes} 
              onChange={e => onFieldChange('notes', e.target.value)} 
              placeholder="Optional notes visible to customer"
              disabled={isLocked}
              rows={2}
              style={{ 
                flex: 1, 
                opacity: isLocked ? 0.6 : 1,
                resize: "vertical",
                minHeight: "50px"
              }}
            />
          </div>
        </td>
      </tr>
      
      {/* Lines 5-7: Large Machine checkbox + Purchasing Notes (3 rows, admin only) */}
      <tr style={{ 
        backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent", 
        ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
      }}>
        <td colSpan="7" style={{ padding: "8px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div 
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
              title="Check this box only if this is a large machine that requires extended time in manufacturing"
            >
              <input
                type="checkbox"
                id={`extended-${item.id}`}
                checked={hasExtendedShipping}
                onChange={e => onFieldChange('hasExtendedShipping', e.target.checked)}
                disabled={isLocked}
                style={{ width: "16px", height: "16px", cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.6 : 1 }}
              />
              <label 
                htmlFor={`extended-${item.id}`} 
                style={{ 
                  fontSize: "12px", 
                  color: hasExtendedShipping ? "var(--success)" : "#6b7280",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  fontWeight: hasExtendedShipping ? "500" : "normal",
                  opacity: isLocked ? 0.6 : 1,
                  whiteSpace: "nowrap"
                }}
              >
                ⭐ Large Machine
              </label>
            </div>
            
            {isAdmin && (
              <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ fontSize: "11px", color: "#9ca3af", minWidth: "100px", paddingTop: "6px" }}>Purchasing Notes:</label>
                <textarea
                  className="input"
                  value={privateItemNote}
                  onChange={e => onFieldChange('privateItemNote', e.target.value)}
                  placeholder="Internal purchasing notes (private, admin only)"
                  rows={3}
                  style={{ 
                    flex: 1,
                    resize: "vertical",
                    minHeight: "65px"
                  }}
                />
              </div>
            )}
          </div>
          {hasExtendedShipping && (
            <div style={{ 
              marginTop: "8px", 
              fontSize: "11px", 
              color: "var(--success)", 
              fontStyle: "italic" 
            }}>
              This is a large machine that requires extended time in manufacturing
            </div>
          )}
        </td>
      </tr>

      {/* Shared Shipment Section - only for admin/agent */}
      {canManageShipments && getAuthHeaders && (
        <tr style={{ 
          backgroundColor: hasExtendedShipping ? "rgba(0, 255, 170, 0.05)" : "transparent",
          borderBottom: "2px solid #404040",
          ...(hasChanges && { boxShadow: "inset 4px 0 0 #f59e0b" })
        }}>
          <td colSpan="7" style={{ padding: "8px" }}>
            <SharedShipmentSection
              item={item}
              onShipmentChange={onRefresh}
              disabled={disabled}
              getAuthHeaders={getAuthHeaders}
            />
          </td>
        </tr>
      )}

      {/* Border row if no shipment section */}
      {!canManageShipments && (
        <tr style={{ borderBottom: "2px solid #404040" }}>
          <td colSpan="7" style={{ padding: 0 }}></td>
        </tr>
      )}
    </>
  );
}
