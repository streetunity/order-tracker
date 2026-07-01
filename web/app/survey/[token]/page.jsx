"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const RED = "#dc2626";
const BG = "#0a0a0a";
const CARD = "#141414";
const BORDER = "#2a2a2a";
const TEXT = "#e5e5e5";
const MUTED = "#9ca3af";

export default function SurveyPage() {
  const params = useParams();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const res = await fetch(`/api/public/survey/${token}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404) throw new Error("This survey link is not valid. Please check your link.");
          throw new Error(data.error || `Failed to load survey (Status: ${res.status})`);
        }
        setSurvey(data);
        if (data.completed) setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load survey");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  function setRating(key, rating) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], rating } }));
  }
  function setChoice(key, choice) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], choice } }));
  }
  function setComment(key, comment) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], comment } }));
  }

  function isComplete() {
    if (!survey?.questions) return false;
    for (const q of survey.questions) {
      const a = answers[q.key] || {};
      if (q.type === "rating" && !a.rating) return false;
      if (q.type === "choice" && !a.choice) return false;
    }
    return true;
  }

  async function submit() {
    if (!isComplete() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        answers: survey.questions.map((q) => {
          const a = answers[q.key] || {};
          return {
            questionKey: q.key,
            rating: a.rating ?? null,
            choice: a.choice ?? null,
            comment: a.comment ?? null,
          };
        }),
      };
      const res = await fetch(`/api/public/survey/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          setSubmitted(true);
          return;
        }
        throw new Error(data.error || `Submission failed (Status: ${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const page = {
    minHeight: "100vh",
    background: BG,
    color: TEXT,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    padding: "24px 16px",
  };
  const shell = { maxWidth: 640, margin: "0 auto" };

  if (loading) {
    return (
      <div style={page}>
        <div style={{ ...shell, textAlign: "center", color: MUTED, paddingTop: 80 }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={page}>
        <div style={{ ...shell, ...{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 32, textAlign: "center" } }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✕</div>
          <h1 style={{ color: RED, fontSize: 20, margin: "0 0 8px" }}>Survey unavailable</h1>
          <p style={{ color: MUTED, margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={page}>
        <div style={{ ...shell, ...{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 32, textAlign: "center" } }}>
          <div style={{ fontSize: 44, marginBottom: 12, color: RED }}>✓</div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Thank you</h1>
          <p style={{ color: MUTED, margin: 0 }}>
            Your feedback has been received. We appreciate you taking the time to share it with Stealth Machine Tools.
          </p>
        </div>
      </div>
    );
  }

  const greeting = survey.contactName ? `Hi ${survey.contactName},` : "Hello,";

  return (
    <div style={page}>
      <div style={shell}>
        <div style={{ marginBottom: 8, color: RED, fontWeight: 700, letterSpacing: 1, fontSize: 12 }}>
          STEALTH MACHINE TOOLS
        </div>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>{survey.title}</h1>
        <p style={{ color: MUTED, margin: "0 0 24px" }}>{greeting} please take a minute to share your feedback.</p>

        {survey.questions.map((q, idx) => (
          <div
            key={q.key}
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 16 }}
          >
            <div style={{ fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>
              <span style={{ color: RED, marginRight: 8 }}>{idx + 1}.</span>
              {q.text}
            </div>

            {q.type === "rating" && (
              <StarRow
                value={answers[q.key]?.rating || 0}
                onSelect={(n) => setRating(q.key, n)}
                labels={survey.ratingScale?.labels}
              />
            )}

            {q.type === "choice" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.options.map((o) => {
                  const active = answers[q.key]?.choice === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setChoice(q.key, o.value)}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 8,
                        cursor: "pointer",
                        border: `1px solid ${active ? RED : BORDER}`,
                        background: active ? "rgba(220,38,38,0.12)" : "#0f0f0f",
                        color: TEXT,
                        fontSize: 15,
                      }}
                    >
                      <span style={{ color: active ? RED : MUTED, marginRight: 10 }}>{active ? "●" : "○"}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "text" && (
              <textarea
                value={answers[q.key]?.comment || ""}
                onChange={(e) => setComment(q.key, e.target.value)}
                placeholder="Share your thoughts..."
                rows={4}
                style={textareaStyle}
              />
            )}

            {q.commentEnabled && q.type !== "text" && (
              <textarea
                value={answers[q.key]?.comment || ""}
                onChange={(e) => setComment(q.key, e.target.value)}
                placeholder="Add a comment (optional)"
                rows={2}
                style={{ ...textareaStyle, marginTop: 12 }}
              />
            )}
          </div>
        ))}

        {submitError && (
          <div style={{ color: "#fca5a5", background: "rgba(220,38,38,0.1)", border: `1px solid ${RED}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
            {submitError}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!isComplete() || submitting}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 10,
            border: "none",
            fontSize: 16,
            fontWeight: 600,
            cursor: !isComplete() || submitting ? "not-allowed" : "pointer",
            background: !isComplete() || submitting ? "#3a1414" : RED,
            color: !isComplete() || submitting ? MUTED : "#fff",
          }}
        >
          {submitting ? "Submitting..." : "Submit feedback"}
        </button>

        <p style={{ color: MUTED, fontSize: 12, textAlign: "center", marginTop: 16 }}>
          Your responses go directly to the Stealth Machine Tools team.
        </p>
      </div>
    </div>
  );
}

const textareaStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0f0f0f",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  color: "#e5e5e5",
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  resize: "vertical",
};

function StarRow({ value, onSelect, labels }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const label = labels && shown ? labels[shown] : "";
  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 30,
              lineHeight: 1,
              padding: 2,
              color: n <= shown ? "#f5b301" : "#3a3a3a",
            }}
          >
            {n <= shown ? "★" : "☆"}
          </button>
        ))}
      </div>
      <div style={{ minHeight: 18, marginTop: 6, fontSize: 13, color: "#9ca3af" }}>{label}</div>
    </div>
  );
}
