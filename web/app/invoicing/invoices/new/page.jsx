"use client";

export const dynamic = 'force-dynamic';

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

function GripIcon({ color }) {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill={color} style={{ display: "block", margin: "0 auto" }}>
      <circle cx="4" cy="4"  r="2"/>
      <circle cx="4" cy="10" r="2"/>
      <circle cx="4" cy="16" r="2"/>
      <circle cx="10" cy="4"  r="2"/>
      <circle cx="10" cy="10" r="2"/>
      <circle cx="10" cy="16" r="2"/>
    </svg>
  );
}

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();

  const presetCustomerId = searchParams.get('customer');
  const estimateId       = searchParams.get('fromEstimate');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const [customerId,           setCustomerId]           = useState("");
  const [selectedCustomer,     setSelectedCustomer]     = useState(null);
  const [customerSearch,       setCustomerSearch]       = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [paymentTerms,         setPaymentTerms]         = useState("NET30");
  // Default to 50/40/10 — the standard schedule for SMT's custom manufacturing sales
  const [paymentScheduleType,  setPaymentScheduleType]  = useState("50_40_10");
  const [items,                setItems]                = useState([]);
  const [taxRate,              setTaxRate]              = useState(0);
  const [localTaxRate,         setLocalTaxRate]         = useState(6.7);
  const [discountType,         setDiscountType]         = useState("");
  const [discountValue,        setDiscountValue]        = useState("");
  const [shippingAmount,       setShippingAmount]       = useState("");
  const [notes,                setNotes]                = useState("");
  const [internalNotes,        setInternalNotes]        = useState("");
  const [termsConditions,      setTermsConditions]      = useState("");

  const [customers,           setCustomers]           = useState([]);
  const [products,            setProducts]            = useState([]);
  const [bundles,             setBundles]             = useState([]);
  const [productSearch,       setProductSearch]       = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [expandedItems,       setExpandedItems]       = useState({});

  const [dragIndex,        setDragIndex]        = useState(null);
  const [dragOverIndex,    setDragOverIndex]    = useState(null);
  const [hoveredGripIndex, setHoveredGripIndex] = useState(null);
  const dragFromHandleRef = useRef(false);

  const toggleItemExpand = (index) => setExpandedItems(prev => ({ ...prev, [index]: !prev[index] }));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadCustomers();
    loadProducts();
    loadBundles();
    loadInvoicingSettings();
    if (estimateId) loadEstimate(estimateId);
  }, [user, router, estimateId]);

  useEffect(() => {
    if (!presetCustomerId || !user || authLoading) return;
    async function fetchPreset() {
      try {
        const res = await fetch(`/api/customers/${presetCustomerId}`, { headers: getAuthHeaders() });
        if (res.ok) { const c = await res.json(); setCustomerId(c.id); setSelectedCustomer(c); if (c.paymentTerms) setPaymentTerms(c.paymentTerms); }
      } catch (e) { console.error(e); }
    }
    fetchPreset();
  }, [presetCustomerId, user, authLoading]);

  async function loadInvoicingSettings() {
    try {
      const res = await fetch("/api/invoicing-settings", { headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); if (d.defaultTaxRate != null) setLocalTaxRate(parseFloat(d.defaultTaxRate)); }
    } catch (e) { console.error(e); }
  }

  async function loadCustomers() {
    try { const r = await fetch("/api/customers", { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setCustomers(d.filter(c => c.status === "ACTIVE")); } } catch (e) { console.error(e); }
  }
  async function loadProducts() {
    try { const r = await fetch("/api/products", { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setProducts(d.filter(p => p.isActive)); } } catch (e) { console.error(e); }
  }
  async function loadBundles() {
    try { const r = await fetch("/api/bundles", { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setBundles(d.filter(b => b.isActive)); } } catch (e) { console.error(e); }
  }

  async function loadEstimate(estId) {
    try {
      const res = await fetch(`/api/estimates/${estId}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const est = await res.json();
        setCustomerId(est.customerId || "");
        setTaxRate(est.taxRate || 0);
        setDiscountType(est.discountType || ""); setDiscountValue(est.discountValue?.toString() || "");
        setShippingAmount(est.shippingAmount?.toString() || "");
        setNotes(est.notes || ""); setTermsConditions(est.termsConditions || "");
        if (est.customer) { setSelectedCustomer(est.customer); if (est.customer.paymentTerms) setPaymentTerms(est.customer.paymentTerms); }
        if (est.items) setItems(est.items.map((item, idx) => ({ id: Date.now() + idx, productId: item.productId, name: item.name, description: item.description, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost, taxable: item.taxable })));
      }
    } catch (e) { console.error(e); }
  }

  function handleDragStart(e, index) {
    if (!dragFromHandleRef.current) { e.preventDefault(); return; }
    dragFromHandleRef.current = false;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) setDragOverIndex(index);
  }

  function handleDrop(e, dropIndex) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); setDragOverIndex(null); return; }
    const newItems = [...items];
    const [moved] = newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, moved);
    setItems(newItems);
    setExpandedItems({});
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    dragFromHandleRef.current = false;
    setDragIndex(null);
    setDragOverIndex(null);
  }

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.firstName?.toLowerCase().includes(q) || c.lastName?.toLowerCase().includes(q) ||
           c.company?.toLowerCase().includes(q) || c.companyName?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  }).slice(0, 10);

  function selectCustomer(c) { setCustomerId(c.id); setSelectedCustomer(c); setCustomerSearch(""); setShowCustomerDropdown(false); if (c.paymentTerms) setPaymentTerms(c.paymentTerms); }

  function addProduct(product) {
    setItems([...items, { id: Date.now(), productId: product.id, name: product.name, description: product.description, sku: product.sku, quantity: 1, unitPrice: product.price, unitCost: product.cost, taxable: product.taxable !== false }]);
    setProductSearch(""); setShowProductDropdown(false);
  }

  function addBundle(bundle) {
    const bundleItems = (bundle.items || []).map((item, idx) => ({ id: Date.now() + idx, productId: item.productId, name: item.product?.name || item.name, description: item.product?.description, sku: item.product?.sku, quantity: item.quantity || 1, unitPrice: item.unitPrice || item.product?.price || 0, unitCost: item.product?.cost, taxable: item.product?.taxable !== false, fromBundleName: bundle.name }));
    setItems([...items, ...bundleItems]);
    setProductSearch(""); setShowProductDropdown(false);
  }

  function addCustomItem() { setItems([...items, { id: Date.now(), name: "", description: "", quantity: 1, unitPrice: 0, taxable: true }]); }
  function updateItem(index, field, value) { const n = [...items]; n[index] = { ...n[index], [field]: value }; setItems(n); }
  function removeItem(index) { setItems(items.filter((_, i) => i !== index)); }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmount = discountType === "PERCENTAGE" && discountValue ? subtotal * (parseFloat(discountValue) / 100) : discountType === "FIXED" && discountValue ? parseFloat(discountValue) : 0;
  const taxableAmount = items.filter(i => i.taxable).reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = (taxableAmount - discountAmount * (taxableAmount / subtotal || 0)) * (taxRate / 100);
  const shipping = parseFloat(shippingAmount) || 0;
  const total = subtotal - discountAmount + taxAmount + shipping;

  const filteredProducts = products.filter(p => !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase()));
  const filteredBundles  = bundles.filter(b => !productSearch || b.name?.toLowerCase().includes(productSearch.toLowerCase()));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!customerId) { setError("Please select a customer"); return; }
    if (items.length === 0) { setError("Please add at least one item"); return; }
    for (const item of items) { if (!item.name) { setError("All items must have a name"); return; } }
    setSaving(true);
    try {
      const endpoint = estimateId ? `/api/invoices/from-estimate/${estimateId}` : "/api/invoices";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ customerId, paymentTerms, paymentScheduleType, items: items.map(item => ({ productId: item.productId, name: item.name, description: item.description, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost, taxable: item.taxable })), taxRate, discountType: discountType || null, discountValue: discountValue ? parseFloat(discountValue) : null, shippingAmount: shipping, notes, internalNotes, termsConditions, estimateId: estimateId || null })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to create invoice"); }
      const invoice = await res.json();
      router.push(`/invoicing/invoices/${invoice.id}`);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  const inp = { padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", fontSize: 14, width: "100%", boxSizing: "border-box" };
  const sec = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 24, marginBottom: 24 };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80, paddingBottom: 60 }}>

        <div style={{ marginBottom: 24 }}>
          <Link href="/invoicing/invoices" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 8 }}>← Back to Invoices</Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{estimateId ? "Create Invoice from Estimate" : "New Invoice"}</h1>
        </div>

        {error && <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>{error}</div>}

        <form onSubmit={handleSubmit}>

          {/* CUSTOMER + PAYMENT TERMS */}
          <div style={sec}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.7px" }}>Customer</h2>
                <div style={{ position: "relative" }}>
                  {selectedCustomer ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{selectedCustomer.companyName || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{selectedCustomer.firstName} {selectedCustomer.lastName}{selectedCustomer.email && ` · ${selectedCustomer.email}`}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginTop: 2 }}>{selectedCustomer.customerNumber}</div>
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
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, marginTop: 4, maxHeight: 300, overflow: "auto", zIndex: 100 }}>
                          {filteredCustomers.map(c => (
                            <div key={c.id} onClick={() => selectCustomer(c)}
                              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                              <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{c.companyName || `${c.firstName} ${c.lastName}`}</div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{c.email}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.7px" }}>Payment Terms</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Terms</label>
                    <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                      <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                      <option value="NET15">Net 15</option>
                      <option value="NET30">Net 30</option>
                      <option value="NET45">Net 45</option>
                      <option value="NET60">Net 60</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Payment Schedule</label>
                    <select value={paymentScheduleType} onChange={(e) => setPaymentScheduleType(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                      <option value="NONE">Full Payment (no schedule)</option>
                      <option value="DEPOSIT_BALANCE">50% Deposit / 50% Balance</option>
                      <option value="50_40_10">50% Deposit / 40% Progress / 10% Final</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LINE ITEMS */}
          <div style={sec}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.7px", margin: 0 }}>Line Items</h2>
              <button type="button" onClick={addCustomItem}
                style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 13 }}>+ Custom Item</button>
            </div>

            <div style={{ position: "relative", marginBottom: 16 }}>
              <input type="text" placeholder="Search products or bundles to add…" value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                onFocus={() => setShowProductDropdown(true)} style={inp} />
              {showProductDropdown && (filteredProducts.length > 0 || filteredBundles.length > 0) && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, marginTop: 4, maxHeight: 300, overflow: "auto", zIndex: 100 }}>
                  {filteredBundles.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Bundles</div>
                      {filteredBundles.map(b => (
                        <div key={`b-${b.id}`} onClick={() => addBundle(b)}
                          style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                          <div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{b.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{b.items?.length} items</div></div>
                          <div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(b.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                  {filteredProducts.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Products</div>
                      {filteredProducts.map(p => (
                        <div key={`p-${p.id}`} onClick={() => addProduct(p)}
                          style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                          <div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{p.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{p.sku}</div></div>
                          <div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(p.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {items.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: 8, width: 32 }}></th>
                    <th style={{ padding: 8, width: 30 }}></th>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Item</th>
                    <th style={{ padding: 8, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", width: 80 }}>Qty</th>
                    <th style={{ padding: 8, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)", width: 120 }}>Price</th>
                    <th style={{ padding: 8, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)", width: 100 }}>Total</th>
                    <th style={{ padding: 8, width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const isDragging   = dragIndex === index;
                    const isDropTarget = dragOverIndex === index && dragIndex !== index;
                    const gripHovered  = hoveredGripIndex === index;
                    return (
                      <>
                        <tr
                          key={item.id}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e)  => handleDragOver(e, index)}
                          onDrop={(e)      => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          style={{
                            borderBottom: expandedItems[index] ? "none" : "1px solid rgba(255,255,255,0.05)",
                            borderTop: isDropTarget ? "2px solid #dc2626" : "2px solid transparent",
                            opacity: isDragging ? 0.35 : 1,
                            background: isDropTarget ? "rgba(220,38,38,0.04)" : "transparent",
                            transition: "opacity 0.15s, background 0.1s",
                          }}
                        >
                          <td
                            onMouseDown={() => { dragFromHandleRef.current = true; }}
                            onMouseUp={()   => { dragFromHandleRef.current = false; }}
                            onMouseEnter={() => setHoveredGripIndex(index)}
                            onMouseLeave={() => setHoveredGripIndex(null)}
                            style={{ padding: "8px 4px", verticalAlign: "middle", cursor: "grab", userSelect: "none", textAlign: "center", width: 32, background: gripHovered ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: 4, transition: "background 0.1s" }}
                          >
                            <GripIcon color={gripHovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)"} />
                          </td>

                          <td style={{ padding: "12px 4px", verticalAlign: "top" }}>
                            <button type="button" onClick={() => toggleItemExpand(index)} draggable={false}
                              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, padding: 4, transform: expandedItems[index] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</button>
                          </td>

                          <td style={{ padding: "12px 8px" }}>
                            <input type="text" value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} placeholder="Item name" style={{ ...inp, padding: "6px 10px" }} required draggable={false} />
                            {item.sku && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sku}</div>}
                            {item.fromBundleName && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>From: {item.fromBundleName}</div>}
                            {item.description && !expandedItems[index] && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic" }}>{item.description.length > 60 ? item.description.substring(0, 60) + "\u2026" : item.description}</div>}
                          </td>

                          <td style={{ padding: "12px 8px", textAlign: "center", verticalAlign: "top" }}>
                            <input type="number" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 1)} style={{ ...inp, width: 60, textAlign: "center", padding: 6 }} min="1" draggable={false} />
                          </td>

                          <td style={{ padding: "12px 8px", textAlign: "right", verticalAlign: "top" }}>
                            <input type="number" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} style={{ ...inp, width: 100, textAlign: "right", padding: 6 }} step="0.01" draggable={false} />
                          </td>

                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 500, color: "rgba(255,255,255,0.9)", verticalAlign: "top", paddingTop: 18 }}>
                            {fmt(item.quantity * item.unitPrice)}
                          </td>

                          <td style={{ padding: "12px 4px", textAlign: "center", verticalAlign: "top" }}>
                            <button type="button" onClick={() => removeItem(index)} draggable={false}
                              style={{ background: "transparent", border: "none", color: "rgba(220,38,38,0.7)", cursor: "pointer", fontSize: 18, padding: "2px", lineHeight: 1 }}>×</button>
                          </td>
                        </tr>

                        {expandedItems[index] && (
                          <tr key={`${item.id}-details`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <td></td>
                            <td></td>
                            <td colSpan={5} style={{ padding: "0 8px 16px 8px" }}>
                              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, marginTop: 4 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                  <div>
                                    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Short Name / SKU</label>
                                    <input type="text" value={item.sku || ""} onChange={(e) => updateItem(index, "sku", e.target.value)} style={{ ...inp, padding: "6px 10px", fontSize: 13 }} placeholder="e.g. SL50AAS-VFD" draggable={false} />
                                  </div>
                                  <div>
                                    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Unit Cost</label>
                                    <input type="number" value={item.unitCost || ""} onChange={(e) => updateItem(index, "unitCost", parseFloat(e.target.value) || null)} style={{ ...inp, padding: "6px 10px", fontSize: 13 }} step="0.01" placeholder="$0.00" draggable={false} />
                                  </div>
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Description</label>
                                  <textarea value={item.description || ""} onChange={(e) => updateItem(index, "description", e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13, minHeight: 80, resize: "vertical" }} placeholder="Item description…" />
                                </div>
                                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                                    <input type="checkbox" checked={item.taxable !== false} onChange={(e) => updateItem(index, "taxable", e.target.checked)} style={{ cursor: "pointer" }} />
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
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>Search for products above or add a custom item</div>
            )}
          </div>

          {/* PRICING + TOTALS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={sec}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.7px" }}>Pricing</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Tax</label>
                  <select value={String(taxRate)} onChange={(e) => setTaxRate(parseFloat(e.target.value))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="0">Out of State — 0%</option>
                    <option value={String(localTaxRate)}>Pinal County Sales Tax (Local) — {localTaxRate}%</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Discount Type</label>
                    <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                      <option value="">No Discount</option>
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FIXED">Fixed Amount</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>{discountType === "PERCENTAGE" ? "Discount %" : "Discount $"}</label>
                    <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} style={inp} step="0.01" disabled={!discountType} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Shipping</label>
                  <input type="number" value={shippingAmount} onChange={(e) => setShippingAmount(e.target.value)} style={inp} step="0.01" min="0" placeholder="0.00" />
                </div>
              </div>
            </div>
            <div style={sec}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.7px" }}>Summary</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Subtotal:</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(subtotal)}</span></div>
                {discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Discount{discountType === "PERCENTAGE" ? ` (${discountValue}%)` : ""}:</span><span style={{ color: "#10b981" }}>-{fmt(discountAmount)}</span></div>}
                {taxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Tax ({taxRate}%):</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(taxAmount)}</span></div>}
                {shipping > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>Shipping:</span><span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(shipping)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 16 }}>Total:</span>
                  <span style={{ fontWeight: 700, color: "#dc2626", fontSize: 20 }}>{fmt(total)}</span>
                </div>
              </div>

              {/* Payment schedule preview — always show for the default 50/40/10 */}
              {paymentScheduleType !== "NONE" && total > 0 && (
                <div style={{ marginTop: 20, padding: 16, background: "rgba(220,38,38,0.06)", borderRadius: 10, border: "1px solid rgba(220,38,38,0.2)" }}>
                  <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment Schedule</div>
                  {paymentScheduleType === "DEPOSIT_BALANCE" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                        <span>Deposit (50%)</span><span style={{ fontWeight: 600 }}>{fmt(total * 0.5)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
                        <span>Balance (50%)</span><span style={{ fontWeight: 600 }}>{fmt(total * 0.5)}</span>
                      </div>
                    </>
                  )}
                  {paymentScheduleType === "50_40_10" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                        <span>Deposit (50%)</span><span style={{ fontWeight: 600, color: "#f59e0b" }}>{fmt(total * 0.5)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                        <span>Progress Payment (40%)</span><span style={{ fontWeight: 600 }}>{fmt(total * 0.4)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
                        <span>Final Payment (10%)</span><span style={{ fontWeight: 600 }}>{fmt(total * 0.1)}</span>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                        Deposit triggers order creation. Progress payment due at shipping. Final payment due at delivery.
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* NOTES */}
          <div style={sec}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.7px" }}>Notes</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Customer Notes (visible to customer)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Any notes for the customer…" /></div>
              <div><label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Internal Notes (not visible to customer)</label><textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical", background: "rgba(234,179,8,0.05)" }} placeholder="Internal notes…" /></div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Terms & Conditions</label>
              <textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Payment terms, warranty info, etc…" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Link href="/invoicing/invoices" style={{ padding: "12px 24px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", textDecoration: "none", fontSize: 14 }}>Cancel</Link>
            <button type="submit" disabled={saving}
              style={{ padding: "12px 24px", background: saving ? "rgba(220,38,38,0.5)" : "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>
              {saving ? "Creating\u2026" : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)" }}>Loading...</div>}>
      <NewInvoiceContent />
    </Suspense>
  );
}
