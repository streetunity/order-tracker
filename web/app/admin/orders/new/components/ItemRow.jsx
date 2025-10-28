// Item Row Component
// Represents a single item in the order

export default function ItemRow({
  item,
  index,
  updateItem,
  removeItem,
  canRemove,
  manufacturers
}) {
  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #404040",
        borderRadius: "6px",
        padding: "16px",
        marginBottom: "16px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: "600", color: "#e4e4e4" }}>
          Item {index + 1}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeItem(index)}
            style={{
              background: "transparent",
              border: "none",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: "14px",
              padding: "4px 8px"
            }}
          >
            Remove
          </button>
        )}
      </div>

      {/* Row 1: Name and Qty */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Name *
          </label>
          <input
            type="text"
            className="input"
            value={item.name}
            onChange={(e) => updateItem(index, 'name', e.target.value)}
            placeholder="Item name"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Qty *
          </label>
          <input
            type="text"
            className="input"
            value={item.qty}
            onChange={(e) => updateItem(index, 'qty', e.target.value)}
            placeholder="Quantity"
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Row 2: Serial #, Model #, and Manufacturer */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Serial #
          </label>
          <input
            type="text"
            className="input"
            value={item.serialNumber}
            onChange={(e) => updateItem(index, 'serialNumber', e.target.value)}
            placeholder="Serial number"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Model # *
          </label>
          <input
            type="text"
            className="input"
            value={item.modelNumber}
            onChange={(e) => updateItem(index, 'modelNumber', e.target.value)}
            placeholder="Model number"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Manufacturer
          </label>
          <select
            className="input"
            value={item.manufacturerId}
            onChange={(e) => updateItem(index, 'manufacturerId', e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Select...</option>
            {manufacturers.map(mfg => (
              <option key={mfg.id} value={mfg.id}>{mfg.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Voltage and Power */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Voltage *
          </label>
          <input
            type="text"
            className="input"
            value={item.voltage}
            onChange={(e) => updateItem(index, 'voltage', e.target.value)}
            placeholder="e.g., 120V"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Power *
          </label>
          <input
            type="text"
            className="input"
            value={item.power}
            onChange={(e) => updateItem(index, 'power', e.target.value)}
            placeholder="e.g., 1000W"
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Row 4: Notes */}
      <div style={{ marginBottom: "12px" }}>
        <label style={{
          display: "block",
          fontSize: "13px",
          fontWeight: "500",
          marginBottom: "6px",
          color: "#e4e4e4"
        }}>
          Notes
        </label>
        <textarea
          className="input"
          value={item.notes}
          onChange={(e) => updateItem(index, 'notes', e.target.value)}
          placeholder="Additional notes or description"
          rows={2}
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>

      {/* Row 5: Price, Private Notes, and Extended Shipping */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "12px", alignItems: "end" }}>
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Price * <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: "normal" }}>(usually retail price)</span>
          </label>
          <input
            type="text"
            className="input"
            value={item.itemPrice}
            onChange={(e) => updateItem(index, 'itemPrice', e.target.value)}
            placeholder="0.00"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "#e4e4e4"
          }}>
            Private Notes (internal only)
          </label>
          <input
            type="text"
            className="input"
            value={item.privateItemNote}
            onChange={(e) => updateItem(index, 'privateItemNote', e.target.value)}
            placeholder="Internal purchasing notes"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ paddingBottom: "8px" }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontSize: "13px",
            color: "#e4e4e4",
            userSelect: "none"
          }}>
            <input
              type="checkbox"
              checked={item.hasExtendedShipping}
              onChange={(e) => updateItem(index, 'hasExtendedShipping', e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Extended Shipping
          </label>
        </div>
      </div>
    </div>
  );
}
