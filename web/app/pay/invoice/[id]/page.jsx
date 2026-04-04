"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

// NexNP Tokenizer configuration from environment
const NEXTNP_BASE_URL   = process.env.NEXT_PUBLIC_NEXTNP_BASE_URL   || 'https://sandbox.nextnpgateway.com';
const NEXTNP_PUBLIC_KEY = process.env.NEXT_PUBLIC_NEXTNP_PUBLIC_KEY;
const TOKENIZER_SCRIPT  = `${NEXTNP_BASE_URL}/tokenizer/tokenizer.js`;

export default function PublicPaymentPage() {
  const params = useParams();
  const [invoice,             setInvoice]             = useState(null);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState(null);
  const [paymentAmount,       setPaymentAmount]       = useState('');
  const [selectedScheduleItem,setSelectedScheduleItem]= useState(null);
  const [processing,          setProcessing]          = useState(false);
  const [success,             setSuccess]             = useState(false);
  const [successData,         setSuccessData]         = useState(null);
  const [tokenizerReady,      setTokenizerReady]      = useState(false);
  const [scriptLoaded,        setScriptLoaded]        = useState(false);

  const tokenizerRef = useRef(null);

  // Load invoice data
  useEffect(() => { loadInvoice(); }, [params.id]);

  // Load Tokenizer script once invoice is loaded and we know we can pay
  useEffect(() => {
    if (!invoice || invoice.balanceDue <= 0 || ['PAID','VOID'].includes(invoice.status)) return;
    if (scriptLoaded) return;

    const script = document.createElement('script');
    script.src = TOKENIZER_SCRIPT;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setError('Failed to load payment form. Please refresh and try again.');
    document.head.appendChild(script);

    return () => {
      // Don't remove on unmount — let it persist for page lifetime
    };
  }, [invoice]);

  // Initialise the Tokenizer once the script is loaded and the DOM container exists
  useEffect(() => {
    if (!scriptLoaded || !window.Tokenizer || !NEXTNP_PUBLIC_KEY) return;

    // Small delay to ensure the container div is rendered
    const timer = setTimeout(() => {
      try {
        tokenizerRef.current = new window.Tokenizer({
          url:      NEXTNP_BASE_URL,
          apikey:   NEXTNP_PUBLIC_KEY,
          container: '#nextnp-payment-form',
          settings: {
            payment: {
              types: ['card', 'ach'],
              card: {
                requireCVV: true,
                mask_number: true,
              },
              ach: {
                sec_code:             'web',
                verifyAccountRouting: true,
                showSecCode:          false,
              },
            },
            styles: {
              body: {
                'color':            'rgba(255,255,255,0.9)',
                'background-color': 'transparent',
                'font-family':      'system-ui, -apple-system, sans-serif',
              },
              input: {
                'background-color': 'rgba(255,255,255,0.06)',
                'border':           '1px solid rgba(255,255,255,0.15)',
                'border-radius':    '8px',
                'color':            'rgba(255,255,255,0.9)',
                'padding':          '10px 14px',
                'font-size':        '14px',
              },
              'input:focus': {
                'border-color': 'rgba(220,38,38,0.6)',
                'outline':      'none',
              },
              label: {
                'color':       'rgba(255,255,255,0.5)',
                'font-size':   '12px',
                'font-weight': '500',
              },
              select: {
                'background-color': 'rgba(255,255,255,0.06)',
                'border':           '1px solid rgba(255,255,255,0.15)',
                'border-radius':    '8px',
                'color':            'rgba(255,255,255,0.9)',
                'padding':          '10px 14px',
              },
            },
          },
          onLoad: () => setTokenizerReady(true),
          submission: (resp) => {
            setProcessing(false);
            if (resp.status === 'success') {
              handleToken(resp.token);
            } else if (resp.status === 'validation') {
              setError('Please check your payment details and try again.');
            } else {
              setError(resp.msg || 'Payment form error. Please try again.');
            }
          },
        });
      } catch (e) {
        setError('Failed to initialise payment form: ' + e.message);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [scriptLoaded]);

  async function loadInvoice() {
    try {
      const res = await fetch(`/api/view-invoice/${params.id}`);
      if (!res.ok) {
        setError(res.status === 404 ? 'Invoice not found' : 'Unable to load invoice');
        return;
      }
      const data = await res.json();
      setInvoice(data);
      if (data.balanceDue > 0) setPaymentAmount(data.balanceDue.toString());
    } catch {
      setError('Unable to load invoice');
    } finally {
      setLoading(false);
    }
  }

  function selectScheduleItem(item) {
    if (item.status === 'PAID') return;
    setSelectedScheduleItem(item.id);
    setPaymentAmount(item.amount.toString());
  }

  function selectFullBalance() {
    setSelectedScheduleItem(null);
    setPaymentAmount(invoice.balanceDue.toString());
  }

  function handlePay() {
    if (!tokenizerRef.current || !tokenizerReady) {
      setError('Payment form is not ready. Please wait a moment and try again.');
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { setError('Please enter a valid amount.'); return; }
    if (amount > invoice.balanceDue + 0.01) { setError(`Amount cannot exceed balance due of ${fmt(invoice.balanceDue)}.`); return; }
    setError(null);
    setProcessing(true);
    tokenizerRef.current.submit();
  }

  async function handleToken(token) {
    setProcessing(true);
    setError(null);
    try {
      // Generate idempotency key client-side to prevent double charges on retry
      const idempotencyKey = crypto.randomUUID();

      const res = await fetch(`/api/public/pay/invoice/${params.id}/nextnp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          amount:         parseFloat(paymentAmount),
          scheduleItemId: selectedScheduleItem || null,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      setSuccessData(data);
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const fmt  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014';

  // ── Styles ──────────────────────────────────────────────────────────────────
  const container  = { minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f0f,#1a1a1a)', padding: '40px 20px', fontFamily: 'system-ui,sans-serif' };
  const card       = { maxWidth: 560, margin: '0 auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32 };
  const sectionBox = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 20 };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Loading invoice\u2026</p>
      </div>
    </div>
  );

  if (error && !invoice) return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>\u26a0\ufe0f</div>
        <h2 style={{ color: '#ef4444', marginBottom: 8 }}>{error}</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Please contact us if you need assistance.</p>
      </div>
    </div>
  );

  if (invoice?.status === 'PAID' && !success) return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>\u2713</div>
        <h2 style={{ color: '#22c55e', fontSize: 28, marginBottom: 12 }}>Invoice Paid</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)' }}>Invoice {invoice.invoiceNumber} has been paid in full.</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 8 }}>Total paid: {fmt(invoice.amountPaid)}</p>
      </div>
    </div>
  );

  if (invoice?.status === 'VOID') return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>\u2298</div>
        <h2 style={{ color: '#6b7280', fontSize: 28, marginBottom: 12 }}>Invoice Voided</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)' }}>This invoice is no longer payable.</p>
      </div>
    </div>
  );

  if (success) return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>
          {successData?.isACH ? '\ud83c\udfe6' : '\u2713'}
        </div>
        <h2 style={{ color: '#22c55e', fontSize: 28, marginBottom: 12 }}>
          {successData?.isACH ? 'ACH Payment Submitted' : 'Payment Successful!'}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
          {successData?.message || `Your payment of ${fmt(parseFloat(paymentAmount))} has been processed.`}
        </p>
        {successData?.isACH && (
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 }}>
            ACH payments typically settle within 1\u20133 business days.
            Your invoice will be marked paid upon confirmation.
          </p>
        )}
        {successData?.transactionId && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 16, fontFamily: 'monospace' }}>
            Transaction ID: {successData.transactionId}
          </p>
        )}
        {successData?.newBalanceDue > 0 && (
          <p style={{ color: '#f59e0b', fontSize: 14, marginTop: 12 }}>
            Remaining balance: {fmt(successData.newBalanceDue)}
          </p>
        )}
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 20 }}>
          A receipt has been sent to your email address.
        </p>
      </div>
    </div>
  );

  return (
    <div style={container}>
      <div style={card}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {invoice.company?.companyName && (
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
              {invoice.company.companyName}
            </h1>
          )}
          <h2 style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
            Invoice {invoice.invoiceNumber}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Due: {fmtD(invoice.dueDate)}</p>
        </div>

        {/* Summary */}
        <div style={sectionBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>Invoice Total</span>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>{fmt(invoice.total)}</span>
          </div>
          {invoice.amountPaid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Amount Paid</span>
              <span style={{ color: '#22c55e', fontWeight: 500 }}>{fmt(invoice.amountPaid)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>Balance Due</span>
            <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 20 }}>{fmt(invoice.balanceDue)}</span>
          </div>
        </div>

        {/* Payment Schedule */}
        {invoice.paymentSchedule && invoice.paymentSchedule.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Payment Schedule
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invoice.paymentSchedule.map(item => (
                <button
                  key={item.id}
                  onClick={() => selectScheduleItem(item)}
                  disabled={item.status === 'PAID' || processing}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px',
                    background: selectedScheduleItem === item.id ? 'rgba(220,38,38,0.1)' : 'rgba(255,255,255,0.03)',
                    border: selectedScheduleItem === item.id ? '1px solid rgba(220,38,38,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, cursor: item.status === 'PAID' ? 'default' : 'pointer',
                    opacity: item.status === 'PAID' ? 0.5 : 1, textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500, fontSize: 14 }}>{item.description}</div>
                    {item.dueDate && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Due: {fmtD(item.dueDate)}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: item.status === 'PAID' ? '#22c55e' : 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{fmt(item.amount)}</div>
                    {item.status === 'PAID' && <div style={{ fontSize: 11, color: '#22c55e' }}>PAID</div>}
                  </div>
                </button>
              ))}
              <button
                onClick={selectFullBalance}
                disabled={processing}
                style={{
                  padding: '12px 16px',
                  background: !selectedScheduleItem ? 'rgba(220,38,38,0.1)' : 'rgba(255,255,255,0.03)',
                  border: !selectedScheduleItem ? '1px solid rgba(220,38,38,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                Pay Full Balance ({fmt(invoice.balanceDue)})
              </button>
            </div>
          </div>
        )}

        {/* Payment amount display */}
        <div style={{ padding: '14px 20px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Payment Amount</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{fmt(parseFloat(paymentAmount) || 0)}</div>
        </div>

        {/* NexNP Tokenizer iframe — card data never touches our server */}
        <div style={{ marginBottom: 20 }}>
          <div
            id="nextnp-payment-form"
            style={{
              minHeight: 200,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              overflow: 'hidden',
              transition: 'opacity 0.2s',
              opacity: tokenizerReady ? 1 : 0.4,
            }}
          />
          {!tokenizerReady && !error && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8 }}>
              Loading secure payment form\u2026
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handlePay}
          disabled={processing || !tokenizerReady || !paymentAmount}
          style={{
            width: '100%', padding: '14px 24px',
            background: processing || !tokenizerReady
              ? 'rgba(156,163,175,0.3)'
              : 'linear-gradient(135deg,#dc2626,#b91c1c)',
            border: 'none', borderRadius: 8, color: 'white',
            fontSize: 16, fontWeight: 700,
            cursor: (processing || !tokenizerReady) ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {processing ? 'Processing\u2026' : `Pay ${fmt(parseFloat(paymentAmount) || 0)}`}
        </button>

        {/* Footer */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
            \ud83d\udd12 Payments are processed securely via NexNP Gateway.
            Your card details are encrypted end-to-end and never stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}
