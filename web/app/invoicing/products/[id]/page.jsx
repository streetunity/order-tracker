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

  const [product,    setProduct]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [isEditing,  setIsEditing]  = useState(false);
  const [formData,   setFormData]   = useState({});
  const [dragActive, setDragActive] = useState(false);

  const [showConfirmModal,          setShowConfirmModal]          = useState(false);
  const [confirmConfig,             setConfirmConfig]             = useState({ title: "", message: "", onConfirm: null });
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (params.id) loadProduct();
  }, [user, router, params.id]);

  async function loadProduct() {
    try {
      const res = await fetch(`/api/products/${params.id}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 404) { setError("Product not found"); setLoading(false); return; }
        throw new Error("Failed to load product");
      }
      const data = await res.json();
      setProduct(data);
      setFormData({
        sku: data.sku || "", name: data.name || "", description: data.description || "",
        modelNumber: data.modelNumber || "", price: data.price || "", cost: data.cost || "",
        category: data.category || "", taxable: data.taxable !== false, isActive: data.isActive !== false
      });
    } catch (e) {
      setError("Failed to load product");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`/api/products/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update product");
      setProduct(data); setIsEditing(false);
      setSuccess("Product updated successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function showConfirm(title, message, onConfirm) { setConfirmConfig({ title, message, onConfirm }); setShowConfirmModal(true); }

  function confirmDeactivateProduct() {
    showConfirm("Deactivate Product", "Deactivate this product? It will no longer appear in product selection.", handleDeactivate);
  }

  async function handleDeactivate() {
    setShowConfirmModal(false);
    try {
      const res  = await fetch(`/api/products/${params.id}`, { method: "DELETE", headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to deactivate product");
      if (data.warning) { setSuccess(data.warning); setProduct({ ...product, isActive: false }); setFormData({ ...formData, isActive: false }); }
      else router.push("/invoicing/products");
    } catch (err) { setError(err.message); }
  }

  function confirmHardDeleteProduct() {
    showConfirm(
      "Permanently Delete Product",
      "This permanently removes the product and all its attachments. This cannot be undone. Products used in estimates or invoices cannot be deleted.",
      handleHardDelete
    );
  }

  async function handleHardDelete() {
    setShowConfirmModal(false);
    try {
      const res  = await fetch(`/api/products/${params.id}?force=true`, { method: "DELETE", headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete product");
      router.push("/invoicing/products");
    } catch (err) { setError(err.message); }
  }

  // ── drag-and-drop handlers ───────────────────────────────────────────────────

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
  }

  async function handleFileInputChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await uploadFiles(files);
  }

  async function uploadFiles(files) {
    setUploading(true); setError("");
    let lastError = null;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('includeInEstimate', 'true');
        const res  = await fetch(`/api/products/${params.id}/attachments`, {
          method: "POST", headers: getAuthHeaders(), body: fd,
        });
        const data = await res.json();
        if (!res.ok) lastError = data.error || "Failed to upload attachment";
      } catch (err) { lastError = err.message; }
    }
    await loadProduct();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (lastError) { setError(lastError); }
    else {
      setSuccess(files.length > 1 ? `${files.length} files uploaded` : "Attachment uploaded successfully");
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  function confirmDeleteAttachment(id) {
    setPendingDeleteAttachmentId(id);
    showConfirm("Delete Attachment", "Are you sure you want to delete this attachment?", () => handleDeleteAttachment(id));
  }

  async function handleDeleteAttachment(id) {
    setShowConfirmModal(false);
    const idToDelete = id || pendingDeleteAttachmentId;
    setPendingDeleteAttachmentId(null);
    if (!idToDelete) return;
    try {
      const res = await fetch(`/api/products/${params.id}/attachments/${idToDelete}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to delete attachment"); }
      await loadProduct();
      setSuccess("Attachment deleted"); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
  }

  async function toggleAttachmentSetting(attachmentId, field, value) {
    try {
      const res = await fetch(`/api/products/${params.id}/attachments/${attachmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to update"); }
      await loadProduct();
    } catch (err) { setError(err.message); }
  }

  const margin        = formData.price && formData.cost ? parseFloat(formData.price) - parseFloat(formData.cost) : null;
  const marginPercent = margin !== null && parseFloat(formData.price) > 0 ? ((margin / parseFloat(formData.price)) * 100).toFixed(2) : null;

  const inp = { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px" };
  const lbl = { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "500", color: "rgba(255,255,255,0.7)" };
  const sec = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: 24, marginBottom: 24 };
  const row = { display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" };

  if (authLoading || !user) return null;

  if (loading) return (
    <><InvoicingNav /><div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
      <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>Loading product...</div>
    </div></>
  );

  if (!product) return (
    <><InvoicingNav /><div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
        <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>Product not found</p>
        <Link href="/invoicing/products" style={{ display: "inline-block", padding: "10px 20px", background: "linear-gradient(135deg,#ef4444,#dc2626)", borderRadius: 8, color: "white", textDecoration: "none", fontSize: 14 }}>Back to Products</Link>
      </div>
    </div></>
  );

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link href="/invoicing/products" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 8 }}>← Back to Products</Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{product.name}</h1>
                {!product.isActive && (
                  <span style={{ padding: "4px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#ef4444", fontSize: 12 }}>Inactive</span>
                )}
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "monospace" }}>{product.sku}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!isEditing ? (
                <>
                  <button onClick={() => setIsEditing(true)} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 14 }}>Edit</button>
                  {product.isActive && <button onClick={confirmDeactivateProduct} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14 }}>Deactivate</button>}
                  <button onClick={confirmHardDeleteProduct} style={{ padding: "8px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontSize: 14 }}>Delete</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setIsEditing(false); loadProduct(); }} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} style={{ padding: "8px 16px", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 8, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save Changes"}</button>
                </>
              )}
            </div>
          </div>
        </div>

        {error   && <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)",  border: "1px solid rgba(239,68,68,0.3)",  borderRadius: 8, color: "#ef4444"  }}>{error}</div>}
        {success && <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(34,197,94,0.1)",  border: "1px solid rgba(34,197,94,0.3)",  borderRadius: 8, color: "#22c55e"  }}>{success}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* ── Left: details + pricing ── */}
          <div>
            <div style={sec}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Product Details</h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={lbl}>Short Name (SKU) *</label>
                    <input type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})} style={inp} required />
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Appears on tracking board when order is created</p>
                  </div>
                  <div><label style={lbl}>Name *</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={inp} required /></div>
                  <div><label style={lbl}>Model Number</label><input type="text" value={formData.modelNumber} onChange={e => setFormData({...formData, modelNumber: e.target.value})} style={inp} /></div>
                  <div><label style={lbl}>Description</label><textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ ...inp, minHeight: 100, resize: "vertical" }} /></div>
                  <div><label style={lbl}>Category</label><select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={inp}>{CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={formData.taxable} onChange={e => setFormData({...formData, taxable: e.target.checked})} style={{ width: 16, height: 16 }} /><span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>Taxable</span></label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} style={{ width: 16, height: 16 }} /><span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>Active</span></label>
                  </div>
                </div>
              ) : (
                <>
                  <div style={row}><span style={{ color: "rgba(255,255,255,0.5)" }}>Short Name</span><span style={{ color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}>{product.sku}</span></div>
                  {product.modelNumber && <div style={row}><span style={{ color: "rgba(255,255,255,0.5)" }}>Model #</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{product.modelNumber}</span></div>}
                  <div style={row}><span style={{ color: "rgba(255,255,255,0.5)" }}>Category</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{product.category || "—"}</span></div>
                  <div style={row}><span style={{ color: "rgba(255,255,255,0.5)" }}>Taxable</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{product.taxable ? "Yes" : "No"}</span></div>
                  {product.description && (
                    <div style={{ paddingTop: 12 }}>
                      <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 6, fontSize: 13 }}>Description</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{product.description}</div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={sec}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Pricing</h2>
              {isEditing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={lbl}>Price ($)</label><input type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} style={inp} min="0" step="0.01" /></div>
                  <div><label style={lbl}>Cost ($)</label><input type="number" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} style={inp} min="0" step="0.01" /></div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Calculated Margin</label>
                    <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, color: marginPercent !== null ? (parseFloat(marginPercent) > 30 ? "#22c55e" : parseFloat(marginPercent) > 15 ? "#eab308" : "#ef4444") : "rgba(255,255,255,0.4)" }}>
                      {marginPercent !== null ? `$${margin?.toFixed(2)} (${marginPercent}%)` : "Enter price & cost"}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={row}><span style={{ color: "rgba(255,255,255,0.5)" }}>Price</span><span style={{ color: "#dc2626", fontWeight: 700, fontSize: 18 }}>${product.price?.toLocaleString() || "0"}</span></div>
                  <div style={row}><span style={{ color: "rgba(255,255,255,0.5)" }}>Cost</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{product.cost ? `$${product.cost.toLocaleString()}` : "—"}</span></div>
                  <div style={{ ...row, borderBottom: "none" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Margin</span>
                    <span style={{ color: product.marginPercent ? (parseFloat(product.marginPercent) > 30 ? "#22c55e" : parseFloat(product.marginPercent) > 15 ? "#eab308" : "#ef4444") : "rgba(255,255,255,0.4)" }}>
                      {product.marginPercent ? `$${product.margin?.toFixed(2)} (${product.marginPercent}%)` : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Right: attachments ── */}
          <div>
            <div style={sec}>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", margin: "0 0 4px" }}>Attachments</h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                  PDF, JPG, PNG, WEBP · Max 10MB each · Files marked "Include in estimates" are auto-attached when the estimate is emailed
                </p>
              </div>

              {/* Drag-and-drop upload zone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple
                onChange={handleFileInputChange}
                style={{ display: "none" }}
              />
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? "#dc2626" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 10,
                  padding: "28px 20px",
                  textAlign: "center",
                  cursor: uploading ? "not-allowed" : "pointer",
                  background: dragActive ? "rgba(220,38,38,0.07)" : "rgba(255,255,255,0.02)",
                  transition: "border-color 0.15s, background 0.15s",
                  marginBottom: 20,
                  userSelect: "none",
                }}
              >
                {uploading ? (
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Uploading…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>{dragActive ? "📎" : "⬆"}</div>
                    <div style={{ color: dragActive ? "#dc2626" : "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500 }}>
                      {dragActive ? "Drop to upload" : "Drop files here or click to browse"}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, marginTop: 4 }}>PDF, JPG, PNG, WEBP</div>
                  </>
                )}
              </div>

              {/* Attachment list */}
              {product.attachments && product.attachments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {product.attachments.map(att => (
                    <div key={att.id} style={{ padding: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a
                            href={att.s3Url || `https://${process.env.NEXT_PUBLIC_S3_BUCKET}.s3.us-east-1.amazonaws.com/${att.s3Key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#dc2626", textDecoration: "none", fontSize: 14, wordBreak: "break-all" }}
                          >
                            {att.filename}
                          </a>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                            {(att.fileSize / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <button
                          onClick={() => confirmDeleteAttachment(att.id)}
                          style={{ padding: "4px 8px", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#ef4444", cursor: "pointer", fontSize: 11, flexShrink: 0, marginLeft: 8 }}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={att.includeInEstimate} onChange={e => toggleAttachmentSetting(att.id, 'includeInEstimate', e.target.checked)} style={{ width: 14, height: 14 }} />
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Include in estimates</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={att.includeInInvoice} onChange={e => toggleAttachmentSetting(att.id, 'includeInInvoice', e.target.checked)} style={{ width: 14, height: 14 }} />
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Include in invoices</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No attachments yet</div>
              )}
            </div>

            {product.bundleItems && product.bundleItems.length > 0 && (
              <div style={sec}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Used in Bundles</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {product.bundleItems.map(item => (
                    <Link key={item.id} href={`/invoicing/bundles/${item.bundle.id}`} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, color: "rgba(255,255,255,0.9)", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{item.bundle.name}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Qty: {item.quantity}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{confirmConfig.title}</h2>
            <p className="modal-confirm-text">{confirmConfig.message}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="modal-btn danger" onClick={confirmConfig.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
