"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

// Signature Canvas Component
function SignatureCanvas({ onSave, onClear }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Set white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.closePath();
      setIsDrawing(false);

      // Save signature data
      if (hasDrawn) {
        onSave(canvas.toDataURL("image/png"));
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onClear();
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          width: "100%",
          maxWidth: "500px",
          height: "150px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "8px",
          backgroundColor: "#ffffff",
          cursor: "crosshair",
          touchAction: "none"
        }}
      />
      <button
        type="button"
        onClick={clearCanvas}
        style={{
          marginTop: "8px",
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "6px",
          color: "rgba(255, 255, 255, 0.7)",
          fontSize: "13px",
          cursor: "pointer"
        }}
      >
        Clear Signature
      </button>
    </div>
  );
}

// Typed Signature Component
function TypedSignature({ name, onNameChange, font }) {
  const fonts = [
    { id: "cursive", label: "Cursive", family: "'Dancing Script', cursive" },
    { id: "elegant", label: "Elegant", family: "'Great Vibes', cursive" },
    { id: "formal", label: "Formal", family: "'Allura', cursive" }
  ];

  const selectedFont = fonts.find(f => f.id === font) || fonts[0];

  return (
    <div style={{
      padding: "20px",
      background: "#ffffff",
      borderRadius: "8px",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      minHeight: "150px"
    }}>
      <div style={{
        fontSize: "36px",
        fontFamily: selectedFont.family,
        color: "#000000",
        textAlign: "center",
        padding: "20px 0",
        borderBottom: "1px solid #ccc",
        marginBottom: "10px"
      }}>
        {name || "Your Name"}
      </div>
      <p style={{ fontSize: "12px", color: "#666", textAlign: "center" }}>
        Sign above
      </p>
    </div>
  );
}

