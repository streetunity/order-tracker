"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const ALLOWED_ROLES = ["BROKER", "SUPER_ADMIN", "ACCOUNTANT"];

const PRIORITY_COLORS = {
  CRITICAL: { bg: "#dc2626", text: "#fff" },
  HIGH: { bg: "#f59e0b", text: "#000" },
  MEDIUM: { bg: "#eab308", text: "#000" },
  NORMAL: { bg: "#525252", text: "#e4e4e4" },
};
const STATUS_COLORS = {
  PENDING: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  IN_PROGRESS: { bg: "rgba(37,99,235,0.15)", text: "#60a5fa" },
  FILED: { bg: "rgba(16,185,129,0.15)", text: "#34d399" },
};
const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, NORMAL: 3 };

const FILTERS = [
  { id: "ALL", label: "All" },
  { id: "CRITICAL", label: "Critical" },
  { id: "HIGH", label: "High" },
  { id: "PENDING", label: "Pending" },
  { id: "IN_PROGRESS", label: "In Progress" },
];

const S = {
  header: { position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#1a1a1a", borderBottom: "1px solid #333" },
  brand: { fontSize: 16, fontWeight: 700, color: "#ef4444" },
  headerBtns: { display: "flex", gap: 8 },
  smallBtn: { minHeight: 38, padding: "0 12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #404040", background: "#2a2a2a", color: "#e4e4e4", cursor: "pointer" },
  wrap: { maxWidth: 720, margin: "0 auto", padding: "12px 14px 28px" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 },
  statCard: { background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, padding: "10px 12px" },
  statLabel: { fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" },
  statValue: { fontSize: 22, fontWeight: 700, marginTop: 2 },
  search: { width: "100%", fontSize: 16, padding: "12px 14px", borderRadius: 8, boxSizing: "border-box", marginBottom: 8 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { padding: "7px 13px", minHeight: 38, borderRadius: 99, fontSize: 13, fontWeight: 600, border: "1px solid #404040", background: "#2a2a2a", color: "#9ca3af", cursor: "pointer" },
  chipActive: { background: "rgba(220,38,38,0.15)", borderColor: "#dc2626", color: "#f87171" },
  card: { display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "14px", marginTop: 8, borderRadius: 8, background: "#1f1f1f", border: "1px solid #333", borderLeftWidth: 4, color: "#e4e4e4", textDecoration: "none", cursor: "pointer" },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  badge: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" },
  title: { fontSize: 15, fontWeight: 600 },
  meta: { fontSize: 13, color: "#9ca3af", marginTop: 3 },
  codes: { fontSize: 12, color: "#7d8590", marginTop: 6 },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 14, padding: "40px 0" },
};

export default function MobileBrokerDashboard() {
  const { user, getAuthHeaders, logout } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        fetch("/api/customs/items-at-sea", { headers: getAuthHeaders(), cache: "no-store" }),
        fetch("/api/customs/statistics", { headers: getAuthHeaders(), cache: "no-store" }),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!user) return;
    if (!ALLOWED_ROLES.includes(user.role)) { router.push("/login"); return; }
    loadData();
  }, [user, router, loadData]);

  const displayRows = useMemo(() => {
    const shipmentGroups = {};
    const standalone = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item.shipmentId && item.shipment) {
        if (!shipmentGroups[item.shipmentId]) {
          shipmentGroups[item.shipmentId] = { type: "shipment", shipmentId: item.shipmentId, containerNumber: item.shipment.containerNumber || item.shipment.billOfLading || "Unnamed Shipment", items: [] };
        }
        shipmentGroups[item.shipmentId].items.push(item);
      } else {
        standalone.push({ type: "item", ...item });
      }
    });

    const shipmentRows = Object.values(shipmentGroups).map((group) => {
      const highestPriority = group.items.reduce((best, it) => ((PRIORITY_ORDER[it.priority] ?? 3) < (PRIORITY_ORDER[best] ?? 3) ? it.priority : best), "NORMAL");
      const hp = group.items.reduce((best, it) => ((PRIORITY_ORDER[it.priority] ?? 3) < (PRIORITY_ORDER[best.priority] ?? 3) ? it : best), group.items[0]);
      const contactNames = [...new Set(group.items.map((i) => i.order?.account?.contactName).filter(Boolean))];
      const customers = [...new Set(group.items.map((i) => i.order?.account?.name).filter(Boolean))];
      const productCodes = group.items.map((i) => i.productCode || "N/A");
      return {
        type: "shipment", id: group.shipmentId, containerNumber: group.containerNumber, count: group.items.length,
        priority: highestPriority, daysUntilArrival: hp?.daysUntilArrival, daysAtSea: hp?.daysAtSea,
        contactNames, customers, productCodes, customsDocumentStatus: group.items[0]?.customsDocumentStatus || "PENDING",
        _search: [group.containerNumber, ...contactNames, ...customers, ...productCodes].filter(Boolean).join(" ").toLowerCase(),
      };
    });

    const itemRows = standalone.map((item) => ({
      type: "item", id: item.id, priority: item.priority || "NORMAL", daysUntilArrival: item.daysUntilArrival, daysAtSea: item.daysAtSea,
      productCode: item.productCode, customerName: item.order?.account?.name, contactName: item.order?.account?.contactName,
      customsDocumentStatus: item.customsDocumentStatus || "PENDING",
      _search: [item.order?.poNumber, item.order?.account?.name, item.order?.account?.contactName, item.productCode].filter(Boolean).join(" ").toLowerCase(),
    }));

    const rows = [...shipmentRows, ...itemRows];
    rows.sort((a, b) => {
      const pA = PRIORITY_ORDER[a.priority] ?? 3;
      const pB = PRIORITY_ORDER[b.priority] ?? 3;
      if (pA !== pB) return pA - pB;
      return (b.daysAtSea || 0) - (a.daysAtSea || 0);
    });
    return rows;
  }, [items]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return displayRows.filter((row) => {
      if (filter === "CRITICAL" && row.priority !== "CRITICAL") return false;
      if (filter === "HIGH" && row.priority !== "HIGH") return false;
      if (filter === "PENDING" && row.customsDocumentStatus !== "PENDING") return false;
      if (filter === "IN_PROGRESS" && row.customsDocumentStatus !== "IN_PROGRESS") return false;
      if (q) return row._search.includes(q);
      return true;
    });
  }, [displayRows, filter, searchTerm]);

  const statusCount = (status) => (stats?.byStatus?.find((s) => s.customsDocumentStatus === status)?._count) || 0;

  if (!user) return null;

  return (
    <>
      <div style={S.header}>
        <span style={S.brand}>Broker Portal</span>
        <div style={S.headerBtns}>
          <button style={S.smallBtn} onClick={loadData}>Refresh</button>
          <button style={S.smallBtn} onClick={logout}>Logout</button>
        </div>
      </div>

      <div style={S.wrap}>
        {stats && (
          <div style={S.statsGrid}>
            <div style={S.statCard}><div style={S.statLabel}>Total At Sea</div><div style={S.statValue}>{stats.total ?? 0}</div></div>
            <div style={S.statCard}><div style={S.statLabel}>Critical</div><div style={{ ...S.statValue, color: "#f87171" }}>{stats.critical ?? 0}</div></div>
            <div style={S.statCard}><div style={S.statLabel}>Pending</div><div style={{ ...S.statValue, color: "#fbbf24" }}>{statusCount("PENDING")}</div></div>
            <div style={S.statCard}><div style={S.statLabel}>Filed</div><div style={{ ...S.statValue, color: "#34d399" }}>{statusCount("FILED")}</div></div>
          </div>
        )}

        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search container, customer, contact, product" style={S.search} autoComplete="off" />

        <div style={S.chips}>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} style={{ ...S.chip, ...(filter === f.id ? S.chipActive : null) }}>{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={S.empty}>Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div style={S.empty}>No items found.</div>
        ) : (
          filteredRows.map((row) => {
            const pc = PRIORITY_COLORS[row.priority] || PRIORITY_COLORS.NORMAL;
            const sc = STATUS_COLORS[row.customsDocumentStatus] || STATUS_COLORS.PENDING;
            const href = row.type === "shipment" ? `/broker/shipment/${row.id}?desktop=1` : `/m/broker/item/${row.id}`;
            const title = row.type === "shipment" ? row.containerNumber : (row.productCode || "Item");
            const contact = row.type === "shipment"
              ? (row.contactNames.length === 1 ? row.contactNames[0] : row.contactNames.length > 1 ? `Multiple (${row.contactNames.length})` : null)
              : row.contactName;
            const customer = row.type === "shipment"
              ? (row.customers.length === 1 ? row.customers[0] : row.customers.length > 1 ? `${row.customers.length} customers` : null)
              : row.customerName;
            const codes = row.type === "shipment" ? row.productCodes : (row.productCode ? [row.productCode] : []);
            const shownCodes = codes.slice(0, 4).join(", ") + (codes.length > 4 ? ` +${codes.length - 4} more` : "");
            const daysBits = [
              row.daysUntilArrival != null ? `${row.daysUntilArrival}d to arrival` : null,
              row.daysAtSea != null ? `${row.daysAtSea}d at sea` : null,
            ].filter(Boolean).join("  ·  ");
            return (
              <a key={`${row.type}-${row.id}`} href={href} style={{ ...S.card, borderLeftColor: pc.bg }}>
                <div style={S.cardTop}>
                  <span style={{ ...S.badge, background: pc.bg, color: pc.text }}>
                    {row.priority}{row.daysUntilArrival != null ? ` (${row.daysUntilArrival}d)` : ""}
                  </span>
                  <span style={{ ...S.badge, background: sc.bg, color: sc.text }}>{(row.customsDocumentStatus || "PENDING").replace("_", " ")}</span>
                </div>
                <div style={S.title}>{title}{row.type === "shipment" ? `  ·  ${row.count} item${row.count === 1 ? "" : "s"}` : ""}</div>
                <div style={S.meta}>{[customer, contact].filter(Boolean).join("  ·  ") || "—"}</div>
                {shownCodes && <div style={S.codes}>{shownCodes}</div>}
                {daysBits && <div style={S.codes}>{daysBits}</div>}
              </a>
            );
          })
        )}
      </div>
    </>
  );
}
