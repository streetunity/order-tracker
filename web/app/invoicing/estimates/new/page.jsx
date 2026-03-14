"use client";

export const dynamic = 'force-dynamic';

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUnsavedChanges } from "@/contexts/UnsavedChangesContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

function NewEstimateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId       = searchParams.get('templateId');
  const presetCustomerId = searchParams.get('customer');
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges, navigateWithWarning: globalNavigateWithWarning } = useUnsavedChanges();

  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [templateName, setTemplateName] = useState("");

  // Customer
  const [customerId,           setCustomerId]           = useState("");
  const [customers,            setCustomers]            = useState([]);
  const [customerSearch,       setCustomerSearch]       = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer,     setSelectedCustomer]     = useState(null);

  // Dates
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate,   setExpiryDate]   = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  // Items
  const [items,               setItems]               = useState([]);
  const [products,            setProducts]            = useState([]);
  const [bundles,             setBundles]             = useState([]);
  const [productSearch,       setProductSearch]       = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [expandedItems,       setExpandedItems]       = useState({});

  // Pricing
  const [taxRate,         setTaxRate]         = useState(0);
  const [localTaxRate,    setLocalTaxRate]    = useState(6.7);   // loaded from settings
  const [discountType,    setDiscountType]    = useState("");
  const [discountValue,   setDiscountValue]   = useState("");
  const [shippingAmount,  setShippingAmount]  = useState("");

  // Notes
  const [notes,           setNotes]           = useState("");
  const [internalNotes,   setInternalNotes]   = useState("");
  const [termsConditions, setTermsConditions] = useState("");

  // Templates
  const [templates,         setTemplates]         = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [formSubmitted,     setFormSubmitted]     = useState(false);

  const hasUnsavedChanges = !formSubmitted && (
    items.length > 0 || customerId !== "" || notes !== "" ||
    internalNotes !== "" || discountValue !== "" || shippingAmount !== ""
  );

  useEffect(() => {
    setGlobalUnsavedChanges(hasUnsavedChanges);
    return () => setGlobalUnsavedChanges(false);
  }, [hasUnsavedChanges, setGlobalUnsavedChanges]);

  useEffect(() => {
    const fn = (e) => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; return ""; } };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const fn = () => {
      window.history.pushState(null, '', window.location.href);
      globalNavigateWithWarning(document.referrer || '/invoicing/estimates', router);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', fn);
    return () => window.removeEventListener('popstate', fn);
  }, [hasUnsavedChanges, globalNavigateWithWarning, router]);

  function navigateWithWarning(url) { globalNavigateWithWarning(url, router); }
  const toggleItemExpand = (index) => setExpandedItems(prev => ({ ...prev, [index]: !prev[index] }));

  // ── Initial data load ─────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadCustomers();
    loadProducts();
    loadBundles();
    loadTemplates();
    loadInvoicingSettings();
    if (templateId) loadTemplate(templateId);
  }, [user, router, templateId]);

  // Auto-populate customer from URL param
  useEffect(() => {
    if (!presetCustomerId || !user || authLoading) return;
    async function fetchPreset() {
      try {
        const res = await fetch(`/api/customers/${presetCustomerId}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const c = await res.json();
          setCustomerId(c.id);
          setSelectedCustomer(c);
        }
      } catch (e) { console.error("Error loading preset customer:", e); }
    }
    fetchPreset();
  }, [presetCustomerId, user, authLoading]);

  async function loadInvoicingSettings() {
    try {
      const res = await fetch("/api/invoicing-settings", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.defaultTaxRate != null) setLocalTaxRate(parseFloat(data.defaultTaxRate));
      }
    } catch (e) { console.error("Error loading invoicing settings:", e); }
  }

  async function loadTemplate(id) {
    try {
      const res = await fetch(`/api/estimate-templates/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const template = await res.json();
        setTemplateName(template.name);
        setNotes(template.notes || "");
        setInternalNotes(template.internalNotes || "");
        setTermsConditions(template.termsConditions || "");
        if (template.validityDays) {
          const d = new Date();
          d.setDate(d.getDate() + template.validityDays);
          setExpiryDate(d.toISOString().split('T')[0]);
        }
        if (template.items?.length > 0) {
          setItems(template.items.map(item => ({
            tempId: Date.now() + Math.random(),
            productId: item.productId || null,
            bundleId:  item.bundleId  || null,
            name:        item.product?.name || item.bundle?.name || item.customName || "",
            description: item.product?.description || item.bundle?.description || item.customDescription || "",
            sku:         item.product?.sku || item.bundle?.sku || "",
            quantity:    item.quantity || 1,
            unitPrice:   item.product?.price || item.bundle?.price || item.customPrice || 0,
            unitCost:    item.product?.cost || item.bundle?.cost || null,
            taxable:     item.product?.taxable !== false
          })));
        }
      }
    } catch (e) { console.error("Error loading template:", e); }
  }

  async function loadCustomers() {
    try {
      const res = await fetch("/api/customers", { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setCustomers(data.filter(c => c.status === "ACTIVE" && !c.isDeleted)); }
    } catch (e) { console.error(e); }
  }

  async function loadProducts() {
    try {
      const res = await fetch("/api/products", { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setProducts(data.filter(p => p.isActive)); }
    } catch (e) { console.error(e); }
  }

  async function loadBundles() {
    try {
      const res = await fetch("/api/bundles", { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setBundles(data.filter(b => b.isActive)); }
    } catch (e) { console.error(e); }
  }

  async function loadTemplates() {
    try {
      const res = await fetch("/api/estimate-templates", { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setTemplates(data.filter(t => t.isActive)); }
    } catch (e) { console.error(e); }
  }

  function applyTemplate(template) {
    setTemplateName(template.name);
    setNotes(template.notes || "");
    setInternalNotes(template.internalNotes || "");
    setTermsConditions(template.termsConditions || "");
    if (template.validityDays) {
      const d = new Date();
      d.setDate(d.getDate() + template.validityDays);
      setExpiryDate(d.toISOString().split('T')[0]);
    }
    if (template.items?.length > 0) {
      setItems(template.items.map(item => ({
        tempId: Date.now() + Math.random(),
        productId: item.productId || null, bundleId: item.bundleId || null,
        name: item.product?.name || item.bundle?.name || item.customName || "",
        description: item.product?.description || item.bundle?.description || item.customDescription || "",
        sku: item.product?.sku || item.bundle?.sku || "",
        quantity: item.quantity || 1,
        unitPrice: item.product?.price || item.bundle?.price || item.customPrice || 0,
        unitCost: item.product?.cost || item.bundle?.cost || null,
        taxable: item.product?.taxable !== false
      })));
    }
    setShowTemplateModal(false);
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmount = discountType === 'PERCENTAGE'
    ? subtotal * (parseFloat(discountValue) || 0) / 100
    : discountType === 'FIXED' ? parseFloat(discountValue) || 0 : 0;
  const taxableAmount = items.filter(i => i.taxable !== false).reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = (taxableAmount - discountAmount * (taxableAmount / subtotal || 0)) * (taxRate / 100);
  const total = subtotal - discountAmount + taxAmount + (parseFloat(shippingAmount) || 0);

  // ── Filtered lists ────────────────────────────────────────────────────────

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.firstName?.toLowerCase().includes(q) || c.lastName?.toLowerCase().includes(q) ||
           c.company?.toLowerCase().includes(q) || c.companyName?.toLowerCase().includes(q) ||
           c.email?.toLowerCase().includes(q);
  }).slice(0, 10);

  const filteredProducts = products.filter(p => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
  });
  const filteredBundles = bundles.filter(b => {
    if (!productSearch) return true;
    return b.name?.toLowerCase().includes(productSearch.toLowerCase());
  });

  // ── Item actions ──────────────────────────────────────────────────────────

  function selectCustomer(c) {
    setCustomerId(c.id); setSelectedCustomer(c); setCustomerSearch(""); setShowCustomerDropdown(false);
  }

  function addProduct(product) {
    setItems([...items, { tempId: Date.now(), productId: product.id, name: product.name, description: product.description, sku: product.sku, quantity: 1, unitPrice: product.price, unitCost: product.cost, taxable: product.taxable }]);
    setProductSearch(""); setShowProductDropdown(false);
  }

  function addBundle(bundle) {
    if (bundle.items?.length > 0) {
      const bTotal = bundle.items.reduce((s, bi) => s + bi.product.price * bi.quantity, 0);
      setItems([...items, ...bundle.items.map(bi => {
        const ratio = bTotal > 0 ? (bi.product.price * bi.quantity) / bTotal : 0;
        return { tempId: Date.now() + Math.random(), productId: bi.productId, name: bi.product.name, description: bi.product.description, sku: bi.product.sku, quantity: bi.quantity, unitPrice: (bundle.price * ratio) / bi.quantity, unitCost: bi.product.cost, taxable: bi.product.taxable, fromBundleId: bundle.id, fromBundleName: bundle.name };
      })]);
    }
    setProductSearch(""); setShowProductDropdown(false);
  }

  function addCustomItem() {
    setItems([...items, { tempId: Date.now(), name: "Custom Item", description: "", quantity: 1, unitPrice: 0, taxable: true }]);
  }

  function updateItem(index, field, value) {
    const n = [...items]; n[index] = { ...n[index], [field]: value }; setItems(n);
  }
  function removeItem(index) { setItems(items.filter((_, i) => i !== index)); }
  function moveItem(index, dir) {
    const ni = dir === 'up' ? index - 1 : index + 1;
    if (ni < 0 || ni >= items.length) return;
    const n = [...items]; const [m] = n.splice(index, 1); n.splice(ni, 0, m); setItems(n);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!customerId) { setError("Please select a customer"); return; }
    if (items.length === 0) { setError("Please add at least one item"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          customerId, estimateDate, expiryDate,
          items: items.map(item => ({ productId: item.productId, fromBundleId: item.fromBundleId, fromBundleName: item.fromBundleName, name: item.name, description: item.description, sku: item.sku, quantity: parseFloat(item.quantity) || 1, unitPrice: parseFloat(item.unitPrice) || 0, unitCost: item.unitCost ? parseFloat(item.unitCost) : null, taxable: item.taxable })),
          taxRate: parseFloat(taxRate) || 0,
          discountType: discountType || null,
          discountValue: discountValue ? parseFloat(discountValue) : null,
          shippingAmount: parseFloat(shippingAmount) || 0,
          notes, internalNotes, termsConditions
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFormSubmitted(true);
      router.push(`/invoicing/estimates/${data.id}`);
    } catch (err) { setError(err.message); setLoading(false); }
  }

  const inp = { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px" };
  const lbl = { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "500", color: "rgba(255,255,255,0.7)" };
  const sec = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: 24, marginBottom: 24 };
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80, paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button type="button" onClick={() => navigateWithWarning("/invoicing/estimates")}
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            ← Back to Estimates
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>New Estimate</h1>
              {templateName && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginTop: 4 }}>From template: <span style={{ color: "rgba(255,255,255,0.7)" }}>{templateName}</span></p>}
            </div>
            {templates.length > 0 && !templateName && (
              <button type="button" onClick={() => setShowTemplateModal(true)}
                style={{ padding: "10px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>📋</span> Use Template
              </button>
            )}
          </div>
        </div>

        {error && <div style={{ padding: "12px 16px", marginBottom: "20px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#ef4444" }}>{error}</div>}

        <form onSubmit={handleSubmit}>

          {/* ── CUSTOMER + DATES ── */}
          <div style={sec}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
              {/* LEFT: Customer */}
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.7px" }}>Customer</h2>
                <div style={{ position: "relative" }}>
                  {selectedCustomer ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{selectedCustomer.companyName || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}</div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{selectedCustomer.firstName} {selectedCustomer.lastName}{selectedCustomer.email && ` · ${selectedCustomer.email}`}</div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginTop: 2 }}>{selectedCustomer.customerNumber}</div>
                      </div>
                      <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerId(""); }}
                        style={{ padding: "4px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12 }}>Change</button>
                    </div>
                  ) : (
                    <>
                      <input type="text" placeholder="Search customers…" value={customerSearch}
                        onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                        onFocus={() => setShowCustomerDropdown(true)} style={inp} />
                      {showCustomerDropdown && filteredCustomers.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", marginTop: 4, maxHeight: "300px", overflow: "auto", zIndex: 100 }}>
                          {filteredCustomers.map(c => (
                            <div key={c.id} onClick={() => selectCustomer(c)}
                              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                              <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{c.companyName || `${c.firstName} ${c.lastName}`}</div>
                              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>{c.email}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* RIGHT: Dates */}
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.7px" }}>Dates</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div><label style={lbl}>Estimate Date</label><input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} style={inp} /></div>
                  <div><label style={lbl}>Expiry Date</label><input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={inp} /></div>
                </div>
              </div>
            </div>
          </div>

          {/* ── LINE ITEMS ── */}
          <div style={sec}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.7px", margin: 0 }}>Line Items</h2>
              <button type="button" onClick={addCustomItem}
                style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: "13px" }}>+ Custom Item</button>
            </div>

            {/* Product search */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <input type="text" placeholder="Search products or bundles to add…" value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                onFocus={() => setShowProductDropdown(true)} style={inp} />
              {showProductDropdown && (filteredProducts.length > 0 || filteredBundles.length > 0) && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", marginTop: 4, maxHeight: "400px", overflow: "auto", zIndex: 100 }}>
                  {filteredBundles.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Bundles</div>
                      {filteredBundles.map(b => (
                        <div key={`b-${b.id}`} onClick={() => addBundle(b)}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                          <div>
                            <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{b.name}</div>
                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{b.itemCount || b.items?.length || 0} items</div>
                          </div>
                          <div style={{ color: "#dc2626", fontWeight: "600" }}>{fmt(b.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                  {filteredProducts.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Products</div>
                      {filteredProducts.map(p => (
                        <div key={`p-${p.id}`} onClick={() => addProduct(p)}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                          <div>
                            <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{p.name}</div>
                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{p.sku}</div>
                          </div>
                          <div style={{ color: "#dc2626", fontWeight: "600" }}>{fmt(p.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Items table */}
            {items.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: "8px", width: 30 }}></th>
                    <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Item</th>
                    <th style={{ padding: "8px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: 80 }}>Qty</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: 120 }}>Price</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: 120 }}>Total</th>
                    <th style={{ padding: "8px", width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <>
                      <tr key={item.tempId || index} style={{ borderBottom: expandedItems[index] ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "8px", verticalAlign: "top" }}>
                          <button type="button" onClick={() => toggleItemExpand(index)}
                            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "12px", padding: "4px", transform: expandedItems[index] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</button>
                        </td>
                        <td style={{ padding: "8px" }}>
                          <input type="text" value={item.name} onChange={(e) => updateItem(index, 'name', e.target.value)} style={{ ...inp, padding: "6px 10px" }} />
                          {item.sku && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sku}</div>}
                          {item.fromBundleName && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>From: {item.fromBundleName}</div>}
                          {item.description && !expandedItems[index] && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic" }}>{item.description.length > 60 ? item.description.substring(0, 60) + "…" : item.description}</div>}
                        </td>
                        <td style={{ padding: "8px", verticalAlign: "top" }}>
                          <input type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} style={{ ...inp, padding: "6px 10px", textAlign: "center" }} min="1" />
                        </td>
                        <td style={{ padding: "8px", verticalAlign: "top" }}>
                          <input type="number" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} style={{ ...inp, padding: "6px 10px", textAlign: "right" }} step="0.01" />
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "500", color: "rgba(255,255,255,0.9)", verticalAlign: "top", paddingTop: 14 }}>{fmt(item.quantity * item.unitPrice)}</td>
                        <td style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                            <button type="button" onClick={() => moveItem(index, 'up')} disabled={index === 0} style={{ background: "transparent", border: "none", color: index === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.5)", cursor: index === 0 ? "not-allowed" : "pointer", fontSize: 12, padding: "2px 4px" }}>▲</button>
                            <button type="button" onClick={() => moveItem(index, 'down')} disabled={index === items.length - 1} style={{ background: "transparent", border: "none", color: index === items.length - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.5)", cursor: index === items.length - 1 ? "not-allowed" : "pointer", fontSize: 12, padding: "2px 4px" }}>▼</button>
                            <button type="button" onClick={() => removeItem(index)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "2px 4px" }}>×</button>
                          </div>
                        </td>
                      </tr>
                      {expandedItems[index] && (
                        <tr key={`${item.tempId || index}-details`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td></td>
                          <td colSpan={5} style={{ padding: "0 8px 16px 8px" }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "12px", marginTop: 4 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Short Name / SKU</label>
                                  <input type="text" value={item.sku || ""} onChange={(e) => updateItem(index, 'sku', e.target.value)} style={{ ...inp, padding: "6px 10px", fontSize: 13 }} placeholder="e.g. SL50AAS-VFD" />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Unit Cost</label>
                                  <input type="number" value={item.unitCost || ""} onChange={(e) => updateItem(index, 'unitCost', e.target.value)} style={{ ...inp, padding: "6px 10px", fontSize: 13 }} step="0.01" placeholder="$0.00" />
                                </div>
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Description</label>
                                <textarea value={item.description || ""} onChange={(e) => updateItem(index, 'description', e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13, minHeight: 80, resize: "vertical" }} placeholder="Enter item description…" />
                              </div>
                              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                                  <input type="checkbox" checked={item.taxable !== false} onChange={(e) => updateItem(index, 'taxable', e.target.checked)} style={{ cursor: "pointer" }} />
                                  Taxable
                                </label>
                                {item.unitCost && item.unitPrice > 0 && (
                                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Margin: {((1 - item.unitCost / item.unitPrice) * 100).toFixed(1)}%</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>No items added yet. Search for products or add a custom item.</div>
            )}
          </div>

          {/* ── PRICING ── */}
          <div style={sec}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.7px" }}>Pricing</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>

              {/* ── Tax — named options instead of free input ── */}
              <div>
                <label style={lbl}>Tax</label>
                <select
                  value={String(taxRate)}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value))}
                  style={inp}
                >
                  <option value="0">Out of State — 0%</option>
                  <option value={String(localTaxRate)}>Pinal County Sales Tax (Local) — {localTaxRate}%</option>
                </select>
              </div>

              <div>
                <label style={lbl}>Discount Type</label>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={inp}>
                  <option value="">No Discount</option>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Discount Value</label>
                <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} style={inp} step="0.01" min="0" disabled={!discountType} placeholder={discountType === 'PERCENTAGE' ? '0%' : '$0.00'} />
              </div>
            </div>
            <div style={{ maxWidth: 200 }}>
              <label style={lbl}>Shipping</label>
              <input type="number" value={shippingAmount} onChange={(e) => setShippingAmount(e.target.value)} style={inp} step="0.01" min="0" placeholder="$0.00" />
            </div>

            {/* Totals */}
            <div style={{ marginTop: 24, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Subtotal:</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(subtotal)}</span></div>
              {discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Discount:</span><span style={{ color: "#10b981" }}>-{fmt(discountAmount)}</span></div>}
              {taxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Tax ({taxRate}%):</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(taxAmount)}</span></div>}
              {parseFloat(shippingAmount) > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Shipping:</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(shippingAmount)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>Total:</span>
                <span style={{ fontWeight: "700", color: "#dc2626", fontSize: 18 }}>{fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* ── NOTES ── */}
          <div style={sec}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.7px" }}>Notes</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <div><label style={lbl}>Customer Notes (visible on estimate)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Notes for the customer…" /></div>
              <div><label style={lbl}>Internal Notes (not visible to customer)</label><textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Internal notes…" /></div>
              <div><label style={lbl}>Terms & Conditions</label><textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Terms and conditions…" /></div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => navigateWithWarning("/invoicing/estimates")}
              style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading}
              style={{ padding: "10px 24px", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 8, color: "white", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Creating…" : "Create Estimate"}
            </button>
          </div>
        </form>
      </div>

      {/* Template modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
            <h2>Select a Template</h2>
            {templates.length === 0 ? (
              <p style={{ color: "#a0a0a0", textAlign: "center", padding: "20px 0" }}>No templates available</p>
            ) : (
              <div className="modal-list">
                {templates.map(t => (
                  <div key={t.id} className="modal-list-item" onClick={() => applyTemplate(t)}>
                    <div className="modal-list-item-title">{t.name}</div>
                    {t.description && <div className="modal-list-item-description">{t.description}</div>}
                    <div className="modal-list-item-meta">{t.items?.length || 0} item{(t.items?.length || 0) !== 1 ? 's' : ''}{t.validityDays && ` · Valid for ${t.validityDays} days`}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions"><button type="button" className="modal-btn cancel" onClick={() => setShowTemplateModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}

export default function NewEstimatePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)" }}>Loading...</div>}>
      <NewEstimateContent />
    </Suspense>
  );
}
