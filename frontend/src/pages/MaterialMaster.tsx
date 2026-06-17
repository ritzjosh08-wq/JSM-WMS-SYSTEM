import React, { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Box, RefreshCw, TrendingUp, Package, Weight, Layers } from 'lucide-react';

const API = 'http://localhost:5001/api';

const COLORS_RM = ['#2563eb','#3b82f6','#60a5fa','#93c5fd','#1d4ed8','#1e40af','#0284c7','#0369a1'];
const COLORS_FG = ['#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#6d28d9','#5b21b6','#9333ea','#a855f7'];

function parseCF(s: string | null | undefined): any {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
  padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
};
const TH: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700,
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '8px 12px', fontSize: '12px', color: '#374151',
  borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
};

// Custom tooltip for pie
const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: '12px' }}>
      <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>{d.name}</div>
      <div style={{ color: '#64748b' }}>Pallets: <b style={{ color: '#2563eb' }}>{d.pallets || 0}</b></div>
      <div style={{ color: '#64748b' }}>Qty (Nos): <b style={{ color: '#059669' }}>{Number(d.nos || 0).toFixed(0)}</b></div>
      <div style={{ color: '#64748b' }}>Net Wt: <b style={{ color: '#7c3aed' }}>{Number(d.kg || 0).toFixed(1)} kg</b></div>
    </div>
  );
};

