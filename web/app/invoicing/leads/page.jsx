"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const [formData, setFormData] = useState({
    source: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "USA",
    interestedIn: "",
    notes: "",
    status: "NEW",
  });

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/leads", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load leads");
      }

      const data = await res.json();
      setLeads(data);
    } catch (e) {
      console.error("Error loading leads:", e);
      setError("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingLead(null);
    setFormData({
      source: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "USA",
      interestedIn: "",
      notes: "",
      status: "NEW",
    });
    setError("");
    setShowModal(true);
  }

  function openEditModal(lead) {
    setEditingLead(lead);
    setFormData({
      source: lead.source || "",
      firstName: lead.firstName || "",
      lastName: lead.lastName || "",
      email: lead.email || "",
      phone: lead.phone || "",
      company: lead.company || "",
      address: lead.address || "",
      city: lead.city || "",
      state: lead.state || "",
      zipCode: lead.zipCode || "",
      country: lead.country || "USA",
      interestedIn: lead.interestedIn || "",
      notes: lead.notes || "",
      status: lead.status || "NEW",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.source) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const url = editingLead ? `/api/leads/${editingLead.id}` : "/api/leads";
      const method = editingLead ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save lead");
      }

      await loadLeads();
      setShowModal(false);
    } catch (e) {
      console.error("Error saving lead:", e);
      setError(e.message);
    }
  }

  async function handleDelete(leadId) {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to delete lead");

      await loadLeads();
    } catch (e) {
      console.error("Error deleting lead:", e);
      alert("Failed to delete lead");
    }
  }

  const filteredLeads = leads.filter((lead) => {
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      lead.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return <div className="loading-state">Loading leads...</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="Search leads..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="CONVERTED">Converted</option>
            <option value="LOST">Lost</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button className="btn-primary" onClick={openCreateModal}>
            + Add Lead
          </button>
        </div>
      </div>

      <div className="invoicing-table-container">
        <table className="invoicing-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Source</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <p>No leads found</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    {lead.firstName} {lead.lastName}
                  </td>
                  <td>{lead.company || "—"}</td>
                  <td>{lead.email}</td>
                  <td>{lead.phone || "—"}</td>
                  <td>{lead.source}</td>
                  <td>
                    <span className={`status-badge ${lead.status.toLowerCase()}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td>{lead.assignedTo ? lead.assignedTo.name : "Unassigned"}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-edit" onClick={() => openEditModal(lead)}>
                        Edit
                      </button>
                      <button className="btn-delete" onClick={() => handleDelete(lead.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingLead ? "Edit Lead" : "Add New Lead"}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="error-message">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label>First Name *</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name *</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Company</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Source *</label>
                    <select
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      required
                    >
                      <option value="">Select source...</option>
                      <option value="website">Website</option>
                      <option value="referral">Referral</option>
                      <option value="facebook">Facebook</option>
                      <option value="google">Google Ads</option>
                      <option value="email">Email Campaign</option>
                      <option value="phone">Phone Call</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="NEW">New</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Interested In</label>
                  <input
                    type="text"
                    value={formData.interestedIn}
                    onChange={(e) => setFormData({ ...formData, interestedIn: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingLead ? "Update Lead" : "Create Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
