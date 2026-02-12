"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

export default function NewBundlePage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    price: "",
    cost: ""
  });

  const [bundleItems, setBundleItems] = useState([]);

  // Calculate totals
  const componentPrice = bundleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const componentCost = bundleItems.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
  const bundlePrice = parseFloat(formData.price) || 0;
  const savings = componentPrice - bundlePrice;
  const savingsPercent = componentPrice > 0 ? ((savings / componentPrice) * 100).toFixed(2) : 0;

  // Margin calculation
  const margin = bundlePrice && formData.cost
    ? bundlePrice - parseFloat(formData.cost)
    : (bundlePrice && componentCost > 0 ? bundlePrice - componentCost : null);
  const marginPercent = margin !== null && bundlePrice > 0
    ? ((margin / bundlePrice) * 100).toFixed(2)
    : null;

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadProducts();
  }, [user, router]);

  async function loadProducts() {
    try {
      const res = await fetch("/api/products", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.filter(p => p.isActive));
      }
    } catch (e) {
      console.error("Error loading products:", e);
    }
  }

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const results = products.filter(p =>
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, products]);

  function addProduct(product) {
    const existing = bundleItems.find(item => item.productId === product.id);
    if (existing) {
      setBundleItems(bundleItems.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setBundleItems([...bundleItems, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        cost: product.cost,
        quantity: 1
      }]);
    }
    setSearchTerm("");
    setSearchResults([]);
  }

  function updateQuantity(productId, quantity) {
    if (quantity < 1) {
      removeProduct(productId);
    } else {
      setBundleItems(bundleItems.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ));
    }
  }

  function removeProduct(productId) {
    setBundleItems(bundleItems.filter(item => item.productId !== productId));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (bundleItems.length === 0) {
      setError("Add at least one product to the bundle");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          ...formData,
          items: bundleItems.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      router.push(`/invoicing/bundles/${data.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px"
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)"
  };

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: 24,
    marginBottom: 24
  };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/invoicing/bundles"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}
          >
            ← Back to Bundles
          </Link>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
            New Bundle
          </h1>
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

        <form onSubmit={handleSubmit}>
          {/* Basic Information */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Bundle Information
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Short Name (SKU) *</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                  style={inputStyle}
                  required
                  placeholder="e.g. SL3015-6K-PKG"
                />
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                  Appears on tracking board when order is created
                </p>
              </div>
              <div>
                <label style={labelStyle}>Bundle Price ($) *</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  style={inputStyle}
                  required
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Bundle Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={inputStyle}
                  required
                  placeholder="SL3015 DIY + 6K Laser Package"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                  placeholder="Bundle description..."
                />
              </div>
              <div>
                <label style={labelStyle}>Bundle Cost ($)</label>
                <input
                  type="number"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  style={inputStyle}
                  placeholder="Leave blank to use component costs"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Bundle Items */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              Bundle Items
            </h2>

            {/* Product Search */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <label style={labelStyle}>Add Product</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={inputStyle}
                placeholder="Search products by SKU or name..."
              />
              {searchResults.length > 0 && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "#1a1a1a",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  marginTop: 4,
                  zIndex: 10,
                  maxHeight: "200px",
                  overflow: "auto"
                }}>
                  {searchResults.map(product => (
                    <div
                      key={product.id}
                      onClick={() => addProduct(product)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "14px" }}>{product.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", fontFamily: "monospace" }}>{product.sku}</div>
                      </div>
                      <div style={{ color: "#dc2626", fontWeight: "600" }}>${product.price?.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Items List */}
            {bundleItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.4)" }}>
                Search and add products above
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bundleItems.map((item) => (
                  <div
                    key={item.productId}
                    style={{
                      padding: "12px 14px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>{item.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", fontFamily: "monospace" }}>{item.sku}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
                        ${item.price?.toLocaleString()} each
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          style={{
                            width: 28,
                            height: 28,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "4px",
                            color: "rgba(255, 255, 255, 0.9)",
                            cursor: "pointer"
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 1)}
                          style={{
                            width: 50,
                            padding: "4px 8px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "4px",
                            color: "rgba(255, 255, 255, 0.9)",
                            textAlign: "center",
                            fontSize: "14px"
                          }}
                          min="1"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          style={{
                            width: 28,
                            height: 28,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "4px",
                            color: "rgba(255, 255, 255, 0.9)",
                            cursor: "pointer"
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600", minWidth: 80, textAlign: "right" }}>
                        ${(item.price * item.quantity).toLocaleString()}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProduct(item.productId)}
                        style={{
                          padding: "4px 8px",
                          background: "transparent",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "4px",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {/* Totals */}
                <div style={{
                  marginTop: 16,
                  padding: 16,
                  background: "rgba(0, 0, 0, 0.2)",
                  borderRadius: "8px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Components Total:</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>${componentPrice.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Bundle Price:</span>
                    <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "18px" }}>
                      ${bundlePrice.toLocaleString()}
                    </span>
                  </div>
                  {bundlePrice > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Customer Savings:</span>
                        <span style={{ color: savings > 0 ? "#22c55e" : "rgba(255,255,255,0.5)" }}>
                          {savings > 0 ? `$${savings.toLocaleString()} (${savingsPercent}%)` : '—'}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Margin:</span>
                        <span style={{
                          color: marginPercent !== null
                            ? (parseFloat(marginPercent) > 30 ? "#22c55e" : parseFloat(marginPercent) > 15 ? "#eab308" : "#ef4444")
                            : "rgba(255,255,255,0.5)"
                        }}>
                          {marginPercent !== null ? `$${margin?.toFixed(2)} (${marginPercent}%)` : '—'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Link
              href="/invoicing/bundles"
              style={{
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                textDecoration: "none",
                fontSize: "14px"
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || bundleItems.length === 0}
              style={{
                padding: "10px 24px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                cursor: loading || bundleItems.length === 0 ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: loading || bundleItems.length === 0 ? 0.7 : 1
              }}
            >
              {loading ? "Creating..." : "Create Bundle"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
