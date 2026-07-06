import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const login = useAuthStore(s => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      if (data.user?.role === 'CUSTOMER') {
        throw new Error('Customer accounts sign in through the Customer Portal app, not the WMS.');
      }
      login(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 50%, #f0f4ff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.06)',
        padding: '40px 40px',
        width: '500px',
        border: '1px solid #e2e8f0',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src="/jsm-logo.svg"
            alt="JSM Logistics"
            style={{ width: '100%', height: 'auto', display: 'block', marginBottom: '12px' }}
          />
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Warehouse Management System
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: '28px' }} />

        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '20px', margin: '0 0 20px' }}>
          Sign in to your account
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '14px',
                color: '#1e293b',
                background: '#f8fafc',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '14px',
                color: '#1e293b',
                background: '#f8fafc',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: '#dc2626',
              marginBottom: '16px',
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
              background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
              transition: 'all 0.15s',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Demo credentials */}
        <div style={{
          marginTop: '28px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '14px 16px',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Demo Credentials
          </p>
          {[
            { user: 'admin',       pass: 'admin123',   label: 'Admin',              role: 'Admin'    },
            { user: 'chennaippd',  pass: 'chennai123', label: 'Chennai Worker PPD', role: 'Worker'   },
          ].map(c => (
            <div
              key={c.user}
              onClick={() => { setUsername(c.user); setPassword(c.pass); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 0', fontSize: '12px', gap: '8px' }}
            >
              <span style={{ color: '#2563eb', fontWeight: 600, minWidth: 90 }}>{c.user}</span>
              <span style={{ color: '#64748b', flex: 1 }}>{c.label}</span>
              <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{c.pass}</span>
              <span style={{ color: '#64748b', background: '#e2e8f0', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', whiteSpace: 'nowrap' }}>{c.role}</span>
            </div>
          ))}
          <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>Click a row to auto-fill</p>
        </div>
      </div>
    </div>
  );
}
