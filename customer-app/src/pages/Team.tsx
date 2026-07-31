import { useEffect, useState } from 'react';
import { fetchTeam, type TeamWorkerStats } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, C } from '../ui';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value ?? 0}</div>
    </div>
  );
}

export default function Team() {
  const user = useAuthStore(s => s.user);
  const [team, setTeam] = useState<TeamWorkerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const locations = user?.allowedLocations?.length
          ? user.allowedLocations
          : (user?.location ? [user.location] : []);
        const data = await fetchTeam(locations);
        if (alive) setTeam(data);
      } catch (e: any) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user]);

  // Background poll — worker activity stats stay current without a manual reload.
  useLiveRefresh(async () => {
    try {
      const locations = user?.allowedLocations?.length
        ? user.allowedLocations
        : (user?.location ? [user.location] : []);
      setTeam(await fetchTeam(locations));
    } catch { /* ignore */ }
  });

  if (loading) return <Spinner label="Loading your team…" />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load team: {error}</Card>;

  return (
    <div>
      <PageHeader
        title="My Team"
        subtitle={`${team.length} worker${team.length === 1 ? '' : 's'} across your site${(user?.allowedLocations?.length || 1) === 1 ? '' : 's'} · who's doing what`}
      />
      {team.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {team.map(w => (
            <Card key={w.username} style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 13,
                }}>
                  {w.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{w.warehouseCode || 'No area'} · {w.location}</div>
                </div>
              </div>

              {w.task && (
                <div style={{
                  fontSize: 11, fontWeight: 700, color: C.blue, background: '#eff6ff',
                  border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 9px',
                  marginBottom: 12, display: 'inline-block',
                }}>
                  {w.task}
                </div>
              )}

              {w.stats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Stat label="Inward Today" value={w.stats.todaysInward} color="#2563eb" />
                  <Stat label="Outward Today" value={w.stats.todaysOutward} color="#059669" />
                  <Stat label="RM Pallets" value={w.stats.inventoryRMPallets} color="#7c3aed" />
                  <Stat label="FG Pallets" value={w.stats.inventoryFGPallets} color="#0891b2" />
                  <Stat label="Total Pallets" value={w.stats.totalPallets} color="#0f172a" />
                  <Stat label="Discrepancies" value={w.stats.discrepancyCount} color="#dc2626" />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.faint, fontStyle: 'italic' }}>No warehouse linked yet.</div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState message="No workers are set up for your site yet." />
      )}
    </div>
  );
}
