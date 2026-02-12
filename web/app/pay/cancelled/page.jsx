"use client";

export default function PaymentCancelledPage() {
  const containerStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
    padding: "40px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  const cardStyle = {
    maxWidth: "500px",
    width: "100%",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    padding: "48px 32px",
    textAlign: "center"
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{
          width: "80px",
          height: "80px",
          background: "rgba(245, 158, 11, 0.1)",
          border: "2px solid #f59e0b",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: "40px"
        }}>
          ⊘
        </div>

        <h1 style={{
          fontSize: "28px",
          fontWeight: "700",
          color: "#f59e0b",
          marginBottom: "16px"
        }}>
          Payment Cancelled
        </h1>

        <p style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: "16px",
          marginBottom: "32px",
          lineHeight: "1.6"
        }}>
          Your payment was cancelled. No charges have been made to your account.
        </p>

        <div style={{
          padding: "16px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "8px",
          marginBottom: "32px"
        }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            If you experienced any issues or have questions about your invoice,
            please contact our support team for assistance.
          </p>
        </div>

        <button
          onClick={() => window.history.back()}
          style={{
            padding: "12px 24px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            color: "rgba(255,255,255,0.9)",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer"
          }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
