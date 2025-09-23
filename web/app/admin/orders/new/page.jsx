"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function NewOrderPage() {
  const router = useRouter();
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]); // Add users state
  const [customSalesPerson, setCustomSalesPerson] = useState(""); // Add state for custom sales person
  const [showOtherInput, setShowOtherInput] = useState(false); // Track if "Other" is selected
  const customerDropdownRef = useRef(null); // Add ref for customer dropdown
  const [formData, setFormData] = useState({
    accountId: "",
    poNumber: "", // Still poNumber in backend
    sku: "", // Still sku in backend - will store user name
    items: [{ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", notes: "" }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  useEffect(() => {
    if (user) {
      loadCustomers();
      loadUsers(); // Load users when component mounts
    }
  }, [user]);

  // Close customer dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function loadCustomers() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/accounts", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load customers");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load customers:", e);
      setError("Failed to load customers");
    }
  }

  // New function to load users
  async function loadUsers() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/users", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        // If not admin, just use current user
        setUsers([{ id: user.id, name: user.name, email: user.email }]);
        return;
      }
      const data = await res.json();
      const activeUsers = (Array.isArray(data) ? data : [])
        .filter(u => u.isActive) // Only show active users
        .filter(u => u.name !== "Admin User") // Exclude the default "Admin User"
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
      setUsers(activeUsers);
    } catch (e) {
      // If error loading users, just use current user (unless it's Admin User)
      console.error("Failed to load users:", e);
      if (user.name !== "Admin User") {
        setUsers([{ id: user.id, name: user.name, email: user.email }]);
      } else {
        setUsers([]); // If current user is Admin User, show empty list
      }
    }
  }

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = customers.find((c) => c.id === formData.accountId);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.accountId) {
      setError("Please select a customer");
      return;
    }
    if (formData.items.length === 0 || !formData.items[0].productCode.trim()) {
      setError("Please add at least one item");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // If "Other" is selected, use the custom sales person value
      const submitData = {
        ...formData,
        sku: showOtherInput ? customSalesPerson : formData.sku
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(submitData),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      router.push("/admin/board");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setLoading(false);
    }
  }

  function addItem() {
    setFormData({
      ...formData,
      items: [...formData.items, { productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", notes: "" }],
    });
  }

  function removeItem(index) {
    if (formData.items.length > 1) {
      setFormData({
        ...formData,
        items: formData.items.filter((_, i) => i !== index),
      });
    }
  }

  function updateItem(index, field, value) {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  }

  function selectCustomer(customer) {
    setFormData({ ...formData, accountId: customer.id });
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  }

  // Handle sales person dropdown change
  function handleSalesPersonChange(value) {
    if (value === "Other") {
      setShowOtherInput(true);
      setFormData({ ...formData, sku: "" });
      setCustomSalesPerson("");
    } else {
      setShowOtherInput(false);
      setFormData({ ...formData, sku: value });
      setCustomSalesPerson("");
    }
  }

  // Don't render content until authentication is checked
  if (!user) {
    return null;
  }

  return (
    <main style={{ padding: "40px 20px", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header with user navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "600", color: "var(--text)", marginBottom: "10px" }}>
            Create New Order
          </h1>
          <Link href="/admin/board" style={{ color: "var(--accent)", textDecoration: "none" }}>
            ← Back to Orders Board
          </Link>
        </div>
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            {user?.name} ({user?.role})
          </span>
          {isAdmin && (
            <Link href="/admin/users" className="btn">
              Manage Users
            </Link>
          )}
          <button 
            onClick={logout} 
            className="btn"
            style={{ backgroundColor: '#dc2626', color: 'white' }}
          >
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "16px",
          marginBottom: "20px",
          backgroundColor: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: "6px",
          color: "#fecaca",
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Customer Selection */}
        <div style={{ marginBottom: "24px" }} ref={customerDropdownRef}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "var(--text)" }}>
            Customer *
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerDropdown(true);
                if (!e.target.value) {
                  setFormData({ ...formData, accountId: "" });
                }
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Type customer name or scroll to select..."
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                backgroundColor: "var(--input-bg)",
                color: "var(--text)",
                fontSize: "14px",
              }}
              required
            />
            
            {showCustomerDropdown && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: "200px",
                overflowY: "auto",
                backgroundColor: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                zIndex: 10,
                marginTop: "4px",
              }}>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      onClick={() => selectCustomer(customer)}
                      style={{
                        padding: "12px",
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text)",
                        backgroundColor: formData.accountId === customer.id ? "var(--accent)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (formData.accountId !== customer.id) {
                          e.target.style.backgroundColor = "var(--hover-bg)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (formData.accountId !== customer.id) {
                          e.target.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <div style={{ fontWeight: "500" }}>{customer.name}</div>
                      {customer.email && (
                        <div style={{ fontSize: "12px", opacity: 0.7 }}>{customer.email}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "12px", color: "var(--text-dim)", textAlign: "center" }}>
                    No customers found
                  </div>
                )}
              </div>
            )}
          </div>
          
          {selectedCustomer && (
            <div style={{
              marginTop: "8px",
              padding: "8px",
              backgroundColor: "var(--muted)",
              borderRadius: "4px",
              fontSize: "12px",
              color: "var(--text-dim)",
            }}>
              Selected: {selectedCustomer.name}
              {selectedCustomer.email && ` (${selectedCustomer.email})`}
            </div>
          )}
        </div>

        {/* Order Date (formerly PO Number) */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "var(--text)" }}>
            Order Date
          </label>
          <input
            type="text"
            value={formData.poNumber}
            onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
            placeholder="Enter order date (e.g., 2024-01-15 or Jan 15, 2024)"
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              backgroundColor: "var(--input-bg)",
              color: "var(--text)",
              fontSize: "14px",
            }}
          />
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
            Optional: Date when order was placed
          </div>
        </div>

        {/* Sales Person (formerly SKU) - FIXED DROPDOWN */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "var(--text)" }}>
            Sales Person
          </label>
          <select
            value={showOtherInput ? "Other" : formData.sku}
            onChange={(e) => handleSalesPersonChange(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              backgroundColor: "var(--input-bg)",
              color: "var(--text)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="" style={{ color: "var(--text-dim)" }}>
              Select sales person...
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name} {u.role === "ADMIN" ? "(Admin)" : u.role === "AGENT" ? "(Agent)" : ""}
              </option>
            ))}
            <option value="Other">Other (Custom)</option>
          </select>
          
          {/* If "Other" is selected, show text input - FIXED */}
          {showOtherInput && (
            <input
              type="text"
              value={customSalesPerson}
              onChange={(e) => setCustomSalesPerson(e.target.value)}
              onBlur={(e) => {
                // Prevent input from disappearing on blur
                e.stopPropagation();
              }}
              placeholder="Enter sales person name"
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                backgroundColor: "var(--input-bg)",
                color: "var(--text)",
                fontSize: "14px",
                marginTop: "8px",
              }}
              autoFocus
            />
          )}
          
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
            Optional: Select the sales person handling this order
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: "32px" }}>
          <label style={{ display: "block", marginBottom: "16px", fontWeight: "500", color: "var(--text)" }}>
            Order Items *
          </label>
          
          {formData.items.map((item, index) => (
            <div key={index} style={{
              marginBottom: "24px",
              padding: "16px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              backgroundColor: "var(--panel)"
            }}>
              {/* First row: Product code and Quantity */}
              <div style={{
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
                alignItems: "end",
              }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-dim)" }}>
                    Product Description *
                  </label>
                  <input
                    type="text"
                    value={item.productCode}
                    onChange={(e) => updateItem(index, "productCode", e.target.value)}
                    placeholder="Product code or description"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text)",
                      fontSize: "14px",
                    }}
                    required
                  />
                </div>
                
                <div style={{ width: "100px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-dim)" }}>
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 1)}
                    min="1"
                    placeholder="Qty"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text)",
                      fontSize: "14px",
                      textAlign: "center",
                    }}
                    required
                  />
                </div>
              </div>
              
              {/* Second row: Serial Number and Model Number */}
              <div style={{
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
              }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-dim)" }}>
                    Serial Number
                  </label>
                  <input
                    type="text"
                    value={item.serialNumber}
                    onChange={(e) => updateItem(index, "serialNumber", e.target.value)}
                    placeholder="Optional serial number"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text)",
                      fontSize: "14px",
                    }}
                  />
                </div>
                
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-dim)" }}>
                    Model Number
                  </label>
                  <input
                    type="text"
                    value={item.modelNumber}
                    onChange={(e) => updateItem(index, "modelNumber", e.target.value)}
                    placeholder="Optional model number"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text)",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>
              
              {/* Third row: Voltage */}
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-dim)" }}>
                  Item Voltage
                </label>
                <input
                  type="text"
                  value={item.voltage}
                  onChange={(e) => updateItem(index, "voltage", e.target.value)}
                  placeholder="Optional - specific voltage for this item (e.g., 220V, 110V)"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    backgroundColor: "var(--input-bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                  }}
                />
              </div>
              
              {/* Fourth row: Notes */}
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-dim)" }}>
                  Item Notes
                </label>
                <textarea
                  value={item.notes}
                  onChange={(e) => updateItem(index, "notes", e.target.value)}
                  placeholder="Optional notes about this item"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    backgroundColor: "var(--input-bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                    minHeight: "60px",
                    resize: "vertical",
                  }}
                />
              </div>
              
              {/* Remove button */}
              {formData.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#991b1b",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Remove Item
                </button>
              )}
            </div>
          ))}
          
          <button
            type="button"
            onClick={addItem}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              marginTop: "8px",
            }}
          >
            + Add Another Item
          </button>
        </div>

        {/* Submit Buttons */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "end" }}>
          <Link
            href="/admin/board"
            style={{
              padding: "12px 24px",
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            Cancel
          </Link>
          
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 24px",
              backgroundColor: loading ? "#666" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            {loading ? "Creating..." : "Create Order"}
          </button>
        </div>
      </form>
    </main>
  );
}