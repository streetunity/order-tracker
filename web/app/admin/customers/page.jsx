"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function CustomersPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [q, setQ] = useState("");

  // Delete confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  // Helper to show notification
  function showNotif(message) {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  }

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function loadCustomers() {
    if (!user) return;
    
    try {
      setLoading(true);
      const res = await fetch("/api/accounts", {
        headers: getAuthHeaders(),
        cache: "no-store"
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

  const filteredCustomers = customers
    .filter(customer => {
      if (!q.trim()) return true;
      const searchTerm = q.toLowerCase();
      return (
        customer.name?.toLowerCase().includes(searchTerm) ||
        customer.contactName?.toLowerCase().includes(searchTerm) ||
        customer.email?.toLowerCase().includes(searchTerm) ||
        customer.phone?.toLowerCase().includes(searchTerm) ||
        customer.address?.toLowerCase().includes(searchTerm) ||
        customer.machineVoltage?.toLowerCase().includes(searchTerm)
      );
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  async function handleEdit(customer) {
    setExpandedCustomer(customer.id);
    setEditingCustomer(customer.id);
    setEditForm({
      name: customer.name || "",
      contactName: customer.contactName || "",
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

  function handleDelete(customer) {
    setPendingDelete(customer);
    setShowDeleteConfirm(true);
  }

  async function executeDelete() {
    if (!pendingDelete) return;

    try {
      const res = await fetch(`/api/accounts/${pendingDelete.id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      await loadCustomers();
      if (expandedCustomer === pendingDelete.id) {
        setExpandedCustomer(null);
      }
      setShowDeleteConfirm(false);
      setPendingDelete(null);
    } catch (err) {
      showNotif(`Failed to delete customer: ${err.message}`);
    }
  }

  function cancelDelete() {
    setShowDeleteConfirm(false);
    setPendingDelete(null);
  }

  if (!user) return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ef4444", marginBottom: 16 }}>
            Manage Customers
          </h1>
          
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Link href="/admin/customers/new" className="btn primary">Add Customer</Link>
          </div>

          <input
            type="text"
            placeholder="Search Customer Name / Contact / Email / Phone / Address"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "rgba(255, 255, 255, 0.9)",
              fontSize: "14px"
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444"
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
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    padding: "20px",
                    background: "rgba(255, 255, 255, 0.03)"
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
                      <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", color: "rgba(255, 255, 255, 0.9)" }}>
                        {customer.name}
                        {customer.contactName && (
                          <span style={{ fontSize: "14px", fontWeight: "400", color: "rgba(255, 255, 255, 0.6)", marginLeft: "12px" }}>
                            (Contact: {customer.contactName})
                          </span>
                        )}
                      </h3>
                      <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)", display: "flex", gap: "20px", flexWrap: "wrap" }}>
                        {customer.email && <span>📧 {customer.email}</span>}
                        {customer.phone && <span>📞 {customer.phone}</span>}
                        {customer.machineVoltage && <span>⚡ {customer.machineVoltage}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(customer);
                        }}
                        style={{
                          padding: "6px 12px",
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "rgba(255, 255, 255, 0.9)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px"
                        }}
                        title="Edit customer"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(customer);
                        }}
                        style={{
                          padding: "6px 12px",
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "#ef4444",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px"
                        }}
                        title="Delete customer (permanent)"
                      >
                        ✕ Delete
                      </button>
                      <span style={{ color: "rgba(255, 255, 255, 0.6)", marginLeft: "8px" }}>
                        {expandedCustomer === customer.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {expandedCustomer === customer.id && (
                    <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
                      {editingCustomer === customer.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Customer Name
                            </label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Contact Name
                            </label>
                            <input
                              type="text"
                              value={editForm.contactName}
                              onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                              placeholder="Contact person's name (optional)"
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Email
                            </label>
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Address
                            </label>
                            <textarea
                              value={editForm.address}
                              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)",
                                minHeight: "60px"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Phone
                            </label>
                            <input
                              type="tel"
                              value={editForm.phone}
                              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Machine Voltage
                            </label>
                            <input
                              type="text"
                              value={editForm.machineVoltage}
                              onChange={(e) => setEditForm({ ...editForm, machineVoltage: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "rgba(255, 255, 255, 0.9)" }}>
                              Notes
                            </label>
                            <textarea
                              value={editForm.notes}
                              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)",
                                minHeight: "80px"
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                            <button
                              onClick={() => handleSave(customer.id)}
                              style={{
                                padding: "10px 20px",
                                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontWeight: "600"
                              }}
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={() => setEditingCustomer(null)}
                              style={{
                                padding: "10px 20px",
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.9)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                cursor: "pointer"
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                          {customer.contactName && (
                            <div>
                              <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Contact Name:</strong>
                              <p style={{ marginTop: "6px", color: "rgba(255, 255, 255, 0.9)" }}>{customer.contactName}</p>
                            </div>
                          )}
                          <div>
                            <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Address:</strong>
                            <p style={{ marginTop: "6px", color: "rgba(255, 255, 255, 0.9)" }}>{customer.address || "Not provided"}</p>
                          </div>
                          <div>
                            <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Phone:</strong>
                            <p style={{ marginTop: "6px", color: "rgba(255, 255, 255, 0.9)" }}>{customer.phone || "Not provided"}</p>
                          </div>
                          <div>
                            <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Machine Voltage:</strong>
                            <p style={{ marginTop: "6px", color: "rgba(255, 255, 255, 0.9)" }}>{customer.machineVoltage || "Not provided"}</p>
                          </div>
                          <div>
                            <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Email:</strong>
                            <p style={{ marginTop: "6px", color: "rgba(255, 255, 255, 0.9)" }}>{customer.email || "Not provided"}</p>
                          </div>
                          {customer.notes && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Notes:</strong>
                              <p style={{ marginTop: "6px", whiteSpace: "pre-wrap", color: "rgba(255, 255, 255, 0.9)" }}>{customer.notes}</p>
                            </div>
                          )}
                          <div style={{ gridColumn: "1 / -1" }}>
                            <strong style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>Created:</strong>
                            <p style={{ marginTop: "6px", color: "rgba(255, 255, 255, 0.9)" }}>
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

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && pendingDelete && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100
            }}
            onClick={cancelDelete}
          >
            <div
              style={{
                backgroundColor: "#1f1f1f",
                border: "1px solid #404040",
                borderRadius: "8px",
                padding: "2rem",
                maxWidth: "500px",
                width: "90%",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                Delete Customer
              </h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
                Are you sure you want to delete customer <strong>"{pendingDelete.name}"</strong>?
              </p>
              <div style={{
                padding: "1rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "6px",
                marginBottom: "1rem"
              }}>
                <p style={{ margin: "0", fontSize: "14px", color: "#ef4444" }}>
                  <strong>Warning:</strong> This action cannot be undone. All customer data will be permanently deleted.
                </p>
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button
                  onClick={cancelDelete}
                  style={{
                    background: "#2d2d2d",
                    color: "#fff",
                    border: "1px solid #404040",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Delete Customer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Toast */}
        {showNotification && (
          <div
            style={{
              position: "fixed",
              top: "100px",
              right: "24px",
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "1rem 1.5rem",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
              zIndex: 1200,
              maxWidth: "400px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "20px" }}>ℹ️</span>
              <span style={{ color: "#d1d5db", fontSize: "14px" }}>{notificationMessage}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
