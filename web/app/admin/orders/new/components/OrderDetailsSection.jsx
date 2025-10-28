// Order Details Section Component
// Handles customer selection, order date, PO number, sales person, and documents link

import Link from 'next/link';

export default function OrderDetailsSection({
  formData,
  setFormData,
  accounts,
  users,
  refreshingAccounts,
  handleRefreshAccounts
}) {
  return (
    <div style={{
      backgroundColor: "#2d2d2d",
      border: "1px solid #404040",
      borderRadius: "8px",
      padding: "24px",
      marginTop: "16px"
    }}>
      <h2 style={{ fontSize: "18px", marginBottom: "20px", color: "#e4e4e4" }}>Order Details</h2>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div>
          <label style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            marginBottom: "8px",
            color: "#e4e4e4"
          }}>
            Customer *
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <select
              className="input"
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              required
              style={{ flex: 1 }}
            >
              <option value="">Select a customer</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRefreshAccounts}
              disabled={refreshingAccounts}
              className="btn"
              style={{
                padding: "8px 12px",
                minWidth: "auto",
                fontSize: "14px"
              }}
              title="Refresh customer list"
            >
              {refreshingAccounts ? "⟳" : "🔄"}
            </button>
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Don't see your customer? <Link href="/admin/customers/new" style={{ color: "#ef4444" }}>Create a new customer</Link> then click refresh
          </div>
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            marginBottom: "8px",
            color: "#e4e4e4"
          }}>
            Order Date *
          </label>
          <input
            type="date"
            className="input"
            value={formData.orderDate}
            onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            marginBottom: "8px",
            color: "#e4e4e4"
          }}>
            PO Number
          </label>
          <input
            type="text"
            className="input"
            value={formData.poNumber}
            onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
            placeholder="Optional"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            marginBottom: "8px",
            color: "#e4e4e4"
          }}>
            Sales Person *
          </label>
          <select
            className="input"
            value={formData.salesPerson}
            onChange={(e) => setFormData({ ...formData, salesPerson: e.target.value })}
            required
            style={{ width: "100%" }}
          >
            <option value="">Select sales person</option>
            {users.map(u => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            marginBottom: "8px",
            color: "#e4e4e4"
          }}>
            Customer Documents Link *
          </label>
          <input
            type="url"
            className="input"
            value={formData.customerDocsLink}
            onChange={(e) => setFormData({ ...formData, customerDocsLink: e.target.value })}
            placeholder="https://www.dropbox.com/..."
            required
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Dropbox or other document link for customer files (visible to customer on tracking page)
          </div>
        </div>
      </div>
    </div>
  );
}
