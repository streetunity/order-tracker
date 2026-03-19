"use client";

export default function DetailsTab({ item, editedItem, onFieldChange, saving, canEditField, isManufacturer, orderedDate }) {
  return (
    <div className="view-item-body-wide">
      {/* Left column */}
      <div className="view-item-left-col">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
          <div className="form-field">
            <label>Quantity</label>
            <input
              type="number" min="1"
              value={editedItem.qty}
              onChange={(e) => onFieldChange("qty", parseInt(e.target.value) || 1)}
              disabled={!canEditField("qty") || saving}
              className={canEditField("qty") ? "" : "field-readonly"}
            />
          </div>
          <div className="form-field">
            <label>Ordered Date</label>
            <div style={{ padding: "10px 12px", background: item?.isOrdered ? "rgba(5,150,105,0.1)" : "rgba(107,114,128,0.1)", border: `1px solid ${item?.isOrdered ? "#059669" : "rgba(107,114,128,0.2)"}`, borderRadius: "6px", color: item?.isOrdered ? "#059669" : "#6b7280", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
              {item?.isOrdered ? (<><span>✓</span><span>{orderedDate}</span></>) : (<span style={{ fontStyle: "italic" }}>Not ordered yet</span>)}
            </div>
          </div>
        </div>

        <div className="form-field">
          <label>Item Name / Product Code</label>
          <input type="text" value={editedItem.productCode} onChange={(e) => onFieldChange("productCode", e.target.value)} disabled={!canEditField("productCode") || saving} className={canEditField("productCode") ? "" : "field-readonly"} placeholder="e.g., Laser Cutter XL-2000" />
        </div>

        <div className="form-field">
          <label>Model Number</label>
          <input type="text" value={editedItem.modelNumber} onChange={(e) => onFieldChange("modelNumber", e.target.value)} disabled={!canEditField("modelNumber") || saving} className={canEditField("modelNumber") ? "" : "field-readonly"} placeholder="e.g., XL-2000-PRO" />
        </div>

        <div className="form-field serial-number-field">
          <label>
            Serial Number
            {canEditField("serialNumber") && <span className="field-badge editable">Always Editable</span>}
          </label>
          <input type="text" value={editedItem.serialNumber} onChange={(e) => onFieldChange("serialNumber", e.target.value)} disabled={!canEditField("serialNumber") || saving} className={canEditField("serialNumber") ? "" : "field-readonly"} placeholder="e.g., SN123456789" />
        </div>

        <div className="form-field">
          <label>Voltage / Power</label>
          <input type="text" value={editedItem.voltage} onChange={(e) => onFieldChange("voltage", e.target.value)} disabled={!canEditField("voltage") || saving} className={canEditField("voltage") ? "" : "field-readonly"} placeholder="e.g., 220V or 110V" />
        </div>

        <div className="form-field">
          <label>Power</label>
          <input type="text" value={editedItem.laserWattage} onChange={(e) => onFieldChange("laserWattage", e.target.value)} disabled={!canEditField("laserWattage") || saving} className={canEditField("laserWattage") ? "" : "field-readonly"} placeholder="e.g., 100W" />
        </div>
      </div>

      {/* Right column */}
      <div className="view-item-right-col">
        <div className="form-field">
          <label>Public Notes</label>
          <textarea
            value={editedItem.notes}
            onChange={(e) => onFieldChange("notes", e.target.value)}
            disabled={!canEditField("notes") || saving}
            className={canEditField("notes") ? "" : "field-readonly"}
            placeholder="Add any public notes about this item..."
            rows={8}
            style={{ padding: "10px 12px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "14px", fontFamily: "inherit", resize: "vertical", minHeight: "180px", height: "180px" }}
          />
        </div>

        <div className="form-field">
          <label>Financial Notes (Internal)</label>
          <textarea
            value={editedItem.privateItemNote}
            onChange={(e) => onFieldChange("privateItemNote", e.target.value)}
            disabled={isManufacturer || !canEditField("privateItemNote") || saving}
            className={(isManufacturer || !canEditField("privateItemNote")) ? "field-readonly" : ""}
            placeholder="Internal financial notes (manufacturers can view but not edit)..."
            rows={8}
            style={{ padding: "10px 12px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "14px", fontFamily: "inherit", resize: "vertical", minHeight: "180px", height: "180px" }}
          />
        </div>
      </div>
    </div>
  );
}
