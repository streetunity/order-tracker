"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  useEffect(() => {
    loadInvoices();
    loadCustomers();
  }, []);

  async function loadInvoices() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/invoices", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load invoices");
      }

      const data = await res.json();
      setInvoices(data);
    } catch (e) {
      console.error("Error loading invoices:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/customers", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCustomers(data.filter((c) => c.status === "ACTIVE"));
      }
    } catch (e) {
      console.error("Error loading customers:", e);
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.customer &&
        (invoice.customer.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.customer.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (invoice.customer.company &&
            invoice.customer.company.toLowerCase().includes(searchTerm.toLowerCase()))));

    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return <div className="loading-state">Loading invoices...</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="Search invoices..."
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
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="VIEWED">Viewed</option>
            <option value="PARTIAL">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button
            className="btn-primary"
            onClick={() => alert("Invoice builder coming soon!")}
          >
            + Create Invoice
          </button>
        </div>
      </div>

      <div className="invoicing-table-container">
        <table className="invoicing-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Due Date</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan="9">
                  <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <p>No invoices found</p>
                    <p style={{ fontSize: "14px", color: "#999", marginTop: "8px" }}>
                      Create your first invoice to get started
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => {
                const total = parseFloat(invoice.total);
                const paid = parseFloat(invoice.amountPaid);
                const balance = parseFloat(invoice.balanceDue);

                return (
                  <tr key={invoice.id}>
                    <td style={{ fontFamily: "monospace" }}>{invoice.invoiceNumber}</td>
                    <td>
                      {invoice.customer
                        ? `${invoice.customer.firstName} ${invoice.customer.lastName}${
                            invoice.customer.company ? ` (${invoice.customer.company})` : ""
                          }`
                        : "—"}
                    </td>
                    <td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                    <td>{new Date(invoice.dueDate).toLocaleDateString()}</td>
                    <td>${total.toFixed(2)}</td>
                    <td style={{ color: paid > 0 ? "#059669" : "#6b7280" }}>
                      ${paid.toFixed(2)}
                    </td>
                    <td style={{ color: balance > 0 ? "#dc2626" : "#6b7280", fontWeight: 500 }}>
                      ${balance.toFixed(2)}
                    </td>
                    <td>
                      <span className={`status-badge ${invoice.status.toLowerCase()}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-view">View</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
