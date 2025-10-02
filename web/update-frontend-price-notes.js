#!/bin/bash

# Script to update frontend for itemPrice and privateItemNote fields

echo "Updating frontend components for price and private notes..."

# Create the update script for the Edit Order page
cat << 'EOF' > update-frontend-price-notes.js
const fs = require('fs');
const path = require('path');

// Read the Edit Order page
const editOrderPath = path.join(__dirname, '../web/app/admin/orders/[id]/page.jsx');
let editOrderContent = fs.readFileSync(editOrderPath, 'utf8');

console.log('Updating Edit Order page to include price and private notes fields...');

// Find the EditableRow component and update it
const editableRowPattern = /function EditableRow\([^)]+\)/;
const match = editOrderContent.match(editableRowPattern);

if (match) {
  // Replace the EditableRow function with the updated version
  const updatedEditableRow = `function EditableRow({ item, onSave, onDelete, onMarkOrdered, onUnmarkOrdered, disabled, isLocked, isAdmin }) {
  const [name, setName] = useState(item.productCode || "");
  const [qty, setQty] = useState(item.qty || 1);
  const [serialNumber, setSerialNumber] = useState(item.serialNumber || "");
  const [modelNumber, setModelNumber] = useState(item.modelNumber || "");
  const [voltage, setVoltage] = useState(item.voltage || "");
  const [laserWattage, setLaserWattage] = useState(item.laserWattage || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [itemPrice, setItemPrice] = useState(item.itemPrice || "");
  const [privateItemNote, setPrivateItemNote] = useState(item.privateItemNote || "");
  
  const changed = name.trim() !== (item.productCode || "") || 
                  Number(qty) !== Number(item.qty || 1) ||
                  serialNumber.trim() !== (item.serialNumber || "") ||
                  modelNumber.trim() !== (item.modelNumber || "") ||
                  voltage.trim() !== (item.voltage || "") ||
                  laserWattage.trim() !== (item.laserWattage || "") ||
                  notes.trim() !== (item.notes || "") ||
                  (isAdmin && (
                    (itemPrice !== "" ? parseFloat(itemPrice) : null) !== (item.itemPrice || null) ||
                    privateItemNote.trim() !== (item.privateItemNote || "")
                  ));

  const isOrdered = item.isOrdered;
  const orderedDate = item.orderedAt ? new Date(item.orderedAt).toLocaleDateString() : null;

  const handleSave = () => {
    const priceValue = itemPrice === "" ? null : parseFloat(itemPrice);
    onSave(name.trim(), Number(qty || 1), serialNumber.trim(), modelNumber.trim(), 
           voltage.trim(), laserWattage.trim(), notes.trim(), priceValue, privateItemNote.trim());
  };

  const handlePriceChange = (e) => {
    const value = e.target.value;
    // Allow empty string or valid number format
    if (value === "" || /^\\d*\\.?\\d{0,2}$/.test(value)) {
      setItemPrice(value);
    }
  };

  return (
    <>
      <tr>
        <td>
          <input 
            className="input" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            disabled={isLocked}
            style={{ width: "145px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            type="number" 
            min={1} 
            value={qty} 
            onChange={e => setQty(e.target.value)} 
            style={{ width: "45px", opacity: isLocked ? 0.6 : 1 }} 
            disabled={isLocked}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={serialNumber} 
            onChange={e => setSerialNumber(e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "95px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={modelNumber} 
            onChange={e => setModelNumber(e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "95px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={voltage} 
            onChange={e => setVoltage(e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "65px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td>
          <input 
            className="input" 
            value={laserWattage} 
            onChange={e => setLaserWattage(e.target.value)} 
            placeholder="HP / Wattage"
            disabled={isLocked}
            style={{ width: "85px", opacity: isLocked ? 0.6 : 1 }}
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
                <span title={\`Ordered on \${orderedDate}\`} style={{ cursor: "help" }}>
                  {orderedDate}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: "#6b7280", fontSize: "12px" }}>—</span>
          )}
        </td>
        <td>
          <input 
            className="input" 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            placeholder="Optional"
            disabled={isLocked}
            style={{ width: "175px", opacity: isLocked ? 0.6 : 1 }}
          />
        </td>
        <td style={{ paddingLeft: "8px" }}>
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "flex-start" }}>
            <button 
              className="btn" 
              disabled={!changed || disabled} 
              onClick={handleSave}
              title={isLocked ? "Order is locked" : "Save changes"}
              style={{ fontSize: "11px", padding: "2px 5px" }}
            >
              Save
            </button>
            <button 
              className="btn danger" 
              onClick={onDelete} 
              disabled={disabled} 
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
      {isAdmin && (
        <tr style={{ backgroundColor: "#f3f4f6" }}>
          <td colSpan="8" style={{ padding: "8px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <input
                  className="input"
                  value={privateItemNote}
                  onChange={e => setPrivateItemNote(e.target.value)}
                  placeholder="Purchasing notes (private, admin only)"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ width: "120px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "14px", color: "#374151" }}>$</span>
                  <input
                    className="input"
                    type="text"
                    value={itemPrice}
                    onChange={handlePriceChange}
                    placeholder="0.00"
                    style={{ width: "90px", textAlign: "right" }}
                  />
                </div>
              </div>
            </div>
          </td>
          <td></td>
        </tr>
      )}
    </>
  );
}`;

  // Find the end of the EditableRow function
  const startIndex = editOrderContent.indexOf('function EditableRow');
  if (startIndex !== -1) {
    // Find the complete function
    let braceCount = 0;
    let endIndex = startIndex;
    let inFunction = false;
    
    for (let i = startIndex; i < editOrderContent.length; i++) {
      if (editOrderContent[i] === '{') {
        braceCount++;
        inFunction = true;
      } else if (editOrderContent[i] === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }
    
    editOrderContent = editOrderContent.substring(0, startIndex) + updatedEditableRow + editOrderContent.substring(endIndex);
    
    // Update the saveItem function call to include the new parameters
    const saveItemPattern = /onSave=\{[^}]+\}/;
    editOrderContent = editOrderContent.replace(saveItemPattern, 
      `onSave={(name, qty, serial, model, voltage, laserWattage, notes, itemPrice, privateItemNote) => 
                          saveItem(it.id, name, qty, serial, model, voltage, laserWattage, notes, itemPrice, privateItemNote)}`);
    
    // Update the saveItem function to handle the new fields
    const saveItemFunctionPattern = /async function saveItem\([^)]+\)/;
    editOrderContent = editOrderContent.replace(saveItemFunctionPattern, 
      'async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes, itemPrice, privateItemNote)');
    
    // Update the body of saveItem request
    const saveItemBodyPattern = /body: JSON\.stringify\(\{[^}]+\}\)/;
    editOrderContent = editOrderContent.replace(saveItemBodyPattern,
      `body: JSON.stringify({ 
          productCode, 
          qty, 
          serialNumber, 
          modelNumber, 
          voltage, 
          laserWattage: laserWattage || null,
          notes,
          itemPrice: itemPrice || null,
          privateItemNote: privateItemNote || null
        })`);
    
    console.log('Updated EditableRow component and saveItem function');
  }
}

