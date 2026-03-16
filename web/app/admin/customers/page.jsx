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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  function showNotif(message) {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  }

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  async function loadCustomers() {
    if (!user) return;
    try {
      setLoading(true);
      const res = await fetch("/api/accounts", { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCustomers(await res.json());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) loadCustomers(); }, [user]);

  const filteredCustomers = customers
    .filter(customer => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        customer.name?.toLowerCase().includes(s) ||
        customer.contactName?.toLowerCase().includes(s) ||
        customer.email?.toLowerCase().includes(s) ||
        customer.phone?.toLowerCase().includes(s) ||
        customer.address?.toLowerCase().includes(s) ||
        customer.machineVoltage?.toLowerCase().includes(s)
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
      notes: customer.notes || "",
      emailNotifications: customer.emailNotifications || false
    });
  }

  async function handleSave(customerId) {
    try {
      const res = await fetch(`/api/accounts/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCustomers();
      setEditingCustomer(null);
      showNotif("Customer updated successfully");
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    }
  }

  async function handleToggleEmail(customer) {
    try {
      const res = await fetch(`/api/accounts/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ emailNotifications: !customer.emailNotifications }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCustomers();
      showNotif(`Email notifications ${!customer.emailNotifications ? 'enabled' : 'disabled'} for ${customer.name}`);
    } catch (err) {
      showNotif(`Failed to update: ${err.message}`);
    }
  }

  function handleDelete(customer) { setPendingDelete(customer); setShowDeleteConfirm(true); }

  async function executeDelete() {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/accounts/${pendingDelete.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      await loadCustomers();
      if (expandedCustomer === pendingDelete.id) setExpandedCustomer(null);
      setShowDeleteConfirm(false);
      setPendingDelete(null);
    } catch (err) {
      showNotif(`Failed to delete customer: ${err.message}`);
    }
  }

  function cancelDelete() { setShowDeleteConfirm(false); setPendingDelete(null); }

  if (!user) return null;

  const toggleSwitchStyle = (isOn) => ({
    position: "relative", width: "44px", height: "24px", borderRadius: "12px",
    background: isOn ? "#dc2626" : "rgba(255,255,255,0.15)",
    cursor: "pointer", transition: "background 0.2s ease", border: "none", padding: 0, flexShrink: 0
  });
  const toggleKnobStyle = (isOn) => ({
    position: "absolute", top: "2px", left: isOn ? "22px" : "2px",
    width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
    transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
  });

  const INP = {
    width: "100%", padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.09)", borderRadius: "8px",
    background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.9)"
  };

  const btnOutlinedRed = {
    padding: "7px 16px", background: "rgba(220,38,38,0.08)",
    border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7,
    color: "#dc2626", textDecoration: "none", fontWeight: 600, fontSize: 13, display: "inline-block"
  };

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 24 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#fff", margin: 0, letterSpacing: "-0.3px" }}>
            Manage Customers
          </h1>
          <Link href="/admin/customers/new" style={btnOutlinedRed}>+ Add Customer</Link>
        </div>

        <input
          type="text"
          placeholder="Search Customer Name / Contact / Email / Phone / Address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px", marginBottom: 20, boxSizing: "border-box" }}
        />

        {error && (
          <div style={{ padding: "12px 16px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.3)", padding: "40px 0", textAlign: "center" }}>Loading customers&#8230;</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.3)", padding: "40px", textAlign: "center" }}>
                {q ? "No customers found matching your search" : "No customers yet"}
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <div key={customer.id} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, background: "#141414" }}>

                  {/* Row header */}
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", cursor: "pointer" }}
                    onClick={() => setExpandedCustomer(expandedCustomer === customer.id ? null : customer.id)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{customer.name}</span>
                        {customer.contactName && (
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Contact: {customer.contactName}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                        {customer.email && <span>&#128231; {customer.email}</span>}
                        {customer.phone && <span>&#128222; {customer.phone}</span>}
                        {customer.machineVoltage && <span>&#9889; {customer.machineVoltage}</span>}
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: customer.emailNotifications ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)", color: customer.emailNotifications ? "#22c55e" : "rgba(255,255,255,0.35)", border: `1px solid ${customer.emailNotifications ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}` }}>
                          {customer.emailNotifications ? "&#10003; Emails On" : "Emails Off"}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
                      <button onClick={(e) => { e.stopPropagation(); handleToggleEmail(customer); }} style={toggleSwitchStyle(customer.emailNotifications)} title={customer.emailNotifications ? "Disable email notifications" : "Enable email notifications"}>
                        <div style={toggleKnobStyle(customer.emailNotifications)} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(customer); }} style={{ padding: "5px 11px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Edit</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(customer); }} style={{ padding: "5px 11px", background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Delete</button>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{expandedCustomer === customer.id ? "&#9650;" : "&#9660;"}</span>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {expandedCustomer === customer.id && (
                    <div style={{ padding: "0 20px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {editingCustomer === customer.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16 }}>
                          {[
                            { label: "Customer Name", key: "name", type: "text" },
                            { label: "Contact Name", key: "contactName", type: "text", placeholder: "Contact person's name (optional)" },
                            { label: "Email", key: "email", type: "email" },
                            { label: "Phone", key: "phone", type: "tel" },
                            { label: "Machine Voltage", key: "machineVoltage", type: "text" },
                          ].map(({ label, key, type, placeholder }) => (
                            <div key={key}>
                              <label style={{ display: "block", marginBottom: 5, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</label>
                              <input type={type} value={editForm[key]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} placeholder={placeholder} style={INP} />
                            </div>
                          ))}
                          <div>
                            <label style={{ display: "block", marginBottom: 5, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Address</label>
                            <textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} style={{ ...INP, minHeight: 60, resize: "vertical" }} />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: 5, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Notes</label>
                            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} style={{ ...INP, minHeight: 80, resize: "vertical" }} />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>Email Notifications</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Send order stage update emails to this customer</div>
                            </div>
                            <button type="button" onClick={() => setEditForm({ ...editForm, emailNotifications: !editForm.emailNotifications })} style={toggleSwitchStyle(editForm.emailNotifications)}>
                              <div style={toggleKnobStyle(editForm.emailNotifications)} />
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => handleSave(customer.id)} style={{ padding: "9px 20px", background: "#dc2626", color: "white", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Save Changes</button>
                            <button onClick={() => setEditingCustomer(null)} style={{ padding: "9px 20px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 16 }}>
                          {customer.contactName && (
                            <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Contact Name</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.contactName}</div></div>
                          )}
                          <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Address</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.address || "Not provided"}</div></div>
                          <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Phone</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.phone || "Not provided"}</div></div>
                          <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Machine Voltage</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.machineVoltage || "Not provided"}</div></div>
                          <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Email</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{customer.email || "Not provided"}</div></div>
                          <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Email Notifications</div><div style={{ fontSize: 13, color: customer.emailNotifications ? "#22c55e" : "rgba(255,255,255,0.4)" }}>{customer.emailNotifications ? "Enabled" : "Disabled"}</div></div>
                          {customer.notes && (
                            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Notes</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, whiteSpace: "pre-wrap" }}>{customer.notes}</div></div>
                          )}
                          <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Created</div><div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{new Date(customer.createdAt).toLocaleDateString()}</div></div>
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
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={cancelDelete}>
            <div style={{ backgroundColor: "#1f1f1f", border: "1px solid #404040", borderRadius: 8, padding: "2rem", maxWidth: 500, width: "90%", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginTop: 0, marginBottom: "1rem" }}>Delete Customer</h3>
              <p style={{ fontSize: 14, marginBottom: "1rem", color: "#d1d5db" }}>Are you sure you want to delete <strong>"{pendingDelete.name}"</strong>?</p>
              <div style={{ padding: "1rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, marginBottom: "1rem" }}>
                <p style={{ margin: 0, fontSize: 14, color: "#ef4444" }}><strong>Warning:</strong> This action cannot be undone.</p>
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button onClick={cancelDelete} style={{ background: "#2d2d2d", color: "#fff", border: "1px solid #404040", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>Cancel</button>
                <button onClick={executeDelete} style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "0.5rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>Delete Customer</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {showNotification && (
          <div style={{ position: "fixed", top: 80, right: 24, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "12px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 1200, maxWidth: 380 }}>
            <span style={{ color: "#d1d5db", fontSize: 13 }}>{notificationMessage}</span>
          </div>
        )}
      </div>
    </>
  );
}
