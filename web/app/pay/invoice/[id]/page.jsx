"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from "@stripe/react-stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Payment Form Component
function PaymentForm({ clientSecret, amount, invoiceNumber, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/pay/success`
      },
      redirect: "if_required"
    });

    if (submitError) {
      setError(submitError.message);
      setProcessing(false);
      onError?.(submitError.message);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onSuccess?.();
    } else if (paymentIntent && paymentIntent.status === "processing") {
      // ACH payments may take time to process
      onSuccess?.("Payment is being processed. You'll receive confirmation once complete.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          layout: "tabs"
        }}
      />

      {error && (
        <div style={{
          marginTop: "16px",
          padding: "12px 16px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "8px",
          color: "#ef4444",
          fontSize: "14px"
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        style={{
          marginTop: "24px",
          width: "100%",
          padding: "14px 24px",
          background: processing
            ? "rgba(156, 163, 175, 0.5)"
            : "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
          border: "none",
          borderRadius: "8px",
          color: "white",
          fontSize: "16px",
          fontWeight: "600",
          cursor: processing ? "not-allowed" : "pointer"
        }}
      >
        {processing ? "Processing..." : `Pay $${amount.toFixed(2)}`}
      </button>
    </form>
  );
}

export default function PublicPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(null);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("card"); // card or ach

  useEffect(() => {
    loadInvoice();
  }, [params.id]);

  async function loadInvoice() {
    try {
      const res = await fetch(`/api/view-invoice/${params.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Invoice not found");
        } else {
          throw new Error("Failed to load invoice");
        }
        return;
      }

      const data = await res.json();
      setInvoice(data);

      // Default to full balance
      if (data.balanceDue > 0) {
        setPaymentAmount(data.balanceDue);
      }
    } catch (e) {
      console.error("Error loading invoice:", e);
      setError("Unable to load invoice");
    } finally {
      setLoading(false);
    }
  }

  async function createPaymentIntent() {
    if (!paymentAmount || paymentAmount <= 0) {
      return;
    }

    setCreatingIntent(true);
    setError(null);

    try {
      const endpoint = paymentMethod === "ach"
        ? `/api/public/pay/invoice/${params.id}/create-ach`
        : `/api/public/pay/invoice/${params.id}/create-intent`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paymentAmount,
          scheduleItemId: selectedScheduleItem
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create payment");
      }

      const data = await res.json();
      setClientSecret(data.clientSecret);
    } catch (e) {
      console.error("Error creating payment intent:", e);
      setError(e.message);
    } finally {
      setCreatingIntent(false);
    }
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

  const handleScheduleSelect = (item) => {
    if (item.status === "PAID") return;
    setSelectedScheduleItem(item.id);
    setPaymentAmount(item.amount);
    setClientSecret(null); // Reset payment form
  };

  const handlePayFullBalance = () => {
    setSelectedScheduleItem(null);
    setPaymentAmount(invoice.balanceDue);
    setClientSecret(null); // Reset payment form
  };

  const containerStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
    padding: "40px 20px"
  };

  const cardStyle = {
    maxWidth: "600px",
    margin: "0 auto",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    padding: "32px"
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Loading...</div>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>Retrieving invoice details</p>
        </div>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>404</div>
          <h2 style={{ color: "#ef4444", marginBottom: "8px" }}>{error}</h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            This invoice may have been deleted or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>
            {paymentMethod === "ach" ? "🏦" : "✓"}
          </div>
          <h2 style={{ color: "#22c55e", marginBottom: "16px", fontSize: "28px" }}>
            {paymentMethod === "ach" ? "Payment Processing" : "Payment Successful!"}
          </h2>
          {paymentMessage ? (
            <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "24px" }}>
              {paymentMessage}
            </p>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "24px" }}>
              Thank you for your payment of {formatCurrency(paymentAmount)} for invoice {invoice.invoiceNumber}.
            </p>
          )}
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            A receipt will be emailed to you shortly.
          </p>
        </div>
      </div>
    );
  }

  if (invoice.status === "PAID") {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>✓</div>
          <h2 style={{ color: "#22c55e", marginBottom: "16px", fontSize: "28px" }}>
            Invoice Paid
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "24px" }}>
            This invoice ({invoice.invoiceNumber}) has already been paid in full.
          </p>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            Total paid: {formatCurrency(invoice.amountPaid)}
          </p>
        </div>
      </div>
    );
  }

  if (invoice.status === "VOID") {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>⊘</div>
          <h2 style={{ color: "#6b7280", marginBottom: "16px", fontSize: "28px" }}>
            Invoice Voided
          </h2>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>
            This invoice has been voided and is no longer payable.
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
          {invoice.company?.companyName && (
            <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#dc2626", marginBottom: "8px" }}>
              {invoice.company.companyName}
            </h1>
          )}
          <h2 style={{ fontSize: "18px", color: "rgba(255,255,255,0.9)", marginBottom: "4px" }}>
            Invoice {invoice.invoiceNumber}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            Due: {formatDate(invoice.dueDate)}
          </p>
        </div>

        {/* Invoice Summary */}
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Invoice Total</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
              {formatCurrency(invoice.total)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Amount Paid</span>
            <span style={{ color: "#22c55e", fontWeight: "500" }}>
              {formatCurrency(invoice.amountPaid)}
            </span>
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "12px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)"
          }}>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600" }}>Balance Due</span>
            <span style={{ color: "#f59e0b", fontWeight: "700", fontSize: "18px" }}>
              {formatCurrency(invoice.balanceDue)}
            </span>
          </div>
        </div>

        {/* Payment Schedule */}
        {invoice.paymentSchedule && invoice.paymentSchedule.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: "12px", textTransform: "uppercase" }}>
              Payment Schedule
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {invoice.paymentSchedule.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleScheduleSelect(item)}
                  disabled={item.status === "PAID"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: selectedScheduleItem === item.id
                      ? "rgba(220, 38, 38, 0.1)"
                      : "rgba(255, 255, 255, 0.03)",
                    border: selectedScheduleItem === item.id
                      ? "1px solid rgba(220, 38, 38, 0.5)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    cursor: item.status === "PAID" ? "default" : "pointer",
                    opacity: item.status === "PAID" ? 0.5 : 1,
                    textAlign: "left"
                  }}
                >
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
                      {item.description}
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                      Due: {formatDate(item.dueDate)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: item.status === "PAID" ? "#22c55e" : "rgba(255,255,255,0.9)", fontWeight: "600" }}>
                      {formatCurrency(item.amount)}
                    </div>
                    {item.status === "PAID" && (
                      <div style={{ fontSize: "12px", color: "#22c55e" }}>PAID</div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Pay Full Balance Option */}
            <button
              onClick={handlePayFullBalance}
              style={{
                marginTop: "12px",
                width: "100%",
                padding: "12px 16px",
                background: !selectedScheduleItem
                  ? "rgba(220, 38, 38, 0.1)"
                  : "rgba(255, 255, 255, 0.03)",
                border: !selectedScheduleItem
                  ? "1px solid rgba(220, 38, 38, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                color: "rgba(255,255,255,0.9)",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                textAlign: "center"
              }}
            >
              Pay Full Balance ({formatCurrency(invoice.balanceDue)})
            </button>
          </div>
        )}

        {/* Payment Amount Display */}
        <div style={{
          padding: "16px",
          background: "rgba(34, 197, 94, 0.1)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          borderRadius: "8px",
          marginBottom: "24px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", marginBottom: "4px" }}>
            Payment Amount
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#22c55e" }}>
            {formatCurrency(paymentAmount)}
          </div>
        </div>

        {/* Payment Method Selection */}
        {!clientSecret && (
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: "12px", textTransform: "uppercase" }}>
              Payment Method
            </h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setPaymentMethod("card")}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: paymentMethod === "card"
                    ? "rgba(220, 38, 38, 0.1)"
                    : "rgba(255, 255, 255, 0.03)",
                  border: paymentMethod === "card"
                    ? "1px solid rgba(220, 38, 38, 0.5)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  color: "rgba(255,255,255,0.9)",
                  cursor: "pointer"
                }}
              >
                Credit Card
              </button>
              <button
                onClick={() => setPaymentMethod("ach")}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: paymentMethod === "ach"
                    ? "rgba(220, 38, 38, 0.1)"
                    : "rgba(255, 255, 255, 0.03)",
                  border: paymentMethod === "ach"
                    ? "1px solid rgba(220, 38, 38, 0.5)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  color: "rgba(255,255,255,0.9)",
                  cursor: "pointer"
                }}
              >
                Bank Account (ACH)
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{
            marginBottom: "16px",
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "14px"
          }}>
            {error}
          </div>
        )}

        {/* Payment Form or Continue Button */}
        {clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: "#dc2626",
                  colorBackground: "#1a1a1a",
                  colorText: "#ffffff",
                  colorTextSecondary: "#a1a1aa",
                  borderRadius: "8px"
                }
              }
            }}
          >
            <PaymentForm
              clientSecret={clientSecret}
              amount={paymentAmount}
              invoiceNumber={invoice.invoiceNumber}
              onSuccess={(message) => {
                setPaymentSuccess(true);
                if (message) setPaymentMessage(message);
              }}
              onError={(err) => setError(err)}
            />
          </Elements>
        ) : (
          <button
            onClick={createPaymentIntent}
            disabled={!paymentAmount || paymentAmount <= 0 || creatingIntent}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: creatingIntent
                ? "rgba(156, 163, 175, 0.5)"
                : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontSize: "16px",
              fontWeight: "600",
              cursor: creatingIntent ? "not-allowed" : "pointer"
            }}
          >
            {creatingIntent ? "Preparing Payment..." : "Continue to Payment"}
          </button>
        )}

        {/* Security Note */}
        <div style={{
          marginTop: "24px",
          paddingTop: "16px",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          textAlign: "center"
        }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
            Secure payment powered by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
