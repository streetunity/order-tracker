"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

export default function BundleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const fileInputRef = useRef(null);

  const [bundle, setBundle] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });

  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    if (params.id) {
      loadBundle();
      loadProducts();
    }
  }, [user, router, params.id]);

  async function loadBundle() {
    try {
      const res = await fetch(`/api/bundles/${params.id}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Bundle not found");
          setLoading(false);
          return;
        }
        throw new Error("Failed to load bundle");
      }

      const data = await res.json();
      setBundle(data);
      setFormData({
        sku: data.sku || "",
        name: data.name || "",
        description: data.description || "",
        price: data.price || "",
        cost: data.cost || "",
        isActive: data.isActive !== false
      });
    } catch (e) {
      console.error("Error loading bundle:", e);
      setError("Failed to load bundle");
    } finally {
      setLoading(false);
    }
  }

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
      const existingProductIds = bundle?.items?.map(i => i.productId) || [];
      const results = products.filter(p =>
        !existingProductIds.includes(p.id) &&
        (p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      ).slice(0, 5);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, products, bundle?.items]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/bundles/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update bundle");
      }

      setBundle(data);
      setIsEditing(false);
      setSuccess("Bundle updated successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function showConfirm(title, message, onConfirm) {
    setConfirmConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  }

  function confirmDeleteBundle() {
    showConfirm("Delete Bundle", "Delete this bundle? This action cannot be undone.", () => handleDelete());
  }

  async function handleDelete() {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/bundles/${params.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete bundle");
      }

      router.push("/invoicing/bundles");
    } catch (err) {
      setError(err.message);
    }
  }

  async function addProduct(product) {
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/bundles/${params.id}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add product");
      }

      await loadBundle();
      setSearchTerm("");
      setSearchResults([]);
      setSuccess("Product added");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateItemQuantity(itemId, quantity) {
    if (quantity < 1) {
      removeItem(itemId);
      return;
    }

    try {
      const res = await fetch(`/api/bundles/${params.id}/items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ quantity }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update quantity");
      }

      await loadBundle();
    } catch (err) {
      setError(err.message);
    }
  }

  function confirmRemoveItem(itemId) {
    showConfirm("Remove Product", "Remove this product from the bundle?", () => removeItem(itemId));
  }

  async function removeItem(itemId) {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/bundles/${params.id}/items/${itemId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove product");
      }

      await loadBundle();
      setSuccess("Product removed");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('includeInEstimate', 'true');

      const res = await fetch(`/api/bundles/${params.id}/attachments`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formDataUpload,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload attachment");
      }

      await loadBundle();
      setSuccess("Attachment uploaded");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function confirmDeleteAttachment(attachmentId) {
    showConfirm("Delete Attachment", "Are you sure you want to delete this attachment?", () => handleDeleteAttachment(attachmentId));
  }

  async function handleDeleteAttachment(attachmentId) {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/bundles/${params.id}/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete attachment");
      }

      await loadBundle();
      setSuccess("Attachment deleted");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
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

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading bundle...
          </div>
        </div>
      </>
    );
  }

  if (!bundle) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>404</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>Bundle not found</p>
            <Link
              href="/invoicing/bundles"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                borderRadius: "8px",
                color: "white",
                textDecoration: "none",
                fontSize: "14px"
              }}
            >
              Back to Bundles
            </Link>
          </div>
        </div>
      </>
    );
  }

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
                  {bundle.name}
                </h1>
                {!bundle.isActive && (
                  <span style={{
                    padding: "4px 10px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    fontSize: "12px"
                  }}>
                    Inactive
                  </span>
                )}
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", fontFamily: "monospace" }}>
                {bundle.sku}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "rgba(255, 255, 255, 0.9)",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={confirmDeleteBundle}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "8px",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      loadBundle();
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "rgba(255, 255, 255, 0.9)",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: "8px 16px",
                      background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      cursor: saving ? "not-allowed" : "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                      opacity: saving ? 0.7 : 1
                    }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
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
          {/* Left Column - Items */}
          <div>
            {/* Bundle Details */}
            {isEditing && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                  Bundle Details
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Short Name (SKU) *</label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                      style={inputStyle}
                      placeholder="e.g. SL3015-6K-PKG"
                    />
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                      Appears on tracking board
                    </p>
                  </div>
                  <div>
                    <label style={labelStyle}>Price ($) *</label>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      style={inputStyle}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cost ($)</label>
                    <input
                      type="number"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      style={inputStyle}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 28 }}>
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
              </div>
            )}

            {/* Bundle Items */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Bundle Items ({bundle.items?.length || 0})
              </h2>

              {/* Add Product Search */}
              <div style={{ position: "relative", marginBottom: 16 }}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={inputStyle}
                  placeholder="Search to add products..."
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
              {bundle.items && bundle.items.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bundle.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "12px 14px",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        opacity: item.product.isActive ? 1 : 0.6
                      }}
                    >
                      <Link
                        href={`/invoicing/products/${item.product.id}`}
                        style={{ flex: 1, textDecoration: "none" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>{item.product.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", fontFamily: "monospace" }}>
                          {item.product.sku}
                          {!item.product.isActive && <span style={{ color: "#ef4444", marginLeft: 8 }}>(Inactive)</span>}
                        </div>
                      </Link>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
                          ${item.product.price?.toLocaleString()} each
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
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
                          <span style={{
                            width: 40,
                            textAlign: "center",
                            color: "rgba(255,255,255,0.9)"
                          }}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
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
                          ${(item.product.price * item.quantity).toLocaleString()}
                        </div>
                        <button
                          type="button"
                          onClick={() => confirmRemoveItem(item.id)}
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
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.4)" }}>
                  No items in this bundle. Search above to add products.
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Summary & Attachments */}
          <div>
            {/* Pricing Summary */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Pricing Summary
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Components Total:</span>
                  <span style={{ color: "rgba(255,255,255,0.9)" }}>${bundle.componentPrice?.toLocaleString() || '0'}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Bundle Price:</span>
                  <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "20px" }}>
                    ${bundle.price?.toLocaleString() || '0'}
                  </span>
                </div>
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Customer Savings:</span>
                    <span style={{ color: bundle.savings > 0 ? "#22c55e" : "rgba(255,255,255,0.5)" }}>
                      {bundle.savings > 0 ? `$${bundle.savings.toLocaleString()} (${bundle.savingsPercent}%)` : '—'}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Margin:</span>
                    <span style={{
                      color: bundle.marginPercent
                        ? (parseFloat(bundle.marginPercent) > 30 ? "#22c55e" : parseFloat(bundle.marginPercent) > 15 ? "#eab308" : "#ef4444")
                        : "rgba(255,255,255,0.5)"
                    }}>
                      {bundle.marginPercent ? `$${bundle.margin?.toFixed(2)} (${bundle.marginPercent}%)` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div style={sectionStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                  Attachments
                </h2>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: "6px 12px",
                    background: "rgba(220, 38, 38, 0.1)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "6px",
                    color: "#dc2626",
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    opacity: uploading ? 0.7 : 1
                  }}
                >
                  {uploading ? "Uploading..." : "+ Upload"}
                </button>
              </div>

              {bundle.attachments && bundle.attachments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bundle.attachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        padding: 10,
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <a
                        href={att.s3Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#dc2626",
                          textDecoration: "none",
                          fontSize: "13px",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {att.filename}
                      </a>
                      <button
                        onClick={() => confirmDeleteAttachment(att.id)}
                        style={{
                          padding: "2px 6px",
                          background: "transparent",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "4px",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "11px",
                          marginLeft: 8
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                  No attachments
                </div>
              )}
            </div>

            {/* Description (view mode) */}
            {!isEditing && bundle.description && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 12 }}>
                  Description
                </h2>
                <p style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap", fontSize: "14px" }}>
                  {bundle.description}
                </p>
              </div>
            )}
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
