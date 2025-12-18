"use client";

import Link from "next/link";

// Stage labels for display
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
  FOLLOW_UP: "Follow Up",
};

export function CustomerOrdersModal({ customerName, orders, onClose }) {
  if (!orders || orders.length === 0) return null;

  // Get stage summary for an order
  const getStageSummary = (order) => {
    const stages = {};
    const items = order.items || [];
    
    items.forEach(item => {
      if (item.archivedAt) return; // Skip archived items
      const stage = item.currentStage || order.currentStage || "MANUFACTURING";
      stages[stage] = (stages[stage] || 0) + 1;
    });

    // Return most common stage or first one
    const entries = Object.entries(stages);
    if (entries.length === 0) return "No active items";
    
    // Sort by count descending
    entries.sort((a, b) => b[1] - a[1]);
    
    const [topStage, count] = entries[0];
    const totalItems = items.filter(i => !i.archivedAt).length;
    
    if (entries.length === 1) {
      return `${STAGE_LABELS[topStage] || topStage}`;
    }
    
    return `${count}/${totalItems} in ${STAGE_LABELS[topStage] || topStage}`;
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Count active items
  const getActiveItemCount = (order) => {
    return (order.items || []).filter(i => !i.archivedAt).length;
  };

  return (
    <div 
      className="confirm-overlay" 
      onClick={onClose}
      style={{ zIndex: 1100 }}
    >
      <div 
        className="confirm-dialog" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "550px" }}
      >
        {/* Header */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "flex-start",
          marginBottom: "1.5rem"
        }}>
          <div>
            <h3 style={{ 
              fontSize: "20px", 
              fontWeight: "600", 
              color: "#fff", 
              margin: "0 0 6px 0" 
            }}>
              📋 Customer Orders
            </h3>
            <p style={{ 
              fontSize: "14px", 
              color: "#9ca3af", 
              margin: 0 
            }}>
              {customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: "24px",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
              transition: "color 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#9ca3af"}
          >
            ✕
          </button>
        </div>

        {/* Orders List */}
        <div style={{ 
          display: "flex", 
          flexDirection: "column", 
          gap: "12px",
          maxHeight: "400px",
          overflowY: "auto",
          marginBottom: "1.5rem"
        }}>
          {orders.map((order, index) => {
            const itemCount = getActiveItemCount(order);
            const stageSummary = getStageSummary(order);
            
            return (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                onClick={onClose}
                style={{
                  display: "block",
                  padding: "16px",
                  backgroundColor: "#252525",
                  border: "1px solid #404040",
                  borderRadius: "8px",
                  textDecoration: "none",
                  transition: "all 0.2s",
                  borderLeft: "4px solid #dc2626"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#2d2d2d";
                  e.currentTarget.style.borderColor = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#252525";
                  e.currentTarget.style.borderColor = "#404040";
                  e.currentTarget.style.borderLeftColor = "#dc2626";
                }}
              >
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "flex-start",
                  marginBottom: "8px"
                }}>
                  <div style={{ 
                    fontSize: "15px", 
                    fontWeight: "600", 
                    color: "#fff" 
                  }}>
                    Order #{order.id}
                    {order.isLocked && (
                      <span 
                        style={{ 
                          marginLeft: "8px", 
                          color: "#dc2626",
                          fontSize: "14px"
                        }}
                        title="Order is locked"
                      >
                        🔒
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: "12px",
                    color: "#9ca3af"
                  }}>
                    {formatDate(order.orderDate || order.createdAt)}
                  </div>
                </div>
                
                <div style={{ 
                  display: "flex", 
                  gap: "16px",
                  fontSize: "13px",
                  color: "#d1d5db"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#6b7280" }}>Items:</span>
                    <span style={{ 
                      backgroundColor: "#374151",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "500"
                    }}>
                      {itemCount}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#6b7280" }}>Stage:</span>
                    <span style={{ color: "#f87171" }}>{stageSummary}</span>
                  </div>
                </div>

                {/* Sales Rep if present */}
                {order.sku && (
                  <div style={{ 
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "#6b7280"
                  }}>
                    Sales Rep: <span style={{ color: "#9ca3af" }}>{order.sku}</span>
                  </div>
                )}

                {/* View arrow indicator */}
                <div style={{
                  position: "absolute",
                  right: "16px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6b7280",
                  fontSize: "16px"
                }}>
                  →
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "1rem",
          borderTop: "1px solid #404040"
        }}>
          <span style={{ 
            fontSize: "13px", 
            color: "#6b7280" 
          }}>
            {orders.length} order{orders.length !== 1 ? 's' : ''} for this customer
          </span>
          <button
            onClick={onClose}
            style={{
              background: "#2d2d2d",
              color: "#fff",
              border: "1px solid #404040",
              padding: "8px 20px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#404040";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#2d2d2d";
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
