"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function PublicPaymentPage() {
  const params = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [paymentAmount, setPaymentAmount]       = useState("");
  const [selectedScheduleItem, setSelectedScheduleItem] = useState(null);
  const [paymentType, setPaymentType]           = useState("card");
  const [processing, setProcessing]             = useState(false);
  const [success, setSuccess]                   = useState(false);
  const [successData, setSuccessData]           = useState(null);

  // Card fields
  const [cardNumber,  setCardNumber]  = useState("");
  const [cardExpiry,  setCardExpiry]  = useState("");
  const [cardCVC,     setCardCVC]     = useState("");
  const [cardZip,     setCardZip]     = useState("");
  // ACH fields
  const [achRouting,  setAchRouting]  = useState("");
  const [achAccount,  setAchAccount]  = useState("");
  const [achType,     setAchType]     = useState("checking");

  useEffect(() => { loadInvoice(); }, [params.id]);

  async function loadInvoice() {
    try {
      const res = await fetch(`/api/view-invoice/${params.id}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Invoice not found" : "Unable to load invoice");
        return;
      }
      const data = await res.json();
      setInvoice(data);
      setPaymentAmount(data.balanceDue > 0 ? data.balanceDue.toString() : "");
    } catch {
      setError("Unable to load invoice");
    } finally {
      setLoading(false);
    }
  }

  function formatCardNumber(val) {
    return val.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  function formatExpiry(val) {
    const d = val.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  }

  function selectScheduleItem(item) {
    if (item.status === "PAID") return;
    setSelectedScheduleItem(item.id);
    setPaymentAmount(item.amount.toString());
  }

  function selectFullBalance() {
    setSelectedScheduleItem(null);
    setPaymentAmount(invoice.balanceDue.toString());
  }

  async function handleSubmit() {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { setError("Enter a valid amount"); return; }

    if (paymentType === "card") {
      const raw = cardNumber.replace(/\s/g, "");
      if (raw.length < 15) { setError("Enter a valid card number"); return; }
      if (!cardExpiry.match(/^\d{2}\/\d{2}$/)) { setError("Enter expiry as MM/YY"); return; }
      if (cardCVC.length < 3) { setError("Enter a valid CVC"); return; }
    } else {
      if (!achRouting.match(/^\d{9}$/)) { setError("Enter a valid 9-digit routing number"); return; }
      if (!achAccount || achAccount.length < 4) { setError("Enter a valid account number"); return; }
    }

    setProcessing(true);
    setError(null);

    try {
      const body = {
        paymentType,
        amount,
        scheduleItemId: selectedScheduleItem || null,
        ...(paymentType === "card"
          ? { cardNumber: cardNumber.replace(/\s/g, ""), expirationDate: cardExpiry, cvc: cardCVC, billingZip: cardZip }
          : { routingNumber: achRouting, accountNumber: achAccount, accountType: achType }
        )
      };

      const res = await fetch(`/api/public/pay/invoice/${params.id}/nextnp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");

      setSuccessData(data);
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const fmt  = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

  const container = { minHeight: "100vh", background: "linear-gradient(135deg,#0f0f0f,#1a1a1a)", padding: "40px 20px", fontFamily: "system-ui,sans-serif" };
  const card = { maxWidth: 560, margin: "0 auto", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 32 };
  const inp  = { padding: "10px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(255,255,255,0.9)", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "monospace" };
  const lbl  = { display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 500 };
  const fld  = { marginBottom: 14 };

  if (loading) return (
    <div style={container}>
      <div style={{ ...card, textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>Loading invoice...</p>
      </div>
    </div>
  );

  if (error && !invoice) return (
    <div style={container}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
        <h2 style={{ color: "#ef4444", marginBottom: 8 }}>{error}</h2>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>This invoice may have been removed or the link is invalid.</p>
      </div>
    </div>
  );

  if (invoice?.status === "PAID" && !success) return (
    <div style={container}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
        <h2 style={{ color: "#22c55e", marginBottom: 16, fontSize: 28 }}>Invoice Paid</h2>
        <p style={{ color: "rgba(255,255,255,0.7)" }}>Invoice {invoice.invoiceNumber} has already been paid in full.</p>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 8 }}>Total paid: {fmt(invoice.amountPaid)}</p>
      </div>
    </div>
  );

  if (invoice?.status === "VOID") return (
    <div style={container}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>⊘</div>
        <h2 style={{ color: "#6b7280", marginBottom: 16, fontSize: 28 }}>Invoice Voided</h2>
        <p style={{ color: "rgba(255,255,255,0.7)" }}>This invoice has been voided and is no longer payable.</p>
      </div>
    </div>
  );

  if (success) return (
    <div style={container}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>{paymentType === "ach" ? "🏦" : "✓"}</div>
        <h2 style={{ color: "#22c55e", marginBottom: 16, fontSize: 28 }}>
          {paymentType === "ach" ? "Payment Submitted" : "Payment Successful!"}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
          Thank you! Your payment of <strong>{fmt(parseFloat(paymentAmount))}</strong> for invoice <strong>{invoice.invoiceNumber}</strong> has been {paymentType === "ach" ? "submitted" : "processed"}.
        </p>
        {successData?.transactionId && (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace", marginTop: 8 }}>
            Transaction ID: {successData.transactionId}
          </p>
        )}
        {successData?.newBalanceDue > 0 && (
          <p style={{ color: "#f59e0b", fontSize: 14, marginTop: 12 }}>
            Remaining balance: {fmt(successData.newBalanceDue)}
          </p>
        )}
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 16 }}>A receipt will be emailed to you.</p>
      </div>
    </div>
  );

  const canPay = invoice?.balanceDue > 0 && !['PAID','VOID'].includes(invoice?.status);

  return (
    <div style={container}>
      <div style={card}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {invoice.company?.companyName && (
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#dc2626", marginBottom: 6 }}>{invoice.company.companyName}</h1>
          )}
          <h2 style={{ fontSize: 17, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>Invoice {invoice.invoiceNumber}</h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Due: {fmtD(invoice.dueDate)}</p>
        </div>

        {/* Summary */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Invoice Total</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{fmt(invoice.total)}</span>
          </div>
          {invoice.amountPaid > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>Amount Paid</span>
              <span style={{ color: "#22c55e", fontWeight: 500 }}>{fmt(invoice.amountPaid)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>Balance Due</span>
            <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 18 }}>{fmt(invoice.balanceDue)}</span>
          </div>
        </div>

        {/* Payment Schedule */}
        {invoice.paymentSchedule && invoice.paymentSchedule.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Payment Schedule</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {invoice.paymentSchedule.map(item => (
                <button
                  key={item.id}
                  onClick={() => selectScheduleItem(item)}
                  disabled={item.status === "PAID"}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: selectedScheduleItem === item.id ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)", border: selectedScheduleItem === item.id ? "1px solid rgba(220,38,38,0.5)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: item.status === "PAID" ? "default" : "pointer", opacity: item.status === "PAID" ? 0.5 : 1, textAlign: "left" }}
                >
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 500, fontSize: 14 }}>{item.description}</div>
                    {item.dueDate && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Due: {fmtD(item.dueDate)}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: item.status === "PAID" ? "#22c55e" : "rgba(255,255,255,0.9)", fontWeight: 600 }}>{fmt(item.amount)}</div>
                    {item.status === "PAID" && <div style={{ fontSize: 11, color: "#22c55e" }}>PAID</div>}
                  </div>
                </button>
              ))}
              <button
                onClick={selectFullBalance}
                style={{ padding: "12px 16px", background: !selectedScheduleItem ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)", border: !selectedScheduleItem ? "1px solid rgba(220,38,38,0.5)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: 500, cursor: "pointer", textAlign: "center" }}
              >
                Pay Full Balance ({fmt(invoice.balanceDue)})
              </button>
            </div>
          </div>
        )}

        {canPay && (
          <>
            {/* Amount display */}
            <div style={{ padding: 16, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, marginBottom: 24, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Payment Amount</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#22c55e" }}>{fmt(parseFloat(paymentAmount) || 0)}</div>
            </div>

            {/* Tab switcher */}
            <div style={{ display: "flex", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
              {[["card","Credit Card"],["ach","ACH / Bank Transfer"]].map(([t,l]) => (
                <button key={t} onClick={() => { setPaymentType(t); setError(null); }} disabled={processing}
                  style={{ flex: 1, padding: "10px", border: "none", borderBottom: paymentType === t ? "2px solid #dc2626" : "2px solid transparent", background: paymentType === t ? "rgba(220,38,38,0.15)" : "transparent", color: paymentType === t ? "#fff" : "rgba(255,255,255,0.45)", fontWeight: paymentType === t ? 600 : 400, fontSize: 13, cursor: "pointer" }}
                >{l}</button>
              ))}
            </div>

            {/* Card form */}
            {paymentType === "card" && (
              <>
                <div style={fld}>
                  <label style={lbl}>Card Number *</label>
                  <input style={inp} type="text" inputMode="numeric" value={cardNumber} onChange={e => setCardNumber(formatCardNumber(e.target.value))} placeholder="1234 5678 9012 3456" maxLength={19} disabled={processing} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Expiry *</label>
                    <input style={inp} type="text" inputMode="numeric" value={cardExpiry} onChange={e => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" maxLength={5} disabled={processing} />
                  </div>
                  <div>
                    <label style={lbl}>CVC *</label>
                    <input style={inp} type="text" inputMode="numeric" value={cardCVC} onChange={e => setCardCVC(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="123" maxLength={4} disabled={processing} />
                  </div>
                  <div>
                    <label style={lbl}>ZIP</label>
                    <input style={inp} type="text" inputMode="numeric" value={cardZip} onChange={e => setCardZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="60601" maxLength={5} disabled={processing} />
                  </div>
                </div>
              </>
            )}

            {/* ACH form */}
            {paymentType === "ach" && (
              <>
                <div style={fld}>
                  <label style={lbl}>Routing Number *</label>
                  <input style={inp} type="text" inputMode="numeric" value={achRouting} onChange={e => setAchRouting(e.target.value.replace(/\D/g,"").slice(0,9))} placeholder="9-digit routing number" maxLength={9} disabled={processing} />
                </div>
                <div style={fld}>
                  <label style={lbl}>Account Number *</label>
                  <input style={inp} type="text" inputMode="numeric" value={achAccount} onChange={e => setAchAccount(e.target.value.replace(/\D/g,"").slice(0,17))} placeholder="Account number" disabled={processing} />
                </div>
                <div style={fld}>
                  <label style={lbl}>Account Type *</label>
                  <select style={{ ...inp, cursor: "pointer", fontFamily: "system-ui" }} value={achType} onChange={e => setAchType(e.target.value)} disabled={processing}>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
                <div style={{ padding: "10px 14px", marginBottom: 14, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  ACH payments typically settle within 1–3 business days.
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: "10px 14px", marginBottom: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={processing || !paymentAmount}
              style={{ width: "100%", padding: "14px 24px", background: processing ? "rgba(156,163,175,0.4)" : "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "white", fontSize: 16, fontWeight: 700, cursor: processing ? "not-allowed" : "pointer" }}
            >
              {processing ? "Processing..." : `Pay ${fmt(parseFloat(paymentAmount) || 0)}`}
            </button>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Secure payment • Powered by NexNP Gateway</p>
        </div>
      </div>
    </div>
  );
}
