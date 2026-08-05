import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Shield, Warehouse, Check, RefreshCw, Save, UserPlus, Trash2, Eye, EyeOff, AlertCircle, Database } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

interface UserPermission {
  username: string;
  name: string;
  role: string;
  location: string;
  dynamic: boolean;
  allowedLocations: string[];
}

interface PermissionsData {
  users: UserPermission[];
  allLocations: string[];
}

const ROLES = [
  { value: 'WORKER',   label: 'Worker',   desc: 'Operational — inward, outbound, inventory',     color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  { value: 'CUSTOMER', label: 'Customer', desc: 'View-only — can view assigned warehouse data',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { value: 'ADMIN',    label: 'Admin',    desc: 'Full access — all warehouses and settings',      color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
];

export default function Settings() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPerms, setLocalPerms] = useState<Record<string, string[]>>({});

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'WORKER', location: '' });
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState(false);

  // Danger zone — wipe all data
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wiping, setWiping]   = useState(false);
  const [wipeResult, setWipeResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  // Narrower reset — inward/outward transactions + current stock only, keeps everything else
  const [txnWipeConfirmText, setTxnWipeConfirmText] = useState('');
  const [txnWiping, setTxnWiping] = useState(false);
  const [txnWipeResult, setTxnWipeResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/auth/permissions`);
      if (!res.ok) throw new Error('Failed to load permissions');
      const json: PermissionsData = await res.json();
      setData(json);
      const perms: Record<string, string[]> = {};
      json.users.filter(u => u.role === 'CUSTOMER').forEach(u => {
        perms[u.username] = u.allowedLocations;
      });
      setLocalPerms(perms);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleLocation = (username: string, location: string) => {
    setLocalPerms(prev => {
      const current = prev[username] || [];
      const next = current.includes(location)
        ? current.filter(l => l !== location)
        : [...current, location];
      return { ...prev, [username]: next };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/auth/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: localPerms }),
      });
      if (!res.ok) throw new Error('Failed to save permissions');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!form.name.trim() || !form.username.trim() || !form.password.trim() || !form.location.trim()) {
      setCreateError('All fields are required.'); return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error || 'Failed to create user'); return; }
      setCreateOk(true);
      setForm({ name: '', username: '', password: '', role: 'WORKER', location: '' });
      setTimeout(() => { setCreateOk(false); setShowCreate(false); }, 2000);
      await load();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setDeletingUser(username);
    try {
      const res = await fetch(`${API}/auth/users/${username}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Failed to delete user'); return; }
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeletingUser(null);
    }
  };

  const customers = data?.users.filter(u => u.role === 'CUSTOMER') || [];
  const allLocations = data?.allLocations || [];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px',
    fontSize: '13px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SettingsIcon size={22} style={{ color: '#2563eb' }} /> Settings
          </h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Admin configuration — manage user accounts and warehouse permissions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { setShowCreate(v => !v); setCreateError(null); setCreateOk(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: showCreate ? '#f1f5f9' : '#2563eb', border: showCreate ? '1.5px solid #e2e8f0' : 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: showCreate ? '#64748b' : '#fff', cursor: 'pointer' }}>
            <UserPlus size={13} /> {showCreate ? 'Cancel' : 'New User'}
          </button>
          <button onClick={load} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {saved && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px 16px', color: '#065f46', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={15} /> Permissions saved successfully.
        </div>
      )}

      {/* ── Create New User ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ background: '#fff', border: '2px solid #2563eb', borderRadius: '14px', padding: '24px', boxShadow: '0 4px 16px rgba(37,99,235,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <UserPlus size={16} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Create New User Account</h2>
          </div>

          {createError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <AlertCircle size={13} /> {createError}
            </div>
          )}
          {createOk && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 14px', color: '#065f46', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Check size={13} /> User created successfully!
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Full Name */}
            <div>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} placeholder="e.g. Mumbai Worker" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Warehouse / Location */}
            <div>
              <label style={labelStyle}>Warehouse / Location</label>
              <input style={inputStyle} placeholder="e.g. Mumbai PPD" value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>

            {/* Username */}
            <div>
              <label style={labelStyle}>Username</label>
              <input style={inputStyle} placeholder="e.g. mumbaippd" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Lowercase, no spaces</div>
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...inputStyle, paddingRight: '38px' }}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Set a strong password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <button onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Role selector */}
          <div style={{ marginTop: '16px' }}>
            <label style={labelStyle}>Role</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {ROLES.map(r => {
                const selected = form.role === r.value;
                return (
                  <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))}
                    style={{ flex: 1, minWidth: '140px', padding: '12px 16px', borderRadius: '10px', border: `2px solid ${selected ? r.color : '#e2e8f0'}`, background: selected ? r.bg : '#f8fafc', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: selected ? r.color : '#374151' }}>{r.label}</div>
                    <div style={{ fontSize: '10px', color: selected ? r.color : '#94a3b8', marginTop: '2px', opacity: 0.9 }}>{r.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleCreate} disabled={creating}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              {creating ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : <><UserPlus size={14} /> Create User</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Customer Warehouse Access ────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Users size={16} style={{ color: '#2563eb' }} />
          <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Customer Warehouse Access</h2>
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px' }}>
          Control which warehouse locations each customer account can view. By default, a customer only sees their own location.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
            Loading…
          </div>
        ) : customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>
            No customer accounts yet. Create one using the <strong>New User</strong> button above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {customers.map(customer => {
              const perms = localPerms[customer.username] || [];
              return (
                <div key={customer.username} style={{ border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '18px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 800, flexShrink: 0 }}>
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{customer.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>@{customer.username} · Default: <strong style={{ color: '#2563eb' }}>{customer.location}</strong></div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '6px', padding: '2px 10px', fontSize: '10px', fontWeight: 700, color: '#7c3aed' }}>CUSTOMER</span>
                      {customer.dynamic && (
                        <button onClick={() => handleDelete(customer.username)} disabled={deletingUser === customer.username}
                          title="Delete this user"
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          {deletingUser === customer.username ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />} Delete
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Warehouse size={12} /> Warehouse Access
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {allLocations.map(loc => {
                      const isOwn = loc === customer.location;
                      const checked = isOwn || perms.includes(loc);
                      return (
                        <label key={loc} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderRadius: '8px', border: `1.5px solid ${checked ? '#bfdbfe' : '#e2e8f0'}`, background: checked ? '#eff6ff' : '#fff', cursor: isOwn ? 'default' : 'pointer', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: checked ? '#1d4ed8' : '#64748b' }}>
                          <input type="checkbox" checked={checked} disabled={isOwn}
                            onChange={() => !isOwn && toggleLocation(customer.username, loc)}
                            style={{ cursor: isOwn ? 'default' : 'pointer' }} />
                          {loc}
                          {isOwn && <span style={{ fontSize: '9px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', padding: '1px 5px', fontWeight: 800 }}>DEFAULT</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && customers.length > 0 && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              {saving ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Save size={14} /> Save Permissions</>}
            </button>
          </div>
        )}
      </div>

      {/* ── All User Accounts ────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Shield size={16} style={{ color: '#059669' }} />
          <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>All User Accounts</h2>
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
          Every login account across all warehouses. Accounts marked <strong>DYNAMIC</strong> were created here and can be deleted.
        </p>

        {loading ? null : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Name', 'Username', 'Role', 'Warehouse', 'Access', ''].map((h, i) => (
                  <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.users || []).map((u, i) => {
                const roleInfo = ROLES.find(r => r.value === u.role);
                return (
                  <tr key={u.username} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                      {u.name}
                      {u.dynamic && <span style={{ marginLeft: '6px', fontSize: '9px', background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px', fontWeight: 800 }}>DYNAMIC</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>{u.username}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: roleInfo?.bg, color: roleInfo?.color, border: `1px solid ${roleInfo?.border}`, borderRadius: '20px', padding: '1px 10px', fontSize: '10px', fontWeight: 800 }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{u.location}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                      {u.role === 'ADMIN'    && '✅ Full access — all warehouses'}
                      {u.role === 'WORKER'   && '✏️ Operational — inward, outbound, inventory'}
                      {u.role === 'CUSTOMER' && `👁 View only — ${(localPerms[u.username] || [u.location]).join(', ')}`}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {u.dynamic && (
                        <button onClick={() => handleDelete(u.username)} disabled={deletingUser === u.username}
                          title="Delete user"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          {deletingUser === u.username ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />} Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Reset Transactions Only (keeps materials, warehouses, users) */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #fed7aa', padding: '28px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ background: '#fff7ed', borderRadius: '10px', padding: '8px', display: 'flex' }}>
            <Database size={18} color="#c2410c" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#9a3412' }}>Reset Transactions Only</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              Clears every Inward entry, Outward dispatch, and the current inventory stock they
              produced — a clean slate for testing the workflow. <strong>Materials, warehouses,
              rack/bin locations, and user accounts are kept exactly as they are.</strong> This
              cannot be undone.
            </div>
          </div>
        </div>

        <div style={{ background: '#fff7ed', borderRadius: '10px', padding: '16px', marginTop: '16px', border: '1px solid #fed7aa' }}>
          <div style={{ fontSize: '13px', color: '#7c2d12', fontWeight: 600, marginBottom: '10px' }}>
            Type <code style={{ background: '#ffedd5', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>RESET TRANSACTIONS</code> to confirm:
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              value={txnWipeConfirmText}
              onChange={e => { setTxnWipeConfirmText(e.target.value); setTxnWipeResult(null); }}
              placeholder="RESET TRANSACTIONS"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '8px',
                border: '1.5px solid #fdba74', fontSize: '13px', fontFamily: 'monospace',
                outline: 'none', background: '#fff',
              }}
            />
            <button
              disabled={txnWipeConfirmText !== 'RESET TRANSACTIONS' || txnWiping}
              onClick={async () => {
                if (txnWipeConfirmText !== 'RESET TRANSACTIONS') return;
                setTxnWiping(true);
                setTxnWipeResult(null);
                try {
                  const res = await fetch(`${API}/inventory/reset-transactions`, { method: 'DELETE' });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || 'Reset failed');
                  setTxnWipeResult({ ok: true, msg: json.message || 'Inward, outward, and current stock cleared.' });
                  setTxnWipeConfirmText('');
                } catch (err: any) {
                  setTxnWipeResult({ ok: false, msg: err.message });
                } finally {
                  setTxnWiping(false);
                }
              }}
              style={{
                padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                border: 'none', cursor: txnWipeConfirmText === 'RESET TRANSACTIONS' && !txnWiping ? 'pointer' : 'not-allowed',
                background: txnWipeConfirmText === 'RESET TRANSACTIONS' && !txnWiping ? '#c2410c' : '#fdba74',
                color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
              }}
            >
              {txnWiping ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              {txnWiping ? 'Resetting…' : 'Reset Transactions'}
            </button>
          </div>
          {txnWipeResult && (
            <div style={{
              marginTop: '10px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: txnWipeResult.ok ? '#ecfdf5' : '#fef2f2',
              color: txnWipeResult.ok ? '#059669' : '#dc2626',
              border: `1px solid ${txnWipeResult.ok ? '#a7f3d0' : '#fca5a5'}`,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {txnWipeResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {txnWipeResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* ── Danger Zone */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #fecaca', padding: '28px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ background: '#fef2f2', borderRadius: '10px', padding: '8px', display: 'flex' }}>
            <Database size={18} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#991b1b' }}>Danger Zone — Wipe All Data</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              Permanently deletes all Inward, Outward, Inventory, Material Master, Reports and related records. User accounts and warehouse structure are kept. <strong>This cannot be undone.</strong>
            </div>
          </div>
        </div>

        <div style={{ background: '#fef2f2', borderRadius: '10px', padding: '16px', marginTop: '16px', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: '13px', color: '#7f1d1d', fontWeight: 600, marginBottom: '10px' }}>
            Type <code style={{ background: '#fee2e2', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>DELETE ALL DATA</code> to confirm:
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              value={wipeConfirmText}
              onChange={e => { setWipeConfirmText(e.target.value); setWipeResult(null); }}
              placeholder="DELETE ALL DATA"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '8px',
                border: '1.5px solid #fca5a5', fontSize: '13px', fontFamily: 'monospace',
                outline: 'none', background: '#fff',
              }}
            />
            <button
              disabled={wipeConfirmText !== 'DELETE ALL DATA' || wiping}
              onClick={async () => {
                if (wipeConfirmText !== 'DELETE ALL DATA') return;
                setWiping(true);
                setWipeResult(null);
                try {
                  const res = await fetch(`${API}/inventory/reset-all`, { method: 'DELETE' });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || 'Reset failed');
                  setWipeResult({ ok: true, msg: 'All data wiped successfully. The system is now empty.' });
                  setWipeConfirmText('');
                } catch (err: any) {
                  setWipeResult({ ok: false, msg: err.message });
                } finally {
                  setWiping(false);
                }
              }}
              style={{
                padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                border: 'none', cursor: wipeConfirmText === 'DELETE ALL DATA' && !wiping ? 'pointer' : 'not-allowed',
                background: wipeConfirmText === 'DELETE ALL DATA' && !wiping ? '#dc2626' : '#fca5a5',
                color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
              }}
            >
              {wiping ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              {wiping ? 'Wiping…' : 'Wipe All Data'}
            </button>
          </div>
          {wipeResult && (
            <div style={{
              marginTop: '10px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: wipeResult.ok ? '#ecfdf5' : '#fef2f2',
              color: wipeResult.ok ? '#059669' : '#dc2626',
              border: `1px solid ${wipeResult.ok ? '#a7f3d0' : '#fca5a5'}`,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {wipeResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {wipeResult.msg}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
