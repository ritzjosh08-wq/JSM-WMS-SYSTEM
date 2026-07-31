import { useEffect, useState, type ReactNode } from 'react';
import { fetchDashboardForCodes, type DashboardStats } from '../api';
import { useAuthStore } from '../store/authStore';
import {
  Card, PageHeader, Spinner, EmptyState, C,
  IconBox, IconLayers, IconInventory, IconAlert, IconBuilding,
  IconArrowDownToLine, IconArrowUpFromLine, IconChevron,
} from '../ui';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

// ── KPI card — optionally expandable to show a breakdown popover ───────────────
function Kpi({
  label, value, accent, bg, Icon, breakdown, open, onToggle,
}: {
  label: string; value: number; accent: string; bg: string; Icon: any;
  breakdown?: ReactNode; open?: boolean; onToggle?: () => void;
}) {
  const clickable = !!breakdown;
  return (
    <div
      className="kpi"
      style={{ position: 'relative', overflow: 'visible', cursor: clickable ? 'pointer' : 'default' }}
      onClick={clickable ? onToggle : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="chip" style={{ background: bg, color: accent, position: 'relative', top: 'auto', right: 'auto' }}><Icon size={19} /></div>
        {clickable && (
          <IconChevron size={15} style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', marginTop: 2 }} />
        )}
      </div>
      <div className="label">{label}</div>
      <div className="value" style={{ color: accent }}>{(value ?? 0).toLocaleString()}</div>

      {clickable && open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 20,
            background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12,
            boxShadow: '0 12px 28px rgba(15,23,42,.14)', padding: '10px 12px', maxHeight: 220, overflowY: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          {breakdown}
        </div>
      )}
    </div>
  );
}

// ── Simple horizontal bar list (Stock by Location fallback / RM by Type) ───────
function BarList({ items, valueKey, labelKey, color }: { items: any[]; valueKey: string; labelKey: string; color: string }) {
  if (!items?.length) return <EmptyState message="No data recorded yet." icon={<IconInventory size={36} />} />;
  const max = Math.max(...items.map(i => i[valueKey] || 0), 1);
  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      {items.slice(0, 8).map((i, idx) => (
        <div key={idx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
            <span style={{ color: C.sub, fontWeight: 600 }}>{i[labelKey]}</span>
            <span style={{ color: C.ink, fontWeight: 800 }}>{(i[valueKey] || 0).toLocaleString()}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: '#eef2f7', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(4, (i[valueKey] / max) * 100)}%`, borderRadius: 999, background: color, transition: 'width .5s cubic-bezier(.2,.7,.3,1)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Small breakdown list used inside KPI popovers (RM/discrepancy category) ────
function MiniBreakdown({ items, labelKey, valueKey }: { items: any[]; labelKey: string; valueKey: string }) {
  if (!items?.length) return <div style={{ fontSize: 12.5, color: C.faint, padding: '4px 2px' }}>No breakdown available.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((i, idx) => (
        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 2px' }}>
          <span style={{ color: C.sub, fontWeight: 600 }}>{i[labelKey]}</span>
          <span style={{ color: C.ink, fontWeight: 800 }}>{(i[valueKey] || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Per-warehouse pallets + quantity cards (Stock by Location) ────────────────
function WarehouseBreakdown({ items }: { items: { code: string; name: string; pallets: number; qty: number }[] | undefined }) {
  if (!items?.length) return <EmptyState message="No warehouse data recorded yet." icon={<IconBuilding size={36} />} />;
  return (
    <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {items.map(w => (
        <div key={w.code} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', color: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconBuilding size={15} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{w.code}<span style={{ fontWeight: 500, color: C.faint }}> · {w.name}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10.5, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em' }}>Pallets</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{w.pallets.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em' }}>Quantity</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{w.qty.toLocaleString()}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section title with a colored accent bar + optional tag ────────────────────
function SectionHead({ title, tag }: { title: string; tag?: string }) {
  return (
    <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 4, height: 16, borderRadius: 2, background: C.blue, display: 'inline-block' }} />
      <span className="card-title">{title}</span>
      {tag && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.blue, background: '#eff6ff', borderRadius: 999, padding: '2px 8px', marginLeft: 'auto' }}>{tag}</span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const user = useAuthStore(s => s.user);
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const codes = selWorker ? [selWorker] : allowedCodes;
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openKpi, setOpenKpi] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try { const stats = await fetchDashboardForCodes(codes); if (alive) setData(stats); }
      catch (e: any) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selWorker, allowedCodes.join(',')]);

  // Silent background refresh — no loading spinner flicker, just swaps in fresh
  // data once it arrives so worker updates in the WMS software show up here.
  useLiveRefresh(async () => {
    try { const stats = await fetchDashboardForCodes(codes); setData(stats); } catch { /* ignore */ }
  });

  if (loading) return <Spinner label="Loading your dashboard…" />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load data: {error}</Card>;
  if (!data) return null;

  const toggle = (key: string) => setOpenKpi(prev => (prev === key ? null : key));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name || 'Customer'}`}
        subtitle={codes.length ? `Live overview · ${codes.join(', ')}` : 'Live overview · all warehouses'}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi label="Today's Inward" value={data.todaysInward ?? 0} accent="#059669" bg="#ecfdf5" Icon={IconArrowDownToLine} />
        <Kpi label="Today's Outward" value={data.todaysOutward ?? 0} accent="#ea580c" bg="#fff7ed" Icon={IconArrowUpFromLine} />
        <Kpi label="Total Pallets" value={data.totalPallets ?? 0} accent={C.blue} bg="#eff6ff" Icon={IconBox} />
        <Kpi
          label="RM Pallets" value={data.inventoryRM ?? 0} accent="#7c3aed" bg="#f5f3ff" Icon={IconLayers}
          breakdown={<MiniBreakdown items={data.rmByType || []} labelKey="type" valueKey="pallets" />}
          open={openKpi === 'rm'} onToggle={() => toggle('rm')}
        />
        <Kpi label="FG Pallets" value={data.inventoryFG ?? 0} accent="#0891b2" bg="#ecfeff" Icon={IconInventory} />
        <Kpi
          label="Discrepancies" value={data.discrepancyCount ?? 0} accent="#dc2626" bg="#fef2f2" Icon={IconAlert}
          breakdown={<MiniBreakdown items={data.discrepancyByCategory || []} labelKey="category" valueKey="count" />}
          open={openKpi === 'disc'} onToggle={() => toggle('disc')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card>
          <SectionHead title="Stock by Location" tag={data.warehouseBreakdown?.length ? `${data.warehouseBreakdown.length} warehouse${data.warehouseBreakdown.length > 1 ? 's' : ''}` : undefined} />
          {data.warehouseBreakdown?.length
            ? <WarehouseBreakdown items={data.warehouseBreakdown} />
            : <BarList items={data.stockLocations} valueKey="pallets" labelKey="name" color="linear-gradient(90deg,#3b82f6,#2563eb)" />}
        </Card>
        <Card>
          <SectionHead title="Raw Material by Type" />
          <BarList items={data.rmByType} valueKey="pallets" labelKey="type" color="linear-gradient(90deg,#8b5cf6,#7c3aed)" />
        </Card>
      </div>
    </div>
  );
}
