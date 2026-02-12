"use client";
export const dynamic = 'force-dynamic';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function GenericManifestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Customer info
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Containers
  const [containers, setContainers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Notification
  const [notif, setNotif] = useState("");

  function showNotif(msg) {
    setNotif(msg);
    setTimeout(() => setNotif(""), 3000);
  }

  // ---- Container management (mirrors ContainersSection.jsx) ----

  function addContainer() {
    const newContainer = {
      id: `box-${Date.now()}`,
      label: `Box ${containers.length + 1}`,
      tracking: "",
      height: null,
      width: null,
      length: null,
      weight: null,
      unit: "in"
    };
    setContainers([...containers, newContainer]);
    setEditingId(newContainer.id);
  }

  function updateContainer(containerId, field, value) {
    setContainers(prev => prev.map(c =>
      c.id === containerId
        ? {
            ...c,
            [field]: (field === 'height' || field === 'width' || field === 'length' || field === 'weight')
              ? (value === "" ? null : parseFloat(value))
              : value
          }
        : c
    ));
  }

  function deleteContainer(containerId) {
    if (!confirm("Delete this container?")) return;
    setContainers(prev => prev.filter(c => c.id !== containerId));
    if (editingId === containerId) setEditingId(null);
  }

  // Calculate totals
  const totalWeight = containers.reduce((sum, c) => sum + (c.weight || 0), 0);
  const boxCount = containers.length;

  // ---- PDF Generation (mirrors existing manifest format) ----

  async function generateManifest() {
    if (!customerName.trim()) {
      showNotif("Please enter a customer name");
      return;
    }
    if (containers.length === 0) {
      showNotif("Please add at least one container");
      return;
    }

    try {
      setGenerating(true);
      const doc = new jsPDF();

      // Try to load company logo
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
          logoImg.src = "/smt-logo.png";
        });
        doc.addImage(logoImg, "PNG", 14, 10, 40, 20);
      } catch (e) {
        // Logo not available, continue without it
        console.log("Logo not available, generating without logo");
      }

      // Title
      doc.setFontSize(20);
      doc.setFont(undefined, "bold");
      doc.text("Shipping Manifest", 60, 22);

      // Horizontal line
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      doc.line(14, 35, 196, 35);

      // Customer Info
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Customer Information", 14, 45);

      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      let infoY = 53;

      if (customerName) {
        doc.setFont(undefined, "bold");
        doc.text("Name:", 14, infoY);
        doc.setFont(undefined, "normal");
        doc.text(customerName, 50, infoY);
        infoY += 7;
      }
      if (customerPhone) {
        doc.setFont(undefined, "bold");
        doc.text("Phone:", 14, infoY);
        doc.setFont(undefined, "normal");
        doc.text(customerPhone, 50, infoY);
        infoY += 7;
      }
      if (customerAddress) {
        doc.setFont(undefined, "bold");
        doc.text("Address:", 14, infoY);
        doc.setFont(undefined, "normal");
        // Handle multi-line addresses
        const addressLines = doc.splitTextToSize(customerAddress, 140);
        doc.text(addressLines, 50, infoY);
        infoY += 7 * addressLines.length;
      }

      infoY += 5;

      // Summary line
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text(`Total Packages: ${boxCount}`, 14, infoY);
      if (totalWeight > 0) {
        doc.text(`Total Weight: ${totalWeight.toFixed(1)} lbs`, 100, infoY);
      }
      infoY += 10;

      // Containers table
      const tableData = containers.map((container, index) => {
        const dimensionStr = (container.length && container.width && container.height)
          ? `${container.length} × ${container.width} × ${container.height} ${container.unit}`
          : "-";
        const weightStr = container.weight ? `${container.weight} lbs` : "-";

        return [
          index + 1,
          container.label || "-",
          dimensionStr,
          weightStr,
          container.tracking || "-"
        ];
      });

      autoTable(doc, {
        startY: infoY,
        head: [["#", "Package", "Dimensions", "Weight", "Notes"]],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [220, 38, 38],
          textColor: [255, 255, 255],
          fontStyle: "bold"
        },
        styles: {
          fontSize: 9,
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 40 },
          2: { cellWidth: 50 },
          3: { cellWidth: 30 },
          4: { cellWidth: 55 }
        }
      });

      // Footer
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text(
        `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        14,
        doc.internal.pageSize.getHeight() - 10
      );

      // Save
      const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
      const fileName = `Shipping_Manifest_${safeCustomerName}_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(fileName);

      showNotif("Shipping manifest generated successfully!");
    } catch (error) {
      console.error("Error generating manifest:", error);
      showNotif(`Failed to generate manifest: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  }

  // Auth guard
  if (authLoading) {
    return (
      <>
        <TopNav />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
          <div style={{ color: "rgba(255, 255, 255, 0.6)" }}>Loading...</div>
        </div>
      </>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

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
    color: "rgba(255, 255, 255, 0.6)"
  };

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>

        {/* Notification */}
        {notif && (
          <div style={{
            position: "fixed",
            top: 80,
            right: 24,
            padding: "12px 20px",
            background: notif.includes("Failed") ? "rgba(239, 68, 68, 0.9)" : "rgba(34, 197, 94, 0.9)",
            color: "#fff",
            borderRadius: "8px",
            zIndex: 1200,
            fontSize: "14px",
            fontWeight: "500",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }}>
            {notif}
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ef4444", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "32px" }}>📋</span>
              Generic Manifest
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "14px" }}>
              Create shipping manifests for individual items not tied to customer orders
            </p>
          </div>

          <button
            onClick={generateManifest}
            disabled={generating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              background: generating ? "rgba(220, 38, 38, 0.5)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: generating ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "14px"
            }}
          >
            {generating ? "Generating..." : "📄 Generate Manifest PDF"}
          </button>
        </div>

        {/* Customer Information Card */}
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: 24
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#fff", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            👤 Customer Information
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Customer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Enter phone number"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Address</label>
            <textarea
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Enter full shipping address"
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        {/* Containers Section */}
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "12px",
          padding: "24px"
        }}>
          {/* Containers Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                📦 Containers / Boxes
              </h2>
              {boxCount > 0 && (
                <>
                  <span style={{
                    fontSize: "12px",
                    padding: "2px 10px",
                    backgroundColor: "#1e40af",
                    borderRadius: "12px",
                    color: "#fff",
                    fontWeight: "500"
                  }}>
                    {boxCount} {boxCount === 1 ? 'box' : 'boxes'}
                  </span>
                  {totalWeight > 0 && (
                    <span style={{ fontSize: "13px", color: "#9ca3af" }}>
                      Total: {totalWeight.toFixed(1)} lbs
                    </span>
                  )}
                </>
              )}
            </div>

            <button
              onClick={addContainer}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
                fontSize: "13px"
              }}
            >
              + Add Container
            </button>
          </div>

          {/* Container list */}
          {containers.length === 0 ? (
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: "14px",
              fontStyle: "italic",
              border: "1px dashed rgba(255, 255, 255, 0.1)",
              borderRadius: "8px"
            }}>
              No containers added yet. Click "Add Container" to start.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {containers.map((container, index) => (
                <div
                  key={container.id}
                  style={{
                    padding: "14px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px"
                  }}
                >
                  {editingId === container.id ? (
                    /* Edit mode */
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Label</label>
                          <input
                            style={inputStyle}
                            value={container.label}
                            onChange={(e) => updateContainer(container.id, 'label', e.target.value)}
                            placeholder="Label"
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Tracking / Notes</label>
                          <input
                            style={inputStyle}
                            value={container.tracking}
                            onChange={(e) => updateContainer(container.id, 'tracking', e.target.value)}
                            placeholder="Tracking number or notes"
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Unit</label>
                          <select
                            style={{ ...inputStyle, cursor: "pointer" }}
                            value={container.unit}
                            onChange={(e) => updateContainer(container.id, 'unit', e.target.value)}
                          >
                            <option value="in">Inches</option>
                            <option value="cm">Centimeters</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Length</label>
                          <input
                            style={inputStyle}
                            type="number"
                            value={container.length || ""}
                            onChange={(e) => updateContainer(container.id, 'length', e.target.value)}
                            placeholder="Length"
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Width</label>
                          <input
                            style={inputStyle}
                            type="number"
                            value={container.width || ""}
                            onChange={(e) => updateContainer(container.id, 'width', e.target.value)}
                            placeholder="Width"
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Height</label>
                          <input
                            style={inputStyle}
                            type="number"
                            value={container.height || ""}
                            onChange={(e) => updateContainer(container.id, 'height', e.target.value)}
                            placeholder="Height"
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: "11px" }}>Weight (lbs)</label>
                          <input
                            style={inputStyle}
                            type="number"
                            value={container.weight || ""}
                            onChange={(e) => updateContainer(container.id, 'weight', e.target.value)}
                            placeholder="Weight"
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: "6px 16px",
                            background: "rgba(34, 197, 94, 0.2)",
                            border: "1px solid rgba(34, 197, 94, 0.4)",
                            color: "#4ade80",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "500"
                          }}
                        >
                          ✓ Done
                        </button>
                        <button
                          onClick={() => deleteContainer(container.id)}
                          style={{
                            padding: "6px 16px",
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#ef4444",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px"
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "500", fontSize: "14px", marginBottom: 4, color: "#e4e4e4" }}>
                          {container.label}
                        </div>
                        {container.tracking && (
                          <div style={{ fontSize: "13px", color: "#60a5fa", marginBottom: 4 }}>
                            📍 {container.tracking}
                          </div>
                        )}
                        <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                          {container.length && container.width && container.height ? (
                            <>📐 {container.length} × {container.width} × {container.height} {container.unit}</>
                          ) : (
                            <span style={{ fontStyle: "italic" }}>No dimensions</span>
                          )}
                          {container.weight && (
                            <> · ⚖️ {container.weight} lbs</>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setEditingId(container.id)}
                          style={{
                            padding: "4px 12px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "rgba(255, 255, 255, 0.7)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px"
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteContainer(container.id)}
                          style={{
                            padding: "4px 12px",
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#ef4444",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px"
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom generate button for convenience */}
        {containers.length > 0 && (
          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={generateManifest}
              disabled={generating}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "14px 28px",
                background: generating ? "rgba(220, 38, 38, 0.5)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: generating ? "not-allowed" : "pointer",
                fontWeight: "600",
                fontSize: "15px"
              }}
            >
              {generating ? "Generating..." : "📄 Generate Manifest PDF"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
