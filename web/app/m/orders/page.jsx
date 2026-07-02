"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "14px 14px 24px" },
  h1: { fontSize: 22, fontWeight: 700, margin: "2px 0 12px" },
  search: { width: "100%", fontSize: 16, padding: "12px 14px", borderRadius: 8, boxSizing: "border-box", marginBottom: 4 },
  card: { display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "14px", marginTop: 8, borderRadius: 8, background: "#1f1f1f", border: "1px solid #333", color: "#e4e4e4", cursor: "pointer" },
  name: { fontSize: 16, fontWeight: 600 },
  meta: { fontSize: 13, color: "#9ca3af", marginTop: 4 },
  pill: { display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, marginTop: 8 },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 14, padding: "40px 0" },
};

export default function MobileOrdersList() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/orders?includeArchived=false", { headers: getAuthHeaders(), cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setOrders(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, getAuthHeaders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? orders.filter((o) => {
          const name = (o.account?.name || "").toLowerCase();
          const sku = (o.sku || "").toLowerCase();
          const contact = (o.account?.contactName || "").toLowerCase();
          return name.includes(q) || sku.includes(q) || contact.includes(q);
        })
      : orders;
    return list;
  }, [orders, query]);

  const meta = (o) => {
    const d = o.orderDate ? new Date(o.orderDate).toLocaleDateString() : null;
    const n = Array.isArray(o.items) ? o.items.length : 0;
    return [d, o.sku ? `Sales: ${o.sku}` : null, `${n} item${n === 1 ? "" : "s"}`].filter(Boolean).join("  ·  ");
  };

  if (!user) return <><TopNav /><div style={S.wrap} /></>;

  return (
    <>
      <TopNav />
      <div style={S.wrap}>
        <h1 style={S.h1}>Orders</h1>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, contact, or sales person"
          style={S.search}
          autoComplete="off"
        />
        {loading ? (
          <div style={S.empty}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={S.empty}>No matching orders.</div>
        ) : (
          filtered.map((o) => (
            <button key={o.id} type="button" style={S.card} onClick={() => router.push(`/m/orders/${o.id}`)}>
              <div style={S.name}>{o.account?.name || "(no customer)"}</div>
              <div style={S.meta}>{meta(o)}</div>
              <span style={{ ...S.pill, background: o.isLocked ? "rgba(220,38,38,0.15)" : "rgba(16,185,129,0.15)", color: o.isLocked ? "#f87171" : "#34d399" }}>
                {o.isLocked ? "Locked" : "Active"}
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
