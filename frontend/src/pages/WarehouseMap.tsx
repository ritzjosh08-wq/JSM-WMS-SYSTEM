import React, { useState, useEffect } from 'react';
import { Map, RefreshCw, Plus, Trash2, Save, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const API = 'http://localhost:5001/api';
const MAP_CONFIG_KEY = 'jsm_warehouse_map_config';

function parseCF(s: string | null | undefined): any {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

interface BinConfig {
  id: string;
  label: string;
  zone: string;
  row: number;
  col: number;
}

interface BinState {
  materialCode: string;
  materialType: string;
  category: string;
  pallets: number;
  kg: number;
  stockLocation: string;
  inwardCount: number;
  outwardCount: number;
  lastUsed: string;
}

const ZONE_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  'A': { bg: '#eff6ff', border: '#bfdbfe', label: '#1d4ed8' },
  'B': { bg: '#ecfdf5', border: '#a7f3d0', label: '#059669' },
  'C': { bg: '#fdf4ff', border: '#e9d5ff', label: '#9333ea' },
  'D': { bg: '#fff7ed', border: '#fed7aa', label: '#ea580c' },
  'E': { bg: '#f0fdf4', border: '#bbf7d0', label: '#16a34a' },
};

const DEFAULT_BINS: BinConfig[] = [
  // Zone A — 3 rows × 4 cols
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `A-${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`,
    label: `A-${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`,
    zone: 'A', row: Math.floor(i / 4), col: i % 4,
  })),
  // Zone B — 3 rows × 4 cols
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `B-${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`,
    label: `B-${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`,
    zone: 'B', row: Math.floor(i / 4), col: i % 4,
  })),
  // Zone C — 2 rows × 4 cols
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `C-${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`,
    label: `C-${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`,
    zone: 'C', row: Math.floor(i / 4), col: i % 4,
  })),
];

