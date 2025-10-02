// Updated EditableRow component for Edit Order page
// This includes the price and private notes fields

function EditableRow({ item, onSave, onDelete, onMarkOrdered, onUnmarkOrdered, disabled, isLocked, isAdmin }) {
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
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
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
        <tr style={{ backgroundColor: "#1f2937" }}>
          <td colSpan="8" style={{ padding: "8px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <input
                  className="input"
                  value={privateItemNote}
                  onChange={e => setPrivateItemNote(e.target.value)}
                  placeholder="Purchasing notes (private, admin only)"
                  style={{ 
                    width: "100%",
                    backgroundColor: "#374151",
                    border: "1px solid #4b5563",
                    color: "#e5e7eb"
                  }}
                />
              </div>
              <div style={{ width: "120px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "14px", color: "#9ca3af" }}>$</span>
                  <input
                    className="input"
                    type="text"
                    value={itemPrice}
                    onChange={handlePriceChange}
                    placeholder="0.00"
                    style={{ 
                      width: "90px", 
                      textAlign: "right",
                      backgroundColor: "#374151",
                      border: "1px solid #4b5563",
                      color: "#e5e7eb"
                    }}
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
}