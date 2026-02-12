"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";

export default function EstimateTemplatesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [templates, setTemplates] = useState([]);
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
    loadTemplates();
  }, [user, router]);

  async function loadTemplates() {
    try {
      const params = new URLSearchParams();
      if (!showInactive) params.append('isActive', 'true');

      const res = await fetch(`/api/estimate-templates?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to load templates");
      }

      const data = await res.json();
      setTemplates(data);
    } catch (e) {
      console.error("Error loading templates:", e);
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [showInactive]);

  const filteredTemplates = templates.filter((template) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      template.name?.toLowerCase().includes(searchLower) ||
      template.description?.toLowerCase().includes(searchLower)
    );
  });

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
    outline: "none"
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading templates...
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
              Estimate Templates
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            href="/invoicing/estimate-templates/new"
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
            + New Template
          </Link>
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
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, minWidth: "250px", flex: 1 }}
          />
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "rgba(255,255,255,0.7)",
            fontSize: "14px",
            cursor: "pointer"
          }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Show inactive
          </label>
        </div>

        {/* Templates Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 20
        }}>
          {filteredTemplates.length === 0 ? (
            <div style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "60px 20px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "12px"
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
              <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
                {searchTerm ? "No templates match your search" : "No estimate templates yet"}
              </p>
              {!searchTerm && (
                <Link
                  href="/invoicing/estimate-templates/new"
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
                  Create your first template
                </Link>
              )}
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => router.push(`/invoicing/estimate-templates/${template.id}`)}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "12px",
                  padding: "20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  opacity: template.isActive ? 1 : 0.6
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                  e.currentTarget.style.borderColor = "rgba(220, 38, 38, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <h3 style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "rgba(255,255,255,0.9)",
                    margin: 0
                  }}>
                    {template.name}
                  </h3>
                  {!template.isActive && (
                    <span style={{
                      padding: "2px 8px",
                      background: "rgba(156, 163, 175, 0.1)",
                      border: "1px solid rgba(156, 163, 175, 0.3)",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#9ca3af"
                    }}>
                      Inactive
                    </span>
                  )}
                </div>

                {template.description && (
                  <p style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "13px",
                    marginBottom: 16,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical"
                  }}>
                    {template.description}
                  </p>
                )}

                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 12,
                  borderTop: "1px solid rgba(255,255,255,0.05)"
                }}>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Items</div>
                      <div style={{ fontSize: "14px", fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>
                        {template._count?.items || template.items?.length || 0}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Est. Total</div>
                      <div style={{ fontSize: "14px", fontWeight: "600", color: "#dc2626" }}>
                        {formatCurrency(template.estimatedTotal)}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.4)"
                  }}>
                    Valid {template.validityDays || 30} days
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
