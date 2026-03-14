'use client';

import { useState } from 'react';

const RED = '#dc2626';

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export default function AcceptButton({ estimateId, estimateNumber, total, initialStatus }) {
  const [status, setStatus]       = useState(initialStatus);
  const [showModal, setShowModal] = useState(false);
  const [name, setName]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const nonAcceptable = ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED', 'DRAFT'];
  if (nonAcceptable.includes(status)) {
    if (status === 'ACCEPTED') {
      return (
        <div style={{ margin: '24px 28px', padding: '16px 24px', background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>✓</span>
          <div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>Estimate Accepted</div>
            <div style={{ fontSize: 13, color: '#166534', marginTop: 2 }}>Thank you for accepting this estimate. We will be in touch shortly.</div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleAccept = async () => {
    if (!name.trim()) { setError('Please enter your name to confirm acceptance.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/accept-estimate/${estimateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to accept estimate.'); return; }
      setStatus('ACCEPTED');
      setShowModal(false);
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Accept CTA bar */}
      <div style={{ margin: '0 0 0 0', padding: '20px 28px', background: '#fff', borderTop: '2px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>Ready to proceed?</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Accept this estimate to move forward — {fmt(total)} total.</div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '12px 28px', background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ✓ Accept Estimate
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Accept Estimate</h2>
            <p style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.6 }}>
              You are accepting <strong>{estimateNumber}</strong> for <strong style={{ color: RED }}>{fmt(total)}</strong>.
              By clicking confirm, you agree to proceed with this estimate.
            </p>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
              Your full name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(null); }}
              placeholder="Enter your full name"
              style={{ width: '100%', padding: '10px 14px', border: `1px solid ${error ? RED : '#ddd'}`, borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
              onKeyDown={e => e.key === 'Enter' && handleAccept()}
              autoFocus
            />
            {error && <p style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={handleAccept}
                disabled={loading}
                style={{ flex: 1, padding: '12px', background: loading ? '#86efac' : '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}
              >
                {loading ? 'Submitting...' : '✓ Confirm Acceptance'}
              </button>
              <button
                onClick={() => { setShowModal(false); setError(null); setName(''); }}
                disabled={loading}
                style={{ padding: '12px 20px', background: '#f3f4f6', border: 'none', borderRadius: 6, color: '#555', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
