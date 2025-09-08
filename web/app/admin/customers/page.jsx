"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function CustomersPage() {
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [q, setQ] = useState("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function loadCustomers() {
    if (!user) return; // Don't try to load if not authenticated
    
    try {
      setLoading(true);
      const res = await fetch("/api/accounts", {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustomers(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadCustomers();
    }
  }, [user]);

  // Filter customers based on search query
  const filteredCustomers = customers.filter(customer => {
    if (!q.trim()) return true;
    const searchTerm = q.toLowerCase();
    return (
      customer.name?.toLowerCase().includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchTerm) ||
      customer.phone?.toLowerCase().includes(searchTerm) ||
      customer.address?.toLowerCase().includes(searchTerm) ||
      customer.machineVoltage?.toLowerCase().includes(searchTerm)
    );
  });

  async function handleEdit(customer) {
    // Auto-expand the customer details and enter edit mode
    setExpandedCustomer(customer.id);
    setEditingCustomer(customer.id);
    setEditForm({
      name: customer.name || "",
      email: customer.email || "",
      address: customer.address || "",
      phone: customer.phone || "",
      machineVoltage: customer.machineVoltage || "",
      notes: customer.notes || ""
    });
  }

  async function handleSave(customerId) {
    try {
      const res = await fetch(`/api/accounts/${customerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      await loadCustomers();
      setEditingCustomer(null);
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    }
  }

  async function handleDelete(customer) {
    if (!confirm(`Are you sure you want to delete customer "${customer.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/accounts/${customer.id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      await loadCustomers();
      // Close expanded view if this customer was expanded
      if (expandedCustomer === customer.id) {
        setExpandedCustomer(null);
      }
    } catch (err) {
      alert(`Failed to delete customer: ${err.message}`);
    }
  }

  // Don't render content until authentication is checked
  if (!user) {
    return null;
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 16 }}>
      {/* Header with user navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 className="h1" style={{ margin: 0 }}>Manage Customers</h1>
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            Welcome, {user?.name} ({user?.role})
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

      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/customers/new" className="btn primary">Add Customer</Link>
        <Link href="/admin/orders" className="btn" style={{ marginLeft: 8 }}>Manage Orders</Link>
        <Link href="/admin/board" className="btn" style={{ marginLeft: 8 }}>Back to Board</Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search Customer Name / Email / Phone / Address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
        />
      </div>

      {error && (
        <div style={{
          padding: "10px",
          marginBottom: "20px",
          backgroundColor: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: "6px",
          color: "#fecaca"
        }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#a0a0a0" }}>Loading customers...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredCustomers.length === 0 ? (
            <div style={{ color: "#a0a0a0", padding: "20px", textAlign: "center" }}>
              {q ? "No customers found matching your search" : "No customers yet"}
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                style={{
                  border: "1px solid #404040",
                  borderRadius: "8px",
                  padding: "15px",
                  backgroundColor: "#2d2d2d"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer"
                  }}
                  onClick={() => setExpandedCustomer(
                    expandedCustomer === customer.id ? null : customer.id
                  )}
                >
                  <div>
                    <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "5px", color: "#e4e4e4" }}>
                      {customer.name}
                    </h3>
                    <div style={{ fontSize: "14px", color: "#a0a0a0", display: "flex", gap: "20px" }}>
                      {customer.email && <span>📧 {customer.email}</span>}
                      {customer.phone && <span>📞 {customer.phone}</span>}
                      {customer.machineVoltage && <span>⚡ {customer.machineVoltage}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(customer);
                      }}
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "#383838",
                        color: "#e4e4e4",
                        border: "1px solid #404040",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px"
                      }}
                      title="Edit customer"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(customer);
                      }}
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "#7f1d1d",
                        color: "#fecaca",
                        border: "1px solid #991b1b",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px"
                      }}
                      title="Delete customer (permanent)"
                    >
                      ✕
                    </button>
                    <span style={{ color: "#a0a0a0", marginLeft: "6px" }}>
                      {expandedCustomer === customer.id ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {expandedCustomer === customer.id && (
                  <div style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px solid #404040" }}>
                    {editingCustomer === customer.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
                            Name
                          </label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              backgroundColor: "#383838",
                              color: "#e4e4e4"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
                            Email
                          </label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              backgroundColor: "#383838",
                              color: "#e4e4e4"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
                            Address
                          </label>
                          <textarea
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              backgroundColor: "#383838",
                              color: "#e4e4e4",
                              minHeight: "60px"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              backgroundColor: "#383838",
                              color: "#e4e4e4"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
                            Machine Voltage
                          </label>
                          <input
                            type="text"
                            value={editForm.machineVoltage}
                            onChange={(e) => setEditForm({ ...editForm, machineVoltage: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              backgroundColor: "#383838",
                              color: "#e4e4e4"
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500", color: "#e4e4e4" }}>
                            Notes
                          </label>
                          <textarea
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              backgroundColor: "#383838",
                              color: "#e4e4e4",
                              minHeight: "80px"
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                          <button
                            onClick={() => handleSave(customer.id)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer"
                            }}
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={() => setEditingCustomer(null)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#2d2d2d",
                              color: "#e4e4e4",
                              border: "1px solid #404040",
                              borderRadius: "4px",
                              cursor: "pointer"
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#a0a0a0" }}>Address:</strong>
                          <p style={{ marginTop: "5px", color: "#e4e4e4" }}>{customer.address || "Not provided"}</p>
                        </div>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#a0a0a0" }}>Phone:</strong>
                          <p style={{ marginTop: "5px", color: "#e4e4e4" }}>{customer.phone || "Not provided"}</p>
                        </div>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#a0a0a0" }}>Machine Voltage:</strong>
                          <p style={{ marginTop: "5px", color: "#e4e4e4" }}>{customer.machineVoltage || "Not provided"}</p>
                        </div>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#a0a0a0" }}>Email:</strong>
                          <p style={{ marginTop: "5px", color: "#e4e4e4" }}>{customer.email || "Not provided"}</p>
                        </div>
                        {customer.notes && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <strong style={{ fontSize: "14px", color: "#a0a0a0" }}>Notes:</strong>
                            <p style={{ marginTop: "5px", whiteSpace: "pre-wrap", color: "#e4e4e4" }}>{customer.notes}</p>
                          </div>
                        )}
                        <div style={{ gridColumn: "1 / -1" }}>
                          <strong style={{ fontSize: "14px", color: "#a0a0a0" }}>Created:</strong>
                          <p style={{ marginTop: "5px", color: "#e4e4e4" }}>
                            {new Date(customer.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}