"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../modal.css";

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'machine', label: 'Machine' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'service', label: 'Service' },
  { value: 'part', label: 'Part' },
  { value: 'other', label: 'Other' }
];

const INP = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "rgba(255,255,255,0.9)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();

  const [activeTab, setActiveTab]           = useState("products");
  const [products, setProducts]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [searchTerm, setSearchTerm]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive]     = useState(false);
  const [showModal, setShowModal]           = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving]                 = useState(false);
  const [bundles, setBundles]               = useState([]);
  const [bundlesLoading, setBundlesLoading] = useState(true);
  const [bundleSearchTerm, setBundleSearchTerm] = useState("");
  const [showBundleInactive, setShowBundleInactive] = useState(false);
  const [showBundleModal, setShowBundleModal]       = useState(false);
  const [editingBundle, setEditingBundle]           = useState(null);
  const [bundleFormData, setBundleFormData]         = useState({ name: '', description: '', items: [] });
  const [productSearch, setProductSearch]           = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmConfig, setConfirmConfig]           = useState({ title: "", message: "", onConfirm: null });
  const [formData, setFormData] = useState({ sku: '', name: '', description: '', modelNumber: '', price: '', cost: '', category: '', taxable: true, isActive: true });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadProducts(); loadBundles();
  }, [user, router]);

  async function loadProducts() {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (showInactive) params.append('includeInactive', 'true');
      const res = await fetch('/api/products' + (params.toString() ? '?' + params.toString() : ''), { headers: getAuthHeaders() });
      if (!res.ok) { if (res.status === 401) { router.push("/login"); return; } throw new Error("Failed to load products"); }
      setProducts(await res.json());
    } catch (e) { setError("Failed to load products"); }
    finally { setLoading(false); }
  }

  async function loadBundles() {
    try {
      const params = new URLSearchParams();
      if (showBundleInactive) params.append('includeInactive', 'true');
      const res = await fetch('/api/bundles' + (params.toString() ? '?' + params.toString() : ''), { headers: getAuthHeaders() });
      if (res.ok) setBundles(await res.json());
    } catch (e) { console.error(e); }
    finally { setBundlesLoading(false); }
  }

  useEffect(() => { if (user) loadProducts(); }, [categoryFilter, showInactive]);
  useEffect(() => { if (user) loadBundles(); }, [showBundleInactive]);

  const filteredProducts = products.filter(p => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return p.sku?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.modelNumber?.toLowerCase().includes(q);
  });
  const filteredBundles = bundles.filter(b => !bundleSearchTerm || b.name?.toLowerCase().includes(bundleSearchTerm.toLowerCase()));
  const searchedProducts = products.filter(p => {
    if (!productSearch) return false;
    const q = productSearch.toLowerCase();
    return p.isActive && (p.sku?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q));
  });

  const bundlePrice = bundleFormData.items.reduce((s, i) => s + (i.price * i.quantity), 0);
  const bundleCost  = bundleFormData.items.reduce((s, i) => s + ((i.cost || 0) * i.quantity), 0);

  const openNewProductModal  = () => { setEditingProduct(null); setFormData({ sku: '', name: '', description: '', modelNumber: '', price: '', cost: '', category: '', taxable: true, isActive: true }); setShowModal(true); };
  const openEditProductModal = (p) => { setEditingProduct(p); setFormData({ sku: p.sku||'', name: p.name||'', description: p.description||'', modelNumber: p.modelNumber||'', price: p.price||'', cost: p.cost||'', category: p.category||'', taxable: p.taxable!==false, isActive: p.isActive!==false }); setShowModal(true); };
  const openNewBundleModal   = () => { setEditingBundle(null); setBundleFormData({ name: '', description: '', items: [] }); setShowBundleModal(true); };
  const openEditBundleModal  = (b) => { setEditingBundle(b); setBundleFormData({ name: b.name||'', description: b.description||'', items: (b.items||[]).map(i => ({ productId: i.productId, sku: i.product?.sku||'', name: i.product?.name||'', price: i.product?.price||0, cost: i.product?.cost||0, quantity: i.quantity||1 })) }); setShowBundleModal(true); };

  function addProductToBundle(product) {
    const existing = bundleFormData.items.find(i => i.productId === product.id);
    if (existing) {
      setBundleFormData({ ...bundleFormData, items: bundleFormData.items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i) });
    } else {
      setBundleFormData({ ...bundleFormData, items: [...bundleFormData.items, { productId: product.id, sku: product.sku, name: product.name, price: product.price||0, cost: product.cost||0, quantity: 1 }] });
    }
    setProductSearch(""); setShowProductDropdown(false);
  }
  function updateBundleItemQuantity(id, qty) { if (qty < 1) removeBundleItem(id); else setBundleFormData({ ...bundleFormData, items: bundleFormData.items.map(i => i.productId === id ? { ...i, quantity: qty } : i) }); }
  function removeBundleItem(id) { setBundleFormData({ ...bundleFormData, items: bundleFormData.items.filter(i => i.productId !== id) }); }

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const res = await fetch(editingProduct ? '/api/products/' + editingProduct.id : '/api/products', { method: editingProduct ? 'PATCH' : 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, price: parseFloat(formData.price)||0, cost: formData.cost ? parseFloat(formData.cost) : null }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save product'); }
      setShowModal(false); loadProducts();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const handleBundleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    if (bundleFormData.items.length === 0) { setError("Add at least one product to the bundle"); setSaving(false); return; }
    try {
      const res = await fetch(editingBundle ? '/api/bundles/' + editingBundle.id : '/api/bundles', { method: editingBundle ? 'PATCH' : 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: bundleFormData.name, description: bundleFormData.description, price: bundlePrice, cost: bundleCost, items: bundleFormData.items.map(i => ({ productId: i.productId, quantity: i.quantity })) }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save bundle'); }
      setShowBundleModal(false); loadBundles();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  function showConfirm(title, message, onConfirm) { setConfirmConfig({ title, message, onConfirm }); setShowConfirmModal(true); }
  function confirmDeactivateProduct(p) { showConfirm("Deactivate Product", `Deactivate "${p.name}"?`, () => handleDelete(p)); }
  function confirmDeactivateBundle(b)  { showConfirm("Deactivate Bundle",  `Deactivate "${b.name}"?`,  () => handleDeleteBundle(b)); }
  const handleDelete = async (p) => { setShowConfirmModal(false); const res = await fetch('/api/products/' + p.id, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) setError('Failed to deactivate product'); else loadProducts(); };
  const handleDeleteBundle = async (b) => { setShowConfirmModal(false); const res = await fetch('/api/bundles/' + b.id, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) setError('Failed to deactivate bundle'); else loadBundles(); };

  if (authLoading || !user) return null;

  const tabBtn = (id, label, count) => {
    const active = activeTab === id;
    return (
      <button onClick={() => setActiveTab(id)} style={{ padding: "6px 14px", background: active ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${active ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, color: active ? "#dc2626" : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.12s" }}>
        {label} <span style={{ opacity: 0.65, fontSize: 11 }}>({count})</span>
      </button>
    );
  };

  const TH = (label, align = "left") => <th style={{ padding: "11px 14px", textAlign: align, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px" }}>{label}</th>;

  return (
    <>
      <InvoicingNav />
      <style>{`
        .prod-row { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .prod-row:hover { background: rgba(255,255,255,0.03); }
        .prod-search { padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 7px; color: rgba(255,255,255,0.9); font-size: 13px; outline: none; transition: border-color 0.15s; }
        .prod-search:focus { border-color: rgba(220,38,38,0.45); }
        .prod-search::placeholder { color: rgba(255,255,255,0.28); }
        .files-btn { padding: 5px 11px; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 6px; color: rgba(96,165,250,0.8); font-size: 12px; cursor: pointer; text-decoration: none; display: inline-block; transition: background 0.12s; white-space: nowrap; }
        .files-btn:hover { background: rgba(59,130,246,0.15); color: #93c5fd; }
        .files-btn.has-files { border-color: rgba(59,130,246,0.35); color: #93c5fd; font-weight: 600; }
      `}</style>

      <div style={{ minHeight: "calc(100vh - 64px)", background: "#0f0f0f", padding: "32px 32px 60px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.3px" }}>Products &amp; Bundles</h1>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>
              {activeTab === "products" ? `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}` : `${filteredBundles.length} bundle${filteredBundles.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={activeTab === "products" ? openNewProductModal : openNewBundleModal}
            style={{ padding: "7px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", borderRadius: 7, color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + New {activeTab === "products" ? "Product" : "Bundle"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontSize: 13 }}>
            {error}
            <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>&#215;</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {tabBtn("products", "Products", products.length)}
          {tabBtn("bundles",  "Bundles",  bundles.length)}
        </div>

        {activeTab === "products" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
              <input type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="prod-search" style={{ width: 260 }} />
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...INP, width: 160 }}>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show Inactive
              </label>
            </div>
            <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
                    {TH("Short Name")}{TH("Name")}{TH("Category")}{TH("Price", "right")}{TH("Cost", "right")}{TH("Margin", "right")}{TH("Files", "center")}{TH("Status", "center")}{TH("Actions", "right")}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>{searchTerm ? "No products match" : "No products yet"}</td></tr>
                  ) : filteredProducts.map(p => {
                    const fileCount = p.attachments?.length || 0;
                    return (
                      <tr key={p.id} className="prod-row" style={{ opacity: p.isActive ? 1 : 0.5 }}>
                        <td style={{ padding: "13px 14px", fontWeight: 600, color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "monospace" }}>{p.sku}</td>
                        <td style={{ padding: "13px 14px" }}>
                          <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{p.name}</div>
                          {p.description && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>}
                        </td>
                        <td style={{ padding: "13px 14px", color: "rgba(255,255,255,0.55)", fontSize: 13, textTransform: "capitalize" }}>{p.category || <span style={{ color: "rgba(255,255,255,0.2)" }}>&#8212;</span>}</td>
                        <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 700, color: "rgba(255,255,255,0.88)", fontSize: 13 }}>{fmt(p.price)}</td>
                        <td style={{ padding: "13px 14px", textAlign: "right", color: "rgba(255,255,255,0.45)", fontSize: 13 }}>{p.cost ? fmt(p.cost) : <span style={{ color: "rgba(255,255,255,0.2)" }}>&#8212;</span>}</td>
                        <td style={{ padding: "13px 14px", textAlign: "right", fontSize: 13 }}>
                          {p.marginPercent ? <span style={{ color: parseFloat(p.marginPercent) >= 20 ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{p.marginPercent}%</span> : <span style={{ color: "rgba(255,255,255,0.2)" }}>&#8212;</span>}
                        </td>
                        <td style={{ padding: "13px 14px", textAlign: "center" }}>
                          <Link
                            href={`/invoicing/products/${p.id}`}
                            className={`files-btn${fileCount > 0 ? ' has-files' : ''}`}
                            title={fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''} attached` : 'Add files to this product'}
                          >
                            {fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : '+ Files'}
                          </Link>
                        </td>
                        <td style={{ padding: "13px 14px", textAlign: "center" }}>
                          <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", background: p.isActive ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)", border: p.isActive ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(156,163,175,0.3)", color: p.isActive ? "#22c55e" : "#9ca3af" }}>
                            {p.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: "13px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => openEditProductModal(p)} style={{ padding: "5px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: "rgba(255,255,255,0.7)", fontSize: 12, cursor: "pointer" }}>Edit</button>
                            {p.isActive && <button onClick={() => confirmDeactivateProduct(p)} style={{ padding: "5px 11px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: "#f87171", fontSize: 12, cursor: "pointer" }}>Deactivate</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "bundles" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
              <input type="text" placeholder="Search bundles..." value={bundleSearchTerm} onChange={e => setBundleSearchTerm(e.target.value)} className="prod-search" style={{ width: 260 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={showBundleInactive} onChange={e => setShowBundleInactive(e.target.checked)} /> Show Inactive
              </label>
            </div>
            <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
                    {TH("Name")}{TH("Items", "center")}{TH("Total Price", "right")}{TH("Status", "center")}{TH("Actions", "right")}
                  </tr>
                </thead>
                <tbody>
                  {filteredBundles.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>No bundles yet</td></tr>
                  ) : filteredBundles.map(b => (
                    <tr key={b.id} className="prod-row" style={{ opacity: b.isActive ? 1 : 0.5 }}>
                      <td style={{ padding: "13px 14px" }}>
                        <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.88)", fontSize: 13 }}>{b.name}</div>
                        {b.description && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.description}</div>}
                      </td>
                      <td style={{ padding: "13px 14px", textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{b.itemCount || b.items?.length || 0}</td>
                      <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 700, color: "#dc2626", fontSize: 13 }}>{fmt(b.price)}</td>
                      <td style={{ padding: "13px 14px", textAlign: "center" }}>
                        <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", background: b.isActive ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)", border: b.isActive ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(156,163,175,0.3)", color: b.isActive ? "#22c55e" : "#9ca3af" }}>
                          {b.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: "13px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => openEditBundleModal(b)} style={{ padding: "5px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: "rgba(255,255,255,0.7)", fontSize: 12, cursor: "pointer" }}>Edit</button>
                          {b.isActive && <button onClick={() => confirmDeactivateBundle(b)} style={{ padding: "5px 11px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: "#f87171", fontSize: 12, cursor: "pointer" }}>Deactivate</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content wide" onClick={e => e.stopPropagation()}>
            <h2>{editingProduct ? 'Edit Product' : 'New Product'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label>Short Name (SKU) *</label>
                  <input type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} required placeholder="e.g. SL50AAS-VFD" />
                  <span className="modal-hint">Appears on tracking board when order is created</span>
                </div>
                <div className="modal-form-group">
                  <label>Model Number</label>
                  <input type="text" value={formData.modelNumber} onChange={e => setFormData({...formData, modelNumber: e.target.value})} />
                </div>
              </div>
              <div className="modal-form-group">
                <label>Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div className="modal-form-group">
                <label>Description</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} />
              </div>
              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label>Price</label>
                  <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                </div>
                <div className="modal-form-group">
                  <label>Cost</label>
                  <input type="number" step="0.01" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} />
                </div>
              </div>
              <div className="modal-form-group">
                <label>Category</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option value="">Select...</option>
                  <option value="machine">Machine</option>
                  <option value="accessory">Accessory</option>
                  <option value="service">Service</option>
                  <option value="part">Part</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="modal-form-group" style={{ display: "flex", gap: 20 }}>
                <label className="modal-checkbox-label"><input type="checkbox" checked={formData.taxable} onChange={e => setFormData({...formData, taxable: e.target.checked})} /> Taxable</label>
                <label className="modal-checkbox-label"><input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} /> Active</label>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving}>{saving ? 'Saving...' : (editingProduct ? 'Update' : 'Create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBundleModal && (
        <div className="modal-overlay">
          <div className="modal-content extra-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, height: "80vh", maxHeight: 750, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <h2 style={{ flexShrink: 0 }}>{editingBundle ? 'Edit Bundle' : 'New Bundle'}</h2>
            <form onSubmit={handleBundleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div style={{ flex: 1, overflowY: "auto", paddingRight: 8 }}>
                <div className="modal-form-group">
                  <label>Bundle Name *</label>
                  <input type="text" value={bundleFormData.name} onChange={e => setBundleFormData({...bundleFormData, name: e.target.value})} required placeholder="e.g. SL-3015 Complete Package" />
                </div>
                <div className="modal-form-group">
                  <label>Description</label>
                  <textarea value={bundleFormData.description} onChange={e => setBundleFormData({...bundleFormData, description: e.target.value})} rows={2} />
                </div>
                <div className="modal-form-group">
                  <label>Products in Bundle</label>
                  <div style={{ position: "relative" }}>
                    <input type="text" placeholder="Type to search products..." value={productSearch} onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }} onFocus={() => setShowProductDropdown(true)} />
                    {showProductDropdown && searchedProducts.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, marginTop: 4, maxHeight: 250, overflow: "auto", zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                        {searchedProducts.map(p => (
                          <div key={p.id} onClick={() => addProductToBundle(p)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{p.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{p.sku}</div></div>
                            <div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(p.price)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {bundleFormData.items.length > 0 ? (
                    <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" }}>
                      {bundleFormData.items.map((item, idx) => (
                        <div key={item.productId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", background: "rgba(255,255,255,0.02)" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{item.name}</div>
                            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{item.sku} &#183; {fmt(item.price)} each</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button type="button" onClick={() => updateBundleItemQuantity(item.productId, item.quantity-1)} style={{ width: 28, height: 28, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>-</button>
                            <span style={{ color: "rgba(255,255,255,0.9)", minWidth: 24, textAlign: "center" }}>{item.quantity}</span>
                            <button type="button" onClick={() => updateBundleItemQuantity(item.productId, item.quantity+1)} style={{ width: 28, height: 28, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>+</button>
                            <span style={{ color: "#dc2626", fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmt(item.price * item.quantity)}</span>
                            <button type="button" onClick={() => removeBundleItem(item.productId)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>&#215;</button>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: 12, background: "rgba(220,38,38,0.08)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Bundle Total:</span>
                        <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 16 }}>{fmt(bundlePrice)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, padding: 20, textAlign: "center", color: "rgba(255,255,255,0.35)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 13 }}>Search and add products above</div>
                  )}
                </div>
              </div>
              <div className="modal-actions" style={{ flexShrink: 0, marginTop: "auto" }}>
                <button type="button" className="modal-btn cancel" onClick={() => setShowBundleModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving || bundleFormData.items.length === 0}>{saving ? 'Saving...' : (editingBundle ? 'Update Bundle' : 'Create Bundle')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
