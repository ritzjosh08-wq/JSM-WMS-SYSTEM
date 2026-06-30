import { useEffect, useState } from 'react';
import { fetchDashboardForCodes, type DashboardStats } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, C, IconBox, IconLayers, IconInventory, IconAlert } from '../ui';

function Kpi({ label, value, accent, bg, Icon }: { label: string; value: number; accent: string; bg: string; Icon: any }) {
  return (
    <div className="kpi">
      <div className="chip" style={{ background: bg, color: accent }}><Icon size={19} /></div>
      <div className="label">{label}</div>
      <div className="value" style={{ color: accent }}>{(value ?? 0).toLocaleString()}</div>
    </div>
  );
}

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

export default function Dashboard() {
  const user = useAuthStore(s => s.user);
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const codes = selWorker ? [selWorker] : allowedCodes;
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try { const stats = await fetchDashboardForCodes(codes); if (alive) setData(stats); }
      catch (e: any) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [selWorker, allowedCodes.join(',')]);

  if (loading) return <Spinner label="Loading your dashboard…" />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load data: {error}</Card>;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name || 'Customer'}`}
        subtitle={codes.length ? `Live overview · ${codes.join(', ')}` : 'Live overview · all warehouses'}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi label="Total Pallets" value={data.totalPallets ?? 0} accent={C.blue} bg="#eff6ff" Icon={IconBox} />
        <Kpi label="RM Pallets" value={data.inventoryRM ?? 0} accent="#7c3aed" bg="#f5f3ff" Icon={IconLayers} />
        <Kpi label="FG Pallets" value={data.inventoryFG ?? 0} accent="#0891b2" bg="#ecfeff" Icon={IconInventory} />
        <Kpi label="Discrepancies" value={data.discrepancyCount ?? 0} accent="#dc2626" bg="#fef2f2" Icon={IconAlert} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card>
          <div className="card-head"><span className="card-title">Stock by Location</span></div>
          <BarList items={data.stockLocations} valueKey="pallets" labelKey="name" color="linear-gradient(90deg,#3b82f6,#2563eb)" />
        </Card>
        <Card>
          <div className="card-head"><span className="card-title">Raw Material by Type</span></div>
          <BarList items={data.rmByType} valueKey="pallets" labelKey="type" color="linear-gradient(90deg,#8b5cf6,#7c3aed)" />
        </Card>
      </div>
    </div>
  );
}
