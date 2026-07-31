import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Info, Layers, Grid3X3, Warehouse } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

// ── CM35 physical floor layout ────────────────────────────────────────
// Excluded (staging/loading) zones shown as grey dividers
const FLOOR_LAYOUT = [
  // Section 1 — top half of warehouse (rows A–F)
  [
    { group: 'A', zones: [{ name: 'A1', excluded: 'STAGING' }, { name: 'A2' }, { name: 'A3' }] },
    { group: 'B', zones: [{ name: 'B1', excluded: 'LOADING' }, { name: 'B2' }, { name: 'B3' }] },
    { group: 'C', zones: [{ name: 'C1' }, { name: 'C2' }, { name: 'C3' }] },
    { group: 'D', zones: [{ name: 'D1' }, { name: 'D2' }, { name: 'D3' }] },
    { group: 'E', zones: [{ name: 'E1' }, { name: 'E2' }, { name: 'E3' }] },
    { group: 'F', zones: [{ name: 'F1' }, { name: 'F2' }, { name: 'F3' }] },
  ],
  // Section 2 — bottom half of warehouse (rows G–M)
  [
    { group: 'G', zones: [{ name: 'G1' }, { name: 'G2' }, { name: 'G3' }] },
    { group: 'H', zones: [{ name: 'H1' }, { name: 'H2' }, { name: 'H3' }] },
    { group: 'J', zones: [{ name: 'J1' }, { name: 'J2' }, { name: 'J3' }] },
    { group: 'K', zones: [{ name: 'K1', excluded: 'LOADING' }, { name: 'K2' }, { name: 'K3' }] },
    { group: 'L', zones: [{ name: 'L1' }, { name: 'L2' }, { name: 'L3' }] },
    { group: 'M', zones: [{ name: 'M1' }, { name: 'M2' }, { name: 'M3' }] },
  ],
] as const;

// Rack groups in physical order (CM35 only)
const RACK_ORDER = ['RA', 'RB', 'RH', 'RI', 'RN', 'RO', 'RP', 'RQ'];

// ── FG05 physical floor layout ────────────────────────────────────────
// Excluded: A2 (WH Entrance), B2 (Staging Area)
const FG05_LAYOUT = [
  // Section 1 — A–F (2 sub-zones each)
  [
    { group: 'A', zones: [{ name: 'A1' }, { name: 'A2', excluded: 'WH ENTRANCE' }] },
    { group: 'B', zones: [{ name: 'B1' }, { name: 'B2', excluded: 'STAGING' }] },
    { group: 'C', zones: [{ name: 'C1' }, { name: 'C2' }] },
    { group: 'D', zones: [{ name: 'D1' }, { name: 'D2' }] },
    { group: 'E', zones: [{ name: 'E1' }, { name: 'E2' }] },
    { group: 'F', zones: [{ name: 'F1' }, { name: 'F2' }] },
  ],
  // Section 2 — G–L (2 sub-zones each)
  [
    { group: 'G', zones: [{ name: 'G1' }, { name: 'G2' }] },
    { group: 'H', zones: [{ name: 'H1' }, { name: 'H2' }] },
    { group: 'I', zones: [{ name: 'I1' }, { name: 'I2' }] },
    { group: 'J', zones: [{ name: 'J1' }, { name: 'J2' }] },
    { group: 'K', zones: [{ name: 'K1' }, { name: 'K2' }] },
    { group: 'L', zones: [{ name: 'L1' }, { name: 'L2' }] },
  ],
] as const;

const WAREHOUSE_CONFIGS = {
  CM35: { label: 'CM35 Warehouse', layout: null as any, hasRacks: true },
  FG05: { label: 'FG05 Warehouse', layout: FG05_LAYOUT, hasRacks: false },
} as const;
type WarehouseCode = keyof typeof WAREHOUSE_CONFIGS;

interface FloorLocation { id: string; zone: string; code: string; usedCapacity: number; }
interface Bin { id: string; code: string; usedCapacity: number; }
interface RackLevel { id: string; code: string; bins: Bin[]; }
interface RackRow { id: string; code: string; levels: RackLevel[]; }
interface Rack { id: string; code: string; rows: RackRow[]; }
interface InventoryBatch {
  id: string; binId?: string; floorLocationId?: string;
  quantity: number; batchNumber: string; customFields?: string;
  material?: { code: string; materialType: string; category?: string; huUnit?: string; };
}

