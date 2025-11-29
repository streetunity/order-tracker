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
const AUTO_CYCLE_INTERVAL = 30000; // Auto-cycle every 30 seconds (30000ms)
const HEADER_HEIGHT = 30; // Header row height
const FOOTER_HEIGHT = 28; // Footer height
const ROW_BASE_HEIGHT = 34; // Minimum row height for a customer
const ITEM_HEIGHT = 22; // Height per item in a stage
const ROW_GAP = 4; // Gap between rows

export default function KioskPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [viewportHeight, setViewportHeight] = useState(800);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);

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

  // Scrollable board content - NOT using grid anymore, using flexbox
  const boardStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '0 4px 4px 4px',
    overflow: 'hidden', // Always hidden for kiosk
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

  // Customer row - uses grid for columns
  const customerRowStyle = {
    display: 'grid',
    gridTemplateColumns: '280px repeat(10, minmax(100px, 1fr))',
    gap: '4px',
    alignItems: 'stretch', // Makes all cells same height
  };

  const customerColStyle = {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    margin: 0,
    padding: '2px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const customerNameStyle = {
    fontWeight: 500,
    fontSize: '16px',
    color: 'var(--text)',
    margin: 0,
    textAlign: 'center',
    lineHeight: '1.2',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };

  const stageCellStyle = {
    minHeight: '30px',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '2px',
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
    height: '24px',
    minHeight: '24px',
    maxHeight: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  };

  const footerTextStyle = {
    color: 'var(--text-dim)',
    fontSize: '10px',
    margin: 0,
    padding: 0,
    lineHeight: '1',
  };

  const emptyStageStyle = {
    padding: '4px',
    margin: 0,
    color: 'var(--text-dim)',
    textAlign: 'center',
    fontSize: '12px',
    lineHeight: '1',
  };

  // Function to truncate text and remove any unwanted characters
  const truncateText = (text, maxLength = 20) => {
    if (!text) return "";
    
    // Remove any newlines, tabs, or other whitespace characters
    const cleaned = text.replace(/[\n\r\t]+/g, ' ').trim();
    
    if (cleaned.length <= maxLength) return cleaned;
    
    const truncated = cleaned.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.6) {
      return truncated.substring(0, lastSpace) + "...";
    }
    
    return truncated + "...";
  };

  // Calculate row height for a customer based on max items in any stage
  const calculateRowHeight = (group) => {
    const stageItemCounts = {};
    for (const order of group.orders) {
      for (const item of order.items || []) {
        if (item.archivedAt) continue;
        const stage = item.currentStage || order.currentStage || "MANUFACTURING";
        stageItemCounts[stage] = (stageItemCounts[stage] || 0) + 1;
      }
    }
    const maxItemsInOneStage = Math.max(1, ...Object.values(stageItemCounts), 0);
    return Math.max(ROW_BASE_HEIGHT, maxItemsInOneStage * ITEM_HEIGHT) + ROW_GAP;
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

  // Get viewport height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      setViewportHeight(window.innerHeight);
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Group customers and calculate pagination based on estimated row heights
  const { grouped, pages, totalPages } = useMemo(() => {
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

    if (allGroups.length === 0) {
      return { grouped: [], pages: [[]], totalPages: 1 };
    }

    // Calculate available height for content
    const availableHeight = viewportHeight - HEADER_HEIGHT - FOOTER_HEIGHT - 20; // 20px buffer
    
    console.log(`Pagination calc: viewportHeight=${viewportHeight}, availableHeight=${availableHeight}`);

    // Build pages based on cumulative height
    const pagesList = [];
    let currentPageItems = [];
    let currentHeight = 0;

    for (const group of allGroups) {
      const rowHeight = calculateRowHeight(group);
      
      if (currentHeight + rowHeight > availableHeight && currentPageItems.length > 0) {
        // Start new page
        pagesList.push(currentPageItems);
        currentPageItems = [group];
        currentHeight = rowHeight;
      } else {
        currentPageItems.push(group);
        currentHeight += rowHeight;
      }
    }

    // Don't forget the last page
    if (currentPageItems.length > 0) {
      pagesList.push(currentPageItems);
    }

    console.log(`Pagination result: ${allGroups.length} customers across ${pagesList.length} pages`);

    return { 
      grouped: allGroups, 
      pages: pagesList, 
      totalPages: pagesList.length 
    };
  }, [orders, viewportHeight]);

  // Get current page customers
  const currentCustomers = useMemo(() => {
    if (pages.length === 0) return [];
    const safePageIndex = Math.min(currentPage, pages.length - 1);
    return pages[safePageIndex] || [];
  }, [pages, currentPage]);

  // Reset currentPage when total pages changes
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(0);
    }
  }, [totalPages, currentPage]);

  // Auto-cycle through pages
  useEffect(() => {
    if (totalPages <= 1) return;

    const interval = setInterval(() => {
      setCurrentPage((prevPage) => {
        const nextPage = (prevPage + 1) % totalPages;
        console.log(`Auto-cycling to page ${nextPage + 1}/${totalPages}`);
        return nextPage;
      });
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
            {/* Page Indicator in Customer Header - always show if multiple pages */}
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
          <div key={`page-${currentPage}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {currentCustomers.length === 0 ? (
              <div style={{
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
                <div key={group.accountId || group.accountName} style={customerRowStyle}>
                {/* Customer Name Cell */}
                <div style={customerColStyle}>
                  <div style={customerNameStyle}>
                    {truncateText(group.accountName, 18)}
                  </div>
                </div>

                {/* Stage Cells */}
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
                    <div key={`${group.accountId}-${stageKey}`} style={stageCellStyle}>
                      {itemsInStage.length === 0 ? (
                        <div style={emptyStageStyle}>—</div>
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
      </div>

      <div style={footerStyle}>
        <div style={footerTextStyle}>
          Manufacturing Tracker • Auto-refreshes every 30 seconds • Last updated: {lastUpdate.toLocaleTimeString()}
          {totalPages > 1 && ` • Page ${currentPage + 1} of ${totalPages}`}
        </div>
      </div>
    </main>
  );
}
