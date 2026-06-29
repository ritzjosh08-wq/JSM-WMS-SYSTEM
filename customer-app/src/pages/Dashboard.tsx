import { useEffect, useState } from 'react';
import { fetchDashboardForCodes, type DashboardStats } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, thStyle, tdStyle, C } from '../ui';

function StatCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <Card style={{ padding: '18px 20px', flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent, marginTop: 6 }}>{value}</div>
    </Card>
  );
}

export default function Dashboard() {
  const user = useAuthStore(s => s.user);
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active scope: one worker's area, or all of the customer's areas combined.
  const codes = selWorker ? [selWorker] : allowedCodes;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const stats = await fetchDashboardForCodes(codes);
        if (alive) setData(stats);
      } catch (e: any) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
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
        subtitle={codes.length ? `Showing data for ${codes.join(', ')}` : 'Showing all warehouses'}
      />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard label="Total Pallets" value={data.totalPallets ?? 0} accent={C.blue} />
        <StatCard label="RM Pallets" value={data.inventoryRM ?? 0} accent="#7c3aed" />
        <StatCard label="FG Pallets" value={data.inventoryFG ?? 0} accent="#0891b2" />
        <StatCard label="Discrepancies" value={data.discrepancyCount ?? 0} accent="#b91c1c" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, fontWeight: 700, fontSize: 14 }}>Stock by Location</div>
          {data.stockLocations?.length ? (
            <table style={{ width: '100%' }}>
              <thead><tr><th style={thStyle}>Location</th><th style={{ ...thStyle, textAlign: 'right' }}>Pallets</th></tr></thead>
              <tbody>
                {data.stockLocations.map((l, i) => (
                  <tr key={i}><td style={tdStyle}>{l.name}</td><td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{l.pallets}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState message="No stock recorded yet." />}
        </Card>

        <Card>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, fontWeight: 700, fontSize: 14 }}>Raw Material by Type</div>
          {data.rmByType?.length ? (
            <table style={{ width: '100%' }}>
              <thead><tr><th style={thStyle}>Type</th><th style={{ ...thStyle, textAlign: 'right' }}>Pallets</th></tr></thead>
              <tbody>
                {data.rmByType.map((t, i) => (
                  <tr key={i}><td style={tdStyle}>{t.type}</td><td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{t.pallets}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState message="No raw material recorded yet." />}
        </Card>
      </div>
    </div>
  );
}
