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

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.push('/admin/board');
    }
  }, [user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      
      if (result.success) {
        // Redirect to admin board on successful login
        router.push('/admin/board');
      } else {
        setError(result.error || 'Login failed');
        setLoading(false);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a1a'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        backgroundColor: '#2d2d2d',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: '600', 
            color: '#e4e4e4',
            marginBottom: '8px'
          }}>
            Stealth Machine Tools
          </h1>
          <p style={{ color: '#a0a0a0' }}>Order Tracking System</p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="on">
          <div style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="email"
              style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#e4e4e4',
                fontSize: '14px'
              }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@stealthmachinetools.com"
              autoComplete="username email"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #404040',
                borderRadius: '6px',
                backgroundColor: '#383838',
                color: '#e4e4e4',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label 
              htmlFor="password"
              style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#e4e4e4',
                fontSize: '14px'
              }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #404040',
                borderRadius: '6px',
                backgroundColor: '#383838',
                color: '#e4e4e4',
                fontSize: '14px'
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px',
              marginBottom: '20px',
              backgroundColor: '#7f1d1d',
              border: '1px solid #991b1b',
              borderRadius: '6px',
              color: '#fecaca',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: loading ? '#666' : '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: '1px solid #404040',
          color: '#a0a0a0',
          fontSize: '12px'
        }}>
          <p style={{ marginBottom: '8px' }}>
            <strong>Default Credentials:</strong>
          </p>
          <p style={{ marginBottom: '4px' }}>
            Admin: admin@stealthmachinetools.com / admin123
          </p>
          <p>
            Agent: john@stealthmachinetools.com / agent123
          </p>
        </div>
      </div>
    </div>
  );
}