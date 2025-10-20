"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function NewOrderPage() {
  const router = useRouter();
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    accountId: "",
    poNumber: "",
    salesPerson: "",
    customerDocsLink: "",
    orderDate: new Date().toISOString().split('T')[0]
  });

  // Items to be added with the order
  const [items, setItems] = useState([
    { 
      name: "",
      qty: "",
      serialNumber: "",
      modelNumber: "",
      voltage: "",
      power: "",
      notes: "",
      itemPrice: "",
      privateItemNote: "",
      hasExtendedShipping: false
    }
  ]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    loadData();
  }, [user]);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([loadAccounts(), loadUsers()]);
    } catch (e) {
      setError("Failed to load data: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/accounts", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (e) {
      console.error("Failed to load accounts:", e);
      setError("Failed to load customer accounts");
    }
  }

  async function loadUsers() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/users/sales-reps", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        // If not admin or error, just use current user if they can be a sales rep
        if (user.name !== "Admin User") {
          setUsers([{ id: user.id, name: user.name, email: user.email }]);
        } else {
          setUsers([]);
        }
        return;
      }
      const data = await res.json();
      // Data is already filtered to active users with canBeSalesRep: true
      const sortedUsers = (Array.isArray(data) ? data : [])
        .sort((a, b) => a.name.localeCompare(b.name));
      setUsers(sortedUsers);
    } catch (e) {
      console.error("Failed to load users:", e);
      if (user.name !== "Admin User") {
        setUsers([{ id: user.id, name: user.name, email: user.email }]);
      } else {
        setUsers([]);
      }
    }
  }

  function addItem() {
    setItems([...items, { 
      name: "",
      qty: "",
      serialNumber: "",
      modelNumber: "",
      voltage: "",
      power: "",
      notes: "",
      itemPrice: "",
      privateItemNote: "",
      hasExtendedShipping: false
    }]);
  }

  function removeItem(index) {
    if (items.length === 1) return; // Keep at least one item row
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index, field, value) {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.accountId) {
      setError("Please select a customer");
      return;
    }

    if (!formData.salesPerson) {
      setError("Please select a sales person");
      return;
    }

    if (!formData.customerDocsLink) {
      setError("Please enter a customer documents link");
      return;
    }

    if (!formData.orderDate) {
      setError("Please enter an order date");
      return;
    }

    // Validate that at least one item has a name
    const validItems = items.filter(item => item.name.trim());
    if (validItems.length === 0) {
      setError("Please add at least one item with a name");
      return;
    }

    // Validate required fields for each item
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      const itemNum = items.indexOf(item) + 1;
      
      if (!item.qty || !item.qty.trim()) {
        setError(`Item ${itemNum}: Quantity is required`);
        return;
      }
      if (!item.modelNumber || !item.modelNumber.trim()) {
        setError(`Item ${itemNum}: Model # is required`);
        return;
      }
      if (!item.voltage || !item.voltage.trim()) {
        setError(`Item ${itemNum}: Voltage is required`);
        return;
      }
      if (!item.power || !item.power.trim()) {
        setError(`Item ${itemNum}: Power is required`);
        return;
      }
      if (!item.itemPrice || !item.itemPrice.trim()) {
        setError(`Item ${itemNum}: Price is required`);
        return;
      }
    }

    try {
      setSaving(true);
      
      // Create the order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          accountId: formData.accountId,
          poNumber: formData.poNumber.trim() || null,
          sku: formData.salesPerson, // Sales person stored in sku field (now required)
          customerDocsLink: formData.customerDocsLink.trim(),
          orderDate: formData.orderDate
        })
      });

      if (!orderRes.ok) {
        const data = await orderRes.json();
        throw new Error(data.error || "Failed to create order");
      }

      const order = await orderRes.json();

      // Add all items to the order using the correct endpoint and field names
      for (const item of validItems) {
        const itemData = {
          productCode: item.name.trim(), // API expects productCode, not name
          qty: item.qty.trim() ? parseInt(item.qty.trim()) : 1,
          serialNumber: item.serialNumber.trim() || null,
          modelNumber: item.modelNumber.trim(),
          voltage: item.voltage.trim(),
          laserWattage: item.power.trim(), // API expects laserWattage, not power
          notes: item.notes.trim() || null,
          itemPrice: parseFloat(item.itemPrice.trim()),
          privateItemNote: item.privateItemNote.trim() || null,
          hasExtendedShipping: item.hasExtendedShipping || false
        };

        const itemRes = await fetch(`/api/orders/${order.id}/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders()
          },
          body: JSON.stringify(itemData)
        });

        if (!itemRes.ok) {
          const data = await itemRes.json();
          console.error("Failed to add item:", data.error);
          // Continue adding other items even if one fails
        }
      }

      router.push(`/admin/orders/${order.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        color: '#a0a0a0'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 16 }}>
      <header className="header" style={{ position: "static", paddingLeft: 0, paddingRight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="h1">Add New Order</h1>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {user?.name} ({user?.role})
            </span>
            {isAdmin && (
              <Link href="/admin/users" className="btn">
                Manage Users
              </Link>
            )}
            <Link href="/admin/orders" className="btn">Back to Orders</Link>
            <Link href="/admin/board" className="btn">Back to Board</Link>
            <button 
              onClick={logout} 
              className="btn"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div style={{
          padding: "12px",
          marginBottom: "16px",
          backgroundColor: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: "6px",
          color: "#fecaca"
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Order Details Section */}
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
              <select
                className="input"
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                required
                style={{ width: "100%" }}
              >
                <option value="">Select a customer</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
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

        {/* Items Section */}
        <div style={{
          backgroundColor: "#2d2d2d",
          border: "1px solid #404040",
          borderRadius: "8px",
          padding: "24px",
          marginTop: "16px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", color: "#e4e4e4" }}>Order Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="btn primary"
              style={{ padding: "8px 16px", fontSize: "14px" }}
            >
              + Add Another Item
            </button>
          </div>

          {items.map((item, index) => (
            <div
              key={index}
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
                {items.length > 1 && (
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

              {/* Row 2: Serial # and Model # */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
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
                    Price *
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={item.itemPrice}
                    onChange={(e) => updateItem(index, 'itemPrice', e.target.value)}
                    placeholder="Item price"
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
          ))}
        </div>

        {/* Submit Buttons */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
          <Link href="/admin/orders" className="btn">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn primary"
            disabled={saving}
          >
            {saving ? "Creating Order..." : "Create Order"}
          </button>
        </div>
      </form>

      <div style={{
        marginTop: "16px",
        padding: "12px",
        backgroundColor: "#1a1a1a",
        border: "1px solid #404040",
        borderRadius: "6px",
        fontSize: "13px",
        color: "#a0a0a0"
      }}>
        <strong style={{ color: "#e4e4e4" }}>Note:</strong> You can add multiple items with all details before creating the order. After creating the order, you can still add more items or edit existing ones on the order details page.
      </div>
    </div>
  );
}
