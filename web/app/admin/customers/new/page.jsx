"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function NewCustomerPage() {
  const router = useRouter();
  const { user, getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    email: "",
    address: "",
    phone: "",
    machineVoltage: "",
    notes: ""
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      router.push("/admin/customers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
      setLoading(false);
    }
  }

  // Don't render content until authentication is checked
  if (!user) {
    return null;
  }

  return (
    <>
      <TopNav />
      
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 16, paddingTop: 80 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "28px", fontWeight: "600", color: "#e4e4e4" }}>Add Customer</h1>
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Customer Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4"
              }}
              placeholder="Enter customer/company name"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Contact Name
            </label>
            <input
              type="text"
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4"
              }}
              placeholder="Contact person's name (optional)"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4"
              }}
              placeholder="customer@example.com"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Address
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4",
                minHeight: "80px",
                resize: "vertical"
              }}
              placeholder="Enter customer address"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4"
              }}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Machine Voltage
            </label>
            <input
              type="text"
              value={formData.machineVoltage}
              onChange={(e) => setFormData({ ...formData, machineVoltage: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4"
              }}
              placeholder="e.g., 220V, 380V, 480V"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "500", color: "#e4e4e4" }}>
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #404040",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#383838",
                color: "#e4e4e4",
                minHeight: "100px",
                resize: "vertical"
              }}
              placeholder="Any additional notes about the customer..."
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? "Creating..." : "Create Customer"}
            </button>
            <Link
              href="/admin/customers"
              style={{
                padding: "10px 20px",
                backgroundColor: "#2d2d2d",
                color: "#e4e4e4",
                border: "1px solid #404040",
                borderRadius: "6px",
                textDecoration: "none",
                display: "inline-block"
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