export default function MaterialMaster() {
  const [inventory, setInventory]     = useState<any[]>([]);
  const [inwardData, setInwardData]   = useState<any[]>([]);
  const [outwardData, setOutwardData] = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [activeView, setActiveView]   = useState<'pallets' | 'kgs'>('pallets');

  const load = async () => {
    setLoading(true);
    try {
      const [inv, inw, out] = await Promise.all([
        fetch(`${API}/inventory`).then(r => r.json()),
        fetch(`${API}/inward`).then(r => r.json()),
        fetch(`${API}/outward`).then(r => r.json()),
      ]);
      setInventory(Array.isArray(inv) ? inv : inv.inventory ?? []);
      setInwardData(Array.isArray(inw) ? inw : []);
      setOutwardData(Array.isArray(out) ? out : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Build material summary from inventory ──────────────────────────────────
  const materialMap: Record<string, { name: string; pallets: number; kg: number; nos: number; category: string; materialType: string }> = {};
  inventory.forEach((batch: any) => {
    const cf = parseCF(batch.customFields);
    const code = batch.material?.code || '?';
    const cat  = (cf.category || batch.material?.category || 'RM').toUpperCase();
    const type = cf.materialType || batch.material?.materialType || '';
    if (!materialMap[code]) materialMap[code] = { name: `${code}`, pallets: 0, kg: 0, nos: 0, category: cat, materialType: type };
    materialMap[code].pallets += Number(cf.pallets || 0);
    materialMap[code].kg      += Number(cf.netWeight || 0);
    materialMap[code].nos     += Number(batch.quantity || 0);
  });
  const allMaterials = Object.values(materialMap);
  const rmMaterials  = allMaterials.filter(m => m.category.includes('RM'));
  const fgMaterials  = allMaterials.filter(m => m.category.includes('FG'));

  // RM grouped by material type (for pie + bar chart — inventory data only)
  const rmTypeMap: Record<string, { name: string; pallets: number; kg: number; nos: number }> = {};
  rmMaterials.forEach(m => {
    const key = m.materialType || 'Unclassified';
    if (!rmTypeMap[key]) rmTypeMap[key] = { name: key, pallets: 0, kg: 0, nos: 0 };
    rmTypeMap[key].pallets += m.pallets;
    rmTypeMap[key].kg      += m.kg;
    rmTypeMap[key].nos     += m.nos;
  });
  const rmTypeData = Object.values(rmTypeMap).filter(t => t.pallets > 0 || t.kg > 0);

  // ── Movement frequency from inward + outward ───────────────────────────────
  const movementMap: Record<string, { code: string; inQty: number; outQty: number; inCount: number; outCount: number }> = {};
  inwardData.forEach((entry: any) => {
    (entry.lineItems || []).forEach((item: any) => {
      const code = item.materialCode;
      if (!movementMap[code]) movementMap[code] = { code, inQty: 0, outQty: 0, inCount: 0, outCount: 0 };
      movementMap[code].inQty   += Number(item.quantity || 0);
      movementMap[code].inCount += 1;
    });
  });
  outwardData.forEach((entry: any) => {
    (entry.lineItems || []).forEach((item: any) => {
      const code = item.materialCode;
      if (!movementMap[code]) movementMap[code] = { code, inQty: 0, outQty: 0, inCount: 0, outCount: 0 };
      movementMap[code].outQty   += Number(item.pickedQty || 0);
      movementMap[code].outCount += 1;
    });
  });
  const movementData = Object.values(movementMap)
    .sort((a, b) => (b.inCount + b.outCount) - (a.inCount + a.outCount))
    .slice(0, 15); // top 15

  // summary stats
  const totalPallets = allMaterials.reduce((s, m) => s + m.pallets, 0);
  const totalKg      = allMaterials.reduce((s, m) => s + m.kg, 0);
  const totalNos     = allMaterials.reduce((s, m) => s + m.nos, 0);
  const rmPallets    = rmMaterials.reduce((s, m) => s + m.pallets, 0);
  const fgPallets    = fgMaterials.reduce((s, m) => s + m.pallets, 0);

  const pieField = activeView === 'pallets' ? 'pallets' : 'kg';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Material Master</h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Inventory analytics — material distribution, types and movement frequency.</p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', background: '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px' }}>
        {[
          { label: 'Total Materials', value: allMaterials.length, icon: Box, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Total Pallets',   value: totalPallets.toFixed(0), icon: Layers, color: '#059669', bg: '#ecfdf5' },
          { label: 'Total Kgs',       value: `${(totalKg/1000).toFixed(1)} T`, icon: Weight, color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Movement Events', value: Object.values(movementMap).reduce((s,m)=>s+m.inCount+m.outCount,0), icon: TrendingUp, color: '#d97706', bg: '#fffbeb' },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: 44, height: 44, borderRadius: '12px', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} style={{ color: c.color }} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{c.value}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* RM type pie + RM type bar (inventory data only) */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '16px' }}>
        {/* RM type pie — pallets or kg */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e40af' }}>RM — by Type of Material</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{rmTypeData.length} types · {rmPallets.toFixed(0)} pallets total</div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['pallets','kgs'] as const).map(v => (
                <button key={v} onClick={() => setActiveView(v === 'kgs' ? 'kgs' : 'pallets')}
                  style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: activeView===v?'#2563eb':'#e2e8f0', background: activeView===v?'#eff6ff':'#fff', color: activeView===v?'#2563eb':'#64748b' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {rmTypeData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '12px' }}>No RM inventory data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={rmTypeData} dataKey={pieField === 'nos' ? 'nos' : pieField} nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={48} paddingAngle={2}
                  label={({ name, percent }) => percent > 0.05 ? name : ''} labelLine={false}>
                  {rmTypeData.map((_, i) => <Cell key={i} fill={COLORS_RM[i % COLORS_RM.length]} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* RM type bar — pallets + net weight from inventory */}
        <div style={CARD}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>RM Inventory — Pallets &amp; Net Weight by Type</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>Current stock from inventory, grouped by material type</div>
          {rmTypeData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '12px' }}>No RM inventory data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rmTypeData} margin={{ top: 4, right: 12, bottom: 44, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-30} textAnchor="end" interval={0} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: '#2563eb' }} orientation="left" />
                <YAxis yAxisId="right" tick={{ fontSize: 10, fill: '#059669' }} orientation="right" />
                <Tooltip labelStyle={{ fontWeight: 700, fontSize: '12px' }} contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  formatter={(v: any, name: string) => [Number(v).toFixed(1), name === 'pallets' ? 'Pallets' : 'Net Wt (kg)']} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(v) => v === 'pallets' ? 'Pallets' : 'Net Wt (kg)'} />
                <Bar yAxisId="left"  dataKey="pallets" fill="#2563eb" radius={[4,4,0,0]} name="pallets" />
                <Bar yAxisId="right" dataKey="kg"      fill="#059669" radius={[4,4,0,0]} name="kg" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Material table */}
      <div style={CARD}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>
          All Materials — Current Stock
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Material Code','Description','Category','Type','Pallets','Qty (Nos)','Net Wt (kg)','Inward Txns','Outward Txns','Net Movement'].map(h =>
                <th key={h} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>{allMaterials.length === 0 ? (
              <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', color: '#94a3b8', padding: '32px' }}>No inventory data. Load an inward entry to populate.</td></tr>
            ) : allMaterials.map((m, i) => {
              const mv = movementMap[m.name] || { inCount: 0, outCount: 0, inQty: 0, outQty: 0 };
              const isFG = m.category.includes('FG');
              return (
                <tr key={m.name} style={{ background: i%2===0?'#fff':'#f8fafc' }}>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{m.name}</td>
                  <td style={{ ...TD, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inventory.find((b:any) => b.material?.code === m.name)?.material?.description || '—'}</td>
                  <td style={TD}>
                    <span style={{ background: isFG?'#f5f3ff':'#ecfdf5', color: isFG?'#7c3aed':'#059669', border: `1px solid ${isFG?'#ddd6fe':'#a7f3d0'}`, borderRadius: '20px', padding: '1px 8px', fontSize: '10px', fontWeight: 700 }}>{m.category}</span>
                  </td>
                  <td style={{ ...TD, color: '#0891b2', fontWeight: 600 }}>{m.materialType || '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{m.pallets.toFixed(0)}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{m.nos.toFixed(0)}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{m.kg.toFixed(1)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{mv.inCount}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#059669', fontWeight: 700 }}>{mv.outCount}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: mv.inCount >= mv.outCount ? '#059669' : '#dc2626' }}>
                    {mv.inCount >= mv.outCount ? `+${mv.inCount - mv.outCount}` : mv.inCount - mv.outCount}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