// Write the updated content
fs.writeFileSync(editOrderPath, editOrderContent);
console.log('Edit Order page updated successfully!');

// Now update the Board page to show the yearly total
const boardPath = path.join(__dirname, '../web/app/admin/board/page.jsx');
let boardContent = fs.readFileSync(boardPath, 'utf8');

console.log('Updating Board page to show yearly total...');

// Add state for yearly total
const statePattern = /const \[loading, setLoading\] = useState\(true\);/;
boardContent = boardContent.replace(statePattern, 
  `const [loading, setLoading] = useState(true);
  const [yearlyTotal, setYearlyTotal] = useState(null);`);

// Add function to fetch yearly total
const loadFunctionPattern = /async function load\(\) {/;
boardContent = boardContent.replace(loadFunctionPattern,
  `async function loadYearlyTotal() {
    if (!user || !isAdmin) return;
    
    try {
      const res = await fetch("/api/orders/yearly-total", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setYearlyTotal(data);
      }
    } catch (e) {
      console.error("Failed to load yearly total:", e);
    }
  }

  async function load() {`);

// Add call to load yearly total in useEffect
const useEffectPattern = /load\(\);[\s]*\}/;
boardContent = boardContent.replace(useEffectPattern,
  `load();
    if (isAdmin) {
      loadYearlyTotal();
    }
  }`);

// Add the yearly total display in the header
const headerPattern = /<h1[^>]*>Orders Board<\/h1>/;
boardContent = boardContent.replace(headerPattern,
  `<h1 className={styles.h1}>Orders Board</h1>
        {isAdmin && yearlyTotal && (
          <div style={{
            marginLeft: "20px",
            padding: "8px 16px",
            backgroundColor: "#059669",
            color: "white",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500"
          }}>
            {new Date().getFullYear()} Total: {yearlyTotal.formatted}
          </div>
        )}`);

// Write the updated board content
fs.writeFileSync(boardPath, boardContent);
console.log('Board page updated successfully!');

console.log('Frontend updates complete!');
EOF

echo "Update script created. Run 'node update-frontend-price-notes.js' to apply changes."