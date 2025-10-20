"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function NewOrderPage() {
  const router = useRouter();
  const { user, getAuthHeaders, isAdmin, logout } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    accountId: "",
    poNumber: "",
    salesPerson: "",
    orderDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    loadData();
  }, [user]);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([loadAccounts(), loadUsers()]);
    } catch (e) {
      setError("Failed to load data: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/accounts", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (e) {
      console.error("Failed to load accounts:", e);
      setError("Failed to load customer accounts");
    }
  }

  async function loadUsers() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/users/sales-reps", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        // If not admin or error, just use current user if they can be a sales rep
        if (user.name !== "Admin User") {
          setUsers([{ id: user.id, name: user.name, email: user.email }]);
        } else {
          setUsers([]);
        }
        return;
      }
      const data = await res.json();
      // Data is already filtered to active users with canBeSalesRep: true
      const sortedUsers = (Array.isArray(data) ? data : [])
        .sort((a, b) => a.name.localeCompare(b.name));
      setUsers(sortedUsers);
    } catch (e) {
      console.error("Failed to load users:", e);
      if (user.name !== "Admin User") {
        setUsers([{ id: user.id, name: user.name, email: user.email }]);
      } else {
        setUsers([]);
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.accountId) {
      setError("Please select a customer");
      return;
    }

    if (!formData.orderDate) {
      setError("Please enter an order date");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          accountId: formData.accountId,
          poNumber: formData.poNumber.trim() || null,
          sku: formData.salesPerson || null, // Sales person stored in sku field
          orderDate: formData.orderDate
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create order");
      }

      const order = await res.json();
      router.push(`/admin/orders/${order.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        color: '#a0a0a0'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: 16 }}>
      <header className="header" style={{ position: "static", paddingLeft: 0, paddingRight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="h1">Add New Order</h1>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {user?.name} ({user?.role})
            </span>
            {isAdmin && (
              <Link href="/admin/users" className="btn">
                Manage Users
              </Link>
            )}
            <Link href="/admin/orders" className="btn">Back to Orders</Link>
            <Link href="/admin/board" className="btn">Back to Board</Link>
            <button 
              onClick={logout} 
              className="btn"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div style={{
          padding: "12px",
          marginBottom: "16px",
          backgroundColor: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: "6px",
          color: "#fecaca"
        }}>
          {error}
        </div>
      )}

      <div style={{
        backgroundColor: "#2d2d2d",
        border: "1px solid #404040",
        borderRadius: "8px",
        padding: "24px",
        marginTop: "16px"
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              marginBottom: "8px",
              color: "#e4e4e4"
            }}>
              Customer *
            </label>
            <select
              className="input"
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              required
              style={{ width: "100%" }}
            >
              <option value="">Select a customer</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              marginBottom: "8px",
              color: "#e4e4e4"
            }}>
              Order Date *
            </label>
            <input
              type="date"
              className="input"
              value={formData.orderDate}
              onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
              required
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
              This date is used for ETA calculations and sales reports
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              marginBottom: "8px",
              color: "#e4e4e4"
            }}>
              PO Number
            </label>
            <input
              type="text"
              className="input"
              value={formData.poNumber}
              onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
              placeholder="Optional"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              marginBottom: "8px",
              color: "#e4e4e4"
            }}>
              Sales Person
            </label>
            <select
              className="input"
              value={formData.salesPerson}
              onChange={(e) => setFormData({ ...formData, salesPerson: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="">Select sales person (optional)</option>
              {users.map(u => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
            <Link href="/admin/orders" className="btn">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn primary"
              disabled={saving}
            >
              {saving ? "Creating..." : "Create Order"}
            </button>
          </div>
        </form>
      </div>

      <div style={{
        marginTop: "16px",
        padding: "12px",
        backgroundColor: "#1a1a1a",
        border: "1px solid #404040",
        borderRadius: "6px",
        fontSize: "13px",
        color: "#a0a0a0"
      }}>
        <strong style={{ color: "#e4e4e4" }}>Note:</strong> After creating the order, you'll be taken to the order details page where you can add items, set measurements, and manage the order.
      </div>
    </div>
  );
}
