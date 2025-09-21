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
  SHIPPING: "Preparing Container",
  AT_SEA: "At Sea",
  SMT: "At SMT",
  QC: "Quality Control",
  DELIVERED: "Delivered",
  ONSITE: "On Site Training",
  COMPLETED: "Complete",
  FOLLOW_UP: "Follow Up",
};

// Store API base URL as a constant to prevent 404 on auto-refresh
const API_BASE_URL = "http://localhost:4000";

function getAdminKey() {
  return (
    process.env.NEXT_PUBLIC_ADMIN_KEY ||
    process.env.NEXT_ADMIN_KEY ||
    "dev-admin-key"
  );
}

export default function KioskPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

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

  // Fixed header section - updated to 10 columns
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
    alignContent: 'start', // This is key - aligns content to start
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
    border: '1px solid #dc2626',  // Changed to red border
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
      // Fixed to use correct API endpoint
      const apiUrl = `${API_BASE_URL}/orders`;
      console.log("Fetching from:", apiUrl);
      
      const res = await fetch(apiUrl, {
        headers: { "x-admin-key": getAdminKey() },
        cache: "no-store",
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Failed to load orders:", e);
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

  const grouped = useMemo(() => {
    const by = new Map();
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
    return Array.from(by.values()).sort((a, b) =>
      a.accountName.localeCompare(b.accountName)
    );
  }, [orders]);

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
          <div style={{ ...headerCellStyle, ...customerColStyle }}>
            <div style={headerTextStyle}>Customer</div>
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
          {grouped.map((group) => (
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
          ))}
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
