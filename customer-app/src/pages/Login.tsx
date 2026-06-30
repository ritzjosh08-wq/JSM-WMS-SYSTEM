import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, resolveAllowedWarehouseCodes } from '../api';
import { useAuthStore } from '../store/authStore';
import InstallButton from '../components/InstallButton';
import { C, IconInventory, IconCycle, IconMaterials } from '../ui';

export default function Login() {
  const setSession = useAuthStore(s => s.setSession);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') throw new Error('This portal is for customer accounts only.');
      const codes = await resolveAllowedWarehouseCodes(user);
      setSession(user, codes);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', border: `1.5px solid ${C.line}`, borderRadius: 11,
    fontSize: 14, color: C.ink, background: '#f8fafc', outline: 'none', boxSizing: 'border-box',
  };
  const feature = (Icon: any, t: string, d: string) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><Icon size={18} /></div>
      <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{t}</div><div style={{ color: '#93c5fd', fontSize: 12.5, marginTop: 2 }}>{d}</div></div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter', system-ui, sans-serif", background: C.bg }}>
      {/* Brand panel */}
      <div className="hide-mobile" style={{
        flex: '1 1 46%', background: 'linear-gradient(160deg,#0b1220 0%,#13213f 55%,#1e3a8a 130%)',
        color: '#fff', padding: '56px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,.35),transparent 70%)', top: -120, right: -120 }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-block', background: '#fff', borderRadius: 14, padding: '12px 18px', boxShadow: '0 10px 30px rgba(0,0,0,.35)' }}>
            <img src="/logo.svg" alt="JSM Logistics Pvt Ltd" style={{ height: 40, display: 'block' }} />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 12 }}>Customer Portal</div>
        </div>
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, margin: '0 0 14px', letterSpacing: '-.02em' }}>Your warehouse,<br />in real time.</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 32px', maxWidth: 380 }}>Live stock, movements and cycle counts for every worker assigned to you — read-only and always up to date.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {feature(IconInventory, 'Live inventory', 'Stock, pallets and net weight by batch')}
            {feature(IconCycle, 'Cycle counts', 'Weekly audit results and discrepancies')}
            {feature(IconMaterials, 'Material master', 'Full catalogue at your fingertips')}
          </div>
        </div>
        <div style={{ position: 'relative', fontSize: 12, color: '#475569' }}>© JSM Logistics Pvt Ltd</div>
      </div>

      {/* Form panel */}
      <div style={{ flex: '1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="fade-up" style={{ width: 420, maxWidth: '100%' }}>
          <div className="only-mobile" style={{ justifyContent: 'center', marginBottom: 18 }}>
            <img src="/logo.svg" alt="JSM Logistics" style={{ height: 40 }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.ink, margin: '0 0 6px', letterSpacing: '-.02em' }}>Welcome back</h2>
          <p style={{ fontSize: 14, color: C.faint, margin: '0 0 26px' }}>Sign in to view your stock</p>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" required style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={e => (e.target.style.borderColor = C.blue)} onBlur={e => (e.target.style.borderColor = C.line)} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required style={{ ...inputStyle, marginBottom: 22 }}
              onFocus={e => (e.target.style.borderColor = C.blue)} onBlur={e => (e.target.style.borderColor = C.line)} />

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>{error}</div>}

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 13, fontSize: 14.5, opacity: loading ? .7 : 1 }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <InstallButton variant="primary" />

          <div style={{ marginTop: 24, background: '#f8fafc', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Demo customer login</p>
            {[
              { user: 'chennaicust', pass: 'chennai123', label: 'Chennai PPD' },
              { user: 'salemcust', pass: 'salem123', label: 'Salem MAB' },
            ].map(c => (
              <div key={c.user} onClick={() => { setUsername(c.user); setPassword(c.pass); }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '5px 0', fontSize: 12.5, gap: 8 }}>
                <span style={{ color: C.blue, fontWeight: 700, minWidth: 110 }}>{c.user}</span>
                <span style={{ color: C.sub, flex: 1 }}>{c.label}</span>
                <span style={{ color: C.faint, fontFamily: 'ui-monospace, monospace' }}>{c.pass}</span>
              </div>
            ))}
            <p style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>Click a row to auto-fill. Accounts are managed in the WMS.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
