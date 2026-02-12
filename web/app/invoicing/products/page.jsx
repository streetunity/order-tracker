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

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState("products");

  // Products state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);

  // Bundles state
  const [bundles, setBundles] = useState([]);
  const [bundlesLoading, setBundlesLoading] = useState(true);
  const [bundleSearchTerm, setBundleSearchTerm] = useState("");
  const [showBundleInactive, setShowBundleInactive] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null);
  const [bundleFormData, setBundleFormData] = useState({
    name: '',
    description: '',
    items: []
  });
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    modelNumber: '',
    price: '',
    cost: '',
    category: '',
    taxable: true,
    isActive: true
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadProducts();
    loadBundles();
  }, [user, router]);

  async function loadProducts() {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (showInactive) params.append('includeInactive', 'true');

      const queryStr = params.toString();
      const url = '/api/products' + (queryStr ? '?' + queryStr : '');

      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load products");
      }

      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error("Error loading products:", e);
      setError("Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  async function loadBundles() {
    try {
      const params = new URLSearchParams();
      if (showBundleInactive) params.append('includeInactive', 'true');

      const queryStr = params.toString();
      const url = '/api/bundles' + (queryStr ? '?' + queryStr : '');

      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setBundles(data);
      }
    } catch (e) {
      console.error("Error loading bundles:", e);
    } finally {
      setBundlesLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadProducts();
    }
  }, [categoryFilter, showInactive]);

  useEffect(() => {
    if (user) {
      loadBundles();
    }
  }, [showBundleInactive]);

  const filteredProducts = products.filter((product) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      product.sku?.toLowerCase().includes(searchLower) ||
      product.name?.toLowerCase().includes(searchLower) ||
      product.description?.toLowerCase().includes(searchLower) ||
      product.modelNumber?.toLowerCase().includes(searchLower)
    );
  });

  const filteredBundles = bundles.filter((bundle) => {
    if (!bundleSearchTerm) return true;
    const searchLower = bundleSearchTerm.toLowerCase();
    return bundle.name?.toLowerCase().includes(searchLower);
  });

  // Product search for bundle items - show all matching products (scrollable list)
  const searchedProducts = products.filter(p => {
    if (!productSearch) return false;
    const search = productSearch.toLowerCase();
    return p.isActive && (
      p.sku?.toLowerCase().includes(search) ||
      p.name?.toLowerCase().includes(search)
    );
  });

  // Calculate bundle totals
  const bundlePrice = bundleFormData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const bundleCost = bundleFormData.items.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);

  const openNewProductModal = () => {
    setEditingProduct(null);
    setFormData({
      sku: '',
      name: '',
      description: '',
      modelNumber: '',
      price: '',
      cost: '',
      category: '',
      taxable: true,
      isActive: true
    });
    setShowModal(true);
  };

  const openEditProductModal = (product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku || '',
      name: product.name || '',
      description: product.description || '',
      modelNumber: product.modelNumber || '',
      price: product.price || '',
      cost: product.cost || '',
      category: product.category || '',
      taxable: product.taxable !== false,
      isActive: product.isActive !== false
    });
    setShowModal(true);
  };

  const openNewBundleModal = () => {
    setEditingBundle(null);
    setBundleFormData({
      name: '',
      description: '',
      items: []
    });
    setShowBundleModal(true);
  };

  const openEditBundleModal = (bundle) => {
    setEditingBundle(bundle);
    setBundleFormData({
      name: bundle.name || '',
      description: bundle.description || '',
      items: (bundle.items || []).map(item => ({
        productId: item.productId,
        sku: item.product?.sku || '',
        name: item.product?.name || '',
        price: item.product?.price || 0,
        cost: item.product?.cost || 0,
        quantity: item.quantity || 1
      }))
    });
    setShowBundleModal(true);
  };

  function addProductToBundle(product) {
    const existing = bundleFormData.items.find(item => item.productId === product.id);
    if (existing) {
      setBundleFormData({
        ...bundleFormData,
        items: bundleFormData.items.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      });
    } else {
      setBundleFormData({
        ...bundleFormData,
        items: [...bundleFormData.items, {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price || 0,
          cost: product.cost || 0,
          quantity: 1
        }]
      });
    }
    setProductSearch("");
    setShowProductDropdown(false);
  }

  function updateBundleItemQuantity(productId, quantity) {
    if (quantity < 1) {
      removeBundleItem(productId);
    } else {
      setBundleFormData({
        ...bundleFormData,
        items: bundleFormData.items.map(item =>
          item.productId === productId ? { ...item, quantity } : item
        )
      });
    }
  }

  function removeBundleItem(productId) {
    setBundleFormData({
      ...bundleFormData,
      items: bundleFormData.items.filter(item => item.productId !== productId)
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url = editingProduct
        ? '/api/products/' + editingProduct.id
        : '/api/products';

      const method = editingProduct ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price) || 0,
          cost: formData.cost ? parseFloat(formData.cost) : null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save product');
      }

      setShowModal(false);
      loadProducts();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBundleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (bundleFormData.items.length === 0) {
      setError("Add at least one product to the bundle");
      setSaving(false);
      return;
    }

    try {
      const url = editingBundle
        ? '/api/bundles/' + editingBundle.id
        : '/api/bundles';

      const method = editingBundle ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: bundleFormData.name,
          description: bundleFormData.description,
          price: bundlePrice, // Auto-calculated
          cost: bundleCost,   // Auto-calculated
          items: bundleFormData.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save bundle');
      }

      setShowBundleModal(false);
      loadBundles();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  function showConfirm(title, message, onConfirm) {
    setConfirmConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  }

  function confirmDeactivateProduct(product) {
    showConfirm("Deactivate Product", `Are you sure you want to deactivate "${product.name}"?`, () => handleDelete(product));
  }

  function confirmDeactivateBundle(bundle) {
    showConfirm("Deactivate Bundle", `Are you sure you want to deactivate "${bundle.name}"?`, () => handleDeleteBundle(bundle));
  }

  const handleDelete = async (product) => {
    setShowConfirmModal(false);
    try {
      const res = await fetch('/api/products/' + product.id, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('Failed to deactivate product');
      }

      loadProducts();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteBundle = async (bundle) => {
    setShowConfirmModal(false);
    try {
      const res = await fetch('/api/bundles/' + bundle.id, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('Failed to deactivate bundle');
      }

      loadBundles();
    } catch (e) {
      setError(e.message);
    }
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

  const tabStyle = (isActive) => ({
    padding: "12px 24px",
    background: isActive ? "rgba(220, 38, 38, 0.1)" : "transparent",
    border: isActive ? "1px solid rgba(220, 38, 38, 0.3)" : "1px solid rgba(255, 255, 255, 0.1)",
    borderBottom: isActive ? "none" : "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px 8px 0 0",
    color: isActive ? "#dc2626" : "rgba(255, 255, 255, 0.6)",
    fontSize: "14px",
    fontWeight: isActive ? "600" : "500",
    cursor: "pointer",
    marginRight: "4px"
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading...
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626", marginBottom: 4 }}>
              Products & Bundles
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              {activeTab === "products"
                ? `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`
                : `${filteredBundles.length} bundle${filteredBundles.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
          <button
            onClick={activeTab === "products" ? openNewProductModal : openNewBundleModal}
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
            + New {activeTab === "products" ? "Product" : "Bundle"}
          </button>
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
            <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>×</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ marginBottom: "0", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <button style={tabStyle(activeTab === "products")} onClick={() => setActiveTab("products")}>
            Products ({products.length})
          </button>
          <button style={tabStyle(activeTab === "bundles")} onClick={() => setActiveTab("bundles")}>
            Bundles ({bundles.length})
          </button>
        </div>

        {/* Products Tab */}
        {activeTab === "products" && (
          <>
            <div style={{ display: "flex", gap: "12px", marginTop: "24px", marginBottom: "24px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ ...inputStyle, width: "280px" }}
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ ...inputStyle, width: "180px" }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show Inactive
              </label>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.03)" }}>
                    <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Short Name</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Name</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Category</th>
                    <th style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Price</th>
                    <th style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Cost</th>
                    <th style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Margin</th>
                    <th style={{ padding: "14px 16px", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Status</th>
                    <th style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
                        No products found
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => (
                      <tr key={product.id} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", opacity: product.isActive ? 1 : 0.5 }}>
                        <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>{product.sku}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>{product.name}</div>
                          {product.description && (
                            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginTop: "2px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.description}</div>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.7)", fontSize: "14px", textTransform: "capitalize" }}>{product.category || '-'}</td>
                        <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.9)", fontSize: "14px", textAlign: "right", fontWeight: "600" }}>{formatCurrency(product.price)}</td>
                        <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.6)", fontSize: "14px", textAlign: "right" }}>{product.cost ? formatCurrency(product.cost) : '-'}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right", fontSize: "14px" }}>
                          {product.marginPercent ? (
                            <span style={{ color: parseFloat(product.marginPercent) >= 20 ? '#22c55e' : '#f59e0b' }}>{product.marginPercent}%</span>
                          ) : '-'}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "500",
                            background: product.isActive ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.1)",
                            border: product.isActive ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(156, 163, 175, 0.3)",
                            color: product.isActive ? "#22c55e" : "#9ca3af"
                          }}>
                            {product.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button onClick={() => openEditProductModal(product)} style={{ padding: "6px 12px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "6px", color: "#3b82f6", fontSize: "12px", cursor: "pointer" }}>Edit</button>
                            {product.isActive && (
                              <button onClick={() => confirmDeactivateProduct(product)} style={{ padding: "6px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Deactivate</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Bundles Tab */}
        {activeTab === "bundles" && (
          <>
            <div style={{ display: "flex", gap: "12px", marginTop: "24px", marginBottom: "24px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search bundles..."
                value={bundleSearchTerm}
                onChange={(e) => setBundleSearchTerm(e.target.value)}
                style={{ ...inputStyle, width: "280px" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                <input
                  type="checkbox"
                  checked={showBundleInactive}
                  onChange={(e) => setShowBundleInactive(e.target.checked)}
                />
                Show Inactive
              </label>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.03)" }}>
                    <th style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Name</th>
                    <th style={{ padding: "14px 16px", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Items</th>
                    <th style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Total Price</th>
                    <th style={{ padding: "14px 16px", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Status</th>
                    <th style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: "13px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBundles.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
                        No bundles found
                      </td>
                    </tr>
                  ) : (
                    filteredBundles.map((bundle) => (
                      <tr key={bundle.id} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", opacity: bundle.isActive ? 1 : 0.5 }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>{bundle.name}</div>
                          {bundle.description && (
                            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginTop: "2px", maxWidth: "400px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bundle.description}</div>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                          {bundle.itemCount || bundle.items?.length || 0}
                        </td>
                        <td style={{ padding: "14px 16px", color: "#dc2626", fontSize: "14px", textAlign: "right", fontWeight: "600" }}>{formatCurrency(bundle.price)}</td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "500",
                            background: bundle.isActive ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.1)",
                            border: bundle.isActive ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(156, 163, 175, 0.3)",
                            color: bundle.isActive ? "#22c55e" : "#9ca3af"
                          }}>
                            {bundle.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button onClick={() => openEditBundleModal(bundle)} style={{ padding: "6px 12px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "6px", color: "#3b82f6", fontSize: "12px", cursor: "pointer" }}>Edit</button>
                            {bundle.isActive && (
                              <button onClick={() => confirmDeactivateBundle(bundle)} style={{ padding: "6px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Deactivate</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Product Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
            <h2>{editingProduct ? 'Edit Product' : 'New Product'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label>Short Name (SKU) *</label>
                  <input type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} required placeholder="e.g. SL50AAS-VFD" />
                  <span className="modal-hint">Appears on tracking board when order is created</span>
                </div>
                <div className="modal-form-group">
                  <label>Model Number</label>
                  <input type="text" value={formData.modelNumber} onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })} />
                </div>
              </div>
              <div className="modal-form-group">
                <label>Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="modal-form-group">
                <label>Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
              </div>
              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label>Price</label>
                  <input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
                </div>
                <div className="modal-form-group">
                  <label>Cost</label>
                  <input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} />
                </div>
              </div>
              <div className="modal-form-group">
                <label>Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="machine">Machine</option>
                  <option value="accessory">Accessory</option>
                  <option value="service">Service</option>
                  <option value="part">Part</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="modal-form-group" style={{ display: "flex", gap: "20px" }}>
                <label className="modal-checkbox-label">
                  <input type="checkbox" checked={formData.taxable} onChange={(e) => setFormData({ ...formData, taxable: e.target.checked })} />
                  Taxable
                </label>
                <label className="modal-checkbox-label">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
                  Active
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving}>
                  {saving ? 'Saving...' : (editingProduct ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bundle Modal */}
      {showBundleModal && (
        <div className="modal-overlay">
          <div className="modal-content extra-wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "900px", height: "80vh", maxHeight: "750px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <h2 style={{ flexShrink: 0 }}>{editingBundle ? 'Edit Bundle' : 'New Bundle'}</h2>
            <form onSubmit={handleBundleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
              <div className="modal-form-group">
                <label>Bundle Name *</label>
                <input type="text" value={bundleFormData.name} onChange={(e) => setBundleFormData({ ...bundleFormData, name: e.target.value })} required placeholder="e.g. SL-3015 Complete Package" />
              </div>
              <div className="modal-form-group">
                <label>Description</label>
                <textarea value={bundleFormData.description} onChange={(e) => setBundleFormData({ ...bundleFormData, description: e.target.value })} rows={2} />
              </div>

              {/* Products in Bundle */}
              <div className="modal-form-group">
                <label>Products in Bundle {productSearch && searchedProducts.length > 0 && <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: "normal" }}>({searchedProducts.length} found)</span>}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Type to search products..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                  />
                  {showProductDropdown && searchedProducts.length > 0 && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#1a1a1a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      marginTop: 4,
                      maxHeight: "250px",
                      overflow: "auto",
                      zIndex: 100,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
                    }}>
                      {searchedProducts.map(product => (
                        <div
                          key={product.id}
                          onClick={() => addProductToBundle(product)}
                          style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div>
                            <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{product.name}</div>
                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{product.sku}</div>
                          </div>
                          <div style={{ color: "#dc2626", fontWeight: "600" }}>{formatCurrency(product.price)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bundle Items List */}
                {bundleFormData.items.length > 0 ? (
                  <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", overflow: "hidden" }}>
                    {bundleFormData.items.map((item, idx) => (
                      <div key={item.productId} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        background: "rgba(255,255,255,0.02)"
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "14px" }}>{item.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>{item.sku} • {formatCurrency(item.price)} each</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button type="button" onClick={() => updateBundleItemQuantity(item.productId, item.quantity - 1)} style={{ width: 28, height: 28, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>-</button>
                          <span style={{ color: "rgba(255,255,255,0.9)", minWidth: 24, textAlign: "center" }}>{item.quantity}</span>
                          <button type="button" onClick={() => updateBundleItemQuantity(item.productId, item.quantity + 1)} style={{ width: 28, height: 28, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>+</button>
                          <span style={{ color: "#dc2626", fontWeight: "600", minWidth: 80, textAlign: "right" }}>{formatCurrency(item.price * item.quantity)}</span>
                          <button type="button" onClick={() => removeBundleItem(item.productId)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "18px", padding: "0 4px" }}>×</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: "rgba(220, 38, 38, 0.1)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600" }}>Bundle Total:</span>
                      <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "16px" }}>{formatCurrency(bundlePrice)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.4)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px" }}>
                    Search and add products above
                  </div>
                )}
              </div>
              </div>

              <div className="modal-actions" style={{ flexShrink: 0, marginTop: "auto" }}>
                <button type="button" className="modal-btn cancel" onClick={() => setShowBundleModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving || bundleFormData.items.length === 0}>
                  {saving ? 'Saving...' : (editingBundle ? 'Update Bundle' : 'Create Bundle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
