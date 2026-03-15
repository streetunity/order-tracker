'use client';

import { useState } from 'react';

const RED = '#dc2626';

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export default function PayButton({ invoiceId, invoiceNumber, balanceDue, initialStatus, paymentSchedule }) {
  const [status,         setStatus]         = useState(initialStatus);
  const [showModal,      setShowModal]       = useState(false);
  const [payAmount,      setPayAmount]       = useState(String(balanceDue || ''));
  const [payMethod,      setPayMethod]       = useState('CHECK');
  const [reference,      setReference]      = useState('');
  const [notes,          setNotes]          = useState('');
  const [selectedSched,  setSelectedSched]  = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [success,        setSuccess]        = useState(false);

  // Don't show for paid / void invoices
  if (['PAID', 'VOID'].includes(status)) {
    if (status === 'PAID') {
      return (
        <div style={{ margin: 0, padding: '20px 28px', background: '#f0fdf4', borderTop: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>&#10003;</span>
          <div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>Invoice Paid in Full</div>
            <div style={{ fontSize: 13, color: '#166534', marginTop: 2 }}>Thank you for your payment. This invoice is fully paid.</div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (success) {
    return (
      <div style={{ margin: 0, padding: '20px 28px', background: '#f0fdf4', borderTop: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 24 }}>&#10003;</span>
        <div>
          <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>Payment Notification Sent</div>
          <div style={{ fontSize: 13, color: '#166534', marginTop: 2 }}>Your payment details have been submitted. Our team will confirm receipt shortly.</div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { setError('Please enter a valid payment amount.'); return; }
    if (amount > balanceDue + 0.01) { setError(`Amount cannot exceed the balance due of ${fmt(balanceDue)}.`); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/notify-payment/${invoiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethod: payMethod,
          referenceNumber: reference.trim() || null,
          notes: notes.trim() || null,
          scheduleItemId: selectedSched || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to submit payment notification.'); return; }
      setSuccess(true);
      setShowModal(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const unpaidScheduleItems = paymentSchedule.filter(s => s.status !== 'PAID');

  return (
    <>
      <div style={{ margin: 0, padding: '20px 28px', background: '#fff', borderTop: '2px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>Ready to pay?</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Balance due: <strong style={{ color: RED }}>{fmt(balanceDue)}</strong></div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '12px 28px', background: RED, border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Submit Payment
        </button>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Submit Payment</h2>
            <p style={{ fontSize: 14, color: '#555', marginBottom: 24, lineHeight: 1.6 }}>
              Invoice <strong>{invoiceNumber}</strong> &mdash; Balance due: <strong style={{ color: RED }}>{fmt(balanceDue)}</strong>
            </p>

            {/* Schedule item selector (if applicable) */}
            {unpaidScheduleItems.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>Paying for (optional)</label>
                <select
                  value={selectedSched || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedSched(val || null);
                    if (val) {
                      const item = paymentSchedule.find(s => s.id === val);
                      if (item) setPayAmount(String(item.amount));
                    }
                  }}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff', color: '#333' }}
                >
                  <option value="">Full balance or custom amount</option>
                  {unpaidScheduleItems.map(s => (
                    <option key={s.id} value={s.id}>{s.description} &mdash; {fmt(s.amount)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Amount */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>Payment Amount *</label>
              <input
                type="number"
                value={payAmount}
                onChange={e => { setPayAmount(e.target.value); setError(null); }}
                step="0.01"
                min="0.01"
                max={balanceDue}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px 14px', border: `1px solid ${error && !payAmount ? RED : '#ddd'}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Max: {fmt(balanceDue)}</div>
            </div>

            {/* Payment method */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>Payment Method *</label>
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff', color: '#333' }}
              >
                <option value="CHECK">Check</option>
                <option value="WIRE">Wire Transfer</option>
                <option value="ACH">ACH</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Reference */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                {payMethod === 'CHECK' ? 'Check Number' : payMethod === 'WIRE' ? 'Wire Reference' : 'Reference Number'} (optional)
              </label>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Optional"
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional information..."
                rows={3}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {error && <p style={{ color: RED, fontSize: 13, marginBottom: 16, padding: '8px 12px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 6 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{ flex: 1, padding: '12px', background: loading ? '#fca5a5' : RED, border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}
              >
                {loading ? 'Submitting...' : 'Submit Payment'}
              </button>
              <button
                onClick={() => { setShowModal(false); setError(null); }}
                disabled={loading}
                style={{ padding: '12px 20px', background: '#f3f4f6', border: 'none', borderRadius: 6, color: '#555', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#aaa', marginTop: 16, textAlign: 'center', lineHeight: 1.5 }}>
              Submitting this form notifies our team of your payment. We will confirm receipt and update your invoice.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
