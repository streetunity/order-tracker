"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

export default function BundlesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadBundles();
  }, [user, router, showInactive]);

  async function loadBundles() {
    try {
      const params = new URLSearchParams();
      if (showInactive) params.append('includeInactive', 'true');

      const res = await fetch(`/api/bundles?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load bundles");
      }

      const data = await res.json();
      setBundles(data);
    } catch (e) {
      console.error("Error loading bundles:", e);
      setError("Failed to load bundles");
    } finally {
      setLoading(false);
    }
  }

  const filteredBundles = bundles.filter((bundle) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      !searchTerm ||
      (bundle.sku && bundle.sku.toLowerCase().includes(searchLower)) ||
      (bundle.name && bundle.name.toLowerCase().includes(searchLower)) ||
      (bundle.description && bundle.description.toLowerCase().includes(searchLower))
    );
  });

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    outline: "none"
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading bundles...
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
              Bundles
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              {filteredBundles.length} bundle{filteredBundles.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/invoicing/products"
              style={{
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                textDecoration: "none",
                fontSize: "14px"
              }}
            >
              View Products
            </Link>
            <Link
              href="/invoicing/bundles/new"
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "600"
              }}
            >
              + New Bundle
            </Link>
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

        {/* Filters */}
        <div style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
          alignItems: "center"
        }}>
          <input
            type="text"
            placeholder="Search bundles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, minWidth: "250px", flex: 1 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "rgba(255,255,255,0.7)" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Show inactive
          </label>
        </div>

        {/* Bundle List */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
          gap: 16
        }}>
          {filteredBundles.length === 0 ? (
            <div style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "60px 20px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px"
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
              <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
                {searchTerm ? "No bundles match your search" : "No bundles yet"}
              </p>
              {!searchTerm && (
                <Link
                  href="/invoicing/bundles/new"
                  style={{
                    display: "inline-block",
                    padding: "10px 20px",
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    borderRadius: "8px",
                    color: "white",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: "600"
                  }}
                >
                  Create your first bundle
                </Link>
              )}
            </div>
          ) : (
            filteredBundles.map((bundle) => (
              <div
                key={bundle.id}
                onClick={() => router.push(`/invoicing/bundles/${bundle.id}`)}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "12px",
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  opacity: bundle.isActive ? 1 : 0.6
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                      {bundle.sku}
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                      {bundle.name}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      padding: "2px 8px",
                      background: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: "4px",
                      color: "#3b82f6",
                      fontSize: "11px"
                    }}>
                      {bundle.itemCount} item{bundle.itemCount !== 1 ? 's' : ''}
                    </span>
                    {!bundle.isActive && (
                      <span style={{
                        padding: "2px 8px",
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: "4px",
                        color: "#ef4444",
                        fontSize: "11px"
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {bundle.description && (
                  <p style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical"
                  }}>
                    {bundle.description}
                  </p>
                )}

                {/* Items Preview */}
                {bundle.items && bundle.items.length > 0 && (
                  <div style={{
                    marginBottom: 12,
                    padding: "8px 10px",
                    background: "rgba(0, 0, 0, 0.2)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.5)"
                  }}>
                    {bundle.items.slice(0, 3).map((item, i) => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{item.product.name}</span>
                        <span>×{item.quantity}</span>
                      </div>
                    ))}
                    {bundle.items.length > 3 && (
                      <div style={{ color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                        +{bundle.items.length - 3} more...
                      </div>
                    )}
                  </div>
                )}

                {/* Pricing */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "#dc2626" }}>
                      ${bundle.price?.toLocaleString() || '0'}
                    </div>
                    {bundle.savings > 0 && (
                      <div style={{ fontSize: "12px", color: "#22c55e" }}>
                        Save ${bundle.savings.toLocaleString()} ({bundle.savingsPercent}%)
                      </div>
                    )}
                  </div>
                  {bundle.marginPercent && (
                    <div style={{
                      fontSize: "12px",
                      color: parseFloat(bundle.marginPercent) > 30 ? "#22c55e" : parseFloat(bundle.marginPercent) > 15 ? "#eab308" : "#ef4444"
                    }}>
                      {bundle.marginPercent}% margin
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
