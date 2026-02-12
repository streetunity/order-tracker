"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

export default function EstimateTemplateDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Edit form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    notes: "",
    internalNotes: "",
    termsConditions: "",
    validityDays: 30,
    isActive: true
  });

  // Product search for adding items
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadTemplate();
  }, [user, router, id]);

  async function loadTemplate() {
    try {
      const res = await fetch(`/api/estimate-templates/${id}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Template not found");
          return;
        }
        throw new Error("Failed to load template");
      }

      const data = await res.json();
      setTemplate(data);
      setFormData({
        name: data.name || "",
        description: data.description || "",
        notes: data.notes || "",
        internalNotes: data.internalNotes || "",
        termsConditions: data.termsConditions || "",
        validityDays: data.validityDays || 30,
        isActive: data.isActive !== false
      });
    } catch (e) {
      console.error("Error loading template:", e);
      setError("Failed to load template");
    } finally {
      setLoading(false);
    }
  }

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

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/estimate-templates/${id}`, {
        method: "PATCH",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const updated = await res.json();
      setTemplate(updated);
      setEditMode(false);
      setSuccess("Template saved successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProduct(product) {
    try {
      const res = await fetch(`/api/estimate-templates/${id}/items`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productId: product.id,
          quantity: 1
        })
      });

      if (!res.ok) {
        throw new Error("Failed to add product");
      }

      setProductSearch("");
      setProductResults([]);
      loadTemplate();
      setSuccess("Product added");
      setTimeout(() => setSuccess(""), 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  function showConfirm(title, message, onConfirm) {
    setConfirmConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  }

  function confirmRemoveItem(itemId) {
    showConfirm("Remove Item", "Remove this item from the template?", () => handleRemoveItem(itemId));
  }

  async function handleRemoveItem(itemId) {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/estimate-templates/${id}/items/${itemId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error("Failed to remove item");
      }

      loadTemplate();
    } catch (e) {
      setError(e.message);
    }
  }

  function confirmDeleteTemplate() {
    showConfirm("Delete Template", "Are you sure you want to delete this template? This will mark it as inactive.", () => handleDelete());
  }

  async function handleDelete() {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/estimate-templates/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error("Failed to delete template");
      }

      router.push("/invoicing/estimate-templates");
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCreateEstimate() {
    router.push(`/invoicing/estimates/new?templateId=${id}`);
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

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

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading template...
          </div>
        </div>
      </>
    );
  }

  if (!template) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{
            padding: "40px",
            textAlign: "center",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "12px"
          }}>
            <p style={{ color: "#ef4444", marginBottom: 16 }}>{error || "Template not found"}</p>
            <Link href="/invoicing/estimate-templates" style={{ color: "#dc2626" }}>
              Back to templates
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Calculate estimated total
  const estimatedTotal = template.items?.reduce((sum, item) => {
    const price = item.product?.price || item.bundle?.price || item.customPrice || 0;
    return sum + (price * (item.quantity || 1));
  }, 0) || 0;

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
              {template.name}
            </h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {!template.isActive && (
                <span style={{
                  padding: "2px 8px",
                  background: "rgba(156, 163, 175, 0.1)",
                  border: "1px solid rgba(156, 163, 175, 0.3)",
                  borderRadius: "4px",
                  fontSize: "11px",
                  color: "#9ca3af"
                }}>
                  Inactive
                </span>
              )}
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
                {template.items?.length || 0} items
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleCreateEstimate}
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              Create Estimate
            </button>
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
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
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: "10px 20px",
                    background: "#22c55e",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setFormData({
                      name: template.name || "",
                      description: template.description || "",
                      notes: template.notes || "",
                      internalNotes: template.internalNotes || "",
                      termsConditions: template.termsConditions || "",
                      validityDays: template.validityDays || 30,
                      isActive: template.isActive !== false
                    });
                  }}
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
              </>
            )}
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

        {success && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "8px",
            color: "#22c55e"
          }}>
            {success}
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

              {editMode ? (
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Validity (days)</label>
                      <input
                        type="number"
                        value={formData.validityDays}
                        onChange={(e) => setFormData({ ...formData, validityDays: parseInt(e.target.value) || 30 })}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", paddingTop: 24 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          style={{ width: 16, height: 16 }}
                        />
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>Active</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Notes (shown on estimate)</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Internal Notes (not shown)</label>
                    <textarea
                      value={formData.internalNotes}
                      onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                      style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Terms & Conditions</label>
                    <textarea
                      value={formData.termsConditions}
                      onChange={(e) => setFormData({ ...formData, termsConditions: e.target.value })}
                      style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {template.description && (
                    <div>
                      <label style={labelStyle}>Description</label>
                      <p style={{ color: "rgba(255,255,255,0.8)", margin: 0 }}>{template.description}</p>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Validity Period</label>
                      <p style={{ color: "rgba(255,255,255,0.8)", margin: 0 }}>{template.validityDays || 30} days</p>
                    </div>
                    <div>
                      <label style={labelStyle}>Status</label>
                      <p style={{ color: template.isActive ? "#22c55e" : "#9ca3af", margin: 0 }}>
                        {template.isActive ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>
                  {template.notes && (
                    <div>
                      <label style={labelStyle}>Notes</label>
                      <p style={{ color: "rgba(255,255,255,0.8)", margin: 0, whiteSpace: "pre-wrap" }}>{template.notes}</p>
                    </div>
                  )}
                  {template.internalNotes && (
                    <div>
                      <label style={labelStyle}>Internal Notes</label>
                      <p style={{ color: "rgba(255,255,255,0.6)", margin: 0, whiteSpace: "pre-wrap", fontStyle: "italic" }}>{template.internalNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Template Items */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              padding: 24
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", margin: 0 }}>
                  Template Items
                </h2>
              </div>

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
              {template.items?.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.5)" }}>
                  No items in this template. Search above to add products.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <th style={{ padding: "10px 0", textAlign: "left", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Item</th>
                      <th style={{ padding: "10px 0", textAlign: "center", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", width: 80 }}>Qty</th>
                      <th style={{ padding: "10px 0", textAlign: "right", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", width: 100 }}>Price</th>
                      <th style={{ padding: "10px 0", textAlign: "right", fontSize: "11px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", width: 100 }}>Total</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.items?.map((item) => {
                      const name = item.product?.name || item.bundle?.name || item.customName || "Unknown";
                      const sku = item.product?.sku || item.bundle?.sku || "";
                      const price = item.product?.price || item.bundle?.price || item.customPrice || 0;
                      const total = price * (item.quantity || 1);

                      return (
                        <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "12px 0" }}>
                            <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{name}</div>
                            {sku && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{sku}</div>}
                          </td>
                          <td style={{ padding: "12px 0", textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
                            {item.quantity || 1}
                          </td>
                          <td style={{ padding: "12px 0", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>
                            {formatCurrency(price)}
                          </td>
                          <td style={{ padding: "12px 0", textAlign: "right", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                            {formatCurrency(total)}
                          </td>
                          <td style={{ padding: "12px 0", textAlign: "right" }}>
                            <button
                              onClick={() => confirmRemoveItem(item.id)}
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
                      );
                    })}
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
              marginBottom: 24
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Summary
              </h3>
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
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                * Prices may change based on current product pricing
              </p>
            </div>

            {/* Actions Card */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              padding: 24
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Actions
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={handleCreateEstimate}
                  style={{
                    padding: "12px",
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    width: "100%"
                  }}
                >
                  Create Estimate from Template
                </button>
                <button
                  onClick={confirmDeleteTemplate}
                  style={{
                    padding: "12px",
                    background: "transparent",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    color: "#ef4444",
                    fontSize: "14px",
                    cursor: "pointer",
                    width: "100%"
                  }}
                >
                  Delete Template
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{confirmConfig.title}</h2>
            <p className="modal-confirm-text">{confirmConfig.message}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="modal-btn danger" onClick={confirmConfig.onConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
