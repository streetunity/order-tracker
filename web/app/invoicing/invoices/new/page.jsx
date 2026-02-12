"use client";

export const dynamic = 'force-dynamic';

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("NET30");
  const [paymentScheduleType, setPaymentScheduleType] = useState("NONE");
  const [items, setItems] = useState([]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [shippingAmount, setShippingAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [termsConditions, setTermsConditions] = useState("");

  // Data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [bundles, setBundles] = useState([]);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  const toggleItemExpand = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Pre-fill from estimate if provided
  const estimateId = searchParams.get('fromEstimate');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadCustomers();
    loadProducts();
    loadBundles();

    if (estimateId) {
      loadEstimate(estimateId);
    }
  }, [user, router, estimateId]);

  async function loadCustomers() {
    try {
      const res = await fetch("/api/customers", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.filter(c => c.status === "ACTIVE"));
      }
    } catch (e) {
      console.error("Error loading customers:", e);
    }
  }

  async function loadProducts() {
    try {
      const res = await fetch("/api/products", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.filter(p => p.isActive));
      }
    } catch (e) {
      console.error("Error loading products:", e);
    }
  }

  async function loadBundles() {
    try {
      const res = await fetch("/api/bundles", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBundles(data.filter(b => b.isActive));
      }
    } catch (e) {
      console.error("Error loading bundles:", e);
    }
  }

  async function loadEstimate(estId) {
    try {
      const res = await fetch(`/api/estimates/${estId}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const estimate = await res.json();
        // Pre-fill from estimate
        setCustomerId(estimate.customerId || "");
        setTaxRate(estimate.taxRate || 0);
        setDiscountType(estimate.discountType || "");
        setDiscountValue(estimate.discountValue?.toString() || "");
        setShippingAmount(estimate.shippingAmount?.toString() || "");
        setNotes(estimate.notes || "");
        setTermsConditions(estimate.termsConditions || "");

        // Convert items
        if (estimate.items) {
          setItems(estimate.items.map(item => ({
            id: Date.now() + Math.random(),
            productId: item.productId,
            name: item.name,
            description: item.description,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            taxable: item.taxable
          })));
        }
      }
    } catch (e) {
      console.error("Error loading estimate:", e);
    }
  }

  function addProduct(product) {
    setItems([...items, {
      id: Date.now(),
      productId: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      quantity: 1,
      unitPrice: product.price,
      unitCost: product.cost,
      taxable: product.taxable !== false
    }]);
    setProductSearch("");
    setShowProductDropdown(false);
  }

  function addBundle(bundle) {
    // Add all products from bundle
    const bundleItems = (bundle.items || []).map((item, idx) => ({
      id: Date.now() + idx,
      productId: item.productId,
      name: item.product?.name || item.name,
      description: item.product?.description,
      sku: item.product?.sku,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.product?.price || 0,
      unitCost: item.product?.cost,
      taxable: item.product?.taxable !== false,
      fromBundleName: bundle.name
    }));
    setItems([...items, ...bundleItems]);
    setProductSearch("");
    setShowProductDropdown(false);
  }

  function addCustomItem() {
    setItems([...items, {
      id: Date.now(),
      name: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxable: true
    }]);
  }

  function updateItem(id, field, value) {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  }

  function removeItem(id) {
    setItems(items.filter(item => item.id !== id));
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  let discountAmount = 0;
  if (discountType === "PERCENTAGE" && discountValue) {
    discountAmount = subtotal * (parseFloat(discountValue) / 100);
  } else if (discountType === "FIXED" && discountValue) {
    discountAmount = parseFloat(discountValue);
  }

  const taxableAmount = items
    .filter(item => item.taxable)
    .reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const taxableAfterDiscount = taxableAmount - (discountAmount * (taxableAmount / subtotal || 0));
  const taxAmount = taxableAfterDiscount * (taxRate / 100);

  const shipping = parseFloat(shippingAmount) || 0;
  const total = subtotal - discountAmount + taxAmount + shipping;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!customerId) {
      setError("Please select a customer");
      return;
    }

    if (items.length === 0) {
      setError("Please add at least one item");
      return;
    }

    // Validate items
    for (const item of items) {
      if (!item.name) {
        setError("All items must have a name");
        return;
      }
    }

    setSaving(true);

    try {
      const invoiceData = {
        customerId,
        paymentTerms,
        paymentScheduleType,
        items: items.map(item => ({
          productId: item.productId,
          name: item.name,
          description: item.description,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          taxable: item.taxable
        })),
        taxRate,
        discountType: discountType || null,
        discountValue: discountValue ? parseFloat(discountValue) : null,
        shippingAmount: shipping,
        notes,
        internalNotes,
        termsConditions,
        estimateId: estimateId || null
      };

      const endpoint = estimateId
        ? `/api/invoices/from-estimate/${estimateId}`
        : "/api/invoices";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(invoiceData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create invoice");
      }

      const invoice = await res.json();
      router.push(`/invoicing/invoices/${invoice.id}`);
    } catch (e) {
      console.error("Error creating invoice:", e);
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

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    width: "100%",
    boxSizing: "border-box"
  };

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: 24,
    marginBottom: 24
  };

  const filteredProducts = products.filter(p => {
    if (!productSearch) return true;
    const search = productSearch.toLowerCase();
    return p.name?.toLowerCase().includes(search) || p.sku?.toLowerCase().includes(search);
  });

  const filteredBundles = bundles.filter(b => {
    if (!productSearch) return true;
    const search = productSearch.toLowerCase();
    return b.name?.toLowerCase().includes(search);
  });

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/invoicing/invoices"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}
          >
            ← Back to Invoices
          </Link>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
            {estimateId ? "Create Invoice from Estimate" : "New Invoice"}
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
          {/* Customer Selection */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
              Customer
            </h2>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
              required
            >
              <option value="">Select a customer...</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.firstName} {customer.lastName}
                  {(customer.company || customer.companyName) && ` (${customer.company || customer.companyName})`}
                </option>
              ))}
            </select>
          </div>

          {/* Line Items */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", margin: 0 }}>
                Line Items
              </h2>
              <button
                type="button"
                onClick={addCustomItem}
                style={{
                  padding: "6px 12px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  color: "rgba(255, 255, 255, 0.9)",
                  cursor: "pointer",
                  fontSize: "13px"
                }}
              >
                + Custom Item
              </button>
            </div>

            {/* Product Search */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search products or bundles to add..."
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
                style={inputStyle}
              />
              {showProductDropdown && (filteredProducts.length > 0 || filteredBundles.length > 0) && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "#1a1a1a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  marginTop: 4,
                  maxHeight: "300px",
                  overflow: "auto",
                  zIndex: 100
                }}>
                  {filteredBundles.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
                        Bundles
                      </div>
                      {filteredBundles.map(bundle => (
                        <div
                          key={`bundle-${bundle.id}`}
                          onClick={() => addBundle(bundle)}
                          style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div>
                            <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{bundle.name}</div>
                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{bundle.items?.length} items</div>
                          </div>
                          <div style={{ color: "#dc2626", fontWeight: "600" }}>{formatCurrency(bundle.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                  {filteredProducts.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
                        Products
                      </div>
                      {filteredProducts.map(product => (
                        <div
                          key={`product-${product.id}`}
                          onClick={() => addProduct(product)}
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
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Items List */}
            {items.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "30px" }}></th>
                    <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Item</th>
                    <th style={{ padding: "8px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "80px" }}>Qty</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "120px" }}>Price</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "100px" }}>Total</th>
                    <th style={{ padding: "8px", width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <>
                      <tr key={item.id} style={{ borderBottom: expandedItems[item.id] ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
                          <button
                            type="button"
                            onClick={() => toggleItemExpand(item.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "rgba(255,255,255,0.5)",
                              cursor: "pointer",
                              fontSize: "12px",
                              padding: "4px",
                              transform: expandedItems[item.id] ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 0.2s"
                            }}
                            title={expandedItems[item.id] ? "Collapse details" : "Expand details"}
                          >
                            ▶
                          </button>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(item.id, "name", e.target.value)}
                            placeholder="Item name"
                            style={{ ...inputStyle, padding: "6px 10px" }}
                            required
                          />
                          {item.sku && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sku}</div>}
                          {item.fromBundleName && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: 2 }}>From: {item.fromBundleName}</div>}
                          {item.description && !expandedItems[item.id] && (
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic" }}>
                              {item.description.length > 60 ? item.description.substring(0, 60) + "..." : item.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center", verticalAlign: "top" }}>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 1)}
                            style={{ ...inputStyle, width: "60px", textAlign: "center", padding: "6px" }}
                            min="1"
                          />
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", verticalAlign: "top" }}>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                            style={{ ...inputStyle, width: "100px", textAlign: "right", padding: "6px" }}
                            step="0.01"
                          />
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "500", color: "rgba(255,255,255,0.9)", verticalAlign: "top", paddingTop: "18px" }}>
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center", verticalAlign: "top" }}>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: "18px"
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                      {expandedItems[item.id] && (
                        <tr key={`${item.id}-details`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td></td>
                          <td colSpan={5} style={{ padding: "0 8px 16px 8px" }}>
                            <div style={{
                              background: "rgba(0,0,0,0.2)",
                              borderRadius: "8px",
                              padding: "12px",
                              marginTop: "4px"
                            }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Short Name</label>
                                  <input
                                    type="text"
                                    value={item.sku || ""}
                                    onChange={(e) => updateItem(item.id, "sku", e.target.value)}
                                    style={{ ...inputStyle, padding: "6px 10px", fontSize: "13px" }}
                                    placeholder="e.g. SL50AAS-VFD"
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Unit Cost</label>
                                  <input
                                    type="number"
                                    value={item.unitCost || ""}
                                    onChange={(e) => updateItem(item.id, "unitCost", parseFloat(e.target.value) || null)}
                                    style={{ ...inputStyle, padding: "6px 10px", fontSize: "13px" }}
                                    step="0.01"
                                    placeholder="$0.00"
                                  />
                                </div>
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Description</label>
                                <textarea
                                  value={item.description || ""}
                                  onChange={(e) => updateItem(item.id, "description", e.target.value)}
                                  style={{ ...inputStyle, padding: "8px 10px", fontSize: "13px", minHeight: "80px", resize: "vertical" }}
                                  placeholder="Enter item description..."
                                />
                              </div>
                              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={item.taxable !== false}
                                    onChange={(e) => updateItem(item.id, "taxable", e.target.checked)}
                                    style={{ cursor: "pointer" }}
                                  />
                                  Taxable
                                </label>
                                {item.unitCost && item.unitPrice > 0 && (
                                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                                    Margin: {((1 - (item.unitCost / item.unitPrice)) * 100).toFixed(1)}%
                                  </span>
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
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>
                Search for products above or add a custom item
              </div>
            )}
          </div>

          {/* Payment & Totals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Payment Settings */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
                Payment Settings
              </h2>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Payment Terms
                </label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                  <option value="NET15">Net 15</option>
                  <option value="NET30">Net 30</option>
                  <option value="NET45">Net 45</option>
                  <option value="NET60">Net 60</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Payment Schedule
                </label>
                <select
                  value={paymentScheduleType}
                  onChange={(e) => setPaymentScheduleType(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="NONE">Full Payment</option>
                  <option value="DEPOSIT_BALANCE">50% Deposit / 50% Balance</option>
                  <option value="50_40_10">50% Deposit / 40% Progress / 10% Final</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                  step="0.01"
                  min="0"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                    Discount Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="">No Discount</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                    {discountType === "PERCENTAGE" ? "Discount %" : "Discount $"}
                  </label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    style={inputStyle}
                    step="0.01"
                    disabled={!discountType}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Shipping
                </label>
                <input
                  type="number"
                  value={shippingAmount}
                  onChange={(e) => setShippingAmount(e.target.value)}
                  style={inputStyle}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Totals */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
                Summary
              </h2>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Subtotal:</span>
                  <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>
                      Discount{discountType === "PERCENTAGE" ? ` (${discountValue}%)` : ""}:
                    </span>
                    <span style={{ color: "#22c55e" }}>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Tax ({taxRate}%):</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                {shipping > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Shipping:</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(shipping)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <span style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)", fontSize: "16px" }}>Total:</span>
                  <span style={{ fontWeight: "700", color: "#dc2626", fontSize: "20px" }}>{formatCurrency(total)}</span>
                </div>
              </div>

              {paymentScheduleType !== "NONE" && (
                <div style={{ marginTop: 20, padding: 12, background: "rgba(59, 130, 246, 0.1)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#3b82f6", fontWeight: "500", marginBottom: 8 }}>Payment Schedule Preview:</div>
                  {paymentScheduleType === "DEPOSIT_BALANCE" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                        <span>Deposit (50%)</span>
                        <span>{formatCurrency(total * 0.5)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
                        <span>Balance (50%)</span>
                        <span>{formatCurrency(total * 0.5)}</span>
                      </div>
                    </>
                  )}
                  {paymentScheduleType === "50_40_10" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                        <span>Deposit (50%)</span>
                        <span>{formatCurrency(total * 0.5)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                        <span>Progress (40%)</span>
                        <span>{formatCurrency(total * 0.4)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
                        <span>Final (10%)</span>
                        <span>{formatCurrency(total * 0.1)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
              Notes
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Customer Notes (visible to customer)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                  placeholder="Any notes for the customer..."
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Internal Notes (not visible to customer)
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  style={{ ...inputStyle, minHeight: "80px", resize: "vertical", background: "rgba(234, 179, 8, 0.05)" }}
                  placeholder="Internal notes..."
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                Terms & Conditions
              </label>
              <textarea
                value={termsConditions}
                onChange={(e) => setTermsConditions(e.target.value)}
                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                placeholder="Payment terms, warranty info, etc..."
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Link
              href="/invoicing/invoices"
              style={{
                padding: "12px 24px",
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
              disabled={saving}
              style={{
                padding: "12px 24px",
                background: saving
                  ? "rgba(220, 38, 38, 0.5)"
                  : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "500"
              }}
            >
              {saving ? "Creating..." : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)" }}>
        Loading...
      </div>
    }>
      <NewInvoiceContent />
    </Suspense>
  );
}
