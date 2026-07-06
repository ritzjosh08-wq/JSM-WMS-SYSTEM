import { useEffect, useMemo, useState } from 'react';
import {
  fetchMaterials, fetchInventoryForCodes, fetchInwardForCodes, fetchOutwardForCodes,
  parseCF, type MaterialRow, type InventoryRow, type InwardEntry, type OutwardEntry,
} from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, thStyle, tdStyle, C, IconBox, IconLayers, IconWeight, IconRefresh, IconMaterials } from '../ui';

const PALETTE = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#0d9488'];

// ── period helpers for the movement trend ───────────────────────────────
type View = 'day' | 'week' | 'month';
function periodKey(d: Date, v: View): string {
  if (v === 'day') return d.toISOString().slice(0, 10);
  if (v === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const jan4 = new Date(t.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}
function periodLabel(key: string, v: View): string {
  if (v === 'day') { const d = new Date(key); return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`; }
  if (v === 'month') { const [y, m] = key.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' }); }
  return key.split('-W')[1] ? 'W' + key.split('-W')[1] : key;
}
function recentPeriods(v: View): string[] {
  const now = new Date(); const keys: string[] = [];
  const n = v === 'day' ? 10 : v === 'week' ? 8 : 6;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    if (v === 'day') d.setDate(d.getDate() - i);
    if (v === 'week') d.setDate(d.getDate() - i * 7);
    if (v === 'month') d.setMonth(d.getMonth() - i);
    keys.push(periodKey(d, v));
  }
  return [...new Set(keys)];
}

function Kpi({ label, value, accent, bg, Icon }: { label: string; value: string | number; accent: string; bg: string; Icon: any }) {
  return (
    <div className="kpi">
      <div className="chip" style={{ background: bg, color: accent }}><Icon size={18} /></div>
      <div className="label">{label}</div>
      <div className="value" style={{ color: accent }}>{value}</div>
    </div>
  );
}

export default function Materials() {
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const codes = selWorker ? [selWorker] : allowedCodes;

  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [inv, setInv] = useState<InventoryRow[]>([]);
  const [inward, setInward] = useState<InwardEntry[]>([]);
  const [outward, setOutward] = useState<OutwardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('week');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [m, invRes, inw, out] = await Promise.all([
        fetchMaterials(),
        fetchInventoryForCodes(codes),
        fetchInwardForCodes(codes).catch(() => []),
        fetchOutwardForCodes(codes).catch(() => []),
      ]);
      setRows(m); setInv(invRes.inventory || []); setInward(inw); setOutward(out);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selWorker, allowedCodes.join(',')]);

  // RM composition by material type
  const rmTypes = useMemo(() => {
    const map: Record<string, { name: string; pallets: number; kg: number }> = {};
    inv.forEach(b => {
      const cf = parseCF(b.customFields);
      const cat = String(cf.category || (b.material as any)?.category || 'RM').toUpperCase();
      if (!cat.includes('RM') || (b.quantity ?? 0) <= 0) return;
      const type = (cf.materialType || b.material?.materialType || 'Unclassified').trim() || 'Unclassified';
      if (!map[type]) map[type] = { name: type, pallets: 0, kg: 0 };
      map[type].pallets += Number(cf.pallets || 0);
      map[type].kg += Number(cf.netWeight || 0);
    });
    return Object.values(map).filter(t => t.pallets > 0 || t.kg > 0).sort((a, b) => b.pallets - a.pallets);
  }, [inv]);

  const stats = useMemo(() => {
    let pallets = 0, kg = 0; const cSet = new Set<string>();
    inv.forEach(b => { const cf = parseCF(b.customFields); pallets += Number(cf.pallets || 0); kg += Number(cf.netWeight || 0); if (b.material?.code) cSet.add(b.material.code); });
    return { pallets: Math.round(pallets), kg, materials: rows.length || cSet.size, movements: inward.length + outward.length };
  }, [inv, rows, inward, outward]);

  const activity = useMemo(() => {
    const periods = recentPeriods(view);
    const inC: Record<string, number> = {}, outC: Record<string, number> = {};
    periods.forEach(k => { inC[k] = 0; outC[k] = 0; });
    const bump = (arr: any[], acc: Record<string, number>, dateField: string) => arr.forEach(e => {
      const raw = e[dateField] || e.createdAt; const d = new Date(raw);
      if (isNaN(d.getTime())) return; const k = periodKey(d, view); if (k in acc) acc[k]++;
    });
    bump(inward, inC, 'createdAt'); bump(outward, outC, 'dispatchDate');
    const data = periods.map(k => ({ label: periodLabel(k, view), inward: inC[k], outward: outC[k] }));
    const max = Math.max(1, ...data.map(d => Math.max(d.inward, d.outward)));
    return { data, max };
  }, [inward, outward, view]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => [r.code, r.description, r.materialType, r.category].filter(Boolean).some(v => String(v).toLowerCase().includes(t)));
  }, [rows, q]);

  if (loading) return <Spinner label="Loading material master…" />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load materials: {error}</Card>;

  const totalRmPallets = rmTypes.reduce((s, t) => s + t.pallets, 0) || 1;
  const R = 66, CIRC = 2 * Math.PI * R; let startFrac = 0;
  const barMax = Math.max(1, ...rmTypes.map(t => t.pallets));

  return (
    <div>
      <PageHeader
        title="Material Master"
        subtitle="Inventory analytics — RM composition, stock and movement trends"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="toolbar-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code or description…"
              style={{ padding: '9px 14px', border: `1.5px solid ${C.line}`, borderRadius: 10, fontSize: 13, width: 220, maxWidth: '100%', outline: 'none' }} />
            <button onClick={load} className="btn btn-primary"><IconRefresh size={15} /> Refresh</button>
          </div>
        }
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi label="Total Materials" value={stats.materials} accent={C.blue} bg="#eff6ff" Icon={IconBox} />
        <Kpi label="Total Pallets" value={stats.pallets.toLocaleString()} accent="#059669" bg="#ecfdf5" Icon={IconLayers} />
        <Kpi label="Total Weight" value={`${(stats.kg / 1000).toFixed(1)} T`} accent="#7c3aed" bg="#f5f3ff" Icon={IconWeight} />
        <Kpi label="Movements" value={stats.movements} accent="#d97706" bg="#fffbeb" Icon={IconRefresh} />
      </div>

      {/* RM donut + bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card>
          <div className="card-head"><span className="card-title">RM — Material Types</span>
            <span style={{ fontSize: 11, color: C.faint }}>{rmTypes.length} type{rmTypes.length === 1 ? '' : 's'} · {Math.round(totalRmPallets)} pallets</span></div>
          {rmTypes.length === 0 ? <EmptyState message="No RM inventory yet." icon={<IconMaterials size={36} />} /> : (
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '16px 18px', flexWrap: 'wrap' }}>
              <svg width={168} height={168} viewBox="0 0 168 168" style={{ flexShrink: 0 }}>
                <g transform="rotate(-90 84 84)">
                  {rmTypes.map((t, i) => {
                    const frac = t.pallets / totalRmPallets; const dash = frac * CIRC; const off = -startFrac * CIRC; startFrac += frac;
                    return <circle key={i} cx={84} cy={84} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={24}
                      strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={off} />;
                  })}
                </g>
                <text x={84} y={80} textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: C.ink }}>{Math.round(totalRmPallets)}</text>
                <text x={84} y={98} textAnchor="middle" style={{ fontSize: 10, fill: C.faint }}>pallets</text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 120 }}>
                {rmTypes.slice(0, 8).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                    <span style={{ color: C.sub, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    <span style={{ color: C.ink, fontWeight: 700 }}>{Math.round(t.pallets)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="card-head"><span className="card-title">RM — Pallets & Net Weight by Type</span></div>
          {rmTypes.length === 0 ? <EmptyState message="No RM inventory yet." icon={<IconLayers size={36} />} /> : (
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rmTypes.slice(0, 8).map((t, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.sub, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ color: C.ink, fontWeight: 700 }}>{Math.round(t.pallets)} plt · {Math.round(t.kg).toLocaleString()} kg</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: '#eef2f7', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(4, (t.pallets / barMax) * 100)}%`, borderRadius: 999, background: PALETTE[i % PALETTE.length], transition: 'width .5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Movement activity */}
      <Card style={{ marginBottom: 16 }}>
        <div className="card-head">
          <span className="card-title">Inward & Outbound Activity</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['day', 'week', 'month'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                border: `1.5px solid ${view === v ? C.blue : C.line}`, background: view === v ? '#eff6ff' : '#fff', color: view === v ? C.blue : C.sub,
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: '18px 18px 12px' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 4, background: C.blue, borderRadius: 2 }} /> Inward ({inward.length})</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 4, background: '#059669', borderRadius: 2 }} /> Outbound ({outward.length})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>
            {activity.data.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
                  <div title={`Inward: ${d.inward}`} style={{ width: 9, height: `${(d.inward / activity.max) * 100}%`, minHeight: d.inward ? 3 : 0, background: 'linear-gradient(180deg,#3b82f6,#2563eb)', borderRadius: '3px 3px 0 0' }} />
                  <div title={`Outbound: ${d.outward}`} style={{ width: 9, height: `${(d.outward / activity.max) * 100}%`, minHeight: d.outward ? 3 : 0, background: 'linear-gradient(180deg,#10b981,#059669)', borderRadius: '3px 3px 0 0' }} />
                </div>
                <span style={{ fontSize: 9.5, color: C.faint, whiteSpace: 'nowrap' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Catalog table */}
      <Card>
        <div className="card-head"><span className="card-title">Material Catalogue</span><span style={{ fontSize: 11, color: C.faint }}>{filtered.length} item{filtered.length === 1 ? '' : 's'}</span></div>
        {filtered.length ? (
          <div className="table-scroll">
            <table style={{ width: '100%' }}>
              <thead><tr>
                <th style={thStyle}>Code</th><th style={thStyle}>Description</th>
                <th style={thStyle}>Type</th><th style={thStyle}>Unit</th><th style={thStyle}>Category</th>
              </tr></thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: C.blueDark }}>{m.code}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', minWidth: 240 }}>{m.description}</td>
                    <td style={tdStyle}>{m.materialType || '-'}</td>
                    <td style={tdStyle}>{m.huUnit || '-'}</td>
                    <td style={tdStyle}>
                      {m.category
                        ? <span style={{ background: String(m.category).includes('FG') ? '#f5f3ff' : '#ecfdf5', color: String(m.category).includes('FG') ? '#7c3aed' : '#059669', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{m.category}</span>
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState message={rows.length ? 'No matches for your search.' : 'No materials in the catalogue yet.'} icon={<IconMaterials size={36} />} />}
      </Card>
    </div>
  );
}
