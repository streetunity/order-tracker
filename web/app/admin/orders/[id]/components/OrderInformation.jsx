// Component for displaying and editing order information
export default function OrderInformation({
  order,
  orderDate,
  setOrderDate,
  salesAgent,
  setSalesAgent,
  salesAgents,
  onSaveOrderDate,
  onSaveSalesAgent,
  isSavingOrderDate,
  isSavingSalesAgent,
  onsiteInstallationDate,
  setOnsiteInstallationDate,
  saveOnsiteInstallationDate,
  isSavingInstallationDate,
  hasExtendedShipping
}) {
  return (
    <section style={{ marginTop: 16, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Order Information</h3>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", flex: 1 }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
              Order Date *
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                onBlur={onSaveOrderDate}
                className="input"
                style={{
                  width: "150px",
                  padding: "8px 12px"
                }}
                disabled={isSavingOrderDate}
              />
              {isSavingOrderDate && (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
              )}
            </div>
          </div>
          {order.poNumber && (
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
                PO Number
              </label>
              <div style={{
                padding: "8px 12px",
                backgroundColor: "#1a1a1a",
                border: "1px solid #404040",
                borderRadius: "4px",
                fontSize: "14px",
                color: "#e4e4e4"
              }}>
                {order.poNumber}
              </div>
            </div>
          )}
          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
              Sales Person
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <select
                className="input"
                value={salesAgent}
                onChange={(e) => setSalesAgent(e.target.value)}
                onBlur={onSaveSalesAgent}
                style={{
                  width: "200px",
                  padding: "8px 12px"
                }}
                disabled={isSavingSalesAgent}
              >
                <option value="">Select sales person...</option>
                {salesAgents.map(agent => (
                  <option key={agent.id} value={agent.name}>{agent.name}</option>
                ))}
              </select>
              {isSavingSalesAgent && (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
              )}
            </div>
          </div>

          {/* ETA Date */}
          {order.etaDate && (
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
                ETA
              </label>
              <div style={{
                padding: "8px 12px",
                backgroundColor: "#1a1a1a",
                border: "1px solid #404040",
                borderRadius: "4px",
                fontSize: "14px",
                color: "#e4e4e4"
              }}>
                {new Date(order.etaDate).toLocaleDateString()}
                {hasExtendedShipping && (
                  <span style={{ fontSize: "11px", color: "var(--success)", marginLeft: "8px" }}>
                    (Extended)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Onsite Installation Date - Right Aligned */}
        <div>
          <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
            Onsite Installation
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="date"
              value={onsiteInstallationDate}
              onChange={(e) => setOnsiteInstallationDate(e.target.value)}
              onBlur={saveOnsiteInstallationDate}
              className="input"
              style={{
                width: "150px",
                padding: "8px 12px"
              }}
              disabled={isSavingInstallationDate}
            />
            {isSavingInstallationDate && (
              <span style={{ fontSize: "12px", color: "#6b7280" }}>Saving...</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
        Press Tab or click outside any field to save changes.
      </div>
    </section>
  );
}
