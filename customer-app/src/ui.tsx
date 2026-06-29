import React from 'react';

export const C = {
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  ink: '#1e293b',
  sub: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  bg: '#f1f5f9',
  card: '#ffffff',
};

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 800, color: C.ink, margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: C.sub, margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {right && <div style={{ flex: '1 1 240px', display: 'flex', justifyContent: 'flex-end' }}>{right}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = (status || '').toUpperCase();
  const map: Record<string, { bg: string; fg: string }> = {
    COMPLETED: { bg: '#dcfce7', fg: '#15803d' },
    DONE:      { bg: '#dcfce7', fg: '#15803d' },
    PICKED:    { bg: '#dcfce7', fg: '#15803d' },
    PENDING:   { bg: '#fef9c3', fg: '#a16207' },
    IN_PROGRESS:{ bg: '#dbeafe', fg: '#1d4ed8' },
    DISCREPANCY:{ bg: '#fee2e2', fg: '#b91c1c' },
    DAMAGED:   { bg: '#fee2e2', fg: '#b91c1c' },
  };
  const c = map[s] || { bg: '#e2e8f0', fg: '#475569' };
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {status || '-'}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: C.faint, fontSize: 14 }}>
      {message}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: C.sub, fontSize: 14 }}>
      {label || 'Loading...'}
    </div>
  );
}

export const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
  color: C.sub, textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: `1px solid ${C.line}`, background: '#f8fafc', whiteSpace: 'nowrap',
};
export const tdStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 13, color: C.ink, borderBottom: `1px solid #f1f5f9`, whiteSpace: 'nowrap',
};

export function fmtDate(d?: string | null): string {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
