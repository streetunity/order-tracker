"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

const CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'machine', label: 'Machine' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'service', label: 'Service' }
];

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const fileInputRef = useRef(null);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    if (params.id) {
      loadProduct();
    }
  }, [user, router, params.id]);

  async function loadProduct() {
    try {
      const res = await fetch(`/api/products/${params.id}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Product not found");
          setLoading(false);
          return;
        }
        throw new Error("Failed to load product");
      }

      const data = await res.json();
      setProduct(data);
      setFormData({
        sku: data.sku || "",
        name: data.name || "",
        description: data.description || "",
        modelNumber: data.modelNumber || "",
        price: data.price || "",
        cost: data.cost || "",
        category: data.category || "",
        taxable: data.taxable !== false,
        isActive: data.isActive !== false
      });
    } catch (e) {
      console.error("Error loading product:", e);
      setError("Failed to load product");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/products/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update product");
      }

      setProduct(data);
      setIsEditing(false);
      setSuccess("Product updated successfully");
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

  function confirmDeactivateProduct() {
    showConfirm("Deactivate Product", "Deactivate this product? It will no longer appear in product selection.", () => handleDelete());
  }

  async function handleDelete() {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/products/${params.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to deactivate product");
      }

      if (data.warning) {
        setSuccess(data.warning);
        setProduct({ ...product, isActive: false });
        setFormData({ ...formData, isActive: false });
      } else {
        router.push("/invoicing/products");
      }
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

      const res = await fetch(`/api/products/${params.id}/attachments`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formDataUpload,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload attachment");
      }

      // Reload product to get updated attachments
      await loadProduct();
      setSuccess("Attachment uploaded successfully");
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
    setPendingDeleteAttachmentId(attachmentId);
    showConfirm("Delete Attachment", "Are you sure you want to delete this attachment?", () => handleDeleteAttachment(attachmentId));
  }

  async function handleDeleteAttachment(attachmentId) {
    setShowConfirmModal(false);
    const idToDelete = attachmentId || pendingDeleteAttachmentId;
    setPendingDeleteAttachmentId(null);
    if (!idToDelete) return;

    try {
      const res = await fetch(`/api/products/${params.id}/attachments/${idToDelete}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete attachment");
      }

      await loadProduct();
      setSuccess("Attachment deleted");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleAttachmentSetting(attachmentId, field, value) {
    try {
      const res = await fetch(`/api/products/${params.id}/attachments/${attachmentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update attachment");
      }

      await loadProduct();
    } catch (err) {
      setError(err.message);
    }
  }

  // Calculate margin
  const margin = formData.price && formData.cost
    ? parseFloat(formData.price) - parseFloat(formData.cost)
    : null;
  const marginPercent = margin !== null && parseFloat(formData.price) > 0
    ? ((margin / parseFloat(formData.price)) * 100).toFixed(2)
    : null;

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

  const infoRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)"
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading product...
          </div>
        </div>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>404</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>Product not found</p>
            <Link
              href="/invoicing/products"
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
              Back to Products
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
            href="/invoicing/products"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}
          >
            ← Back to Products
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
                  {product.name}
                </h1>
                {!product.isActive && (
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
                {product.sku}
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
                  {product.isActive && (
                    <button
                      onClick={confirmDeactivateProduct}
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
                      Deactivate
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      loadProduct();
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Left Column */}
          <div>
            {/* Product Details */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Product Details
              </h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Short Name (SKU) *</label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                      style={inputStyle}
                      required
                    />
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                      Appears on tracking board when order is created
                    </p>
                  </div>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Model Number</label>
                    <input
                      type="text"
                      value={formData.modelNumber}
                      onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      style={inputStyle}
                    >
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={formData.taxable}
                        onChange={(e) => setFormData({ ...formData, taxable: e.target.checked })}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>Taxable</span>
                    </label>
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
              ) : (
                <>
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Short Name</span>
                    <span style={{ color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}>{product.sku}</span>
                  </div>
                  {product.modelNumber && (
                    <div style={infoRowStyle}>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Model #</span>
                      <span style={{ color: "rgba(255,255,255,0.9)" }}>{product.modelNumber}</span>
                    </div>
                  )}
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Category</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{product.category || '—'}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Taxable</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{product.taxable ? 'Yes' : 'No'}</span>
                  </div>
                  {product.description && (
                    <div style={{ paddingTop: 12 }}>
                      <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 6, fontSize: "13px" }}>Description</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{product.description}</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pricing */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Pricing
              </h2>
              {isEditing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Price ($)</label>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      style={inputStyle}
                      min="0"
                      step="0.01"
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
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Calculated Margin</label>
                    <div style={{
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "8px",
                      color: marginPercent !== null
                        ? (parseFloat(marginPercent) > 30 ? "#22c55e" : parseFloat(marginPercent) > 15 ? "#eab308" : "#ef4444")
                        : "rgba(255,255,255,0.4)"
                    }}>
                      {marginPercent !== null ? `$${margin?.toFixed(2)} (${marginPercent}%)` : "Enter price & cost"}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Price</span>
                    <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "18px" }}>
                      ${product.price?.toLocaleString() || '0'}
                    </span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Cost</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>
                      {product.cost ? `$${product.cost.toLocaleString()}` : '—'}
                    </span>
                  </div>
                  <div style={{ ...infoRowStyle, borderBottom: "none" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Margin</span>
                    <span style={{
                      color: product.marginPercent
                        ? (parseFloat(product.marginPercent) > 30 ? "#22c55e" : parseFloat(product.marginPercent) > 15 ? "#eab308" : "#ef4444")
                        : "rgba(255,255,255,0.4)"
                    }}>
                      {product.marginPercent ? `$${product.margin?.toFixed(2)} (${product.marginPercent}%)` : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Column - Attachments */}
          <div>
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
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
                PDF, JPG, PNG, WEBP - Max 10MB. Attachments can be auto-included in estimates.
              </p>

              {product.attachments && product.attachments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {product.attachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        padding: 12,
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a
                            href={att.s3Url || `https://${process.env.NEXT_PUBLIC_S3_BUCKET}.s3.us-east-1.amazonaws.com/${att.s3Key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#dc2626",
                              textDecoration: "none",
                              fontSize: "14px",
                              wordBreak: "break-all"
                            }}
                          >
                            {att.filename}
                          </a>
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                            {(att.fileSize / 1024).toFixed(1)} KB • {att.mimeType}
                          </div>
                        </div>
                        <button
                          onClick={() => confirmDeleteAttachment(att.id)}
                          style={{
                            padding: "4px 8px",
                            background: "transparent",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: "4px",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: "11px"
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={att.includeInEstimate}
                            onChange={(e) => toggleAttachmentSetting(att.id, 'includeInEstimate', e.target.checked)}
                            style={{ width: 14, height: 14 }}
                          />
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Include in estimates</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={att.includeInInvoice}
                            onChange={(e) => toggleAttachmentSetting(att.id, 'includeInInvoice', e.target.checked)}
                            style={{ width: 14, height: 14 }}
                          />
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Include in invoices</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={att.isPrimary}
                            onChange={(e) => toggleAttachmentSetting(att.id, 'isPrimary', e.target.checked)}
                            style={{ width: 14, height: 14 }}
                          />
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Primary image</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.4)" }}>
                  No attachments yet
                </div>
              )}
            </div>

            {/* Used in Bundles */}
            {product.bundleItems && product.bundleItems.length > 0 && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                  Used in Bundles
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {product.bundleItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/invoicing/bundles/${item.bundle.id}`}
                      style={{
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "6px",
                        color: "rgba(255,255,255,0.9)",
                        textDecoration: "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span>{item.bundle.name}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
                        Qty: {item.quantity}
                      </span>
                    </Link>
                  ))}
                </div>
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
