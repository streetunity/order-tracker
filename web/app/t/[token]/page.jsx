"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const STAGES = [
  "MANUFACTURING","TESTING","SHIPPING","AT_SEA",
  "SMT","QC","DELIVERED","ONSITE","COMPLETED","FOLLOW_UP",
];

const STAGE_LABELS = {
  MANUFACTURING: "Manufacturing",
  TESTING:       "Debugging & Testing",
  SHIPPING:      "Preparing Container",
  AT_SEA:        "Container At Sea",
  SMT:           "Arrived At SMT",
  QC:            "Quality Control",
  DELIVERED:     "Delivered To Customer",
  ONSITE:        "On Site Setup & Training",
  COMPLETED:     "Training Complete",
  FOLLOW_UP:     "Systems Operational",
};

export default function PublicTrackingPage() {
  const params = useParams();
  const [order,         setOrder]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [customerFiles, setCustomerFiles] = useState(null);
  const [activeTab,     setActiveTab]     = useState("overview");

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/public/orders/${params.token}`, { cache: "no-store" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          if (res.status === 404) throw new Error("Order not found. Please check your tracking link.");
          throw new Error(d.error || `Failed to load order (Status: ${res.status})`);
        }
        setOrder(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    if (params.token) loadOrder();
  }, [params.token]);

  useEffect(() => {
    if (!params.token) return;
    async function loadFiles() {
      try {
        const res = await fetch(`/api/public/track/${params.token}/customer-documents`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setCustomerFiles(data);
        }
      } catch { /* silent */ }
    }
    loadFiles();
  }, [params.token]);

  const formatDate = (s) => {
    try {
      const d = new Date(s);
      return d.toLocaleDateString() + " at " + d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    } catch { return s; }
  };
  const formatDateOnly = (s) => {
    if (!s) return null;
    try {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString();
      return new Date(s).toLocaleDateString();
    } catch { return s; }
  };

  if (loading) return (
    <main style={{ padding:"60px 20px", maxWidth:"1100px", margin:"0 auto", textAlign:"center" }}>
      <div style={{ color:"#a0a0a0", fontSize:"18px" }}>Loading order status…</div>
    </main>
  );
  if (error) return (
    <main style={{ padding:"60px 20px", maxWidth:"1100px", margin:"0 auto", textAlign:"center" }}>
      <div style={{ padding:"20px", backgroundColor:"#7f1d1d", border:"1px solid #991b1b", borderRadius:"8px", color:"#fecaca" }}>{error}</div>
    </main>
  );
  if (!order) return (
    <main style={{ padding:"60px 20px", maxWidth:"1100px", margin:"0 auto", textAlign:"center" }}>
      <div style={{ color:"#a0a0a0" }}>No order data available</div>
    </main>
  );

  const showShipping = order.etaDate || order.shippingCarrier || order.trackingNumber || order.onsiteInstallationDate;
  const hasTimeline  = (order.statusEvents?.length > 0) || order.items?.some(i => i.statusEvents?.length > 0);

  // Determine if there are any files to show on the Files tab
  const hasAnyFiles = customerFiles && (
    customerFiles.totalCount > 0 ||
    customerFiles.legacyDropboxLink ||
    customerFiles.readme?.length > 0
  );

  const tabStyle = (id) => ({
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    borderRadius: "6px",
    background: activeTab === id ? "#dc2626" : "transparent",
    color:      activeTab === id ? "#fff"     : "#a0a0a0",
    transition: "background 0.15s, color 0.15s",
    whiteSpace: "nowrap",
  });

  const cardStyle = {
    background: "#2d2d2d",
    border: "1px solid #404040",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "16px",
    width: "100%",
    boxSizing: "border-box",
  };

  const infoBlock = (label, value, color = "#e4e4e4") => (
    <div>
      <div style={{ fontSize:"11px", fontWeight:600, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"4px" }}>{label}</div>
      <div style={{ fontSize:"15px", color }}>{value || "—"}</div>
    </div>
  );

  return (
    <main style={{ maxWidth:"1100px", margin:"0 auto", padding:"24px 16px 60px" }}>

      <style>{`
        .tracking-header {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 28px;
        }
        .tracking-logo {
          flex-shrink: 0;
          width: 90px;
          height: 90px;
        }
        .tracking-tabs {
          display: flex;
          gap: 4px;
          padding: 6px;
          background: #1a1a1a;
          border-radius: 8px;
          margin-bottom: 24px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .tracking-tabs::-webkit-scrollbar { display: none; }
        .info-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px 32px;
        }
        .item-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 18px;
          gap: 16px;
        }
        .stage-pills-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 14px;
        }
        .stage-pill {
          flex: 1 1 80px;
          padding: 6px 4px;
          border-radius: 5px;
          text-align: center;
          font-size: 9px;
          font-weight: 500;
          line-height: 1.3;
          box-sizing: border-box;
        }
        @media (max-width: 640px) {
          .tracking-header { flex-direction: column; align-items: flex-start; gap: 14px; }
          .tracking-logo { width: 64px; height: 64px; }
          .tracking-header h1 { font-size: 22px !important; }
          .info-grid-2 { grid-template-columns: 1fr; gap: 14px; }
          .item-header-row { flex-direction: column; gap: 10px; }
          .item-header-row > div:last-child { text-align: left !important; }
          .stage-pill { flex: 1 1 60px; font-size: 8px; }
        }
      `}</style>

      {/* Header */}
      <div className="tracking-header">
        <div className="tracking-logo" style={{
          backgroundImage:"url('/smt-logo.png')",
          backgroundSize:"contain", backgroundRepeat:"no-repeat", backgroundPosition:"center",
        }} />
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:"26px", fontWeight:700, color:"#e4e4e4", margin:"0 0 12px" }}>Order Status</h1>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
            {order.orderDate && (
              <span style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"5px 12px", background:"#1f1f1f", border:"1px solid #2d2d2d", borderRadius:"99px", fontSize:"13px", color:"#a0a0a0" }}>
                <span style={{ color:"#dc2626", fontWeight:600 }}>Order Date</span> {formatDateOnly(order.orderDate)}
              </span>
            )}
            {order.sku && (
              <span style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"5px 12px", background:"#1f1f1f", border:"1px solid #2d2d2d", borderRadius:"99px", fontSize:"13px", color:"#a0a0a0" }}>
                <span style={{ color:"#dc2626", fontWeight:600 }}>Sales Rep</span> {order.sku}
              </span>
            )}
            {order.poNumber && (
              <span style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"5px 12px", background:"#1f1f1f", border:"1px solid #2d2d2d", borderRadius:"99px", fontSize:"13px", color:"#a0a0a0" }}>
                <span style={{ color:"#dc2626", fontWeight:600 }}>PO</span> {order.poNumber}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tracking-tabs">
        <button onClick={() => setActiveTab("overview")} style={tabStyle("overview")}>Overview</button>
        <button onClick={() => setActiveTab("files")}    style={tabStyle("files")}>Your Files</button>
        {hasTimeline && (
          <button onClick={() => setActiveTab("timeline")} style={tabStyle("timeline")}>Timeline</button>
        )}
      </div>

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <>
          <div style={cardStyle}>
            <h2 style={{ fontSize:"14px", fontWeight:600, color:"#e4e4e4", margin:"0 0 18px", textTransform:"uppercase", letterSpacing:"0.06em" }}>Customer Information</h2>
            <div className="info-grid-2">
              {infoBlock("Company",         order.accountName)}
              {infoBlock("Contact Name",    order.account?.contactName)}
              {infoBlock("Email",           order.account?.email)}
              {infoBlock("Phone",           order.account?.phone)}
              {infoBlock("Address",         order.account?.address)}
              {infoBlock("Machine Voltage", order.account?.machineVoltage)}
            </div>
          </div>

          {showShipping && (
            <div style={cardStyle}>
              <h2 style={{ fontSize:"14px", fontWeight:600, color:"#e4e4e4", margin:"0 0 18px", textTransform:"uppercase", letterSpacing:"0.06em" }}>Shipping Information</h2>
              <div className="info-grid-2">
                {order.etaDate         && infoBlock("ETA", formatDateOnly(order.etaDate))}
                {order.onsiteInstallationDate !== undefined && infoBlock("Onsite Installation Date", order.onsiteInstallationDate ? formatDateOnly(order.onsiteInstallationDate) : "TBD")}
                {order.shippingCarrier && infoBlock("Carrier",  order.shippingCarrier)}
                {order.trackingNumber  && infoBlock("Tracking", order.trackingNumber)}
              </div>
            </div>
          )}

          <div>
            <h2 style={{ fontSize:"18px", fontWeight:600, color:"#e4e4e4", margin:"0 0 14px" }}>Order Items & Progress</h2>
            {(!order.items || order.items.length === 0) ? (
              <div style={{ ...cardStyle, textAlign:"center" }}>
                <p style={{ color:"#dc2626", marginBottom:"8px" }}>No items found in this order</p>
                <p style={{ color:"#a0a0a0", fontSize:"14px" }}>Please contact support if you believe this is an error.</p>
              </div>
            ) : (
              <div style={{ display:"grid", gap:"16px" }}>
                {order.items.map((item) => {
                  const stage    = item.currentStage || order.currentStage || "MANUFACTURING";
                  const stageIdx = Math.max(0, STAGES.indexOf(stage));
                  const done     = stage === "FOLLOW_UP";
                  return (
                    <div key={item.id} style={cardStyle}>
                      <div className="item-header-row">
                        <div>
                          <div style={{ fontSize:"19px", fontWeight:600, color:"#e4e4e4", marginBottom:"8px" }}>{item.productCode || "Unknown Item"}</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                            {[
                              ["Qty",     item.qty || 1],
                              ["Serial",  item.serialNumber],
                              ["Model",   item.modelNumber],
                              ["Voltage", item.voltage],
                              ["Power",   item.laserWattage],
                            ].filter(([,v]) => v).map(([k,v]) => (
                              <span key={k} style={{ padding:"3px 10px", background:"#1a1a1a", border:"1px solid #333", borderRadius:"99px", fontSize:"12px", color:"#a0a0a0" }}>
                                <span style={{ color:"#dc2626" }}>{k}:</span> {v}
                              </span>
                            ))}
                          </div>
                          {item.notes && (
                            <div style={{ marginTop:"10px", fontSize:"13px", color:"#a0a0a0", fontStyle:"italic", background:"#1a1a1a", padding:"8px 12px", borderRadius:"6px", border:"1px solid #333" }}>
                              {item.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:"14px", fontWeight:600, color: done ? "#10b981" : "#dc2626" }}>{STAGE_LABELS[stage] || stage}</div>
                          <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"4px" }}>Stage {stageIdx + 1} of {STAGES.length}</div>
                        </div>
                      </div>
                      <div className="stage-pills-wrap">
                        {STAGES.map((s, i) => {
                          const isCur  = stage === s;
                          const isPast = i < stageIdx;
                          const bg     = isCur ? (s === "FOLLOW_UP" ? "#10b981" : "#dc2626") : isPast ? "#10b981" : "#1a1a1a";
                          const fg     = (isCur || isPast) ? "#fff" : "#6b7280";
                          const border = (isCur || isPast) ? bg : "#333";
                          return (
                            <div key={s} className="stage-pill" style={{ border:`1px solid ${border}`, background:bg, color:fg }}>
                              {STAGE_LABELS[s]}
                              {isPast && <div style={{ fontSize:"8px", opacity:0.85, marginTop:"2px" }}>✓</div>}
                              {isCur && s !== "FOLLOW_UP" && <div style={{ fontSize:"8px", opacity:0.85, marginTop:"2px" }}>▶ Current</div>}
                              {isCur && s === "FOLLOW_UP" && <div style={{ fontSize:"8px", opacity:0.85, marginTop:"2px" }}>✓</div>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ height:"6px", background:"#333", borderRadius:"99px", overflow:"hidden", marginBottom:"6px" }}>
                        <div style={{ height:"100%", width:`${((stageIdx+1)/STAGES.length)*100}%`, background: done ? "#10b981" : "#dc2626", borderRadius:"99px", transition:"width 0.3s" }} />
                      </div>
                      <div style={{ fontSize:"12px", color:"#6b7280" }}>{Math.round(((stageIdx+1)/STAGES.length)*100)}% Complete</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* YOUR FILES */}
      {activeTab === "files" && (
        <div>
          {!customerFiles ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"#6b7280" }}>
              <div style={{ fontSize:"40px", marginBottom:"12px" }}>📁</div>
              <p style={{ fontSize:"16px" }}>Loading your files…</p>
            </div>
          ) : !hasAnyFiles ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"#6b7280" }}>
              <div style={{ fontSize:"40px", marginBottom:"12px" }}>📁</div>
              <p style={{ fontSize:"16px" }}>No files have been uploaded yet.</p>
              <p style={{ fontSize:"14px", marginTop:"8px" }}>Check back later — your sales rep will upload photos, videos, and documents here.</p>
            </div>
          ) : (
            <>
              {/* Read Me files */}
              {customerFiles.readme?.length > 0 && (
                <div style={{ marginBottom:"28px" }}>
                  <h3 style={{ fontSize:"16px", fontWeight:600, color:"#e4e4e4", margin:"0 0 12px", display:"flex", alignItems:"center", gap:"8px" }}>
                    📖 Read Me <span style={{ fontSize:"13px", color:"#6b7280", fontWeight:400 }}>({customerFiles.readme.length})</span>
                  </h3>
                  <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                    {customerFiles.readme.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px", background:"#2d2d2d", border:"1px solid #404040", borderRadius:"8px", textDecoration:"none", color:"inherit" }}>
                        <span style={{ fontSize:"22px", flexShrink:0 }}>📖</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:500, color:"#e4e4e4", fontSize:"15px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.fileName}</div>
                          {f.description && <div style={{ fontSize:"13px", color:"#a0a0a0", marginTop:"2px" }}>{f.description}</div>}
                          {f.fileSizeFormatted && <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"2px" }}>{f.fileSizeFormatted}</div>}
                        </div>
                        <span style={{ color:"#dc2626", fontSize:"18px", flexShrink:0 }}>↓</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              {customerFiles.photos?.length > 0 && (
                <div style={{ marginBottom:"28px" }}>
                  <h3 style={{ fontSize:"16px", fontWeight:600, color:"#e4e4e4", margin:"0 0 12px", display:"flex", alignItems:"center", gap:"8px" }}>
                    📷 Photos <span style={{ fontSize:"13px", color:"#6b7280", fontWeight:400 }}>({customerFiles.photos.length})</span>
                  </h3>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:"10px" }}>
                    {customerFiles.photos.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ display:"block", borderRadius:"8px", overflow:"hidden", border:"1px solid #404040", aspectRatio:"1", background:"#2d2d2d" }}>
                        <img src={f.url} alt={f.fileName} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos */}
              {customerFiles.videos?.length > 0 && (
                <div style={{ marginBottom:"28px" }}>
                  <h3 style={{ fontSize:"16px", fontWeight:600, color:"#e4e4e4", margin:"0 0 12px", display:"flex", alignItems:"center", gap:"8px" }}>
                    🎬 Videos <span style={{ fontSize:"13px", color:"#6b7280", fontWeight:400 }}>({customerFiles.videos.length})</span>
                  </h3>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:"14px" }}>
                    {customerFiles.videos.map((f) => (
                      <div key={f.id} style={{ background:"#2d2d2d", border:"1px solid #404040", borderRadius:"8px", overflow:"hidden" }}>
                        <video controls style={{ width:"100%", display:"block" }}>
                          <source src={f.url} type={f.mimeType} />
                          Your browser does not support video playback.
                        </video>
                        <div style={{ padding:"8px 12px", fontSize:"13px", color:"#a0a0a0" }}>
                          {f.fileName}{f.fileSizeFormatted && <span style={{ marginLeft:"8px" }}>· {f.fileSizeFormatted}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents & Manuals */}
              {([...(customerFiles.manuals||[]), ...(customerFiles.documents||[])].length > 0) && (
                <div style={{ marginBottom:"28px" }}>
                  <h3 style={{ fontSize:"16px", fontWeight:600, color:"#e4e4e4", margin:"0 0 12px", display:"flex", alignItems:"center", gap:"8px" }}>
                    📄 Documents & Manuals
                    <span style={{ fontSize:"13px", color:"#6b7280", fontWeight:400 }}>({(customerFiles.manuals?.length||0)+(customerFiles.documents?.length||0)})</span>
                  </h3>
                  <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                    {[...(customerFiles.manuals||[]), ...(customerFiles.documents||[])].map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                        style={{ display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px", background:"#2d2d2d", border:"1px solid #404040", borderRadius:"8px", textDecoration:"none", color:"inherit" }}>
                        <span style={{ fontSize:"22px", flexShrink:0 }}>📄</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:500, color:"#e4e4e4", fontSize:"15px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.fileName}</div>
                          {f.description && <div style={{ fontSize:"13px", color:"#a0a0a0", marginTop:"2px" }}>{f.description}</div>}
                          {f.fileSizeFormatted && <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"2px" }}>{f.fileSizeFormatted}</div>}
                        </div>
                        <span style={{ color:"#dc2626", fontSize:"18px", flexShrink:0 }}>↓</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy Dropbox */}
              {customerFiles.legacyDropboxLink && (
                <div style={{ padding:"16px", background:"#2d2d2d", border:"1px solid #404040", borderRadius:"8px" }}>
                  <p style={{ margin:"0 0 8px", fontSize:"13px", color:"#a0a0a0" }}>Additional files available via Dropbox:</p>
                  <a href={customerFiles.legacyDropboxLink} target="_blank" rel="noopener noreferrer"
                    style={{ color:"#dc2626", fontSize:"14px", wordBreak:"break-all" }}>
                    {customerFiles.legacyDropboxLink} ↗
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TIMELINE */}
      {activeTab === "timeline" && (
        <div>
          {order.items?.filter(i => i.statusEvents?.length > 0).map((item) => (
            <div key={item.id} style={{ marginBottom:"24px" }}>
              <h3 style={{ fontSize:"16px", fontWeight:600, color:"#e4e4e4", margin:"0 0 12px" }}>{item.productCode || "Item"}</h3>
              <div style={{ background:"#2d2d2d", border:"1px solid #404040", borderRadius:"10px", overflow:"hidden" }}>
                {item.statusEvents.map((ev, i) => (
                  <div key={ev.id || i} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"14px 16px", borderBottom: i < item.statusEvents.length-1 ? "1px solid #333" : "none", gap:"12px" }}>
                    <div>
                      <div style={{ fontWeight:600, color:"#dc2626", fontSize:"14px" }}>{STAGE_LABELS[ev.stage] || ev.stage}</div>
                      {ev.note && <div style={{ color:"#a0a0a0", fontSize:"13px", marginTop:"3px" }}>{ev.note}</div>}
                    </div>
                    <div style={{ color:"#6b7280", fontSize:"12px", whiteSpace:"nowrap", flexShrink:0 }}>{formatDate(ev.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {order.statusEvents?.length > 0 && (
            <div>
              <h3 style={{ fontSize:"16px", fontWeight:600, color:"#e4e4e4", margin:"0 0 12px" }}>Order Events</h3>
              <div style={{ background:"#2d2d2d", border:"1px solid #404040", borderRadius:"10px", overflow:"hidden" }}>
                {order.statusEvents.map((ev, i) => (
                  <div key={ev.id || i} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"14px 16px", borderBottom: i < order.statusEvents.length-1 ? "1px solid #333" : "none", gap:"12px" }}>
                    <div>
                      <div style={{ fontWeight:600, color:"#dc2626", fontSize:"14px" }}>{STAGE_LABELS[ev.stage] || ev.stage}</div>
                      {ev.note && <div style={{ color:"#a0a0a0", fontSize:"13px", marginTop:"3px" }}>{ev.note}</div>}
                    </div>
                    <div style={{ color:"#6b7280", fontSize:"12px", whiteSpace:"nowrap", flexShrink:0 }}>{formatDate(ev.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop:"48px", paddingTop:"20px", borderTop:"1px solid #252525", textAlign:"center" }}>
        <p style={{ color:"#6b7280", fontSize:"13px" }}>Order created on {formatDateOnly(order.createdAt)}</p>
        <p style={{ color:"#404040", fontSize:"12px", marginTop:"6px" }}>This is a secure tracking link. Do not share with unauthorized parties.</p>
      </div>
    </main>
  );
}
