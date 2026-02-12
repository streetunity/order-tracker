"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

export default function NewEstimateTemplatePage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    notes: "",
    internalNotes: "",
    termsConditions: "",
    validityDays: 30
  });

  // Items state
  const [items, setItems] = useState([]);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function searchProducts(query) {
    if (!query || query.length < 2) {
      setProductResults([]);
      return;
    }

    setSearchingProducts(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(query)}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setProductResults(data.slice(0, 10));
      }
    } catch (e) {
      console.error("Product search error:", e);
    } finally {
      setSearchingProducts(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(productSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  function handleAddProduct(product) {
    setItems([...items, {
      tempId: Date.now(),
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      quantity: 1
    }]);
    setProductSearch("");
    setProductResults([]);
  }

  function handleRemoveItem(tempId) {
    setItems(items.filter(i => i.tempId !== tempId));
  }

  function handleUpdateItemQuantity(tempId, quantity) {
    setItems(items.map(i =>
      i.tempId === tempId ? { ...i, quantity: parseInt(quantity) || 1 } : i
    ));
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      setError("Template name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        ...formData,
        items: items.map((item, index) => ({
          productId: item.productId,
          quantity: item.quantity,
          sortOrder: index
        }))
      };

      const res = await fetch("/api/estimate-templates", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create template");
      }

      const template = await res.json();
      router.push(`/invoicing/estimate-templates/${template.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const estimatedTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    outline: "none",
    width: "100%"
  };

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 6
  };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <Link
              href="/invoicing/estimate-templates"
              style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", textDecoration: "none", marginBottom: 8, display: "inline-block" }}
            >
              &larr; Back to Templates
            </Link>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 4 }}>
              New Estimate Template
            </h1>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => router.push("/invoicing/estimate-templates")}
              style={{
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                opacity: saving ? 0.5 : 1
              }}
            >
              {saving ? "Saving..." : "Create Template"}
            </button>
          </div>
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
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
          {/* Main Content */}
          <div>
            {/* Template Details */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              padding: 24,
              marginBottom: 24
            }}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 20 }}>
                Template Details
              </h2>

              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Standard Machine Package"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of what this template includes"
                    style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Validity Period (days)</label>
                  <input
                    type="number"
                    value={formData.validityDays}
                    onChange={(e) => setFormData({ ...formData, validityDays: parseInt(e.target.value) || 30 })}
                    style={{ ...inputStyle, maxWidth: 120 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Notes (shown on estimate)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notes that will appear on estimates created from this template"
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Internal Notes (not shown to customer)</label>
                  <textarea
                    value={formData.internalNotes}
                    onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                    placeholder="Internal notes for your team"
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Terms & Conditions</label>
                  <textarea
                    value={formData.termsConditions}
                    onChange={(e) => setFormData({ ...formData, termsConditions: e.target.value })}
                    placeholder="Default terms and conditions"
                    style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                  />
                </div>
              </div>
            </div>

            {/* Template Items */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              padding: 24
            }}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 20 }}>
                Template Items
              </h2>

              {/* Add Product Search */}
              <div style={{ position: "relative", marginBottom: 20 }}>
                <input
                  type="text"
                  placeholder="Search products to add..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  style={inputStyle}
                />
                {productResults.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    marginTop: 4,
                    maxHeight: 300,
                    overflow: "auto",
                    zIndex: 100
                  }}>
                    {productResults.map(product => (
                      <div
                        key={product.id}
                        onClick={() => handleAddProduct(product)}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <div>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>{product.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>{product.sku}</div>
                        </div>
                        <div style={{ color: "#dc2626", fontWeight: "600" }}>
                          {formatCurrency(product.price)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Items Table */}
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.5)" }}>
                  No items added yet. Search above to add products.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <th style={{ padding: "10px 0", textAlign: "left", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Item</th>
                      <th style={{ padding: "10px 0", textAlign: "center", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", width: 100 }}>Qty</th>
                      <th style={{ padding: "10px 0", textAlign: "right", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", width: 100 }}>Price</th>
                      <th style={{ padding: "10px 0", textAlign: "right", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", width: 100 }}>Total</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.tempId} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "12px 0" }}>
                          <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{item.sku}</div>}
                        </td>
                        <td style={{ padding: "12px 0", textAlign: "center" }}>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQuantity(item.tempId, e.target.value)}
                            style={{
                              ...inputStyle,
                              width: 70,
                              textAlign: "center",
                              padding: "6px 8px"
                            }}
                          />
                        </td>
                        <td style={{ padding: "12px 0", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>
                          {formatCurrency(item.price)}
                        </td>
                        <td style={{ padding: "12px 0", textAlign: "right", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                          {formatCurrency(item.price * item.quantity)}
                        </td>
                        <td style={{ padding: "12px 0", textAlign: "right" }}>
                          <button
                            onClick={() => handleRemoveItem(item.tempId)}
                            style={{
                              padding: "4px 8px",
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: "16px"
                            }}
                            title="Remove item"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Summary Card */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              padding: 24,
              position: "sticky",
              top: 100
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Summary
              </h3>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Items</span>
                  <span style={{ color: "rgba(255,255,255,0.9)" }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Validity</span>
                  <span style={{ color: "rgba(255,255,255,0.9)" }}>{formData.validityDays} days</span>
                </div>
              </div>

              <div style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "16px 0",
                borderTop: "1px solid rgba(255,255,255,0.05)"
              }}>
                <span style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>Estimated Total</span>
                <span style={{ fontSize: "20px", fontWeight: "700", color: "#dc2626" }}>
                  {formatCurrency(estimatedTotal)}
                </span>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  opacity: saving ? 0.5 : 1,
                  marginTop: 16
                }}
              >
                {saving ? "Creating..." : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
