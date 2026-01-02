"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingZipCode: "",
    billingCountry: "USA",
    sameAsBilling: true,
    taxExempt: false,
    paymentTerms: "NET30",
    status: "ACTIVE",
    notes: "",
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/customers", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load customers");
      }

      const data = await res.json();
      setCustomers(data);
    } catch (e) {
      console.error("Error loading customers:", e);
      setError("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingCustomer(null);
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      billingAddress: "",
      billingCity: "",
      billingState: "",
      billingZipCode: "",
      billingCountry: "USA",
      sameAsBilling: true,
      taxExempt: false,
      paymentTerms: "NET30",
      status: "ACTIVE",
      notes: "",
    });
    setError("");
    setShowModal(true);
  }

  function openEditModal(customer) {
    setEditingCustomer(customer);
    setFormData({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      company: customer.company || "",
      billingAddress: customer.billingAddress || "",
      billingCity: customer.billingCity || "",
      billingState: customer.billingState || "",
      billingZipCode: customer.billingZipCode || "",
      billingCountry: customer.billingCountry || "USA",
      sameAsBilling: customer.sameAsBilling ?? true,
      taxExempt: customer.taxExempt || false,
      paymentTerms: customer.paymentTerms || "NET30",
      status: customer.status || "ACTIVE",
      notes: customer.notes || "",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : "/api/customers";
      const method = editingCustomer ? "PUT" : "POST";

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
        throw new Error(errorData.error || "Failed to save customer");
      }

      await loadCustomers();
      setShowModal(false);
    } catch (e) {
      console.error("Error saving customer:", e);
      setError(e.message);
    }
  }

  async function handleDelete(customerId) {
    if (!confirm("Are you sure you want to delete this customer?")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to delete customer");

      await loadCustomers();
    } catch (e) {
      console.error("Error deleting customer:", e);
      alert("Failed to delete customer");
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      customer.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.company && customer.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
      customer.customerNumber.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return <div className="loading-state">Loading customers...</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="Search customers..."
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
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button className="btn-primary" onClick={openCreateModal}>
            + Add Customer
          </button>
        </div>
      </div>

      <div className="invoicing-table-container">
        <table className="invoicing-table">
          <thead>
            <tr>
              <th>Customer #</th>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Payment Terms</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div>
                    <p>No customers found</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td style={{ fontFamily: "monospace" }}>{customer.customerNumber}</td>
                  <td>
                    {customer.firstName} {customer.lastName}
                  </td>
                  <td>{customer.company || "—"}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone || "—"}</td>
                  <td>{customer.paymentTerms}</td>
                  <td>
                    <span className={`status-badge ${customer.status.toLowerCase()}`}>
                      {customer.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-edit" onClick={() => openEditModal(customer)}>
                        Edit
                      </button>
                      <button className="btn-delete" onClick={() => handleDelete(customer.id)}>
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
              <h2>{editingCustomer ? "Edit Customer" : "Add New Customer"}</h2>
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

                <div className="form-group">
                  <label>Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Terms</label>
                    <select
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    >
                      <option value="NET15">NET 15</option>
                      <option value="NET30">NET 30</option>
                      <option value="NET60">NET 60</option>
                      <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.taxExempt}
                      onChange={(e) => setFormData({ ...formData, taxExempt: e.target.checked })}
                    />
                    {" "}Tax Exempt
                  </label>
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
                  {editingCustomer ? "Update Customer" : "Create Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
