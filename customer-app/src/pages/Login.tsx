import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, resolveAllowedWarehouseCodes } from '../api';
import { useAuthStore } from '../store/authStore';
import InstallButton from '../components/InstallButton';

export default function Login() {
  const setSession = useAuthStore(s => s.setSession);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
        throw new Error('This portal is for customer accounts only.');
      }
      const codes = await resolveAllowedWarehouseCodes(user);
      setSession(user, codes);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
    borderRadius: 10, fontSize: 14, color: '#1e293b', background: '#f8fafc',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 50%, #f0f4ff 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif", padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.06)',
        padding: 40, width: 460, maxWidth: '100%', border: '1px solid #e2e8f0',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/jsm-logo.svg" alt="JSM Logistics" style={{ width: '100%', maxWidth: 280, height: 'auto', marginBottom: 10 }} />
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Customer Portal</p>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 24 }} />

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>
          Sign in to view your stock
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 12,
            background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
          }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <InstallButton variant="primary" />

        <div style={{ marginTop: 24, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Demo customer login
          </p>
          {[
            { user: 'chennaicust', pass: 'chennai123', label: 'Chennai PPD' },
            { user: 'salemcust', pass: 'salem123', label: 'Salem MAB' },
          ].map(c => (
            <div key={c.user} onClick={() => { setUsername(c.user); setPassword(c.pass); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 0', fontSize: 12, gap: 8 }}>
              <span style={{ color: '#2563eb', fontWeight: 600, minWidth: 110 }}>{c.user}</span>
              <span style={{ color: '#64748b', flex: 1 }}>{c.label}</span>
              <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{c.pass}</span>
            </div>
          ))}
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>Click a row to auto-fill. Accounts are managed in the WMS.</p>
        </div>
      </div>
    </div>
  );
}
