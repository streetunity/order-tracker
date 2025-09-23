"use client";

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

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/public/orders/${params.token}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error("API Error:", errorData);
          if (res.status === 404) {
            throw new Error("Order not found. Please check your tracking link.");
          }
          throw new Error(errorData.error || `Failed to load order (Status: ${res.status})`);
        }
        const data = await res.json();
        console.log("Order data received:", data);
        console.log("Items array:", data.items);
        console.log("Number of items:", data.items?.length || 0);
        setOrder(data);
      } catch (err) {
        console.error("Error loading order:", err);
        setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    
    if (params.token) {
      loadOrder();
    }
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
        <div style={{
          padding: "20px",
          backgroundColor: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: "8px",
          color: "#fecaca",
          fontSize: "16px"
        }}>
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

  // Helper function to format dates
  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + " at " + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch {
      return dateStr;
    }
  };

  return (
    <main style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", position: "relative" }}>
      {/* SMT Logo in top left corner */}
      <div style={{
        position: "absolute",
        top: "20px",
        left: "20px",
        width: "125px",
        height: "125px",
        backgroundImage: "url('/smt-logo.png')",
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        zIndex: 10
      }}></div>

      {/* Header */}
      <div style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "32px", fontWeight: "600", color: "#e4e4e4", marginBottom: "20px" }}>
          Order Status
        </h1>
        
        {/* Order Details */}
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
          {order.poNumber && (
            <div style={{ fontSize: "16px", color: "#a0a0a0" }}>
              <strong>Order Date:</strong> {order.poNumber}
            </div>
          )}
          {order.sku && (
            <div style={{ fontSize: "16px", color: "#a0a0a0" }}>
              <strong>Sales Person:</strong> {order.sku}
            </div>
          )}
        </div>
      </div>

      {/* Complete Customer Information - Full width matching order items */}
      <div style={{ 
        backgroundColor: "#2d2d2d", 
        border: "1px solid #404040", 
        borderRadius: "8px", 
        padding: "20px",
        marginBottom: "40px",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#e4e4e4", marginBottom: "16px" }}>
          Customer Information
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", textAlign: "left" }}>
          <div>
            <strong style={{ color: "#ef4444" }}>Name:</strong>
            <div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.accountName || "N/A"}</div>
          </div>
          <div>
            <strong style={{ color: "#ef4444" }}>Email:</strong>
            <div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.email || "Not provided"}</div>
          </div>
          <div>
            <strong style={{ color: "#ef4444" }}>Phone:</strong>
            <div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.phone || "Not provided"}</div>
          </div>
          <div>
            <strong style={{ color: "#ef4444" }}>Address:</strong>
            <div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.address || "Not provided"}</div>
          </div>
          <div>
            <strong style={{ color: "#ef4444" }}>Machine Voltage:</strong>
            <div style={{ color: "#e4e4e4", marginTop: "4px" }}>{order.account?.machineVoltage || "Not specified"}</div>
          </div>
        </div>
      </div>

      {/* Items List with Individual Progress - FIXED WIDTH */}
      <div style={{ 
        marginBottom: "40px",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#e4e4e4", marginBottom: "20px" }}>
          Order Items & Progress
        </h2>
        
        {/* Check if items exist and have length */}
        {(!order.items || order.items.length === 0) ? (
          <div style={{
            padding: "40px",
            backgroundColor: "#2d2d2d",
            border: "1px solid #404040",
            borderRadius: "8px",
            textAlign: "center"
          }}>
            <p style={{ color: "#ef4444", fontSize: "18px", marginBottom: "10px" }}>
              No items found in this order
            </p>
            <p style={{ color: "#a0a0a0", fontSize: "14px" }}>
              Please contact support if you believe this is an error.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "24px" }}>
            {order.items.map((item) => {
              // FIX: Get the effective current stage, defaulting to MANUFACTURING if neither exists
              const effectiveStage = item.currentStage || order.currentStage || "MANUFACTURING";
              const currentStageIndex = STAGES.indexOf(effectiveStage);
              const validStageIndex = currentStageIndex >= 0 ? currentStageIndex : 0; // Default to first stage if invalid
              const isCompleted = effectiveStage === "FOLLOW_UP";
              
              console.log(`Item ${item.id}: effectiveStage=${effectiveStage}, index=${validStageIndex}`);
              
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "20px",
                    borderRadius: "8px",
                    border: "1px solid #404040",
                    backgroundColor: "#2d2d2d",
                    width: "100%",
                    boxSizing: "border-box"
                  }}
                >
                  {/* Item Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "4px" }}>
                        {item.productCode || "Unknown Item"}
                      </div>
                      <div style={{ fontSize: "14px", color: "#a0a0a0" }}>
                        Quantity: {item.qty || 1}
                      </div>
                      {item.serialNumber && (
                        <div style={{ 
                          fontSize: "14px", 
                          color: "#ef4444", 
                          marginTop: "4px",
                          fontWeight: "500"
                        }}>
                          Serial Number: {item.serialNumber}
                        </div>
                      )}
                      {item.modelNumber && (
                        <div style={{ 
                          fontSize: "14px", 
                          color: "#ef4444", 
                          marginTop: "4px",
                          fontWeight: "500"
                        }}>
                          Model Number: {item.modelNumber}
                        </div>
                      )}
                      {item.voltage && (
                        <div style={{ 
                          fontSize: "14px", 
                          color: "#a0a0a0", 
                          marginTop: "4px"
                        }}>
                          Voltage: {item.voltage}
                        </div>
                      )}
                      {item.notes && (
                        <div style={{ 
                          fontSize: "13px", 
                          color: "#a0a0a0", 
                          marginTop: "6px",
                          fontStyle: "italic",
                          backgroundColor: "#1a1a1a",
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #404040"
                        }}>
                          Notes: {item.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "16px", fontWeight: "500", color: "#ef4444" }}>
                        {STAGE_LABELS[effectiveStage] || effectiveStage}
                      </div>
                      <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>
                        Stage {validStageIndex + 1} of {STAGES.length}
                      </div>
                    </div>
                  </div>
                  
                  {/* Individual Stage Progress for This Item */}
                  <div style={{ marginBottom: "16px" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#e4e4e4", marginBottom: "10px" }}>
                      Production Progress
                    </h4>
                    <div style={{ 
                      overflowX: "auto",
                      overflowY: "hidden",
                      width: "100%"
                    }}>
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: `repeat(${STAGES.length}, minmax(108px, 1fr))`,
                        gap: "5px",
                        minWidth: "100%"
                      }}>
                        {STAGES.map((stage, index) => {
                          const isCurrent = effectiveStage === stage;
                          const isStageCompleted = index < validStageIndex;
                          const isPending = index > validStageIndex;
                          
                          let backgroundColor, borderColor, textColor;
                          if (isCurrent) {
                            backgroundColor = "#ef4444";
                            borderColor = "#ef4444";
                            textColor = "#fff";
                          } else if (isStageCompleted) {
                            backgroundColor = "#059669";
                            borderColor = "#059669";
                            textColor = "#fff";
                          } else {
                            backgroundColor = "#1a1a1a";
                            borderColor = "#404040";
                            textColor = "#a0a0a0";
                          }
                          
                          return (
                            <div
                              key={stage}
                              style={{
                                padding: "5px 4px",
                                borderRadius: "5px",
                                border: "1px solid",
                                borderColor,
                                backgroundColor,
                                textAlign: "center",
                                fontSize: "9px",
                                fontWeight: "500",
                                color: textColor,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }}
                            >
                              <div style={{ 
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "normal",
                                lineHeight: "1.1"
                              }}>
                                {STAGE_LABELS[stage]}
                              </div>
                              {isCurrent && <div style={{ fontSize: "8px", marginTop: "2px", opacity: 0.9 }}>Current</div>}
                              {isStageCompleted && <div style={{ fontSize: "8px", marginTop: "2px", opacity: 0.9 }}>✓</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ 
                      height: "8px", 
                      backgroundColor: "#404040", 
                      borderRadius: "4px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${((validStageIndex + 1) / STAGES.length) * 100}%`,
                        backgroundColor: isCompleted ? "#059669" : "#ef4444",
                        transition: "width 0.3s"
                      }} />
                    </div>
                    <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>
                      {Math.round(((validStageIndex + 1) / STAGES.length) * 100)}% Complete
                    </div>
                  </div>

                  {/* Item Timeline/Log */}
                  {item.statusEvents && item.statusEvents.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: "16px", fontWeight: "500", color: "#e4e4e4", marginBottom: "12px" }}>
                        Timeline
                      </h4>
                      <div style={{ 
                        maxHeight: "200px", 
                        overflowY: "auto",
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #404040",
                        borderRadius: "6px",
                        padding: "12px"
                      }}>
                        {item.statusEvents.map((event, index) => (
                          <div 
                            key={event.id || index}
                            style={{ 
                              paddingBottom: "8px", 
                              marginBottom: "8px",
                              borderBottom: index < item.statusEvents.length - 1 ? "1px solid #404040" : "none"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                              <div>
                                <span style={{ color: "#ef4444", fontWeight: "500", fontSize: "14px" }}>
                                  {STAGE_LABELS[event.stage] || event.stage}
                                </span>
                                {event.note && (
                                  <div style={{ color: "#a0a0a0", fontSize: "12px", marginTop: "2px" }}>
                                    {event.note}
                                  </div>
                                )}
                              </div>
                              <div style={{ color: "#a0a0a0", fontSize: "11px", whiteSpace: "nowrap", marginLeft: "12px" }}>
                                {formatDate(event.createdAt)}
                              </div>
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

      {/* Additional Shipping Info - FIXED WIDTH */}
      {(order.etaDate || order.shippingCarrier || order.trackingNumber) && (
        <div style={{ 
          padding: "20px",
          backgroundColor: "#2d2d2d",
          borderRadius: "8px",
          border: "1px solid #404040",
          marginBottom: "40px",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>
            Shipping Information
          </h3>
          {order.etaDate && (
            <div style={{ marginBottom: "8px", color: "#a0a0a0" }}>
              <strong>ETA:</strong> {new Date(order.etaDate).toLocaleDateString()}
            </div>
          )}
          {order.shippingCarrier && (
            <div style={{ marginBottom: "8px", color: "#a0a0a0" }}>
              <strong>Carrier:</strong> {order.shippingCarrier}
            </div>
          )}
          {order.trackingNumber && (
            <div style={{ color: "#a0a0a0" }}>
              <strong>Tracking:</strong> {order.trackingNumber}
            </div>
          )}
        </div>
      )}

      {/* Order-Level Timeline - FIXED WIDTH */}
      {order.statusEvents && order.statusEvents.length > 0 && (
        <div style={{ 
          padding: "20px",
          backgroundColor: "#2d2d2d",
          borderRadius: "8px",
          border: "1px solid #404040",
          marginBottom: "40px",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "12px" }}>
            Order Timeline
          </h3>
          <div style={{ 
            maxHeight: "300px", 
            overflowY: "auto",
            backgroundColor: "#1a1a1a",
            border: "1px solid #404040",
            borderRadius: "6px",
            padding: "12px"
          }}>
            {order.statusEvents.map((event, index) => (
              <div 
                key={event.id || index}
                style={{ 
                  paddingBottom: "12px", 
                  marginBottom: "12px",
                  borderBottom: index < order.statusEvents.length - 1 ? "1px solid #404040" : "none"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <span style={{ color: "#ef4444", fontWeight: "500", fontSize: "14px" }}>
                      {STAGE_LABELS[event.stage] || event.stage}
                    </span>
                    {event.note && (
                      <div style={{ color: "#a0a0a0", fontSize: "12px", marginTop: "2px" }}>
                        {event.note}
                      </div>
                    )}
                  </div>
                  <div style={{ color: "#a0a0a0", fontSize: "11px", whiteSpace: "nowrap", marginLeft: "12px" }}>
                    {formatDate(event.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #404040", textAlign: "center" }}>
        <p style={{ color: "#a0a0a0", fontSize: "14px" }}>
          Order created on {new Date(order.createdAt).toLocaleDateString()}
        </p>
        <p style={{ color: "#666", fontSize: "12px", marginTop: "8px" }}>
          This is a secure tracking link. Do not share with unauthorized parties.
        </p>
      </div>
    </main>
  );
}