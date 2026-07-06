import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { C, IconDashboard, IconInventory, IconCycle, IconMaterials, IconReports, IconMap, IconLogout } from '../ui';
import InstallButton from './InstallButton';
import WorkerDropdown from './WorkerDropdown';

const NAV = [
  { to: '/', label: 'Dashboard', end: true, Icon: IconDashboard },
  { to: '/inventory', label: 'Inventory', Icon: IconInventory },
  { to: '/cycle-count', label: 'Cycle Count', Icon: IconCycle },
  { to: '/materials', label: 'Material Master', Icon: IconMaterials },
  { to: '/reports', label: 'Reports', Icon: IconReports },
  { to: '/warehouse-map', label: 'Warehouse Map', Icon: IconMap },
];

export default function Layout({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user);
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const team = useAuthStore(s => s.team);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const doLogout = () => { logout(); navigate('/login'); };

  const initials = (user?.name || 'JSM').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const scopeLabel = selWorker
    ? (team.find(w => w.warehouseCode === selWorker)?.name || selWorker)
    : (allowedCodes.length ? `All areas · ${allowedCodes.join(', ')}` : (user?.location || 'All areas'));

  return (
    <div className="shell">
      {/* Sidebar (desktop) */}
      <aside className="sidebar">
        <div className="sidebar-brand" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <img src="/logo.svg" alt="JSM Logistics Pvt Ltd" style={{ width: 188, maxWidth: '100%', display: 'block' }} />
          <div className="sub" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#64748b' }}>Customer Portal · Read-only</div>
        </div>
        <nav className="nav">
          <div className="nav-label">Menu</div>
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ fontSize: 10.5, color: '#64748b' }}>{user?.location || 'Customer'}</div>
            </div>
          </div>
          <button onClick={doLogout} className="btn btn-ghost" style={{ width: '100%', marginTop: 8, justifyContent: 'center', background: 'rgba(255,255,255,.04)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,.1)' }}>
            <IconLogout size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          {/* Mobile brand */}
          <div className="only-mobile" style={{ alignItems: 'center', gap: 9 }}>
            <img src="/logo.svg" alt="JSM Logistics" style={{ height: 24 }} />
          </div>
          {/* Scope context (desktop) */}
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.sub, fontSize: 13, fontWeight: 600 }}>
            <IconInventory size={16} style={{ color: C.faint }} />
            <span style={{ color: C.faint }}>Viewing</span>
            <span style={{ color: C.ink, fontWeight: 700 }}>{scopeLabel}</span>
          </div>
          <div style={{ flex: 1 }} />
          <WorkerDropdown />
          <InstallButton variant="chip" />
          <button onClick={doLogout} className="btn btn-ghost only-mobile" title="Sign out" style={{ padding: '8px 10px' }}><IconLogout size={16} /></button>
        </header>

        <main className="content fade-up">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="bottomnav">
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={20} /> {label.split(' ')[0]}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
