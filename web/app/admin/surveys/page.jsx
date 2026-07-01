"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

const RED = "#dc2626";
const CARD = "#1a1a1a";
const BORDER = "#333";
const TEXT = "#e4e4e4";
const MUTED = "#9ca3af";

const PHASE_OPTIONS = [
  { value: "", label: "All phases" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "CONTAINER_AT_SEA", label: "Container At Sea" },
  { value: "COMPLETION", label: "Completion" },
];

const SEND_PHASES = PHASE_OPTIONS.filter((o) => o.value);
const phaseLabelOf = (v) => PHASE_OPTIONS.find((o) => o.value === v)?.label || v;

function scoreColor(v) {
  if (v == null) return MUTED;
  if (v <= 3) return "#ef4444";
  if (v < 4) return "#f59e0b";
  return "#22c55e";
}

function Stars({ value }) {
  if (value == null) return <span style={{ color: MUTED }}>-</span>;
  const full = Math.round(value);
  return (
    <span style={{ color: "#f5b301", letterSpacing: 1 }}>
      {"★".repeat(full)}
      <span style={{ color: "#3a3a3a" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

export default function AdminSurveysPage() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ surveys: [], summary: null });
  const [filters, setFilters] = useState({ phase: "", agent: "", flagged: false, from: "", to: "" });
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showSend, setShowSend] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [sendOrderId, setSendOrderId] = useState("");
  const [sendPhase, setSendPhase] = useState("MANUFACTURING");
  const [orderFilter, setOrderFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.phase) p.set("phase", filters.phase);
    if (filters.agent) p.set("agent", filters.agent);
    if (filters.flagged) p.set("flagged", "true");
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/surveys?${buildQuery()}`, { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load surveys (Status: ${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, getAuthHeaders]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function openDetail(id) {
    setDetailLoading(true);
    setDetail({ id });
    try {
      const res = await fetch(`/api/surveys/${id}`, { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load detail (Status: ${res.status})`);
      setDetail(await res.json());
    } catch (e) {
      setDetail({ error: e instanceof Error ? e.message : "Failed to load detail" });
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await fetch(`/api/surveys/export.csv?${buildQuery()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "survey-results.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    }
  }

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/surveys/orders", { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load orders (Status: ${res.status})`);
      setOrders(await res.json());
    } catch (e) {
      setSendMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to load orders" });
    } finally {
      setOrdersLoading(false);
    }
  }, [getAuthHeaders]);

  function openSend() {
    setSendMsg(null);
    setSendOrderId("");
    setSendPhase("MANUFACTURING");
    setOrderFilter("");
    setShowSend(true);
    loadOrders();
  }

  async function submitSend(resend) {
    if (!sendOrderId) { setSendMsg({ type: "error", text: "Pick an order first." }); return; }
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/surveys/generate", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: sendOrderId, phase: sendPhase, resend: !!resend }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendMsg({ type: "error", text: body.error || `Failed (Status: ${res.status})` });
      } else {
        const emailNote = body.recipientEmail
          ? `Invite emailed to ${body.recipientEmail}.`
          : "No customer email on file, so no email was sent -- the tracking-page link still works.";
        const verb = body.action === "resent" ? "Invite re-sent" : "Survey created";
        setSendMsg({ type: "success", text: `${verb}. ${emailNote}` });
        await loadOrders();
        load();
      }
    } catch (e) {
      setSendMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to send" });
    } finally {
      setSending(false);
    }
  }

  if (authLoading || !user) return null;

  const s = data.summary;
  const fmt = (v, d = 2) => (v == null ? "-" : Number(v).toFixed(d));
  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "-");

  const inputStyle = {
    background: "#0f0f0f", border: `1px solid ${BORDER}`, borderRadius: 6,
    color: TEXT, padding: "8px 10px", fontSize: 14,
  };

  const selectedOrder = orders.find((o) => o.id === sendOrderId) || null;
  const existingForPhase = selectedOrder?.surveys?.find((sv) => sv.phase === sendPhase) || null;
  const filteredOrders = orders.filter((o) => {
    const q = orderFilter.trim().toLowerCase();
    if (!q) return true;
    return (o.poNumber || "").toLowerCase().includes(q) || (o.accountName || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: TEXT }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, margin: 0 }}>Customer Surveys</h1>
            <p style={{ color: MUTED, margin: "4px 0 0" }}>Satisfaction responses across manufacturing, shipping, and completion.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={openSend} style={{ background: "#262626", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
              Send a survey
            </button>
            <button onClick={exportCsv} style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {s && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
            <SummaryCard label="Avg Overall" value={s.avgOverall == null ? "-" : `${fmt(s.avgOverall, 1)}/5`} color={scoreColor(s.avgOverall)} />
            <SummaryCard label="Completed" value={s.completed} />
            <SummaryCard label="Pending" value={s.pending} />
            <SummaryCard label="Flagged" value={s.flagged} color={s.flagged > 0 ? "#ef4444" : TEXT} />
            <SummaryCard label="Contact Requests" value={s.contactRequests} color={s.contactRequests > 0 ? "#f59e0b" : TEXT} />
            <SummaryCard label="Testimonials" value={`${s.testimonialsYes} / ${s.testimonialsMaybe}`} sub="yes / maybe" />
          </div>
        )}

        {/* Aggregate tables */}
        {s && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
            <AggTable title="Average by Sales Agent" rows={s.avgByAgent} />
            <AggTable title="Average by Machine Model" rows={s.avgByModel} />
            <AggTable title="Average by Phase" rows={s.avgByPhase} />
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <select value={filters.phase} onChange={(e) => setFilters((f) => ({ ...f, phase: e.target.value }))} style={inputStyle}>
            {PHASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input placeholder="Sales agent" value={filters.agent} onChange={(e) => setFilters((f) => ({ ...f, agent: e.target.value }))} style={inputStyle} />
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} style={inputStyle} />
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} style={inputStyle} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 14 }}>
            <input type="checkbox" checked={filters.flagged} onChange={(e) => setFilters((f) => ({ ...f, flagged: e.target.checked }))} />
            Flagged only
          </label>
          <button onClick={load} style={{ background: "#262626", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>
            Apply
          </button>
        </div>

        {error && (
          <div style={{ color: "#fca5a5", background: "rgba(220,38,38,0.1)", border: `1px solid ${RED}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>
        )}

        {/* Results table */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#111", color: MUTED, textAlign: "left" }}>
                  <th style={th}>Date</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Order</th>
                  <th style={th}>Phase</th>
                  <th style={th}>Agent</th>
                  <th style={th}>Machine</th>
                  <th style={th}>Score</th>
                  <th style={th}>Flags</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: MUTED, padding: 24 }}>Loading...</td></tr>
                ) : data.surveys.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: MUTED, padding: 24 }}>No surveys match these filters.</td></tr>
                ) : (
                  data.surveys.map((r) => (
                    <tr key={r.id} onClick={() => openDetail(r.id)} style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer" }}>
                      <td style={td}>{fmtDate(r.completedAt || r.createdAt)}</td>
                      <td style={td}>{r.customerName || "-"}</td>
                      <td style={td}>{r.orderRef || "-"}</td>
                      <td style={td}>{r.phaseLabel}</td>
                      <td style={td}>{r.salesAgent || "-"}</td>
                      <td style={td}>{r.machineModel || "-"}</td>
                      <td style={{ ...td, color: scoreColor(r.overallScore), fontWeight: 600 }}>{r.overallScore == null ? "-" : `${r.overallScore.toFixed(1)}`}</td>
                      <td style={td}>
                        {r.flagged && <Badge color="#ef4444">Low</Badge>}
                        {r.contactRequested && <Badge color="#f59e0b">Contact</Badge>}
                        {r.testimonialWillingness === "YES" && <Badge color="#22c55e">Testimonial</Badge>}
                        {r.testimonialWillingness === "MAYBE" && <Badge color="#3b82f6">Maybe</Badge>}
                      </td>
                      <td style={td}>
                        <span style={{ color: r.status === "COMPLETED" ? "#22c55e" : MUTED }}>{r.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Send-a-survey modal */}
      {showSend && (
        <div onClick={() => !sending && setShowSend(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto", zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, maxWidth: 520, width: "100%", padding: 24, marginTop: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Send a survey</h2>
              <button onClick={() => !sending && setShowSend(false)} style={{ background: "transparent", border: "none", color: MUTED, fontSize: 22, cursor: "pointer" }}>✕</button>
            </div>

            <p style={{ color: MUTED, fontSize: 13, marginTop: 0, marginBottom: 18 }}>
              Fire a survey for an existing order. This emails the customer (when an email is on file) and makes the Feedback tab appear on their tracking page.
            </p>

            <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Order</label>
            <input placeholder="Filter by PO or customer" value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
            <select value={sendOrderId} onChange={(e) => setSendOrderId(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 16 }}>
              <option value="">{ordersLoading ? "Loading orders..." : "Select an order"}</option>
              {filteredOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {(o.poNumber || o.id.slice(-8).toUpperCase())} - {o.accountName || "No account"}{o.hasEmail ? "" : " (no email)"}
                </option>
              ))}
            </select>

            <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Phase</label>
            <select value={sendPhase} onChange={(e) => setSendPhase(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 16 }}>
              {SEND_PHASES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {selectedOrder && existingForPhase && (
              <div style={{ fontSize: 13, color: existingForPhase.status === "COMPLETED" ? "#22c55e" : "#f59e0b", marginBottom: 16 }}>
                {existingForPhase.status === "COMPLETED"
                  ? "The customer already completed this survey."
                  : `A ${phaseLabelOf(sendPhase)} survey already exists for this order (status: ${existingForPhase.status}). You can re-send the invite.`}
              </div>
            )}

            {selectedOrder && !selectedOrder.hasEmail && (
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
                This customer has no email on file. The survey link will still work from their tracking page, but no email will be sent.
              </div>
            )}

            {sendMsg && (
              <div style={{ fontSize: 13, marginBottom: 16, padding: 10, borderRadius: 8, border: `1px solid ${sendMsg.type === "error" ? RED : "#22c55e"}`, background: sendMsg.type === "error" ? "rgba(220,38,38,0.1)" : "rgba(34,197,94,0.1)", color: sendMsg.type === "error" ? "#fca5a5" : "#86efac" }}>
                {sendMsg.text}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => !sending && setShowSend(false)} style={{ background: "#262626", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>
                Close
              </button>
              {existingForPhase && existingForPhase.status === "COMPLETED" ? (
                <button disabled style={{ background: "#333", color: MUTED, border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "not-allowed" }}>
                  Already completed
                </button>
              ) : existingForPhase ? (
                <button onClick={() => submitSend(true)} disabled={sending || !sendOrderId} style={{ background: "#f59e0b", color: "#111", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.6 : 1 }}>
                  {sending ? "Sending..." : "Resend invite"}
                </button>
              ) : (
                <button onClick={() => submitSend(false)} disabled={sending || !sendOrderId} style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.6 : 1 }}>
                  {sending ? "Sending..." : "Send survey"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, maxWidth: 640, width: "100%", padding: 24, marginTop: 40 }}>
            {detailLoading ? (
              <div style={{ color: MUTED, textAlign: "center", padding: 24 }}>Loading...</div>
            ) : detail.error ? (
              <div style={{ color: "#fca5a5" }}>{detail.error}</div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 20 }}>{detail.title}</h2>
                    <div style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>
                      {detail.customerName} {detail.orderRef ? `- Order ${detail.orderRef}` : ""}
                    </div>
                  </div>
                  <button onClick={() => setDetail(null)} style={{ background: "transparent", border: "none", color: MUTED, fontSize: 22, cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 14 }}>
                  <span style={{ color: scoreColor(detail.overallScore), fontWeight: 700 }}>
                    Overall {detail.overallScore == null ? "-" : `${detail.overallScore.toFixed(1)}/5`}
                  </span>
                  <span style={{ color: MUTED }}>Agent: {detail.salesAgent || "-"}</span>
                  <span style={{ color: MUTED }}>Machine: {detail.machineModel || "-"}</span>
                </div>

                {(detail.flagged || detail.contactRequested || (detail.testimonialWillingness && detail.testimonialWillingness !== "NO")) && (
                  <div style={{ marginBottom: 16 }}>
                    {detail.flagged && <Badge color="#ef4444">Low rating</Badge>}
                    {detail.contactRequested && <Badge color="#f59e0b">Contact requested</Badge>}
                    {detail.testimonialWillingness === "YES" && <Badge color="#22c55e">Testimonial: Yes</Badge>}
                    {detail.testimonialWillingness === "MAYBE" && <Badge color="#3b82f6">Testimonial: Maybe</Badge>}
                  </div>
                )}

                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                  {(detail.answers || []).map((a) => (
                    <div key={a.questionKey} style={{ padding: "12px 0", borderBottom: `1px solid #262626` }}>
                      <div style={{ fontSize: 14, color: TEXT, marginBottom: 6 }}>{a.questionText}</div>
                      <div style={{ fontSize: 14 }}>
                        {a.rating != null && <Stars value={a.rating} />}
                        {a.choiceLabel && <span style={{ color: "#93c5fd" }}>{a.choiceLabel}</span>}
                        {a.rating == null && !a.choiceLabel && a.comment && <span style={{ color: TEXT }}>{a.comment}</span>}
                        {a.rating == null && !a.choiceLabel && !a.comment && <span style={{ color: MUTED }}>-</span>}
                      </div>
                      {a.comment && (a.rating != null || a.choiceLabel) && (
                        <div style={{ color: MUTED, fontSize: 13, marginTop: 4, fontStyle: "italic" }}>{a.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "12px 14px", whiteSpace: "nowrap" };

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: MUTED, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: color || TEXT }}>{value}</div>
      {sub && <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function AggTable({ title, rows }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {(!rows || rows.length === 0) ? (
        <div style={{ color: MUTED, fontSize: 13 }}>No data yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: `1px solid #262626` }}>
                <td style={{ padding: "6px 0", color: TEXT }}>{r.key}</td>
                <td style={{ padding: "6px 0", textAlign: "right", color: scoreColor(r.avg), fontWeight: 600 }}>{r.avg == null ? "-" : r.avg.toFixed(2)}</td>
                <td style={{ padding: "6px 0 6px 12px", textAlign: "right", color: MUTED }}>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{ display: "inline-block", background: "transparent", color, border: `1px solid ${color}`, borderRadius: 5, padding: "1px 7px", fontSize: 11, marginRight: 5, whiteSpace: "nowrap" }}>{children}</span>
  );
}
