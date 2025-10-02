# Manual Update Instructions for Price and Private Notes Feature

## 1. Database Migration
First, run the database migration to add the new fields:

```bash
cd /var/www/order-tracker/api
npx prisma generate
npx prisma migrate deploy
```

## 2. Update API (api/src/index.js)

### Find the PATCH endpoint for updating items
Look for: `app.patch("/api/orders/:orderId/items/:itemId"`

### Replace the entire endpoint with:
```javascript
app.patch("/api/orders/:orderId/items/:itemId", requireAuth, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes, itemPrice, privateItemNote } = req.body;
    
    // Get the order with its lock status
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isLocked: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    // Build update data based on what's allowed
    const updateData = {};
    
    // These fields can only be updated if order is not locked
    if (!order.isLocked) {
      if (productCode !== undefined) updateData.productCode = productCode;
      if (qty !== undefined) updateData.qty = qty;
      if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
      if (modelNumber !== undefined) updateData.modelNumber = modelNumber;
      if (voltage !== undefined) updateData.voltage = voltage;
      if (laserWattage !== undefined) updateData.laserWattage = laserWattage;
      if (notes !== undefined) updateData.notes = notes;
    }
    
    // Admin-only fields that can be updated even when locked
    if (req.user && req.user.role === 'ADMIN') {
      if (itemPrice !== undefined) updateData.itemPrice = itemPrice === "" || itemPrice === null ? null : parseFloat(itemPrice);
      if (privateItemNote !== undefined) updateData.privateItemNote = privateItemNote || null;
    }

    const item = await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });
    
    res.json(item);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
});
```

### Add the yearly total endpoint
Add this BEFORE the general `app.get("/api/orders"` endpoint:

```javascript
// GET /api/orders/yearly-total - Get total of all item prices for current year (ADMIN ONLY)
app.get("/api/orders/yearly-total", requireAuth, requireAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);
    
    const result = await prisma.orderItem.aggregate({
      _sum: {
        itemPrice: true
      },
      where: {
        order: {
          createdAt: {
            gte: startOfYear,
            lte: endOfYear
          }
        }
      }
    });
    
    const total = result._sum.itemPrice || 0;
    
    res.json({ 
      total: total,
      year: currentYear,
      formatted: new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD' 
      }).format(total)
    });
  } catch (error) {
    console.error("Error calculating yearly total:", error);
    res.status(500).json({ error: "Failed to calculate yearly total" });
  }
});
```

## 3. Update Edit Order Page (web/app/admin/orders/[id]/page.jsx)

### Update the saveItem function signature
Find: `async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes)`
Replace with: `async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes, itemPrice, privateItemNote)`

### Update the saveItem body
In the saveItem function, update the body of the fetch request:
```javascript
body: JSON.stringify({ 
  productCode, 
  qty, 
  serialNumber, 
  modelNumber, 
  voltage, 
  laserWattage: laserWattage || null,
  notes,
  itemPrice: itemPrice || null,
  privateItemNote: privateItemNote || null
})
```

### Update the EditableRow component call
Find where EditableRow is called in the table and update the onSave prop:
```javascript
onSave={(name, qty, serial, model, voltage, laserWattage, notes, itemPrice, privateItemNote) => 
  saveItem(it.id, name, qty, serial, model, voltage, laserWattage, notes, itemPrice, privateItemNote)}
```

### Replace the entire EditableRow function
Replace the entire `function EditableRow` at the bottom of the file with:

```javascript
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
```

## 4. Update Board Page (web/app/admin/board/page.jsx)

### Add state for yearly total
After the line `const [loading, setLoading] = useState(true);` add:
```javascript
const [yearlyTotal, setYearlyTotal] = useState(null);
```

### Add function to load yearly total
Before the `async function load()` function, add:
```javascript
async function loadYearlyTotal() {
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
```

### Update useEffect to load yearly total
In the useEffect that calls `load()`, add:
```javascript
if (isAdmin) {
  loadYearlyTotal();
}
```

### Add yearly total display
Find the line `<h1 className={styles.h1}>Orders Board</h1>` and add after it:
```javascript
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
)}
```

## 5. Build and Deploy
```bash
cd /var/www/order-tracker/web
npm run build
pm2 restart all
pm2 status
```

## Testing Checklist
1. ✅ Edit an order as admin - verify second row appears under each item
2. ✅ Add price and private notes to an item
3. ✅ Save the item and verify data persists
4. ✅ Lock the order and verify admins can still edit price/notes
5. ✅ Check the Board page for yearly total display (admin only)
6. ✅ Check customer tracking page - verify price/notes are NOT visible