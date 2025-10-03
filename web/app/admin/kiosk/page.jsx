"use client";

import { useEffect, useMemo, useState } from "react";

// Stage keys from API (do not change)
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

// Display labels for column headers - SHORTENED for kiosk
const STAGE_LABELS = {
  MANUFACTURING: "Manufacturing",
  TESTING: "Testing",
  SHIPPING: "Preparing To Ship",
  AT_SEA: "Container At Sea",
  SMT: "Arrived At SMT",
  QC: "Quality Control",
  DELIVERED: "Delivered",
  ONSITE: "On Site Setup",
  COMPLETED: "Training Complete",
  FOLLOW_UP: "Follow Up",
};

// Kiosk pagination settings
const ITEMS_PER_PAGE = 40; // Number of items (red boxes) to show per page
const AUTO_CYCLE_INTERVAL = 10000; // Auto-cycle every 10 seconds (10000ms)

export default function KioskPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Define all styles at the top before any early returns
  const containerStyle = {
    height: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    margin: 0,
    padding: 0,
    position: 'relative',
    backgroundImage: 'url("/smt-logo.png")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    backgroundSize: '40%',
    backgroundAttachment: 'fixed',
  };

  const backgroundOverlayStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'var(--bg)',
    opacity: 0.7,
    zIndex: 1,
    pointerEvents: 'none',
  };

  // New wrapper for the scrollable content
  const contentWrapperStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  };

  // Fixed header section - updated to 10 columns + page indicator
  const headerSectionStyle = {
    display: 'grid',
    gridTemplateColumns: '280px repeat(10, minmax(100px, 1fr))',
    gap: '4px',
    padding: '4px 4px 0 4px',
    background: 'var(--bg)',
    borderBottom: '2px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  };

  // Scrollable board content - updated to 10 columns
  const boardStyle = {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '280px repeat(10, minmax(100px, 1fr))',
    gap: '4px',
    padding: '0 4px 4px 4px',
    alignContent: 'start',
    overflow: 'auto',
    position: 'relative',
    zIndex: 2,
  };

  const headerCellStyle = {
    background: 'var(--accent)',
    borderRadius: '2px',
    margin: 0,
    padding: '2px',
    height: '22px',
    minHeight: '22px',
    maxHeight: '22px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
  };

  const headerTextStyle = {
    color: '#fff',
    fontWeight: 400,
    fontSize: '18px',
    textAlign: 'center',
    lineHeight: '1',
    margin: 0,
    padding: 0,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };

  const customerColStyle = {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
  };

  const customerNameStyle = {
    fontWeight: 500,
    fontSize: '16px',
    color: 'var(--text)',
    padding: '2px',
    margin: 0,
    textAlign: 'center',
    lineHeight: '1',
    height: '22px',
    minHeight: '22px',
    maxHeight: '22px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };

  const itemCardStyle = {
    background: 'var(--panel)',
    border: '1px solid #dc2626',
    borderRadius: '1px',
    padding: '1px',
    margin: '1px',
    minHeight: '18px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const itemTextStyle = {
    fontWeight: 400,
    fontSize: '12px',
    color: 'var(--text)',
    textAlign: 'center',
    lineHeight: '1',
    margin: 0,
    padding: 0,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };

  const footerStyle = {
    background: 'var(--panel)',
    borderTop: '1px solid var(--border)',
    padding: '4px 8px',
    margin: 0,
    textAlign: 'center',
    height: '20px',
    minHeight: '20px',
    maxHeight: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  };

  const footerTextStyle = {
    color: 'var(--text-dim)',
    fontSize: '8px',
    margin: 0,
    padding: 0,
    lineHeight: '1',
  };

  // Function to truncate text
  const truncateText = (text, maxLength = 20) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.6) {
      return truncated.substring(0, lastSpace) + "...";
    }
    
    return truncated + "...";
  };

  async function load() {
    try {
      const apiUrl = `/api/kiosk/orders`;
      console.log("Kiosk fetching from:", apiUrl);
      
      const res = await fetch(apiUrl, {
        cache: "no-store",
      });
      
      if (!res.ok) {
        console.error(`HTTP ${res.status} from kiosk API`);
        setOrders([]);
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      console.log("Kiosk loaded orders:", Array.isArray(data) ? data.length : 0);
      setOrders(Array.isArray(data) ? data : []);
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Kiosk failed to load orders:", e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const o of orders) {
      for (const it of o.items || []) {
        if (it.archivedAt) continue;
        const s = it.currentStage || o.currentStage || "MANUFACTURING";
        if (c[s] != null) c[s] += 1;
      }
    }
    return c;
  }, [orders]);

  // Group customers and calculate pagination based on ITEMS
  const { grouped, currentCustomers } = useMemo(() => {
    const by = new Map();
    
    // First, group orders by customer
    for (const o of orders) {
      const key = o.account?.id || o.accountId || o.id;
      if (!by.has(key))
        by.set(key, {
          accountId: o.account?.id || o.accountId || null,
          accountName: o.account?.name || "—",
          orders: [],
        });
      by.get(key).orders.push(o);
    }
    
    const allGroups = Array.from(by.values()).sort((a, b) =>
      a.accountName.localeCompare(b.accountName)
    );
    
    // Count total non-archived items across all customers
    let totalItems = 0;
    const itemsPerCustomer = new Map();
    
    for (const group of allGroups) {
      let customerItemCount = 0;
      for (const order of group.orders) {
        for (const item of order.items || []) {
          if (!item.archivedAt) {
            customerItemCount++;
            totalItems++;
          }
        }
      }
      itemsPerCustomer.set(group.accountId || group.accountName, customerItemCount);
    }
    
    // Calculate total pages based on items
    const pages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    setTotalPages(pages);
    
    // Determine which customers to show on current page based on item pagination
    const startItemIndex = currentPage * ITEMS_PER_PAGE;
    const endItemIndex = startItemIndex + ITEMS_PER_PAGE;
    
    let currentItemCount = 0;
    const customersForPage = [];
    
    for (const group of allGroups) {
      const groupItemCount = itemsPerCustomer.get(group.accountId || group.accountName) || 0;
      
      // Check if any of this customer's items fall within the current page range
      const groupStartIndex = currentItemCount;
      const groupEndIndex = currentItemCount + groupItemCount;
      
      if (groupEndIndex > startItemIndex && groupStartIndex < endItemIndex) {
        customersForPage.push(group);
      }
      
      currentItemCount += groupItemCount;
      
      // Stop if we've passed the end of the current page
      if (currentItemCount >= endItemIndex) {
        break;
      }
    }
    
    return { grouped: allGroups, currentCustomers: customersForPage };
  }, [orders, currentPage]);

  // Auto-cycle through pages
  useEffect(() => {
    if (totalPages <= 1) return; // Don't cycle if only one page
    
    const interval = setInterval(() => {
      setCurrentPage((prevPage) => (prevPage + 1) % totalPages);
    }, AUTO_CYCLE_INTERVAL);
    
    return () => clearInterval(interval);
  }, [totalPages]);

  if (loading) {
    return (
      <main style={containerStyle}>
        <div style={backgroundOverlayStyle}></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: 'var(--text-dim)', position: 'relative', zIndex: 2 }}>
          Loading production board...
        </div>
      </main>
    );
  }

  return (
    <main style={containerStyle}>
      <div style={backgroundOverlayStyle}></div>
      
      <div style={contentWrapperStyle}>
        {/* Fixed Header Row */}
        <div style={headerSectionStyle}>
          <div style={{ ...headerCellStyle, ...customerColStyle, position: 'relative' }}>
            <div style={headerTextStyle}>Customer</div>
            {/* Page Indicator in Customer Header */}
            {totalPages > 1 && (
              <div style={{
                position: 'absolute',
                top: '2px',
                right: '4px',
                backgroundColor: '#dc2626',
                color: '#fff',
                fontSize: '10px',
                padding: '2px 4px',
                borderRadius: '3px',
                fontWeight: 'bold',
                lineHeight: '1'
              }}>
                {currentPage + 1}/{totalPages}
              </div>
            )}
          </div>
          {STAGES.map((s) => (
            <div key={s} style={headerCellStyle}>
              <div style={headerTextStyle}>
                {STAGE_LABELS[s] ?? s.replace(/_/g, " ")}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Content */}
        <div style={boardStyle}>
          {currentCustomers.length === 0 ? (
            <div style={{ 
              gridColumn: 'span 11', 
              textAlign: 'center', 
              padding: '40px',
              color: 'var(--text-dim)',
              fontSize: '14px'
            }}>
              {grouped.length === 0 
                ? (orders.length === 0 
                    ? "No orders to display. Orders will appear here once created."
                    : "Processing orders...")
                : "No items on this page"}
            </div>
          ) : (
            currentCustomers.map((group) => (
              <div key={group.accountId || group.accountName} style={{ display: 'contents' }}>
                <div style={customerColStyle}>
                  <div style={customerNameStyle}>
                    {truncateText(group.accountName, 18)}
                  </div>
                </div>

                {STAGES.map((stageKey) => {
                  const itemsInStage = (group.orders || [])
                    .flatMap((o) =>
                      (o.items || [])
                        .filter((it) => {
                          const s = it.currentStage || o.currentStage || "MANUFACTURING";
                          if (it.archivedAt) return false;
                          return s === stageKey;
                        })
                        .map((it) => ({ it, order: o }))
                    );

                  return (
                    <div key={`${group.accountId}-${stageKey}`} style={{ minHeight: '30px', background: 'transparent', overflow: 'hidden' }}>
                      {itemsInStage.length === 0 ? (
                        <div style={{ padding: '4px', margin: 0, color: 'var(--text-dim)', textAlign: 'center', fontSize: '12px', lineHeight: '1' }}>—</div>
                      ) : (
                        itemsInStage.map(({ it, order }) => {
                          const s = it.currentStage || order.currentStage || "MANUFACTURING";
                          
                          return (
                            <div key={it.id} style={itemCardStyle} title={`${it.productCode} - ${STAGE_LABELS[s] || s}`}>
                              <div style={itemTextStyle}>
                                {truncateText(it.productCode || "Item", 15)}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={footerStyle}>
        <div style={footerTextStyle}>
          Manufacturing Tracker • Auto-refreshes every 30 seconds • Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>
    </main>
  );
}