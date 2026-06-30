import React from 'react';

// Color tokens (kept for inline use; most styling now lives in index.css)
export const C = {
  blue: '#2563eb', blueDark: '#1d4ed8', ink: '#0f172a', sub: '#475569',
  faint: '#94a3b8', line: '#e6eaf0', bg: '#eef2f7', card: '#ffffff',
};

// ── Inline SVG icons (stroke = currentColor) ───────────────────────────────
type IP = { size?: number; style?: React.CSSProperties };
const S = (size = 18): React.SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
});
export const IconDashboard = (p: IP) => (<svg {...S(p.size)} style={p.style}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>);
export const IconInventory = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>);
export const IconCycle = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M9 12l2 2 4-4"/></svg>);
export const IconMaterials = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>);
export const IconRefresh = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/></svg>);
export const IconInstall = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>);
export const IconLogout = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>);
export const IconChevron = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M6 9l6 6 6-6"/></svg>);
export const IconSearch = (p: IP) => (<svg {...S(p.size)} style={p.style}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>);
export const IconUser = (p: IP) => (<svg {...S(p.size)} style={p.style}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>);
export const IconBuilding = (p: IP) => (<svg {...S(p.size)} style={p.style}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg>);
export const IconAlert = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>);
export const IconLayers = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>);
export const IconBox = (p: IP) => (<svg {...S(p.size)} style={p.style}><path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>);
export const IconWeight = (p: IP) => (<svg {...S(p.size)} style={p.style}><circle cx="12" cy="5" r="2"/><path d="M8 7h8l3 13H5L8 7z"/></svg>);

// ── Components ──────────────────────────────────────────────────────────────
export function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`card ${className || ''}`} style={style}>{children}</div>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 className="page-title" style={{ fontSize: 23, fontWeight: 800, color: C.ink, margin: 0, letterSpacing: '-.02em' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: C.faint, margin: '5px 0 0' }}>{subtitle}</p>}
      </div>
      {right && <div style={{ flex: '1 1 240px', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = (status || '').toUpperCase();
  const map: Record<string, [string, string]> = {
    COMPLETED: ['#dcfce7', '#15803d'], DONE: ['#dcfce7', '#15803d'], PICKED: ['#dcfce7', '#15803d'],
    AVAILABLE: ['#dcfce7', '#15803d'], PENDING: ['#fef9c3', '#a16207'], IN_PROGRESS: ['#dbeafe', '#1d4ed8'],
    DISCREPANCY: ['#fee2e2', '#b91c1c'], DAMAGED: ['#fee2e2', '#b91c1c'],
  };
  const [bg, fg] = map[s] || ['#e2e8f0', '#475569'];
  return <span className="pill" style={{ background: bg, color: fg }}>{status || '-'}</span>;
}

export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div style={{ padding: '56px 20px', textAlign: 'center', color: C.faint }}>
      <div style={{ opacity: .35, marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{icon || <IconBox size={40} />}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.sub }}>{message}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div style={{ padding: 64, textAlign: 'center', color: C.sub }}>
      <IconRefresh size={26} style={{ animation: 'spin 1s linear infinite', color: C.blue }} />
      <div style={{ fontSize: 13, marginTop: 12, fontWeight: 600 }}>{label || 'Loading…'}</div>
    </div>
  );
}

export function Skeleton({ h = 14, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

// Legacy inline style exports (kept for compatibility)
export const thStyle: React.CSSProperties = { textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: `1.5px solid ${C.line}`, background: '#f8fafc', whiteSpace: 'nowrap' };
export const tdStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: C.ink, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

export function fmtDate(d?: string | null): string {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
