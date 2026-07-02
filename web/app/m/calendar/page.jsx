"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const EVENT_COLORS = {
  INSTALL:  { bg: "#dc2626", text: "#fff" },
  TIME_OFF: { bg: "#f59e0b", text: "#000" },
  BLOCKED:  { bg: "#525252", text: "#e4e4e4" },
  OTHER:    { bg: "#2563eb", text: "#fff" },
};
const TYPE_LABELS = {
  INSTALL: "Install",
  TIME_OFF: "Out of Office",
  BLOCKED: "Blocked",
  OTHER: "Other",
};

function buildTitle(e) {
  if (e.type === "INSTALL") {
    if (!e.order) return e.title || "Install";
    const acct = e.order.account;
    const label = acct?.contactName ? `${acct.name} — ${acct.contactName}` : (acct?.name || "Install");
    let t = `Install — ${label}`;
    if (e.assignees?.length) t = `${t} · ${e.assignees.map((a) => (a.name || "").split(" ")[0]).join(", ")}`;
    return t;
  }
  if (e.type === "TIME_OFF") {
    const name = e.user?.name || (e.assignees?.[0]?.name);
    return name ? `${name} — Out of Office` : (e.title || "Out of Office");
  }
  return e.title || TYPE_LABELS[e.type] || "Event";
}

const dayKey = (d) => {
  const x = new Date(d);
  return [x.getFullYear(), String(x.getMonth() + 1).padStart(2, "0"), String(x.getDate()).padStart(2, "0")].join("-");
};
const fmtTime = (d) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
const fmtDayHeader = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "14px 14px 24px" },
  h1: { fontSize: 22, fontWeight: 700, margin: "2px 0 12px" },
  monthRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  navBtn: { minWidth: 44, minHeight: 44, fontSize: 20, fontWeight: 700, borderRadius: 8, background: "#2a2a2a", border: "1px solid #404040", color: "#e4e4e4", cursor: "pointer" },
  monthLabel: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: 600 },
  todayBtn: { minHeight: 44, padding: "0 14px", fontSize: 14, fontWeight: 600, borderRadius: 8, background: "#dc2626", border: "1px solid #dc2626", color: "#fff", cursor: "pointer" },
  dayHead: { fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "18px 0 8px" },
  todayHead: { color: "#f87171" },
  card: { display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 8, background: "#1f1f1f", border: "1px solid #333", borderLeftWidth: 4 },
  evTitle: { fontSize: 15, fontWeight: 600, color: "#e4e4e4", lineHeight: 1.35 },
  evMeta: { fontSize: 13, color: "#9ca3af", marginTop: 3 },
  tag: { display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, marginTop: 6 },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 14, padding: "40px 0" },
};

export default function MobileCalendarPage() {
  const { user, getAuthHeaders } = useAuth();
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const monthLabel = useMemo(
    () => new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [cursor]
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const start = new Date(cursor.y, cursor.m, 1);
        const end = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59);
        const p = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
        const res = await fetch(`/api/calendar/events?${p}`, { headers: getAuthHeaders(), cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setEvents(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, cursor, getAuthHeaders]);

  const grouped = useMemo(() => {
    const map = {};
    for (const e of events) {
      const k = dayKey(e.startDate);
      (map[k] = map[k] || []).push(e);
    }
    return Object.keys(map).sort().map((k) => ({
      key: k,
      items: map[k].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)),
    }));
  }, [events]);

  const todayKey = dayKey(new Date());
  const shift = (delta) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); };

  if (!user) return <><TopNav /><div style={S.wrap} /></>;

  return (
    <>
      <TopNav />
      <div style={S.wrap}>
        <h1 style={S.h1}>Calendar</h1>

        <div style={S.monthRow}>
          <button style={S.navBtn} onClick={() => shift(-1)} aria-label="Previous month">&#8249;</button>
          <div style={S.monthLabel}>{monthLabel}</div>
          <button style={S.navBtn} onClick={() => shift(1)} aria-label="Next month">&#8250;</button>
          <button style={S.todayBtn} onClick={goToday}>Today</button>
        </div>

        {loading ? (
          <div style={S.empty}>Loading...</div>
        ) : grouped.length === 0 ? (
          <div style={S.empty}>No events this month.</div>
        ) : (
          grouped.map((g) => (
            <div key={g.key}>
              <div style={{ ...S.dayHead, ...(g.key === todayKey ? S.todayHead : null) }}>
                {fmtDayHeader(g.key)}{g.key === todayKey ? "  ·  Today" : ""}
              </div>
              {g.items.map((e) => {
                const c = EVENT_COLORS[e.type] || EVENT_COLORS.OTHER;
                const timed = e.allDay === false;
                return (
                  <div key={e.id} style={{ ...S.card, borderLeftColor: c.bg }}>
                    <div style={S.evTitle}>{buildTitle(e)}</div>
                    <div style={S.evMeta}>{timed ? `${fmtTime(e.startDate)} – ${fmtTime(e.endDate)}` : "All day"}</div>
                    <span style={{ ...S.tag, background: c.bg, color: c.text }}>{TYPE_LABELS[e.type] || "Event"}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}
