import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore, whQuery } from '../store/authStore';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ComposedChart,
} from 'recharts';
import { Box, RefreshCw, TrendingUp, Weight, Layers } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

const COLORS_RM = [
  '#2563eb','#7c3aed','#059669','#d97706','#dc2626',
  '#0891b2','#db2777','#65a30d','#1d4ed8','#6d28d9',
];

// Renders the pallet count centered *inside* each donut segment (instead of
// floating outside the ring), so labels never collide with each other or
// with the legend underneath.
const RADIAN = Math.PI / 180;
function renderRmSliceLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, value, percent } = props;
  if (!percent || percent < 0.045) return null; // skip slivers too thin to hold text
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 800, fill: '#fff', pointerEvents: 'none' }}>
      {Number(value).toFixed(0)}
    </text>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
function getDateFromEntry(entry: any): Date | null {
  const raw = entry.createdAt || parseCFRaw(entry.customFields)?.date || '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
function parseCFRaw(s: any): any {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
function periodKey(d: Date, view: 'day' | 'week' | 'month'): string {
  if (view === 'day') return d.toISOString().slice(0, 10);
  if (view === 'month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const tmp = new Date(d); tmp.setHours(0,0,0,0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6) % 7));
  const jan4 = new Date(tmp.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((tmp.getTime()-jan4.getTime())/86400000 - 3 + ((jan4.getDay()+6)%7)) / 7);
  return `${tmp.getFullYear()}-W${String(wk).padStart(2,'0')}`;
}
function periodLabel(key: string, view: 'day' | 'week' | 'month'): string {
  if (view === 'day') {
    const d = new Date(key);
    return `${d.getDate()} ${d.toLocaleString('default',{month:'short'})}`;
  }
  if (view === 'month') {
    const [y, m] = key.split('-');
    const d = new Date(Number(y), Number(m)-1, 1);
    return d.toLocaleString('default',{month:'short',year:'2-digit'});
  }
  return key;
}
function recentPeriods(view: 'day' | 'week' | 'month'): string[] {
  const now = new Date(); const keys: string[] = [];
  const n = view === 'day' ? 14 : view === 'week' ? 10 : 6;
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(now);
    if (view === 'day')   d.setDate(d.getDate() - i);
    if (view === 'week')  d.setDate(d.getDate() - i*7);
    if (view === 'month') d.setMonth(d.getMonth() - i);
    keys.push(periodKey(d, view));
  }
  return [...new Set(keys)];
}
function parseCF(s: string | null | undefined): any {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

// Aggregate batches by material type → { name, pallets, nos }
function buildTypeData(batches: any[]): { name: string; pallets: number; nos: number }[] {
  const map: Record<string, { pallets: number; nos: number }> = {};
  batches.forEach((b: any) => {
    if ((b.quantity ?? 0) <= 0) return;
    const cf  = parseCF(b.customFields);
    const t   = (cf.materialType || 'Other').trim() || 'Other';
    if (!map[t]) map[t] = { pallets: 0, nos: 0 };
    map[t].pallets += Number(cf.pallets  || 0);
    map[t].nos     += Number(b.quantity  || 0);
  });
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .filter(t => t.pallets > 0 || t.nos > 0)
    .sort((a, b) => b.pallets - a.pallets);
}

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
  padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
};

// ── Warehouse chart (ComposedChart: bars=pallets left y, line=qty right y) ──
function WHChart({
  data, title, subtitle, barColor,
}: {
  data: { name: string; pallets: number; nos: number }[];
  title: string; subtitle: string; barColor: string;
}) {
  const totalPallets = data.reduce((s, d) => s + d.pallets, 0);
  const totalNos     = data.reduce((s, d) => s + d.nos, 0);
  return (
    <div style={CARD}>
      {/* card header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'10px', gap:'10px' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:800, color:'#0f172a', lineHeight:1.3 }}>{title}</div>
          <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'2px' }}>{subtitle}</div>
        </div>
        <div style={{ display:'flex', gap:'8px', flexShrink:0 }}>
          <div style={{ background: barColor+'15', border:'1px solid '+barColor+'40', borderRadius:'8px', padding:'4px 10px', textAlign:'center' }}>
            <div style={{ fontSize:'15px', fontWeight:900, color:barColor, lineHeight:1 }}>{totalPallets.toFixed(0)}</div>
            <div style={{ fontSize:'9px', color:'#94a3b8', fontWeight:600 }}>pallets</div>
          </div>
          <div style={{ background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:'8px', padding:'4px 10px', textAlign:'center' }}>
            <div style={{ fontSize:'15px', fontWeight:900, color:'#059669', lineHeight:1 }}>{totalNos.toFixed(0)}</div>
            <div style={{ fontSize:'9px', color:'#94a3b8', fontWeight:600 }}>nos</div>
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ textAlign:'center', padding:'32px 0', color:'#94a3b8', fontSize:'12px' }}>No data for this storage type</div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={data} margin={{ top:4, right:44, bottom:60, left:0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize:10, fill:'#64748b' }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={64}
              tickLine={false}
              axisLine={{ stroke:'#e2e8f0' }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize:9, fill: barColor }}
              tickLine={false}
              axisLine={false}
              width={32}
              tickFormatter={(v) => v === 0 ? '' : v.toFixed(0)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize:9, fill:'#059669' }}
              tickLine={false}
              axisLine={false}
              width={32}
              tickFormatter={(v) => v === 0 ? '' : v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{ borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'11px', boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}
              labelStyle={{ fontWeight:700, color:'#0f172a', marginBottom:'4px', fontSize:'12px' }}
              formatter={(v: any, name: any) => [Number(v).toFixed(0), name === 'pallets' ? 'Pallets' : 'Qty (Nos)']}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize:'10px', paddingTop:'6px' }}
              formatter={(v) => v === 'pallets' ? 'Pallets' : 'Qty (Nos)'}
            />
            <Bar
              yAxisId="left"
              dataKey="pallets"
              name="pallets"
              fill={barColor}
              radius={[4,4,0,0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="nos"
              name="nos"
              stroke="#059669"
              strokeWidth={2}
              dot={{ r:4, fill:'#059669', stroke:'#fff', strokeWidth:2 }}
              activeDot={{ r:5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Custom line dot (only shows when value > 0)
const ActiveDot = (props: any) => {
  const { cx, cy, value, stroke } = props;
  if (!value) return null;
  return <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="#fff" strokeWidth={2} />;
};

export default function MaterialMaster() {
  const selectedWorker = useAuthStore(s => s.selectedWorker);
  const [inventory, setInventory]       = useState<any[]>([]);
  const [inwardData, setInwardData]     = useState<any[]>([]);
  const [outwardData, setOutwardData]   = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [activityView, setActivityView] = useState<'day' | 'week' | 'month'>('day');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wcParam = whQuery(selectedWorker);
      const [inv, inw, out] = await Promise.all([
        fetch(`${API}/inventory${wcParam}`).then(r => r.json()),
        fetch(`${API}/inward${wcParam}`).then(r => r.json()),
        fetch(`${API}/outward${wcParam}`).then(r => r.json()),
      ]);
      setInventory(Array.isArray(inv) ? inv : inv.inventory ?? []);
      setInwardData(Array.isArray(inw) ? inw : []);
      setOutwardData(Array.isArray(out) ? out : []);
    } catch {}
    setLoading(false);
  }, [selectedWorker]);

  useEffect(() => { load(); }, [load]);

  // ── RM type aggregation (for pie + bar) ──────────────────────────────────
  const rmTypeMap: Record<string, { name: string; pallets: number; kg: number; nos: number }> = {};
  inventory.forEach((b: any) => {
    const cf  = parseCF(b.customFields);
    const cat = (cf.category || b.material?.category || 'RM').toUpperCase();
    if (!cat.includes('RM')) return;
    if ((b.quantity ?? 0) <= 0) return;
    const type = (cf.materialType || 'Unclassified').trim() || 'Unclassified';
    if (!rmTypeMap[type]) rmTypeMap[type] = { name: type, pallets: 0, kg: 0, nos: 0 };
    rmTypeMap[type].pallets += Number(cf.pallets   || 0);
    rmTypeMap[type].kg      += Number(cf.netWeight || 0);
    rmTypeMap[type].nos     += Number(b.quantity   || 0);
  });
  const rmTypeData = Object.values(rmTypeMap)
    .filter(t => t.pallets > 0 || t.kg > 0 || t.nos > 0)
    .sort((a, b) => b.pallets - a.pallets);
  const rmPallets = rmTypeData.reduce((s, t) => s + t.pallets, 0);

  // ── Summary stats ─────────────────────────────────────────────────────────
  let totalPallets = 0; let totalKg = 0;
  const materialCodes = new Set<string>();
  inventory.forEach((b: any) => {
    const cf = parseCF(b.customFields);
    totalPallets += Number(cf.pallets   || 0);
    totalKg      += Number(cf.netWeight || 0);
    if (b.material?.code) materialCodes.add(b.material.code);
  });

  // ── Activity line chart — count of entries per period ────────────────────
  const periods = recentPeriods(activityView);
  const inCounts:  Record<string, number> = {};
  const outCounts: Record<string, number> = {};
  periods.forEach(k => { inCounts[k] = 0; outCounts[k] = 0; });
  inwardData.forEach((entry: any) => {
    const d = getDateFromEntry(entry);
    if (!d) return;
    const k = periodKey(d, activityView);
    if (k in inCounts) inCounts[k]++;
  });
  outwardData.forEach((entry: any) => {
    const d = getDateFromEntry(entry);
    if (!d) return;
    const k = periodKey(d, activityView);
    if (k in outCounts) outCounts[k]++;
  });
  const lineChartData = periods.map(k => ({
    label:   periodLabel(k, activityView),
    inward:  inCounts[k],
    outward: outCounts[k],
  }));
  const periodInTotal  = Object.values(inCounts).reduce((s,v) => s+v, 0);
  const periodOutTotal = Object.values(outCounts).reduce((s,v) => s+v, 0);

  // ── Warehouse data — CM35 (floor + rack) and FG05 ────────────────────────
  const cm35All    = inventory.filter((b: any) => b.warehouse?.code === 'CM35');
  const fg05All    = inventory.filter((b: any) => b.warehouse?.code === 'FG05');

  const cm35Floor  = cm35All.filter((b: any) => b.floorLocation);
  const cm35Rack   = cm35All.filter((b: any) => b.rack || b.bin);

  const cm35FloorData = buildTypeData(cm35Floor);
  const cm35RackData  = buildTypeData(cm35Rack);
  const fg05Data      = buildTypeData(fg05All);

  const hasCM35  = cm35FloorData.length > 0 || cm35RackData.length > 0;
  const hasFG05  = fg05Data.length > 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:900, color:'#0f172a', margin:0 }}>
            {selectedWorker ? `${selectedWorker.name} — Material Master` : 'Material Master'}
          </h1>
          <p style={{ fontSize:'12px', color:'#94a3b8', marginTop:'4px' }}>
            Inventory analytics — RM composition, movement trends, and warehouse utilization.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ display:'flex', alignItems:'center', gap:'7px', padding:'9px 18px', background:'#2563eb', border:'none', borderRadius:'9px', color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer', opacity: loading ? 0.7 : 1 }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px' }}>
        {[
          { label:'Total Materials', value: materialCodes.size,                  icon: Box,       color:'#2563eb', bg:'#eff6ff' },
          { label:'Total Pallets',   value: totalPallets.toFixed(0),             icon: Layers,    color:'#059669', bg:'#ecfdf5' },
          { label:'Total Weight',    value: (totalKg/1000).toFixed(1)+' T',      icon: Weight,    color:'#7c3aed', bg:'#f5f3ff' },
          { label:'Movements',       value: inwardData.length + outwardData.length, icon: TrendingUp,color:'#d97706', bg:'#fffbeb' },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ ...CARD, display:'flex', alignItems:'center', gap:'14px' }}>
              <div style={{ width:42, height:42, borderRadius:'12px', background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon size={18} style={{ color:c.color }} />
              </div>
              <div>
                <div style={{ fontSize:'22px', fontWeight:900, color:'#0f172a', lineHeight:1 }}>{c.value}</div>
                <div style={{ fontSize:'11px', color:'#94a3b8', fontWeight:600, marginTop:'3px' }}>{c.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── RM Type Pie + RM Bar ───────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:'16px' }}>

        {/* Pie — types only, colour-coded */}
        <div style={CARD}>
          <div style={{ fontSize:'14px', fontWeight:800, color:'#1e40af', marginBottom:'2px' }}>RM — Material Types</div>
          <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'12px' }}>
            {rmTypeData.length} type{rmTypeData.length !== 1 ? 's' : ''} · {rmPallets.toFixed(0)} pallets total
          </div>
          {rmTypeData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 0', color:'#94a3b8', fontSize:'12px' }}>No RM inventory data</div>
          ) : (
            <>
              <div style={{ position:'relative' }}>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart margin={{ top:8, right:8, bottom:8, left:8 }}>
                    <Pie
                      data={rmTypeData}
                      dataKey="pallets"
                      nameKey="name"
                      cx="50%" cy="50%"
                      outerRadius={90}
                      innerRadius={58}
                      paddingAngle={3}
                      label={renderRmSliceLabel}
                      labelLine={false}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {rmTypeData.map((_, i) => (
                        <Cell key={i} fill={COLORS_RM[i % COLORS_RM.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'11px' }}
                      formatter={(value: any, name: any) => [`${Number(value).toFixed(0)} pallets`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center total — sits in the donut hole, independent of chart width */}
                <div style={{
                  position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
                  textAlign:'center', pointerEvents:'none',
                }}>
                  <div style={{ fontSize:'22px', fontWeight:900, color:'#0f172a', lineHeight:1 }}>{rmPallets.toFixed(0)}</div>
                  <div style={{ fontSize:'10px', color:'#94a3b8', fontWeight:600, marginTop:'2px' }}>pallets</div>
                </div>
              </div>
              {/* Legend — own row below the chart, grid-wrapped so long names never collide with the pie */}
              <div style={{
                display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:'6px 10px',
                marginTop:'10px', paddingTop:'10px', borderTop:'1px solid #f1f5f9',
              }}>
                {rmTypeData.map((t, i) => (
                  <div key={t.name} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', minWidth:0 }}>
                    <span style={{ width:9, height:9, borderRadius:'50%', background: COLORS_RM[i % COLORS_RM.length], flexShrink:0 }} />
                    <span style={{ color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</span>
                    <span style={{ color:'#0f172a', fontWeight:800, marginLeft:'auto', flexShrink:0 }}>{t.pallets.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RM bar — pallets & net weight by type */}
        <div style={CARD}>
          <div style={{ fontSize:'14px', fontWeight:800, color:'#0f172a', marginBottom:'2px' }}>RM — Pallets &amp; Net Weight by Type</div>
          <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'12px' }}>Current RM stock grouped by material type</div>
          {rmTypeData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 0', color:'#94a3b8', fontSize:'12px' }}>No RM inventory data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rmTypeData} margin={{ top:4, right:44, bottom:60, left:0 }} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize:10, fill:'#64748b' }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={64}
                  tickLine={false}
                  axisLine={{ stroke:'#e2e8f0' }}
                />
                <YAxis yAxisId="left"  orientation="left"  tick={{ fontSize:9, fill:'#2563eb' }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => v===0?'':v.toFixed(0)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize:9, fill:'#059669' }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => v===0?'':v.toFixed(0)} />
                <Tooltip
                  contentStyle={{ borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'11px' }}
                  labelStyle={{ fontWeight:700, color:'#0f172a', marginBottom:'4px' }}
                  formatter={(v: any, name: any) => [Number(v).toFixed(1), name === 'pallets' ? 'Pallets' : 'Net Wt (kg)']}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'10px', paddingTop:'6px' }}
                  formatter={(v) => v === 'pallets' ? 'Pallets' : 'Net Wt (kg)'} />
                <Bar yAxisId="left"  dataKey="pallets" name="pallets" fill="#2563eb" radius={[4,4,0,0]} />
                <Bar yAxisId="right" dataKey="kg"      name="kg"      fill="#059669" radius={[4,4,0,0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Inward & Outbound Activity — Line Chart ────────────────────── */}
      <div style={CARD}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ width:'4px', height:'18px', background:'#059669', borderRadius:'3px', display:'inline-block' }} />
            <div>
              <div style={{ fontSize:'14px', fontWeight:800, color:'#0f172a' }}>Inward &amp; Outbound Activity</div>
              <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                No. of entries per {activityView === 'day' ? 'day (last 14)' : activityView === 'week' ? 'week (last 10)' : 'month (last 6)'}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:'5px' }}>
            {(['day','week','month'] as const).map(v => (
              <button key={v} onClick={() => setActivityView(v)}
                style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:700, cursor:'pointer', border:'1.5px solid', borderColor:activityView===v?'#059669':'#e2e8f0', background:activityView===v?'#ecfdf5':'#fff', color:activityView===v?'#059669':'#64748b', textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* badges */}
        <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap' }}>
          {[
            { label:'Total Inward',  value: inwardData.length,  color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' },
            { label:'Total Outward', value: outwardData.length, color:'#059669', bg:'#ecfdf5', border:'#a7f3d0' },
            { label:`Inward (period)`,  value: periodInTotal,  color:'#2563eb', bg:'#f8fafc', border:'#e2e8f0' },
            { label:`Outward (period)`, value: periodOutTotal, color:'#059669', bg:'#f8fafc', border:'#e2e8f0' },
          ].map(b => (
            <div key={b.label} style={{ background:b.bg, border:'1px solid '+b.border, borderRadius:'10px', padding:'7px 14px' }}>
              <div style={{ fontSize:'18px', fontWeight:900, color:b.color, lineHeight:1 }}>{b.value}</div>
              <div style={{ fontSize:'10px', color:'#64748b', fontWeight:600, marginTop:'2px' }}>{b.label}</div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineChartData} margin={{ top:4, right:16, bottom: activityView==='week' ? 30 : 10, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize:10, fill:'#64748b' }}
              angle={activityView==='week' ? -25 : 0}
              textAnchor={activityView==='week' ? 'end' : 'middle'}
              interval={0}
              height={activityView==='week' ? 40 : 20}
              tickLine={false}
              axisLine={{ stroke:'#e2e8f0' }}
            />
            <YAxis
              tick={{ fontSize:9, fill:'#64748b' }}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={24}
              tickFormatter={(v) => v===0?'':String(v)}
            />
            <Tooltip
              contentStyle={{ borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'11px' }}
              labelStyle={{ fontWeight:700, color:'#0f172a', marginBottom:'4px' }}
              formatter={(v: any, name: any) => [v, name === 'inward' ? '↓ Inward entries' : '↑ Outbound entries']}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'10px', paddingTop:'6px' }}
              formatter={(name: string) => name === 'inward' ? '↓ Inward' : '↑ Outbound'} />
            <Line
              type="monotone" dataKey="inward" name="inward" stroke="#2563eb" strokeWidth={2.5}
              dot={<ActiveDot stroke="#2563eb" />} activeDot={{ r:6, stroke:'#fff', strokeWidth:2 }}
            />
            <Line
              type="monotone" dataKey="outward" name="outward" stroke="#059669" strokeWidth={2.5}
              strokeDasharray="5 3"
              dot={<ActiveDot stroke="#059669" />} activeDot={{ r:6, stroke:'#fff', strokeWidth:2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Warehouse Utilization ─────────────────────────────────────── */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
          <span style={{ width:'4px', height:'20px', background:'#7c3aed', borderRadius:'3px', display:'inline-block' }} />
          <span style={{ fontSize:'15px', fontWeight:800, color:'#0f172a' }}>Warehouse Utilization</span>
          <span style={{ fontSize:'11px', color:'#94a3b8', fontWeight:600 }}>Pallets (bars, left axis) · Qty in Nos (line, right axis) · by material type</span>
        </div>

        {!hasCM35 && !hasFG05 ? (
          <div style={{ ...CARD, textAlign:'center', padding:'48px', color:'#94a3b8', fontSize:'12px' }}>
            No warehouse location data yet. Assign batches to floor locations or rack bins in the Warehouse Map.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

            {/* CM35 section */}
            {hasCM35 && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'3px 12px' }}>
                    <span style={{ fontSize:'12px', fontWeight:800, color:'#2563eb' }}>CM35</span>
                  </div>
                  <span style={{ fontSize:'12px', color:'#64748b', fontWeight:600 }}>— Floor &amp; Rack Storage</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                  <WHChart
                    data={cm35FloorData}
                    title="CM35 — Floor Storage"
                    subtitle={`${cm35Floor.length} batch${cm35Floor.length!==1?'es':''} across floor locations`}
                    barColor="#2563eb"
                  />
                  <WHChart
                    data={cm35RackData}
                    title="CM35 — Rack Storage"
                    subtitle={`${cm35Rack.length} batch${cm35Rack.length!==1?'es':''} across rack / bin locations`}
                    barColor="#7c3aed"
                  />
                </div>
              </div>
            )}

            {/* FG05 section */}
            {hasFG05 && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <div style={{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', padding:'3px 12px' }}>
                    <span style={{ fontSize:'12px', fontWeight:800, color:'#7c3aed' }}>FG05</span>
                  </div>
                  <span style={{ fontSize:'12px', color:'#64748b', fontWeight:600 }}>— Floor Storage</span>
                </div>
                <div style={{ maxWidth:'560px' }}>
                  <WHChart
                    data={fg05Data}
                    title="FG05 — Floor Storage"
                    subtitle={`${fg05All.length} batch${fg05All.length!==1?'es':''} across FG05 floor locations`}
                    barColor="#7c3aed"
                  />
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
