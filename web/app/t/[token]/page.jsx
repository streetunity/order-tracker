"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const STAGES = [
  "MANUFACTURING",
  "TESTING",
  "SHIPPING",
  "AT_SEA",
  "SMT",
  "QC",
  "DELIVERED",
  "ONSITE",
  "COMPLETED",
  "FOLLOW_UP",
];

const STAGE_LABELS = {
  MANUFACTURING: "Manufacturing",
  TESTING: "Debugging & Testing",
  SHIPPING: "Preparing Container",
  AT_SEA: "Container At Sea",
  SMT: "Arrived At SMT",
  QC: "Quality Control",
  DELIVERED: "Delivered To Customer",
  ONSITE: "On Site Setup & Training",
  COMPLETED: "Training Complete",
  FOLLOW_UP: "Systems Operational",
};

export default function PublicTrackingPage() {
  const params = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customerFiles, setCustomerFiles] = useState(null);

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/public/orders/${params.token}`, { cache: "no-store" });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          if (res.status === 404) throw new Error("Order not found. Please check your tracking link.");
          throw new Error(errorData.error || `Failed to load order (Status: ${res.status})`);
        }
        const data = await res.json();
        setOrder(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    if (params.token) loadOrder();
  }, [params.token]);

  // Load customer files separately (non-blocking)
  useEffect(() => {
    if (!params.token) return;
    async function loadFiles() {
      try {
        const res = await fetch(`/api/public/track/${params.token}/customer-documents`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          // Only store if there's actually something to show
          const hasFiles = data.totalCount > 0 || data.legacyDropboxLink;
          if (hasFiles) setCustomerFiles(data);
        }
      } catch {
        // Silent — customer files are optional
      }
    }
    loadFiles();
  }, [params.token]);

  if (loading) {
    return (
      <main style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ color: "#a0a0a0", fontSize: "18px" }}>Loading order status...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ padding: "20px", backgroundColor: "#7f1d1d", border: "1px solid #991b1b", borderRadius: "8px", color: "#fecaca", fontSize: "16px" }}>
          {error}
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ color: "#a0a0a0", fontSize: "18px" }}>No order data available</div>
      </main>
    );
  }

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + " at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  const formatDateOnly = (dateStr) => {
    if (!dateStr) return null;
    try {
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString();
      }
      return new Date(dateStr).toLocaleDateString();
    } catch { return dateStr; }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  const showShippingSection = order.etaDate || order.shippingCarrier || order.trackingNumber || order.onsiteInstallationDate !== undefined;

  return (
    <main style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", position: "relative" }}>
      <div style={{
        position: "absolute", top: "20px", left: "20px",
        width: "125px", height: "125px",
        backgroundImage: "url('/smt-logo.png')",
        backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
        zIndex: 10
      }}></div>

      <div style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "32px", fontWeight: "600", color: "#e4e4e4", marginBottom: "20px" }}>Order Status</h1>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
          {order.orderDate && (
            <div style={{ fontSize: "16px", color: "#a0a0a0" }}><strong>Order Date:</strong> {formatDateOnly(order.orderDate)}</div>
          )}
          {order.poNumber && (
            <div style={{ fontSize: "16px", color: "#a0a0a0" }}><strong>PO Number:</strong> {order.poNumber}</div>
          )}
          {order.sku && (
            <div style={{ fontSize: "16px", color: "#a0a0a0" }}><strong>Sales Person:</strong> {order.sku}</div>
          )}
        </div>
      </div>

      {/* Customer Information */}
      <div style={{ backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#e4e4e4", marginBottom: "16px" }}>Customer Information</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginBottom: "16px" }}>
          <div><strong style={{ color: "#ef4444" }}>Company:</strong><div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.accountName || "N/A"}</div></div>
          <div><strong style={{ color: "#ef4444" }}>Contact Name:</strong><div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.contactName || "Not provided"}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginBottom: "16px" }}>
          <div><strong style={{ color: "#ef4444" }}>Email:</strong><div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.email || "Not provided"}</div></div>
          <div><strong style={{ color: "#ef4444" }}>Phone:</strong><div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.phone || "Not provided"}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginBottom: "16px" }}>
          <div><strong style={{ color: "#ef4444" }}>Address:</strong><div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.address || "Not provided"}</div></div>
          <div><strong style={{ color: "#ef4444" }}>Machine Voltage:</strong><div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.machineVoltage || "Not specified"}</div></div>
        </div>
        {order.customerDocsLink && (
          <div>
            <strong style={{ color: "#ef4444" }}>Customer Files Link:</strong>
            <div style={{ marginTop: "4px" }}>
              <a href={order.customerDocsLink} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "underline", fontSize: "14px" }}>View Customer Documents ↗</a>
            </div>
          </div>
        )}
      </div>

      {/* Shipping Information */}
      {showShippingSection && (
        <div style={{ padding: "20px", backgroundColor: "#2d2d2d", borderRadius: "8px", border: "1px solid #404040", marginBottom: "40px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>Shipping Information</h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ flex: 1 }}>
              {order.etaDate && (<div style={{ marginBottom: "8px" }}><strong style={{ color: "#ef4444" }}>ETA:</strong><span style={{ color: "#e4e4e4", marginLeft: "8px" }}>{formatDateOnly(order.etaDate)}</span></div>)}
              {order.shippingCarrier && (<div style={{ marginBottom: "8px" }}><strong style={{ color: "#ef4444" }}>Carrier:</strong><span style={{ color: "#e4e4e4", marginLeft: "8px" }}>{order.shippingCarrier}</span></div>)}
              {order.trackingNumber && (<div><strong style={{ color: "#ef4444" }}>Tracking:</strong><span style={{ color: "#e4e4e4", marginLeft: "8px" }}>{order.trackingNumber}</span></div>)}
            </div>
            <div style={{ paddingLeft: "20px", borderLeft: "1px solid #404040", minWidth: "200px" }}>
              <div>
                <strong style={{ color: "#ef4444" }}>Onsite Installation Date:</strong>
                <div style={{ color: order.onsiteInstallationDate ? "#e4e4e4" : "#a0a0a0", marginTop: "4px", fontSize: "16px", fontWeight: order.onsiteInstallationDate ? "500" : "normal", fontStyle: order.onsiteInstallationDate ? "normal" : "italic" }}>
                  {order.onsiteInstallationDate ? formatDateOnly(order.onsiteInstallationDate) : "TBD"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Items */}
      <div style={{ marginBottom: "40px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#e4e4e4", marginBottom: "20px" }}>Order Items & Progress</h2>
        {(!order.items || order.items.length === 0) ? (
          <div style={{ padding: "40px", backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ color: "#ef4444", fontSize: "18px", marginBottom: "10px" }}>No items found in this order</p>
            <p style={{ color: "#a0a0a0", fontSize: "14px" }}>Please contact support if you believe this is an error.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "24px" }}>
            {order.items.map((item) => {
              const effectiveStage = item.currentStage || order.currentStage || "MANUFACTURING";
              const currentStageIndex = STAGES.indexOf(effectiveStage);
              const validStageIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
              const isCompleted = effectiveStage === "FOLLOW_UP";

              return (
                <div key={item.id} style={{ padding: "20px", borderRadius: "8px", border: "1px solid #404040", backgroundColor: "#2d2d2d" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "4px" }}>{item.productCode || "Unknown Item"}</div>
                      <div style={{ fontSize: "14px", color: "#a0a0a0" }}>Quantity: {item.qty || 1}</div>
                      <div style={{ fontSize: "14px", color: item.serialNumber ? "#ef4444" : "#6b7280", marginTop: "4px", fontWeight: item.serialNumber ? "500" : "normal" }}>Serial Number: {item.serialNumber || "Not specified"}</div>
                      <div style={{ fontSize: "14px", color: item.modelNumber ? "#ef4444" : "#6b7280", marginTop: "4px", fontWeight: item.modelNumber ? "500" : "normal" }}>Model Number: {item.modelNumber || "Not specified"}</div>
                      <div style={{ fontSize: "14px", color: "#a0a0a0", marginTop: "4px" }}>Voltage: {item.voltage || "Not specified"}</div>
                      <div style={{ fontSize: "14px", color: "#a0a0a0", marginTop: "4px" }}>Power: {item.laserWattage || "Not specified"}</div>
                      <div style={{ fontSize: "13px", color: "#a0a0a0", marginTop: "6px", fontStyle: item.notes ? "italic" : "normal", backgroundColor: "#1a1a1a", padding: "8px", borderRadius: "4px", border: "1px solid #404040" }}>Notes: {item.notes || "No notes"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "16px", fontWeight: "500", color: isCompleted ? "#059669" : "#ef4444" }}>{STAGE_LABELS[effectiveStage] || effectiveStage}</div>
                      <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>Stage {validStageIndex + 1} of {STAGES.length}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#e4e4e4", marginBottom: "10px" }}>Production Progress</h4>
                    <div style={{ overflowX: "auto", overflowY: "hidden", width: "100%" }}>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(108px, 1fr))`, gap: "5px", minWidth: "100%" }}>
                        {STAGES.map((stage, index) => {
                          const isCurrent = effectiveStage === stage;
                          const isStageCompleted = index < validStageIndex;
                          let backgroundColor, borderColor, textColor;
                          if (isCurrent) {
                            if (stage === "FOLLOW_UP") { backgroundColor = "#059669"; borderColor = "#059669"; textColor = "#fff"; }
                            else { backgroundColor = "#ef4444"; borderColor = "#ef4444"; textColor = "#fff"; }
                          } else if (isStageCompleted) { backgroundColor = "#059669"; borderColor = "#059669"; textColor = "#fff"; }
                          else { backgroundColor = "#1a1a1a"; borderColor = "#404040"; textColor = "#a0a0a0"; }
                          return (
                            <div key={stage} style={{ padding: "5px 4px", borderRadius: "5px", border: "1px solid", borderColor, backgroundColor, textAlign: "center", fontSize: "9px", fontWeight: "500", color: textColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", lineHeight: "1.1" }}>{STAGE_LABELS[stage]}</div>
                              {isCurrent && stage !== "FOLLOW_UP" && <div style={{ fontSize: "8px", marginTop: "2px", opacity: 0.9 }}>Current</div>}
                              {(isStageCompleted || (isCurrent && stage === "FOLLOW_UP")) && <div style={{ fontSize: "8px", marginTop: "2px", opacity: 0.9 }}>✓</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ height: "8px", backgroundColor: "#404040", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${((validStageIndex + 1) / STAGES.length) * 100}%`, backgroundColor: isCompleted ? "#059669" : "#ef4444", transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>{Math.round(((validStageIndex + 1) / STAGES.length) * 100)}% Complete</div>
                  </div>

                  {item.statusEvents && item.statusEvents.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: "16px", fontWeight: "500", color: "#e4e4e4", marginBottom: "12px" }}>Timeline</h4>
                      <div style={{ maxHeight: "200px", overflowY: "auto", backgroundColor: "#1a1a1a", border: "1px solid #404040", borderRadius: "6px", padding: "12px" }}>
                        {item.statusEvents.map((event, index) => (
                          <div key={event.id || index} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: index < item.statusEvents.length - 1 ? "1px solid #404040" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                              <div>
                                <span style={{ color: "#ef4444", fontWeight: "500", fontSize: "14px" }}>{STAGE_LABELS[event.stage] || event.stage}</span>
                                {event.note && (<div style={{ color: "#a0a0a0", fontSize: "12px", marginTop: "2px" }}>{event.note}</div>)}
                              </div>
                              <div style={{ color: "#a0a0a0", fontSize: "11px", whiteSpace: "nowrap", marginLeft: "12px" }}>{formatDate(event.createdAt)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Timeline */}
      {order.statusEvents && order.statusEvents.length > 0 && (
        <div style={{ padding: "20px", backgroundColor: "#2d2d2d", borderRadius: "8px", border: "1px solid #404040", marginBottom: "40px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>Order Timeline</h3>
          <div style={{ maxHeight: "300px", overflowY: "auto", backgroundColor: "#1a1a1a", border: "1px solid #404040", borderRadius: "6px", padding: "12px" }}>
            {order.statusEvents.map((event, index) => (
              <div key={event.id || index} style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: index < order.statusEvents.length - 1 ? "1px solid #404040" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <span style={{ color: "#ef4444", fontWeight: "500", fontSize: "14px" }}>{STAGE_LABELS[event.stage] || event.stage}</span>
                    {event.note && (<div style={{ color: "#a0a0a0", fontSize: "12px", marginTop: "2px" }}>{event.note}</div>)}
                  </div>
                  <div style={{ color: "#a0a0a0", fontSize: "11px", whiteSpace: "nowrap", marginLeft: "12px" }}>{formatDate(event.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Customer Files Section ── */}
      {customerFiles && (
        <div style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#e4e4e4", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
            📁 Your Files
          </h2>

          {/* Photos */}
          {customerFiles.photos?.length > 0 && (
            <div style={{ marginBottom: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>📷 Photos</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
                {customerFiles.photos.map((file) => (
                  <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "block", borderRadius: "8px", overflow: "hidden", border: "1px solid #404040", aspectRatio: "1", backgroundColor: "#2d2d2d" }}
                  >
                    <img src={file.url} alt={file.fileName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Videos */}
          {customerFiles.videos?.length > 0 && (
            <div style={{ marginBottom: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>🎬 Videos</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
                {customerFiles.videos.map((file) => (
                  <div key={file.id} style={{ backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "8px", overflow: "hidden" }}>
                    <video controls style={{ width: "100%", display: "block" }}>
                      <source src={file.url} type={file.mimeType} />
                      Your browser does not support video playback.
                    </video>
                    <div style={{ padding: "8px 12px", fontSize: "13px", color: "#a0a0a0" }}>
                      {file.fileName}
                      {file.fileSizeFormatted && <span style={{ marginLeft: "8px" }}>· {file.fileSizeFormatted}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manuals & Documents */}
          {((customerFiles.manuals?.length > 0) || (customerFiles.documents?.length > 0)) && (
            <div style={{ marginBottom: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>📄 Documents & Manuals</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[...(customerFiles.manuals || []), ...(customerFiles.documents || [])].map((file) => (
                  <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "8px", textDecoration: "none", color: "inherit" }}
                  >
                    <span style={{ fontSize: "24px" }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: "500", color: "#e4e4e4", fontSize: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {file.fileName}
                      </div>
                      {file.description && (
                        <div style={{ fontSize: "13px", color: "#a0a0a0", marginTop: "2px" }}>{file.description}</div>
                      )}
                      {file.fileSizeFormatted && (
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{file.fileSizeFormatted}</div>
                      )}
                    </div>
                    <span style={{ fontSize: "18px", color: "#ef4444", flexShrink: 0 }}>↓</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Legacy Dropbox fallback */}
          {customerFiles.legacyDropboxLink && (
            <div style={{ padding: "16px", backgroundColor: "#2d2d2d", border: "1px solid #404040", borderRadius: "8px" }}>
              <p style={{ fontSize: "13px", color: "#a0a0a0", marginBottom: "8px" }}>Additional files:</p>
              <a href={customerFiles.legacyDropboxLink} target="_blank" rel="noopener noreferrer"
                style={{ color: "#60a5fa", textDecoration: "underline", fontSize: "14px" }}
              >
                View in Dropbox ↗
              </a>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #404040", textAlign: "center" }}>
        <p style={{ color: "#a0a0a0", fontSize: "14px" }}>Order created on {formatDateOnly(order.createdAt)}</p>
        <p style={{ color: "#666", fontSize: "12px", marginTop: "8px" }}>This is a secure tracking link. Do not share with unauthorized parties.</p>
      </div>
    </main>
  );
}
