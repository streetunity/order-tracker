"use client";

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Allow page to render
    setLoading(false);
  }, []);

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

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{
          width: "80px",
          height: "80px",
          background: "rgba(34, 197, 94, 0.1)",
          border: "2px solid #22c55e",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: "40px"
        }}>
          ✓
        </div>

        <h1 style={{
          fontSize: "28px",
          fontWeight: "700",
          color: "#22c55e",
          marginBottom: "16px"
        }}>
          Payment Successful!
        </h1>

        <p style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: "16px",
          marginBottom: "32px",
          lineHeight: "1.6"
        }}>
          Thank you for your payment. A confirmation email with your receipt has been sent to you.
        </p>

        <div style={{
          padding: "16px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "8px",
          marginBottom: "32px"
        }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            Your payment has been processed and your invoice has been updated.
            If you have any questions, please contact our support team.
          </p>
        </div>

        <p style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: "12px"
        }}>
          You may close this window.
        </p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.5)"
      }}>
        Loading...
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
