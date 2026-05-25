// Shared inline-style tokens for the settings module.
// Tailwind is not configured in this project; all UI uses inline styles.

export const INP = {
  width: "100%",
  padding: "9px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 7,
  color: "rgba(255,255,255,0.9)",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};

export const LBL = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.6px",
  marginBottom: 5,
};

export const CARD = {
  background: "linear-gradient(180deg,#1f1f1f,#151515 48%,#111)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: 18,
  marginBottom: 14,
  boxShadow: "0 16px 36px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)",
};

export const HINT = {
  fontSize: 11,
  color: "rgba(255,255,255,0.28)",
  marginTop: 4,
};

export const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export const DIALOG = {
  background: "#1f1f1f",
  border: "1px solid #404040",
  borderRadius: 10,
  padding: 28,
  width: "90%",
  maxWidth: 500,
  boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
};
