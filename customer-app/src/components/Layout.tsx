import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { C } from '../ui';
import InstallButton from './InstallButton';
import WorkerDropdown from './WorkerDropdown';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/inventory', label: 'Inventory' },
  { to: '/cycle-count', label: 'Cycle Count' },
  { to: '/materials', label: 'Material Master' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user);
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const doLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.bg }}>
      <header className="app-header" style={{
        background: '#fff', borderBottom: `1px solid ${C.line}`,
        padding: '10px 16px', minHeight: 56, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src="/jsm-logo.svg" alt="JSM" style={{ height: 28 }} />
          <div className="hide-mobile" style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>Customer Portal</div>
            <div style={{ fontSize: 11, color: C.faint }}>Read-only view</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <WorkerDropdown />
          <InstallButton variant="chip" />
          <div className="hide-mobile" style={{ textAlign: 'right', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
              {allowedCodes.length ? allowedCodes.join(', ') : (user?.location || 'All locations')}
            </div>
          </div>
          <button onClick={doLogout} style={{
            background: '#f8fafc', border: `1px solid ${C.line}`, color: C.sub,
            borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Sign out</button>
        </div>
      </header>

      <nav className="app-nav" style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '0 12px', display: 'flex', gap: 2, position: 'sticky', top: 56, zIndex: 9 }}>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}
            style={({ isActive }) => ({
              padding: '14px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              color: isActive ? C.blue : C.sub, whiteSpace: 'nowrap',
              borderBottom: isActive ? `2px solid ${C.blue}` : '2px solid transparent',
            })}>
            {n.label}
          </NavLink>
        ))}
      </nav>

      <main className="app-main" style={{ flex: 1, padding: 24, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        {children}
      </main>

      <footer style={{ textAlign: 'center', padding: '16px', fontSize: 11, color: C.faint }}>
        JSM Logistics - Customer Portal
      </footer>
    </div>
  );
}