function parseCF(s?: string | null) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

/** Parse DD/MM/YYYY, YYYY-MM-DD, ISO strings, or Excel serial numbers safely */
function parseDateStr(raw: string | null | undefined): string {
  if (!raw) return '—';
  const s = String(raw).trim();
  if (!s) return '—';

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) {
    const d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // YYYY-MM-DD or YYYY/MM/DD (with optional time)
  const ymd = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(s);
  if (ymd) {
    const d = new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ISO string / any other format
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return s; // return raw string rather than "Invalid Date"
}

export default function WarehouseMap() {
  const selectedWorker = useAuthStore(s => s.selectedWorker);
  const [tab, setTab] = useState<'floor' | 'rack'>('floor');
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [floor, setFloor] = useState<FloorLocation[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [inventory, setInventory] = useState<InventoryBatch[]>([]);
  const [selected, setSelected] = useState<{ type: 'floor' | 'bin'; id: string } | null>(null);
  // When Admin has a worker selected, default to that worker's warehouse (only if it's a known config)
  const workerWH = (selectedWorker?.warehouseCode || selectedWorker?.warehouseCodes?.[0]) as WarehouseCode | undefined;
  const defaultWH: WarehouseCode = (workerWH && workerWH in WAREHOUSE_CONFIGS) ? workerWH : 'CM35';
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseCode>(defaultWH);

  // Sync warehouse selector when the viewed worker/scope changes
  useEffect(() => {
    const wc = (selectedWorker?.warehouseCode || selectedWorker?.warehouseCodes?.[0]) as WarehouseCode | undefined;
    if (wc && wc in WAREHOUSE_CONFIGS) {
      setSelectedWarehouse(wc);
    }
  }, [selectedWorker]);

  // Derived lookups
  const binOccupancy = React.useMemo(() => {
    const map = new Map<string, InventoryBatch[]>();
    inventory.forEach(inv => {
      if ((inv.quantity ?? 0) <= 0) return;
      const key = inv.binId || inv.floorLocationId;
      if (key) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(inv);
      }
    });
    return map;
  }, [inventory]);

  const load = useCallback(async () => {
    setLoading(true);
    setSeeding(false);
    try {
      const r = await fetch(`${API}/warehouse/layout?warehouse=${selectedWarehouse}`);
      if (!r.ok) throw new Error('Failed to load layout');
      const data = await r.json();
      if (data.racks?.length === 0 && data.floorLocations?.length === 0) setSeeding(true);
      setFloor(data.floorLocations || []);
      setRacks(data.racks || []);
      setInventory(data.inventory || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedWarehouse]);

  useEffect(() => { load(); }, [load]);

  function switchWarehouse(code: WarehouseCode) {
    if (code === selectedWarehouse) return;
    setSelectedWarehouse(code);
    setSelected(null);
    setTab('floor');
  }

  // Floor bins grouped by zone
  const floorByZone = React.useMemo(() => {
    const m = new Map<string, FloorLocation[]>();
    floor.forEach(f => {
      if (!m.has(f.zone)) m.set(f.zone, []);
      m.get(f.zone)!.push(f);
    });
    return m;
  }, [floor]);

  // Racks indexed by code
  const rackByCode = React.useMemo(() => {
    const m = new Map<string, Rack>();
    racks.forEach(r => m.set(r.code, r));
    return m;
  }, [racks]);

  const totalFloor   = floor.length;
  const totalRack    = racks.reduce((s, r) => s + r.rows.reduce((ss, row) => ss + row.levels.reduce((sss, l) => sss + l.bins.length, 0), 0), 0);
  const totalBins    = totalFloor + totalRack;
  const occupiedBins = binOccupancy.size;

  // Bin availability — split by floor vs rack
  const occupiedFloor = floor.filter(f => binOccupancy.has(f.id)).length;
  const emptyFloor    = totalFloor - occupiedFloor;
  const allRackBins   = racks.flatMap(r => r.rows.flatMap(row => row.levels.flatMap(l => l.bins)));
  const occupiedRack  = allRackBins.filter(b => binOccupancy.has(b.id)).length;
  const emptyRack     = totalRack - occupiedRack;

  function getFloorStatus(loc: FloorLocation) {
    const invs = binOccupancy.get(loc.id) || [];
    return invs.length > 0 ? 'occupied' : 'vacant';
  }
  function getBinStatus(bin: Bin) {
    const invs = binOccupancy.get(bin.id) || [];
    return invs.length > 0 ? 'occupied' : 'vacant';
  }
  function getFloorInv(loc: FloorLocation) { return binOccupancy.get(loc.id) || []; }
  function getBinInv(bin: Bin) { return binOccupancy.get(bin.id) || []; }

  const selectedDetails = React.useMemo(() => {
    if (!selected) return null;
    if (selected.type === 'floor') {
      const loc = floor.find(f => f.id === selected.id);
      if (!loc) return null;
      const invs = getFloorInv(loc);
      return { label: loc.code, zone: loc.zone, invs };
    } else {
      // find bin across all racks
      for (const rack of racks) {
        for (const row of rack.rows) {
          for (const level of row.levels) {
            const bin = level.bins.find(b => b.id === selected.id);
            if (bin) {
              const invs = getBinInv(bin);
              return { label: bin.code, zone: rack.code, invs };
            }
          }
        }
      }
      return null;
    }
  }, [selected, floor, racks, binOccupancy]);

  // ── Colour helpers ────────────────────────────────────────────────────
  const S = {
    vacant:   { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8' },
    occupied: { bg: '#ecfdf5', border: '#86efac', text: '#15803d' },
    excluded: { bg: '#f1f5f9', border: '#e2e8f0', text: '#cbd5e1' },
  };

  // ── Render floor zone column ──────────────────────────────────────────
  function FloorZone({ zone, excluded }: { zone: string; excluded?: string }) {
    const bins = floorByZone.get(zone) || [];
    const isExcluded = !!excluded;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
        {/* Zone header */}
        <div style={{
          background: isExcluded ? '#f1f5f9' : '#eff6ff',
          border: `1px solid ${isExcluded ? '#e2e8f0' : '#bfdbfe'}`,
          borderRadius: '5px', padding: '2px 4px', textAlign: 'center',
          fontSize: '9px', fontWeight: 800,
          color: isExcluded ? '#94a3b8' : '#1d4ed8',
          marginBottom: '2px',
        }}>
          {zone}
        </div>
        {isExcluded ? (
          <div style={{ background: '#f1f5f9', border: '1px dashed #e2e8f0', borderRadius: '5px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '7px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.1 }}>{excluded}</span>
          </div>
        ) : (
          bins.map(loc => {
            const status = getFloorStatus(loc);
            const sc = S[status];
            const isSelected = selected?.id === loc.id;
            return (
              <div key={loc.id} onClick={() => setSelected(isSelected ? null : { type: 'floor', id: loc.id })}
                style={{
                  background: isSelected ? '#dbeafe' : sc.bg,
                  border: `1.5px solid ${isSelected ? '#3b82f6' : sc.border}`,
                  borderRadius: '4px', padding: '2px 3px', cursor: 'pointer',
                  textAlign: 'center', transition: 'all 0.1s',
                  boxShadow: isSelected ? '0 0 0 2px #bfdbfe' : 'none',
                }}>
                <div style={{ fontSize: '8px', fontWeight: 700, color: sc.text }}>{loc.code}</div>
                {status === 'occupied' && (
                  <div style={{ fontSize: '7px', color: '#059669', fontWeight: 600 }}>●</div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  // ── Render rack column ────────────────────────────────────────────────
  function RackColumn({ row }: { row: RackRow }) {
    // Collect all bin codes from this row's levels, in position order
    const allBins = row.levels.flatMap(l => l.bins);
    // Detect gangways: gaps in the original bin numbering
    // We render each bin as a slot; show gangway dividers when numbers skip by > 1
    const withGangways: Array<{ type: 'bin'; bin: Bin } | { type: 'gangway' }> = [];
    for (let i = 0; i < allBins.length; i++) {
      if (i > 0) {
        const prevNum = parseInt(allBins[i - 1].code.split('-').pop()!, 10);
        const curNum  = parseInt(allBins[i].code.split('-').pop()!, 10);
        if (curNum - prevNum > 1) {
          withGangways.push({ type: 'gangway' });
        }
      }
      withGangways.push({ type: 'bin', bin: allBins[i] });
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '44px' }}>
        {/* Column header */}
        <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px', textAlign: 'center', fontSize: '8px', fontWeight: 800, color: '#64748b', marginBottom: '2px' }}>
          {row.code}
        </div>
        {withGangways.map((item, idx) => {
          if (item.type === 'gangway') {
            return (
              <div key={`g-${idx}`} style={{ height: '6px', background: '#e2e8f0', borderRadius: '2px', margin: '1px 0', opacity: 0.6 }}
                title="Gangway" />
            );
          }
          const { bin } = item;
          const status = getBinStatus(bin);
          const sc = S[status];
          const isSelected = selected?.id === bin.id;
          return (
            <div key={bin.id} onClick={() => setSelected(isSelected ? null : { type: 'bin', id: bin.id })}
              style={{
                background: isSelected ? '#dbeafe' : sc.bg,
                border: `1px solid ${isSelected ? '#3b82f6' : sc.border}`,
                borderRadius: '3px', padding: '1px 2px', cursor: 'pointer',
                textAlign: 'center', transition: 'all 0.1s',
              }}
              title={bin.code}>
              <div style={{ fontSize: '7px', fontWeight: status === 'occupied' ? 800 : 500, color: sc.text, whiteSpace: 'nowrap' }}>
                {bin.code.split('-').pop()}
                {status === 'occupied' && ' ●'}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
            {WAREHOUSE_CONFIGS[selectedWarehouse].label} Map
          </h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', margin: 0 }}>
            Real-time bin occupancy — {totalFloor} floor bins{selectedWarehouse === 'CM35' ? ` · ${totalRack} rack bins` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Warehouse switcher */}
          <div style={{ display: 'flex', gap: '3px', background: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
            {(Object.keys(WAREHOUSE_CONFIGS) as WarehouseCode[]).map(code => (
              <button key={code} onClick={() => switchWarehouse(code)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', background: selectedWarehouse === code ? '#1e3a5f' : 'transparent', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: selectedWarehouse === code ? '#fff' : '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>
                <Warehouse size={12} /> {code}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedWarehouse === 'CM35' ? 'repeat(4,1fr)' : 'repeat(3,1fr)', gap: '10px' }}>
        {[
          { label: 'Total Bins',   value: totalBins,    color: '#2563eb', bg: '#eff6ff', sub: undefined, show: true },
          { label: 'Floor Bins',   value: totalFloor,   color: '#7c3aed', bg: '#f5f3ff', sub: undefined, show: true },
          { label: 'Rack Bins',    value: totalRack,    color: '#0891b2', bg: '#ecfeff', sub: undefined, show: selectedWarehouse === 'CM35' },
          { label: 'Occupied',     value: occupiedFloor + occupiedRack, color: '#059669', bg: '#ecfdf5',
            sub: selectedWarehouse === 'CM35' ? `${occupiedFloor} floor · ${occupiedRack} rack` : `${occupiedFloor} floor`, show: true },
        ].filter(c => c.show).map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: '12px', padding: '12px 16px', border: `1.5px solid ${c.bg}` }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: c.color }}>{loading ? '—' : c.value}</div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{c.label}</div>
            {c.sub && <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>{loading ? '' : c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Bin Availability Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedWarehouse === 'CM35' ? 'repeat(2,1fr)' : '1fr', gap: '10px' }}>
        {[
          { label: 'Empty Floor Bins', empty: emptyFloor, total: totalFloor, occupied: occupiedFloor, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', show: true },
          { label: 'Empty Rack Bins',  empty: emptyRack,  total: totalRack,  occupied: occupiedRack,  color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', show: selectedWarehouse === 'CM35' },
        ].filter(c => c.show).map(c => {
          const pct = c.total > 0 ? Math.round((c.occupied / c.total) * 100) : 0;
          return (
            <div key={c.label} style={{ background: '#fff', border: `1.5px solid ${c.border}`, borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</span>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>{c.occupied} occupied · {c.total} total</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '32px', fontWeight: 900, color: c.color, lineHeight: 1 }}>{loading ? '—' : c.empty}</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>free bins</span>
              </div>
              <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : c.color, borderRadius: '3px', transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>{pct}% full</div>
            </div>
          );
        })}
      </div>

      {/* Seeding notice */}
      {seeding && (
        <div style={{ background: '#fefce8', border: '1.5px solid #fde047', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#713f12' }}>
          ⚙️ Setting up {selectedWarehouse} warehouse data for the first time — this may take a few seconds. Please refresh after a moment.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        {([['floor', 'Floor Layout', Grid3X3], ['rack', 'Rack Layout', Layers]] as const)
          .filter(([t]) => t !== 'rack' || selectedWarehouse === 'CM35')
          .map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t as 'floor' | 'rack')}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 18px', background: tab === t ? '#fff' : 'transparent', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: tab === t ? '#1e40af' : '#64748b', cursor: 'pointer', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', width: 'fit-content' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#374151' }}>Legend:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 12, height: 12, background: '#ecfdf5', border: '1.5px solid #86efac', borderRadius: '3px' }} />
          <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 600 }}>Occupied</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 12, height: 12, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '3px' }} />
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Vacant</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 12, height: 6, background: '#e2e8f0', borderRadius: '2px' }} />
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Gangway</span>
        </div>
      </div>

      {/* Main content: map full-width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Map area */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '13px' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px', opacity: 0.4 }} />
              <div>Loading {selectedWarehouse} layout…</div>
            </div>
          ) : tab === 'floor' ? (

            // ── FLOOR TAB — card-grid matching rack design ─────────────
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(selectedWarehouse === 'FG05' ? FG05_LAYOUT : FLOOR_LAYOUT).map((section, si) => (
                <div key={si}>
                  {/* Section label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 10px', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>
                      SECTION {si + 1}
                    </div>
                    <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }} />
                  </div>

                  {/* auto-fit grid — fills available width, no horizontal overflow */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px' }}>
                    {section.map(group => {
                      // Count bins and occupancy for this group
                      const activeZones = group.zones.filter(z => !('excluded' in z));
                      const groupBins = activeZones.flatMap(z => floorByZone.get(z.name) || []);
                      const groupOccupied = groupBins.filter(f => binOccupancy.has(f.id)).length;
                      const pct = groupBins.length > 0 ? Math.round((groupOccupied / groupBins.length) * 100) : 0;
                      return (
                        <div key={group.group} style={{ border: '1.5px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                          {/* Card header — same navy as rack */}
                          <div style={{ background: '#1e3a5f', padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '13px', fontWeight: 900, color: '#fff', letterSpacing: '0.5px' }}>{group.group}</span>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{groupOccupied}/{groupBins.length}</span>
                          </div>
                          {/* Utilisation bar */}
                          <div style={{ height: '3px', background: '#e2e8f0' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981', transition: 'width 0.3s' }} />
                          </div>
                          {/* 3 zone columns */}
                          <div style={{ padding: '6px', overflowY: 'auto', maxHeight: '300px' }}>
                            <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
                              {group.zones.map(z => (
                                <FloorZone key={z.name} zone={z.name} excluded={'excluded' in z ? z.excluded : undefined} />
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          ) : (

            // ── RACK TAB — 4×2 parallel grid ──────────────────────────
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {RACK_ORDER.map(rackCode => {
                const rack = rackByCode.get(rackCode);
                if (!rack) return (
                  <div key={rackCode} style={{ background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: '10px', padding: '16px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
                    {rackCode}…
                  </div>
                );
                const totalBinsInRack = rack.rows.reduce((s, row) => s + row.levels.reduce((ss, l) => ss + l.bins.length, 0), 0);
                const occupiedInRack  = rack.rows.reduce((s, row) => s + row.levels.reduce((ss, l) => ss + l.bins.filter(b => binOccupancy.has(b.id)).length, 0), 0);
                const pct = totalBinsInRack > 0 ? Math.round((occupiedInRack / totalBinsInRack) * 100) : 0;
                return (
                  <div key={rackCode} style={{ border: '1.5px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                    {/* Rack header */}
                    <div style={{ background: '#1e3a5f', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: '#fff', letterSpacing: '0.5px' }}>{rackCode}</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{occupiedInRack}/{totalBinsInRack}</span>
                    </div>
                    {/* Utilisation bar */}
                    <div style={{ height: '3px', background: '#e2e8f0' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981', transition: 'width 0.3s' }} />
                    </div>
                    {/* Columns — horizontal scroll if needed; fixed height with vertical scroll */}
                    <div style={{ padding: '10px', overflowX: 'auto', overflowY: 'auto', maxHeight: '340px' }}>
                      <div style={{ display: 'flex', gap: '6px', minWidth: 'max-content' }}>
                        {rack.rows.sort((a, b) => a.code.localeCompare(b.code)).map(row => (
                          <RackColumn key={row.id} row={row} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel — full-width, below map, only shown when a bin is selected */}
        {selectedDetails && (
          <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            {/* Panel header */}
            <div style={{ background: '#1e3a5f', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '0.3px' }}>
                {selected?.type === 'floor' ? '📦' : '🗄️'} {selectedDetails.label}
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                {selected?.type === 'floor' ? 'Floor Location' : 'Rack Bin'} · {selectedDetails.zone}
              </span>
              <span style={{
                marginLeft: 'auto',
                background: selectedDetails.invs.length > 0 ? '#10b981' : '#475569',
                color: '#fff', borderRadius: '20px', padding: '2px 12px',
                fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px',
              }}>
                {selectedDetails.invs.length > 0 ? 'OCCUPIED' : 'VACANT'}
              </span>
            </div>

            <div style={{ padding: '16px' }}>
              {selectedDetails.invs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '6px' }}>📭</div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>No stock in this bin</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                  {selectedDetails.invs.map((inv, i) => {
                    const cf = parseCF(inv.customFields);
                    // Prefer customFields (exact inward entry values) over Material model defaults
                    const huUnit      = cf.huUnit       || inv.material?.huUnit       || '—';
                    const matType     = cf.materialType || inv.material?.materialType || '—';
                    const category    = cf.category     || inv.material?.category     || '—';
                    const description = inv.material?.description || '—';
                    const pallets     = (cf.pallets != null && cf.pallets !== 0)
                                          ? String(cf.pallets)
                                          : (cf.receivedQtyInPallets != null && cf.receivedQtyInPallets !== 0)
                                            ? String(cf.receivedQtyInPallets) : '—';
                    const netWt       = (cf.netWeight != null && cf.netWeight !== 0)
                                          ? `${cf.netWeight} kg`
                                          : (cf.receivedNetWeight != null && cf.receivedNetWeight !== 0)
                                            ? `${cf.receivedNetWeight} kg` : '—';
                    const invoiceNo   = cf.invoiceNo   || cf.sapDocNo     || '—';
                    const inwardDate  = parseDateStr(cf.inwardDate);
                    const stockLoc    = cf.stockLocation || '—';
                    const source      = cf.source        || '—';

                    const fields = [
                      { label: 'Material Code',    value: inv.material?.code || '—', mono: true, color: '#1e40af' },
                      { label: 'Description',      value: description,                             color: '#374151' },
                      { label: 'HU Unit',          value: huUnit,                                  color: '#7c3aed' },
                      { label: 'Type of Material', value: matType,                                 color: '#0891b2' },
                      { label: 'Category',         value: category,                                color: '#059669' },
                      { label: 'Pallets',          value: pallets,                                 color: '#7c3aed' },
                      { label: 'Net Weight',       value: netWt,                                   color: '#059669' },
                      { label: 'Quantity',         value: String(inv.quantity),                    color: '#374151' },
                      { label: 'Invoice / SAP No', value: invoiceNo,               mono: true,    color: '#374151' },
                      { label: 'Inward Date',      value: inwardDate,                              color: '#374151' },
                      { label: 'Stock Location',   value: stockLoc,                                color: '#d97706' },
                      { label: 'Source',           value: source,                                  color: '#64748b' },
                    ];

                    return (
                      <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* item header */}
                        <div style={{ background: '#f0f9ff', padding: '7px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '12px', color: '#1e40af' }}>{inv.material?.code || '—'}</span>
                          {selectedDetails.invs.length > 1 && (
                            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>Item {i + 1} of {selectedDetails.invs.length}</span>
                          )}
                        </div>
                        {/* 2-column key-value grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                          {fields.map((f, fi) => (
                            <div key={f.label} style={{
                              padding: '7px 12px',
                              background: Math.floor(fi / 2) % 2 === 0 ? '#fff' : '#fafafa',
                              borderBottom: fi < fields.length - 2 ? '1px solid #f1f5f9' : 'none',
                              borderRight: fi % 2 === 0 ? '1px solid #f1f5f9' : 'none',
                            }}>
                              <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{f.label}</div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: f.color, fontFamily: f.mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>{f.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' }} />
    </div>
  );
}
