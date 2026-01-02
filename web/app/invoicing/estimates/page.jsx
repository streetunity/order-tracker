"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  useEffect(() => {
    loadEstimates();
    loadCustomers();
  }, []);

  async function loadEstimates() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/estimates", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load estimates");
      }

      const data = await res.json();
      setEstimates(data);
    } catch (e) {
      console.error("Error loading estimates:", e);
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

  const filteredEstimates = estimates.filter((estimate) => {
    const matchesStatus = statusFilter === "all" || estimate.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      estimate.estimateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (estimate.customer &&
        (estimate.customer.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          estimate.customer.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (estimate.customer.company &&
            estimate.customer.company.toLowerCase().includes(searchTerm.toLowerCase()))));

    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return <div className="loading-state">Loading estimates...</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="Search estimates..."
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
            <option value="ACCEPTED">Accepted</option>
            <option value="DECLINED">Declined</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button
            className="btn-primary"
            onClick={() => alert("Estimate builder coming soon!")}
          >
            + Create Estimate
          </button>
        </div>
      </div>

      <div className="invoicing-table-container">
        <table className="invoicing-table">
          <thead>
            <tr>
              <th>Estimate #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Expiry Date</th>
              <th>Total</th>
              <th>Items</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEstimates.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">
                    <div className="empty-state-icon">📄</div>
                    <p>No estimates found</p>
                    <p style={{ fontSize: "14px", color: "#999", marginTop: "8px" }}>
                      Create your first estimate to get started
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredEstimates.map((estimate) => (
                <tr key={estimate.id}>
                  <td style={{ fontFamily: "monospace" }}>{estimate.estimateNumber}</td>
                  <td>
                    {estimate.customer
                      ? `${estimate.customer.firstName} ${estimate.customer.lastName}${
                          estimate.customer.company ? ` (${estimate.customer.company})` : ""
                        }`
                      : "—"}
                  </td>
                  <td>{new Date(estimate.estimateDate).toLocaleDateString()}</td>
                  <td>{new Date(estimate.expiryDate).toLocaleDateString()}</td>
                  <td>${parseFloat(estimate.total).toFixed(2)}</td>
                  <td>{estimate._count?.items || 0}</td>
                  <td>
                    <span className={`status-badge ${estimate.status.toLowerCase()}`}>
                      {estimate.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-view">View</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