export default function WarehouseMap() {
  const [bins, setBins]           = useState<BinConfig[]>(() => {
    try { const s = localStorage.getItem(MAP_CONFIG_KEY); return s ? JSON.parse(s) : DEFAULT_BINS; } catch { return DEFAULT_BINS; }
  });
  const [binStates, setBinStates] = useState<Record<string, BinState>>({});
  const [selected, setSelected]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const user = useAuthStore(s => s.user);
  const isViewer = user?.role === 'CUSTOMER';
  const [editMode, setEditMode]   = useState(false);
  const [newBin, setNewBin]       = useState({ label: '', zone: 'A', row: 0, col: 0 });
  const [movFreq, setMovFreq]     = useState<Record<string, { in: number; out: number }>>({});

  const saveBins = (b: BinConfig[]) => {
    setBins(b);
    localStorage.setItem(MAP_CONFIG_KEY, JSON.stringify(b));
  };

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, inRes, outRes] = await Promise.all([
        fetch(`${API}/inventory`).then(r => r.json()),
        fetch(`${API}/inward`).then(r => r.json()),
        fetch(`${API}/outward`).then(r => r.json()),
      ]);

      const inventory: any[] = Array.isArray(invRes) ? invRes : invRes.inventory ?? [];
      const inward: any[]    = Array.isArray(inRes) ? inRes : [];
      const outward: any[]   = Array.isArray(outRes) ? outRes : [];

      // Build bin state from inventory batches
      const states: Record<string, BinState> = {};
      inventory.forEach((batch: any) => {
        const cf = parseCF(batch.customFields);
        // match by binLocation or stockLocation
        const loc = (cf.binLocation || cf.stockLocation || '').trim().toUpperCase();
        if (!loc) return;
        if (!states[loc]) states[loc] = { materialCode: '', materialType: '', category: '', pallets: 0, kg: 0, stockLocation: loc, inwardCount: 0, outwardCount: 0, lastUsed: '' };
        states[loc].materialCode  = states[loc].materialCode || batch.material?.code || '';
        states[loc].materialType  = states[loc].materialType || cf.materialType || batch.material?.materialType || '';
        states[loc].category      = states[loc].category || cf.category || batch.material?.category || '';
        states[loc].pallets      += Number(cf.pallets || 0);
        states[loc].kg           += Number(cf.netWeight || 0);
        states[loc].lastUsed      = cf.inwardDate || '';
      });

      // Movement frequency from inward + outward
      const freq: Record<string, { in: number; out: number }> = {};
      inward.forEach((entry: any) => {
        (entry.lineItems || []).forEach((item: any) => {
          const cf = parseCF(item.customFields);
          const loc = (item.binLocation || cf.stockLocation || '').trim().toUpperCase();
          if (!loc) return;
          if (!freq[loc]) freq[loc] = { in: 0, out: 0 };
          freq[loc].in += 1;
          if (states[loc]) states[loc].inwardCount += 1;
        });
      });
      outward.forEach((entry: any) => {
        (entry.lineItems || []).forEach((item: any) => {
          const cf = parseCF(item.customFields);
          const loc = (cf.stockLocation || '').trim().toUpperCase();
          if (!loc) return;
          if (!freq[loc]) freq[loc] = { in: 0, out: 0 };
          freq[loc].out += 1;
          if (states[loc]) states[loc].outwardCount += 1;
        });
      });

      setBinStates(states);
      setMovFreq(freq);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const zones = [...new Set(bins.map(b => b.zone))].sort();
  const selectedBin = bins.find(b => b.id === selected);
  const selectedState = selected ? binStates[selected] || binStates[selected?.toUpperCase()] : null;
  const selectedFreq  = selected ? movFreq[selected] || movFreq[selected?.toUpperCase()] || { in: 0, out: 0 } : { in: 0, out: 0 };

  const getBinStatus = (bin: BinConfig) => {
    const state = binStates[bin.id] || binStates[bin.id.toUpperCase()] || binStates[bin.label.toUpperCase()];
    if (!state) return 'vacant';
    if (state.pallets > 0 || state.kg > 0) return 'full';
    return 'occupied';
  };

  const getBinState = (bin: BinConfig) => binStates[bin.id] || binStates[bin.id.toUpperCase()] || binStates[bin.label.toUpperCase()] || null;

  const getFreqLevel = (bin: BinConfig) => {
    const f = movFreq[bin.id] || movFreq[bin.label.toUpperCase()] || { in: 0, out: 0 };
    const total = f.in + f.out;
    if (total === 0) return 'none';
    if (total <= 2) return 'low';
    if (total <= 6) return 'medium';
    return 'high';
  };

  const statusColor = {
    vacant:   { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8' },
    occupied: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    full:     { bg: '#ecfdf5', border: '#86efac', text: '#166534' },
  };
  const freqDot = { none: '#e2e8f0', low: '#93c5fd', medium: '#f59e0b', high: '#ef4444' };

  const totalBins   = bins.length;
  const filledBins  = bins.filter(b => getBinStatus(b) === 'full').length;
  const vacantBins  = totalBins - filledBins;
  const utilization = totalBins > 0 ? Math.round((filledBins / totalBins) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Warehouse Map</h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Live bin occupancy, material traceability and movement frequency.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isViewer && (
            <button onClick={() => setEditMode(!editMode)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: editMode?'#1e40af':'#fff', border: '1.5px solid', borderColor: editMode?'#1e40af':'#e2e8f0', borderRadius: '9px', color: editMode?'#fff':'#374151', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              <Map size={13} /> {editMode ? 'Done Editing' : 'Configure Bins'}
            </button>
          )}
          <button onClick={load} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {[
          { label: 'Total Bins',    value: totalBins,        color: '#2563eb', bg: '#eff6ff' },
          { label: 'Occupied',      value: filledBins,       color: '#059669', bg: '#ecfdf5' },
          { label: 'Vacant',        value: vacantBins,       color: '#94a3b8', bg: '#f8fafc' },
          { label: 'Utilization',   value: `${utilization}%`, color: utilization>80?'#dc2626':utilization>50?'#d97706':'#059669', bg: '#f8fafc' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1.5px solid ${c.bg === '#f8fafc' ? '#e2e8f0' : c.bg}`, borderRadius: '12px', padding: '14px 18px' }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151' }}>Legend:</span>
        {[
          { label: 'Full', bg: '#ecfdf5', border: '#86efac', text: '#166534' },
          { label: 'Vacant', bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: 16, height: 16, borderRadius: '4px', background: l.bg, border: `1.5px solid ${l.border}` }} />
            <span style={{ fontSize: '11px', color: l.text, fontWeight: 600 }}>{l.label}</span>
          </div>
        ))}
        <div style={{ width: '1px', height: '16px', background: '#e2e8f0' }} />
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151' }}>Freq dot:</span>
        {[
          { label: 'None', color: '#e2e8f0' }, { label: 'Low', color: '#93c5fd' },
          { label: 'Medium', color: '#f59e0b' }, { label: 'High', color: '#ef4444' },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />
            <span style={{ fontSize: '11px', color: '#64748b' }}>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Main layout: map + detail panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', alignItems: 'start' }}>

        {/* Map grid */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

          {editMode && (
            <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '10px' }}>Add New Bin</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['label','zone'].map(f => (
                  <input key={f} placeholder={f === 'label' ? 'Bin ID (e.g. A-A1)' : 'Zone (A/B/C…)'}
                    value={(newBin as any)[f]} onChange={e => setNewBin(p => ({ ...p, [f]: e.target.value.toUpperCase() }))}
                    style={{ border: '1.5px solid #bfdbfe', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', width: f === 'label' ? '140px' : '80px', outline: 'none' }} />
                ))}
                {['row','col'].map(f => (
                  <input key={f} type="number" placeholder={f} min={0} max={10}
                    value={(newBin as any)[f]} onChange={e => setNewBin(p => ({ ...p, [f]: Number(e.target.value) }))}
                    style={{ border: '1.5px solid #bfdbfe', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', width: '70px', outline: 'none' }} />
                ))}
                <button onClick={() => {
                  if (!newBin.label) return;
                  saveBins([...bins, { id: newBin.label, ...newBin }]);
                  setNewBin({ label: '', zone: 'A', row: 0, col: 0 });
                }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', background: '#2563eb', border: 'none', borderRadius: '7px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={12} /> Add
                </button>
                <button onClick={() => saveBins(DEFAULT_BINS)}
                  style={{ padding: '6px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
                  Reset to Default
                </button>
              </div>
            </div>
          )}

          {zones.map(zone => {
            const zoneBins = bins.filter(b => b.zone === zone);
            const maxRow = Math.max(...zoneBins.map(b => b.row));
            const maxCol = Math.max(...zoneBins.map(b => b.col));
            const zc = ZONE_COLORS[zone] || ZONE_COLORS['A'];
            return (
              <div key={zone} style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ background: zc.bg, border: `1.5px solid ${zc.border}`, borderRadius: '6px', padding: '2px 10px', fontSize: '11px', fontWeight: 800, color: zc.label }}>
                    ZONE {zone}
                  </div>
                  <div style={{ flex: 1, height: '1px', background: zc.border }} />
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {zoneBins.filter(b => getBinStatus(b) === 'full').length}/{zoneBins.length} occupied
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxCol + 1}, 1fr)`, gap: '6px' }}>
                  {Array.from({ length: maxRow + 1 }, (_, row) =>
                    Array.from({ length: maxCol + 1 }, (_, col) => {
                      const bin = zoneBins.find(b => b.row === row && b.col === col);
                      if (!bin) return <div key={`${row}-${col}`} />;
                      const status = getBinStatus(bin);
                      const state  = getBinState(bin);
                      const freq   = getFreqLevel(bin);
                      const sc = statusColor[status];
                      const isSelected = selected === bin.id;
                      return (
                        <div key={bin.id} onClick={() => setSelected(isSelected ? null : bin.id)}
                          style={{ position: 'relative', background: sc.bg, border: `2px solid ${isSelected ? '#2563eb' : sc.border}`, borderRadius: '8px', padding: '8px 6px', cursor: 'pointer', transition: 'all 0.15s', minWidth: '72px', boxShadow: isSelected ? '0 0 0 3px #bfdbfe' : 'none' }}>
                          {/* Freq dot */}
                          <div style={{ position: 'absolute', top: '5px', right: '5px', width: '7px', height: '7px', borderRadius: '50%', background: freqDot[freq] }} />
                          {/* Delete in edit mode */}
                          {editMode && (
                            <button onClick={e => { e.stopPropagation(); saveBins(bins.filter(b => b.id !== bin.id)); }}
                              style={{ position: 'absolute', top: '2px', left: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '0' }}>
                              <Trash2 size={10} />
                            </button>
                          )}
                          <div style={{ fontSize: '10px', fontWeight: 800, color: sc.text, textAlign: 'center', marginBottom: '2px' }}>{bin.label}</div>
                          {state ? (
                            <>
                              <div style={{ fontSize: '9px', color: '#374151', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{state.materialCode}</div>
                              <div style={{ fontSize: '8px', color: '#94a3b8', textAlign: 'center' }}>{state.materialType || state.category}</div>
                              {state.pallets > 0 && <div style={{ fontSize: '8px', color: '#059669', textAlign: 'center', fontWeight: 700 }}>{state.pallets.toFixed(0)} plt</div>}
                            </>
                          ) : (
                            <div style={{ fontSize: '9px', color: '#cbd5e1', textAlign: 'center', marginTop: '2px' }}>Vacant</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', position: 'sticky', top: 0 }}>
          {!selected ? (
            <div style={{ textAlign: 'center', padding: '32px 12px', color: '#94a3b8' }}>
              <Info size={28} style={{ marginBottom: '10px', opacity: 0.3 }} />
              <div style={{ fontSize: '12px', fontWeight: 700 }}>Click a bin to see details</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>Bin {selectedBin?.label}</div>
                <span style={{
                  background: getBinStatus(selectedBin!) === 'full' ? '#ecfdf5' : '#f8fafc',
                  color: getBinStatus(selectedBin!) === 'full' ? '#059669' : '#94a3b8',
                  border: `1px solid ${getBinStatus(selectedBin!) === 'full' ? '#86efac' : '#e2e8f0'}`,
                  borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: 700
                }}>{getBinStatus(selectedBin!) === 'full' ? 'OCCUPIED' : 'VACANT'}</span>
              </div>

              {selectedState ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'Material Code', value: selectedState.materialCode, mono: true, color: '#1e40af' },
                    { label: 'Type', value: selectedState.materialType || '—', color: '#0891b2' },
                    { label: 'Category', value: selectedState.category || '—', color: selectedState.category?.includes('FG') ? '#7c3aed' : '#059669' },
                    { label: 'Pallets', value: selectedState.pallets.toFixed(0), color: '#374151' },
                    { label: 'Net Weight', value: `${selectedState.kg.toFixed(1)} kg`, color: '#374151' },
                    { label: 'Last Inward', value: selectedState.lastUsed || '—', color: '#64748b' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: row.color, fontFamily: row.mono ? 'monospace' : undefined }}>{row.value}</span>
                    </div>
                  ))}

                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', marginTop: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Movement Frequency</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1, background: '#eff6ff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#2563eb' }}>{selectedFreq.in}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Inward</div>
                      </div>
                      <div style={{ flex: 1, background: '#ecfdf5', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669' }}>{selectedFreq.out}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Outward</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                      Frequency: <b style={{ color: ['none','low'].includes(getFreqLevel(selectedBin!)) ? '#94a3b8' : getFreqLevel(selectedBin!) === 'medium' ? '#d97706' : '#dc2626' }}>
                        {getFreqLevel(selectedBin!).toUpperCase()}
                      </b>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '12px' }}>No stock assigned to this bin.</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Bin location must match inward records.</div>
                </div>
              )}
            </>
          )}

          {/* Zone summary */}
          <div style={{ marginTop: '18px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Zone Summary</div>
            {zones.map(zone => {
              const zoneBins  = bins.filter(b => b.zone === zone);
              const filled    = zoneBins.filter(b => getBinStatus(b) === 'full').length;
              const pct       = zoneBins.length > 0 ? Math.round((filled / zoneBins.length) * 100) : 0;
              const zc        = ZONE_COLORS[zone] || ZONE_COLORS['A'];
              return (
                <div key={zone} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: zc.label }}>Zone {zone}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{filled}/{zoneBins.length} · {pct}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981', borderRadius: '3px', transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
