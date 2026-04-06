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

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [bundleItems, setBundleItems] = useState([]);

  // Auto-calculated from components
  const componentPrice = bundleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const componentCost  = bundleItems.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
  const margin        = componentPrice > 0 && componentCost > 0 ? componentPrice - componentCost : null;
  const marginPercent = margin !== null && componentPrice > 0 ? ((margin / componentPrice) * 100).toFixed(2) : null;

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadProducts();
  }, [user, router]);

  async function loadProducts() {
    try {
      const res = await fetch("/api/products", { headers: getAuthHeaders() });
      if (res.ok) setProducts((await res.json()).filter(p => p.isActive));
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const existing = bundleItems.map(i => i.productId);
      setSearchResults(products.filter(p =>
        !existing.includes(p.id) &&
        (p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
         p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      ).slice(0, 5));
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, products, bundleItems]);

  function addProduct(product) {
    const existing = bundleItems.find(i => i.productId === product.id);
    if (existing) {
      setBundleItems(bundleItems.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setBundleItems([...bundleItems, { productId: product.id, sku: product.sku, name: product.name, price: product.price, cost: product.cost, quantity: 1 }]);
    }
    setSearchTerm(""); setSearchResults([]);
  }

  function updateQuantity(productId, quantity) {
    if (quantity < 1) removeProduct(productId);
    else setBundleItems(bundleItems.map(i => i.productId === productId ? { ...i, quantity } : i));
  }

  function removeProduct(productId) {
    setBundleItems(bundleItems.filter(i => i.productId !== productId));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) { setError("Bundle name is required"); return; }
    if (bundleItems.length === 0) { setError("Add at least one product to the bundle"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ...formData, items: bundleItems.map(i => ({ productId: i.productId, quantity: i.quantity })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/invoicing/bundles/${data.id}`);
    } catch (err) { setError(err.message); setLoading(false); }
  }

  const inp = { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px" };
  const lbl = { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "500", color: "rgba(255,255,255,0.7)" };
  const sec = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: 24, marginBottom: 24 };

  if (authLoading || !user) return null;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/invoicing/bundles" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 8 }}>← Back to Bundles</Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>New Bundle</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 4 }}>A bundle is a saved collection of products that can be quickly added to an estimate or invoice. Price is calculated automatically from the components.</p>
        </div>

        {error && <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444" }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={sec}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Bundle Information</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={lbl}>Bundle Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={inp} required placeholder="e.g. SL3015 + 6K Laser Package" />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Bundle description..." />
              </div>
            </div>
          </div>

          <div style={sec}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>Products in Bundle</h2>

            <div style={{ position: "relative", marginBottom: 16 }}>
              <label style={lbl}>Add Product</label>
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={inp} placeholder="Search by product name or SKU..." />
              {searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflow: "auto" }}>
                  {searchResults.map(product => (
                    <div key={product.id} onClick={() => addProduct(product)}
                      style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{product.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "monospace" }}>{product.sku}</div>
                      </div>
                      <div style={{ color: "#dc2626", fontWeight: 600 }}>${product.price?.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {bundleItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.4)" }}>Search and add products above</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bundleItems.map(item => (
                  <div key={item.productId} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{item.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "monospace" }}>{item.sku}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>${item.price?.toLocaleString()} each</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1)} style={{ width: 28, height: 28, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(255,255,255,0.9)", cursor: "pointer" }}>−</button>
                        <input type="number" value={item.quantity} onChange={e => updateQuantity(item.productId, parseInt(e.target.value) || 1)}
                          style={{ width: 50, padding: "4px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(255,255,255,0.9)", textAlign: "center", fontSize: 14 }} min="1" />
                        <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1)} style={{ width: 28, height: 28, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(255,255,255,0.9)", cursor: "pointer" }}>+</button>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600, minWidth: 80, textAlign: "right" }}>${(item.price * item.quantity).toLocaleString()}</div>
                      <button type="button" onClick={() => removeProduct(item.productId)} style={{ padding: "4px 8px", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#ef4444", cursor: "pointer", fontSize: 12 }}>Remove</button>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 8, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: componentCost > 0 ? 8 : 0 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>Bundle Total Price:</span>
                    <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 18 }}>${componentPrice.toLocaleString()}</span>
                  </div>
                  {componentCost > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: marginPercent !== null ? 8 : 0 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Cost:</span>
                      <span style={{ color: "rgba(255,255,255,0.7)" }}>${componentCost.toLocaleString()}</span>
                    </div>
                  )}
                  {marginPercent !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Margin:</span>
                      <span style={{ color: parseFloat(marginPercent) > 30 ? "#22c55e" : parseFloat(marginPercent) > 15 ? "#eab308" : "#ef4444" }}>
                        ${margin?.toFixed(2)} ({marginPercent}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Link href="/invoicing/bundles" style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", textDecoration: "none", fontSize: 14 }}>Cancel</Link>
            <button type="submit" disabled={loading || bundleItems.length === 0}
              style={{ padding: "10px 24px", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 8, color: "white", cursor: loading || bundleItems.length === 0 ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: loading || bundleItems.length === 0 ? 0.7 : 1 }}>
              {loading ? "Creating..." : "Create Bundle"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