export default function SignEstimatePage() {
  const params = useParams();
  const router = useRouter();
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [declined, setDeclined] = useState(false);

  // Signature state
  const [signatureMode, setSignatureMode] = useState("draw"); // "draw" or "type"
  const [signatureData, setSignatureData] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [typedFont, setTypedFont] = useState("cursive");
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  useEffect(() => {
    loadEstimate();
  }, [params.estimateId]);

  async function loadEstimate() {
    try {
      const res = await fetch(`/api/view-estimate/${params.estimateId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Estimate not found or has been deleted");
        } else {
          throw new Error("Failed to load estimate");
        }
        return;
      }

      const data = await res.json();
      setEstimate(data);

      // Pre-fill signer info from customer
      if (data.customer) {
        setSignerName(`${data.customer.firstName} ${data.customer.lastName}`);
        setSignerEmail(data.customer.email || "");
      }
    } catch (e) {
      console.error("Error loading estimate:", e);
      setError("Unable to load estimate");
    } finally {
      setLoading(false);
    }
  }

  async function handleSign() {
    if (!signerName.trim()) {
      alert("Please enter your name");
      return;
    }

    if (signatureMode === "draw" && !signatureData) {
      alert("Please draw your signature");
      return;
    }

    setSubmitting(true);

    try {
      // For typed signature, generate canvas image
      let finalSignatureData = signatureData;
      if (signatureMode === "type") {
        finalSignatureData = generateTypedSignatureImage(signerName, typedFont);
      }

      const res = await fetch("/api/signatures/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateId: params.estimateId,
          signerName: signerName.trim(),
          signerTitle: signerTitle.trim() || null,
          signerEmail: signerEmail.trim() || null,
          signatureData: finalSignatureData,
          signatureType: signatureMode === "draw" ? "DRAW" : "TYPE",
          typedSignature: signatureMode === "type" ? signerName : null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit signature");
      }

      setSuccess(true);
    } catch (e) {
      console.error("Error signing:", e);
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    setSubmitting(true);

    try {
      const res = await fetch("/api/signatures/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateId: params.estimateId,
          declineReason: declineReason.trim() || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to decline");
      }

      setDeclined(true);
      setShowDeclineModal(false);
    } catch (e) {
      console.error("Error declining:", e);
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Generate typed signature as image
  function generateTypedSignatureImage(name, fontId) {
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    const fonts = {
      cursive: "'Dancing Script', cursive",
      elegant: "'Great Vibes', cursive",
      formal: "'Allura', cursive"
    };

    ctx.fillStyle = "#000000";
    ctx.font = `48px ${fonts[fontId] || fonts.cursive}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    // Draw signature line
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 120);
    ctx.lineTo(450, 120);
    ctx.stroke();

    return canvas.toDataURL("image/png");
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  };

  const containerStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
    padding: "40px 20px"
  };

  const cardStyle = {
    maxWidth: "700px",
    margin: "0 auto",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    padding: "32px"
  };

  // Load Google Fonts for typed signature
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Allura&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Loading...</div>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>Retrieving estimate details</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>404</div>
          <h2 style={{ color: "#ef4444", marginBottom: "8px" }}>{error}</h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            This estimate may have been deleted or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>✓</div>
          <h2 style={{ color: "#22c55e", marginBottom: "16px", fontSize: "28px" }}>
            Estimate Signed!
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "24px" }}>
            Thank you for signing estimate {estimate.estimateNumber}.
            We'll be in touch shortly to proceed with your order.
          </p>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            A copy of the signed estimate will be emailed to you.
          </p>
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>✓</div>
          <h2 style={{ color: "#f59e0b", marginBottom: "16px", fontSize: "28px" }}>
            Estimate Declined
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "24px" }}>
            Thank you for letting us know. If you have any questions or would like to
            discuss alternative options, please don't hesitate to contact us.
          </p>
        </div>
      </div>
    );
  }

  if (estimate.isSigned) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>✓</div>
          <h2 style={{ color: "#22c55e", marginBottom: "16px", fontSize: "28px" }}>
            Already Signed
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>
            This estimate ({estimate.estimateNumber}) has already been signed.
          </p>
        </div>
      </div>
    );
  }

  if (estimate.status === "DECLINED") {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>✗</div>
          <h2 style={{ color: "#6b7280", marginBottom: "16px", fontSize: "28px" }}>
            Estimate Declined
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>
            This estimate has been declined.
          </p>
        </div>
      </div>
    );
  }

  if (estimate.status === "EXPIRED" || (estimate.expiryDate && new Date(estimate.expiryDate) < new Date())) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>⏰</div>
          <h2 style={{ color: "#f59e0b", marginBottom: "16px", fontSize: "28px" }}>
            Estimate Expired
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>
            This estimate expired on {formatDate(estimate.expiryDate)}.
            Please contact us for an updated quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          {estimate.company?.companyName && (
            <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#dc2626", marginBottom: "8px" }}>
              {estimate.company.companyName}
            </h1>
          )}
          <h2 style={{ fontSize: "18px", color: "rgba(255,255,255,0.9)", marginBottom: "4px" }}>
            Estimate {estimate.estimateNumber}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            Valid until: {formatDate(estimate.expiryDate)}
          </p>
        </div>

        {/* Estimate Summary */}
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px"
        }}>
          <h3 style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: "16px", textTransform: "uppercase" }}>
            Estimate Summary
          </h3>

          {/* Items */}
          <div style={{ marginBottom: "16px" }}>
            {estimate.items?.map((item, idx) => (
              <div key={idx} style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: idx < estimate.items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none"
              }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.9)" }}>{item.name}</div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                    Qty: {item.quantity} × {formatCurrency(item.unitPrice)}
                  </div>
                </div>
                <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
                  {formatCurrency(item.amount)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>Subtotal</span>
              <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(estimate.subtotal)}</span>
            </div>
            {estimate.discountAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Discount</span>
                <span style={{ color: "#22c55e" }}>-{formatCurrency(estimate.discountAmount)}</span>
              </div>
            )}
            {estimate.taxAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Tax ({estimate.taxRate}%)</span>
                <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(estimate.taxAmount)}</span>
              </div>
            )}
            {estimate.shippingAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Shipping</span>
                <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(estimate.shippingAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600", fontSize: "18px" }}>Total</span>
              <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "24px" }}>{formatCurrency(estimate.total)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {estimate.termsConditions && (
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "24px"
          }}>
            <h3 style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: "12px", textTransform: "uppercase" }}>
              Terms & Conditions
            </h3>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", whiteSpace: "pre-wrap" }}>
              {estimate.termsConditions}
            </div>
          </div>
        )}

        {/* Signature Section */}
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <h3 style={{ fontSize: "16px", color: "rgba(255,255,255,0.9)", marginBottom: "20px" }}>
            Sign to Accept
          </h3>

          {/* Signer Info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                Full Name *
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Your full name"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: "14px"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                Title (optional)
              </label>
              <input
                type="text"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="e.g., Owner, Manager"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: "14px"
                }}
              />
            </div>
          </div>

          {/* Signature Mode Toggle */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <button
              onClick={() => setSignatureMode("draw")}
              style={{
                flex: 1,
                padding: "10px",
                background: signatureMode === "draw" ? "rgba(220, 38, 38, 0.1)" : "rgba(255, 255, 255, 0.03)",
                border: signatureMode === "draw" ? "1px solid rgba(220, 38, 38, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                cursor: "pointer"
              }}
            >
              Draw Signature
            </button>
            <button
              onClick={() => setSignatureMode("type")}
              style={{
                flex: 1,
                padding: "10px",
                background: signatureMode === "type" ? "rgba(220, 38, 38, 0.1)" : "rgba(255, 255, 255, 0.03)",
                border: signatureMode === "type" ? "1px solid rgba(220, 38, 38, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                cursor: "pointer"
              }}
            >
              Type Signature
            </button>
          </div>

          {/* Signature Input */}
          {signatureMode === "draw" ? (
            <SignatureCanvas
              onSave={setSignatureData}
              onClear={() => setSignatureData(null)}
            />
          ) : (
            <div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                {["cursive", "elegant", "formal"].map(font => (
                  <button
                    key={font}
                    onClick={() => setTypedFont(font)}
                    style={{
                      padding: "6px 12px",
                      background: typedFont === font ? "rgba(220, 38, 38, 0.1)" : "transparent",
                      border: typedFont === font ? "1px solid rgba(220, 38, 38, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "6px",
                      color: "rgba(255, 255, 255, 0.9)",
                      fontSize: "12px",
                      cursor: "pointer",
                      textTransform: "capitalize"
                    }}
                  >
                    {font}
                  </button>
                ))}
              </div>
              <TypedSignature name={signerName} onNameChange={setSignerName} font={typedFont} />
            </div>
          )}

          {/* Legal Notice */}
          <p style={{ marginTop: "16px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
            By signing above, you agree to the terms and conditions of this estimate.
            Your signature, IP address, and timestamp will be recorded for verification.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => setShowDeclineModal(true)}
            disabled={submitting}
            style={{
              flex: 1,
              padding: "14px 24px",
              background: "transparent",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "8px",
              color: "#ef4444",
              fontSize: "16px",
              fontWeight: "500",
              cursor: submitting ? "not-allowed" : "pointer"
            }}
          >
            Decline
          </button>
          <button
            onClick={handleSign}
            disabled={submitting || !signerName.trim() || (signatureMode === "draw" && !signatureData)}
            style={{
              flex: 2,
              padding: "14px 24px",
              background: submitting ? "rgba(156, 163, 175, 0.5)" : "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontSize: "16px",
              fontWeight: "600",
              cursor: submitting ? "not-allowed" : "pointer"
            }}
          >
            {submitting ? "Submitting..." : "Accept & Sign"}
          </button>
        </div>
      </div>

      {/* Decline Modal */}
      {showDeclineModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          zIndex: 1000
        }}>
          <div style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "16px",
            padding: "32px",
            maxWidth: "400px",
            width: "100%"
          }}>
            <h3 style={{ fontSize: "20px", color: "rgba(255,255,255,0.9)", marginBottom: "16px" }}>
              Decline Estimate?
            </h3>
            <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: "20px" }}>
              Please let us know why you're declining so we can better serve you in the future.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Reason for declining (optional)"
              rows={3}
              style={{
                width: "100%",
                padding: "12px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px",
                marginBottom: "20px",
                resize: "vertical"
              }}
            />
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowDeclineModal(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  color: "rgba(255, 255, 255, 0.9)",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                  borderRadius: "8px",
                  color: "#ef4444",
                  cursor: submitting ? "not-allowed" : "pointer"
                }}
              >
                {submitting ? "..." : "Decline Estimate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
