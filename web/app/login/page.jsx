"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.role === 'BROKER') router.push('/broker/dashboard');
      else router.push('/admin/board');
    }
  }, [user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        const userData = JSON.parse(localStorage.getItem('user'));
        if (userData?.role === 'BROKER') router.push('/broker/dashboard');
        else router.push('/admin/board');
      } else {
        setError(result.error || 'Invalid email or password');
        setLoading(false);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0f0f0f' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-card { animation: fadeUp 0.4s ease both; }
        .login-input {
          width: 100%;
          padding: 11px 14px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .login-input:focus { border-color: rgba(220,38,38,0.6); background: rgba(255,255,255,0.07); }
        .login-input::placeholder { color: rgba(255,255,255,0.25); }
        .login-btn {
          width: 100%;
          padding: 12px;
          background: #dc2626;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.2px;
        }
        .login-btn:hover:not(:disabled) { background: #b91c1c; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(220,38,38,0.35); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .show-pw-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: rgba(255,255,255,0.35); cursor: pointer;
          padding: 4px; display: flex; align-items: center;
          transition: color 0.15s;
        }
        .show-pw-btn:hover { color: rgba(255,255,255,0.7); }
      `}</style>

      {/* ── Left branding panel ── */}
      <div style={{
        width: '45%',
        flexShrink: 0,
        background: 'linear-gradient(160deg, #1a0505 0%, #0f0f0f 50%, #0a0a0a 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 52px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle background glow */}
        <div style={{
          position: 'absolute', top: -120, left: -120,
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, right: -80,
          width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, zIndex: 1 }}>
          <img src="/smt-logo.png" alt="SMT Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>Stealth Machine Tools</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Order Management Platform</div>
          </div>
        </div>

        {/* Centre copy */}
        <div style={{ zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 16 }}>Welcome back</div>
          <h2 style={{ fontSize: 34, fontWeight: 700, color: '#fff', margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
            Your orders,<br />your pipeline,<br />your way.
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.7, maxWidth: 300, margin: 0 }}>
            Track manufacturing stages, manage customer estimates and invoices, and keep every deal moving forward.
          </p>
        </div>

        {/* Bottom stat strip */}
        <div style={{ display: 'flex', gap: 32, zIndex: 1 }}>
          {[
            { label: 'Order Stages', value: '10' },
            { label: 'Role-based Access', value: '6' },
            { label: 'Pipeline Tracking', value: '100%' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div className="login-card" style={{ width: '100%', maxWidth: 380 }}>

          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.3px' }}>Sign in</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: 0 }}>Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 7 }}>
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="login-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@stealthlaser.com"
                autoComplete="username email"
              />
            </div>

            <div>
              <label htmlFor="password" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" className="show-pw-btn" onClick={() => setShowPassword(p => !p)} tabIndex={-1}>
                  {showPassword ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 7, color: '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" /></svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>&#169; {new Date().getFullYear()} Stealth Machine Tools</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
