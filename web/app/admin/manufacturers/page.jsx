"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import Link from "next/link";

export default function ManageManufacturersPage() {
  const { user, getAuthHeaders, isAdmin } = useAuth();
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    contactInfo: "",
    notes: "",
    createUserAccount: false,
    email: "",
    password: ""
  });

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (!isAdmin) {
      router.push("/admin/board");
    }
  }, [user, isAdmin, router]);

  async function loadManufacturers() {
    try {
      setLoading(true);
      const res = await fetch("/api/manufacturers", {
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setManufacturers(data);
      setErr("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user && isAdmin) {
      loadManufacturers();
    }
  }, [user, isAdmin]);

  function resetForm() {
    setFormData({
      name: "",
      contactInfo: "",
      notes: "",
      createUserAccount: false,
      email: "",
      password: ""
    });
  }

  function openAddDialog() {
    resetForm();
    setShowAddDialog(true);
  }

  function openEditDialog(manufacturer) {
    setEditingManufacturer(manufacturer);
    setFormData({
      name: manufacturer.name,
      contactInfo: manufacturer.contactInfo || "",
      notes: manufacturer.notes || "",
      createUserAccount: false,
      email: "",
      password: ""
    });
    setShowEditDialog(true);
  }

  async function handleAdd(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Manufacturer name is required");
      return;
    }

    if (formData.createUserAccount) {
      if (!formData.email.trim()) {
        alert("Email is required when creating a user account");
        return;
      }
      if (formData.password.length < 8) {
        alert("Password must be at least 8 characters");
        return;
      }
    }

    try {
      setSaving(true);
      const res = await fetch("/api/manufacturers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setShowAddDialog(false);
      resetForm();
      await loadManufacturers();
      alert("Manufacturer added successfully");
    } catch (e) {
      alert(`Failed to add manufacturer: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Manufacturer name is required");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/manufacturers/${editingManufacturer.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          name: formData.name,
          contactInfo: formData.contactInfo,
          notes: formData.notes
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setShowEditDialog(false);
      setEditingManufacturer(null);
      resetForm();
      await loadManufacturers();
      alert("Manufacturer updated successfully");
    } catch (e) {
      alert(`Failed to update manufacturer: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(manufacturer) {
    if (!confirm(`Are you sure you want to ${manufacturer.isActive ? 'deactivate' : 'activate'} ${manufacturer.name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/manufacturers/${manufacturer.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          isActive: !manufacturer.isActive
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await loadManufacturers();
    } catch (e) {
      alert(`Failed to update manufacturer: ${e.message}`);
    }
  }

  async function handleDelete(manufacturer) {
    if (!confirm(`Are you sure you want to delete ${manufacturer.name}? This cannot be undone if the manufacturer has no assigned items.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/manufacturers/${manufacturer.id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await loadManufacturers();
      alert("Manufacturer deleted successfully");
    } catch (e) {
      alert(`Failed to delete manufacturer: ${e.message}`);
    }
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Manage Manufacturers</h1>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn primary" onClick={openAddDialog}>
              + Add Manufacturer
            </button>
            <Link href="/admin/board" className="btn">
              Back to Board
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="status">Loading manufacturers...</div>
        ) : err ? (
          <div className="status" style={{ color: "#dc2626" }}>
            Failed to load: {err}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact Info</th>
                  <th>Assigned Items</th>
                  <th>User Account</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {manufacturers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "#6b7280" }}>
                      No manufacturers yet. Click "Add Manufacturer" to create one.
                    </td>
                  </tr>
                ) : (
                  manufacturers.map((mfg) => (
                    <tr key={mfg.id}>
                      <td>
                        <strong>{mfg.name}</strong>
                        {mfg.notes && (
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                            {mfg.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: "14px" }}>
                        {mfg.contactInfo || "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {mfg._count?.orderItems || 0}
                      </td>
                      <td>
                        {mfg.user ? (
                          <div>
                            <div style={{ fontSize: "14px" }}>{mfg.user.email}</div>
                            {mfg.user.lastLogin && (
                              <div style={{ fontSize: "11px", color: "#6b7280" }}>
                                Last login: {new Date(mfg.user.lastLogin).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#6b7280" }}>No account</span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: mfg.isActive ? "#d1fae5" : "#fee2e2",
                            color: mfg.isActive ? "#065f46" : "#991b1b"
                          }}
                        >
                          {mfg.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn"
                            onClick={() => openEditDialog(mfg)}
                            style={{ fontSize: "12px", padding: "4px 8px" }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn"
                            onClick={() => handleToggleActive(mfg)}
                            style={{ fontSize: "12px", padding: "4px 8px" }}
                          >
                            {mfg.isActive ? "Deactivate" : "Activate"}
                          </button>
                          {mfg._count?.orderItems === 0 && (
                            <button
                              className="btn danger"
                              onClick={() => handleDelete(mfg)}
                              style={{ fontSize: "12px", padding: "4px 8px" }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Manufacturer Dialog */}
        {showAddDialog && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000
            }}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                padding: "24px",
                maxWidth: "500px",
                width: "90%",
                maxHeight: "90vh",
                overflowY: "auto"
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Add Manufacturer</h3>
              <form onSubmit={handleAdd}>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                    Name *
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Manufacturer company name"
                    style={{ width: "100%" }}
                    required
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                    Contact Info
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={formData.contactInfo}
                    onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                    placeholder="Phone, email, or other contact details"
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                    Notes
                  </label>
                  <textarea
                    className="input"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes about this manufacturer"
                    style={{ width: "100%", minHeight: "80px" }}
                  />
                </div>

                <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <input
                      type="checkbox"
                      checked={formData.createUserAccount}
                      onChange={(e) => setFormData({ ...formData, createUserAccount: e.target.checked })}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span style={{ fontWeight: 500 }}>Create user account for this manufacturer</span>
                  </label>

                  {formData.createUserAccount && (
                    <>
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
                          Email *
                        </label>
                        <input
                          className="input"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="user@example.com"
                          style={{ width: "100%" }}
                          required={formData.createUserAccount}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
                          Password *
                        </label>
                        <input
                          className="input"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="Minimum 8 characters"
                          style={{ width: "100%" }}
                          required={formData.createUserAccount}
                          minLength={8}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setShowAddDialog(false);
                      resetForm();
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn primary" disabled={saving}>
                    {saving ? "Adding..." : "Add Manufacturer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Manufacturer Dialog */}
        {showEditDialog && editingManufacturer && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000
            }}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                padding: "24px",
                maxWidth: "500px",
                width: "90%"
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Edit Manufacturer</h3>
              <form onSubmit={handleEdit}>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                    Name *
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Manufacturer company name"
                    style={{ width: "100%" }}
                    required
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                    Contact Info
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={formData.contactInfo}
                    onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                    placeholder="Phone, email, or other contact details"
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                    Notes
                  </label>
                  <textarea
                    className="input"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes about this manufacturer"
                    style={{ width: "100%", minHeight: "80px" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setShowEditDialog(false);
                      setEditingManufacturer(null);
                      resetForm();
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
