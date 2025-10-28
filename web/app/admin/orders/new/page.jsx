"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import OrderDetailsSection from "./components/OrderDetailsSection";
import ItemsSection from "./components/ItemsSection";
import DiscountSection from "./components/DiscountSection";
import { validateOrderForm } from "./components/FormValidation";
import { orderApi } from "./services/orderApi";

export default function NewOrderPage() {
  const router = useRouter();
  const { user, getAuthHeaders } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshingAccounts, setRefreshingAccounts] = useState(false);
  
  const [formData, setFormData] = useState({
    accountId: "",
    poNumber: "",
    salesPerson: "",
    customerDocsLink: "",
    orderDate: new Date().toISOString().split('T')[0],
    discount: ""
  });

  // Items to be added with the order
  const [items, setItems] = useState([
    { 
      name: "",
      qty: "",
      serialNumber: "",
      modelNumber: "",
      manufacturerId: "",
      voltage: "",
      power: "",
      notes: "",
      itemPrice: "",
      privateItemNote: "",
      hasExtendedShipping: false
    }
  ]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    loadData();
  }, [user]);

  // Auto-reload accounts when window gains focus (user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      if (user && !loading) {
        loadAccounts();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, loading]);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([loadAccounts(), loadUsers(), loadManufacturers()]);
    } catch (e) {
      setError("Failed to load data: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    if (!user) return;
    
    try {
      const data = await orderApi.loadAccounts(getAuthHeaders);
      setAccounts(data);
    } catch (e) {
      console.error("Failed to load accounts:", e);
      setError("Failed to load customer accounts");
    }
  }

  async function loadManufacturers() {
    if (!user) return;
    
    try {
      const data = await orderApi.loadManufacturers(getAuthHeaders);
      setManufacturers(data);
    } catch (e) {
      console.error("Failed to load manufacturers:", e);
    }
  }

  async function handleRefreshAccounts() {
    setRefreshingAccounts(true);
    try {
      await loadAccounts();
    } finally {
      setRefreshingAccounts(false);
    }
  }

  async function loadUsers() {
    if (!user) return;
    
    try {
      const data = await orderApi.loadSalesReps(getAuthHeaders);
      if (data.length === 0 && user.name !== "Admin User") {
        // If no sales reps returned and current user isn't admin, use current user
        setUsers([{ id: user.id, name: user.name, email: user.email }]);
      } else {
        // Sort users alphabetically
        const sortedUsers = data.sort((a, b) => a.name.localeCompare(b.name));
        setUsers(sortedUsers);
      }
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

    // Validate the form
    const validation = validateOrderForm(formData, items);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    try {
      setSaving(true);
      
      // Create order with items using the API service
      const result = await orderApi.createOrderWithItems(
        formData,
        validation.validItems,
        getAuthHeaders
      );

      // If any items failed to add, log them but still redirect
      if (result.failedItems.length > 0) {
        console.error("Some items failed to add:", result.failedItems);
      }

      router.push(`/admin/orders/${result.order.id}`);
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
    <>
      <TopNav />
      
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 16, paddingTop: 80 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "28px", fontWeight: "600", color: "#e4e4e4" }}>Add New Order</h1>
        </div>

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

        <form onSubmit={handleSubmit}>
          {/* Order Details Section */}
          <OrderDetailsSection
            formData={formData}
            setFormData={setFormData}
            accounts={accounts}
            users={users}
            refreshingAccounts={refreshingAccounts}
            handleRefreshAccounts={handleRefreshAccounts}
          />

          {/* Items Section */}
          <ItemsSection
            items={items}
            setItems={setItems}
            manufacturers={manufacturers}
          />

          {/* Discount Section */}
          <DiscountSection
            formData={formData}
            setFormData={setFormData}
          />

          {/* Submit Buttons */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
            <Link href="/admin/orders" className="btn">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn primary"
              disabled={saving}
            >
              {saving ? "Creating Order..." : "Create Order"}
            </button>
          </div>
        </form>

        <div style={{
          marginTop: "16px",
          padding: "12px",
          backgroundColor: "#1a1a1a",
          border: "1px solid #404040",
          borderRadius: "6px",
          fontSize: "13px",
          color: "#a0a0a0"
        }}>
          <strong style={{ color: "#e4e4e4" }}>Note:</strong> You can add multiple items with all details before creating the order. After creating the order, you can still add more items or edit existing ones on the order details page.
        </div>
      </div>
    </>
  );
}
