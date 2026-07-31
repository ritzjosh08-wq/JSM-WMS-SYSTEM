import { useEffect, useMemo, useState } from 'react';
import { fetchInventoryForCodes, parseCF, type InventoryRow, type Warehouse } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, C, IconRefresh } from '../ui';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

// Mirrors the WMS software Inventory columns (read-only for customers).
const th: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1.5px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap',
};
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '6px 10px', fontSize: 12, color: '#334155', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };

function num(v: number, fixed = 0) { return v > 0 ? v.toFixed(fixed) : '-'; }

export default function Inventory() {
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const team = useAuthStore(s => s.team);
  const codes = selWorker ? [selWorker] : allowedCodes;

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'ALL' | 'RM' | 'FG'>('ALL');
  const [statusF, setStatusF] = useState('');
  const [whF, setWhF] = useState('');

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError('');
    try {
      const { inventory, warehouses } = await fetchInventoryForCodes(codes);
      setRows(inventory);
      setWarehouses((warehouses || []).filter(w => !/jsm|default/i.test(w.name || '') && !/^WH-?DEFAULT$/i.test(w.code || '')));
      setUpdated(new Date());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selWorker, allowedCodes.join(',')]);
  // Background poll so inward/outward changes workers make in the WMS software
  // show up here without the customer needing to reload the page.
  useLiveRefresh(() => load({ silent: true }));

  const enriched = useMemo(() => rows.map(r => {
    const cf = parseCF(r.customFields);
    const category = String(cf.category || (r.material as any)?.category || r.material?.materialType || '').toUpperCase();
    const binLoc = cf.binLocation
      || (r.bin?.code ? `${r.rack?.code ? r.rack.code + ' / ' : ''}${r.bin.code}` : (r.floorLocation?.code ? `Floor ${r.floorLocation.code}` : ''));
    return {
      ...r, cf, category,
      materialType: cf.materialType || r.material?.materialType || '',
      huUnit: cf.huUnit || r.material?.huUnit || '',
      invoiceNo: cf.invoiceNo || r.batchNumber || '',
      sapDocNo: cf.sapDocNo || '',
      gateSerialNo: cf.gateSerialNo || '',
      binLocation: binLoc || '',
      stockLocation: cf.stockLocation || r.warehouse?.code || '',
      inwardDate: cf.inwardDate || '',
      createdBy: cf.createdBy || '',
      tatRemarks: cf.tatRemarks || '',
      discrepancyRemarks: cf.discrepancyRemarks || '',
      displayQtyKg: parseFloat(cf.netWeight) || 0,
      displayQtyPallet: parseFloat(cf.pallets) || 0,
      shortInPallet: Number(cf.shortInPallet || 0),
      shortExcessInQty: Number(cf.shortExcessInQty || 0),
      shortExcessInKg: Number(cf.shortExcessInKg || 0),
      invoiceQtyInNos: Number(cf.invoiceQtyInNos || 0),
      receivedQtyInNos: Number(cf.receivedQtyInNos || 0),
      invoiceNetWeight: Number(cf.invoiceNetWeight || 0),
      receivedNetWeight: Number(cf.receivedNetWeight || 0),
      invoiceQtyInPallet: Number(cf.invoiceQtyInPallet || 0),
      receivedQtyInPallets: Number(cf.receivedQtyInPallets || 0),
      isDiscrepancy: !!(cf.discrepancy || r.stockStatus === 'DISCREPANCY' || Number(cf.shortInPallet||0)!==0 || Number(cf.shortExcessInKg||0)!==0 || Number(cf.shortExcessInQty||0)!==0 || cf.discrepancyRemarks),
    };
  }), [rows]);

  const active = enriched.filter(i => i.quantity > 0);
  const rm = active.filter(i => i.category.includes('RM'));
  const fg = active.filter(i => i.category.includes('FG'));
  const sum = (arr: any[], k: string) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const cards = {
    activeSkus: active.length,
    depleted: enriched.length - active.length,
    rmPallets: Math.round(sum(rm, 'displayQtyPallet')),
    rmKg: Math.round(sum(rm, 'displayQtyKg')),
    rmBatches: rm.length,
    fgPallets: Math.round(sum(fg, 'displayQtyPallet')),
    fgBatches: fg.length,
    fgNetWt: Math.round(sum(fg, 'receivedNetWeight') || sum(fg, 'displayQtyKg')),
    fgNos: Math.round(sum(fg, 'receivedQtyInNos')),
  };

  const statuses = useMemo(() => [...new Set(enriched.map(i => i.stockStatus).filter(Boolean))], [enriched]);

  const filtered = useMemo(() => {
    let list = enriched.filter(i => i.quantity > 0 || i.isDiscrepancy);
    if (view === 'RM') list = list.filter(i => i.category.includes('RM'));
    if (view === 'FG') list = list.filter(i => i.category.includes('FG'));
    if (statusF) list = list.filter(i => i.stockStatus === statusF);
    if (whF) list = list.filter(i => i.warehouse?.code === whF);
    const t = q.trim().toLowerCase();
    if (t) list = list.filter(i =>
      [i.material?.code, i.material?.description, i.invoiceNo, i.batchNumber, i.sapDocNo, i.binLocation]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(t)));
    return list;
  }, [enriched, view, statusF, whF, q]);

  const scopeName = selWorker ? (team.find(w => w.warehouseCode === selWorker)?.name || selWorker) : 'All my areas';
  const scopeWh = selWorker || (codes.length ? codes.join(', ') : 'N/A');

  if (loading && !rows.length) return <Spinner label="Loading inventory..." />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load inventory: {error}</Card>;

  const tabBtn = (key: 'ALL'|'RM'|'FG', label: string) => (
    <button onClick={() => setView(key)} style={{
      padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
      border: 'none', background: view === key ? C.blue : '#fff', color: view === key ? '#fff' : C.sub,
      boxShadow: view === key ? 'none' : `inset 0 0 0 1px ${C.line}`,
    }}>{label}</button>
  );

  return (
    <div>
      <PageHeader
        title={`${scopeName}'s Inventory`}
        subtitle={`Warehouse: ${scopeWh} · Live stock${updated ? ` · Updated ${updated.toLocaleTimeString()}` : ''}`}
        right={<button onClick={() => load()} className="btn btn-primary"><IconRefresh size={15} /> Refresh</button>}
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <Card style={{ padding: 16, background: '#eff6ff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.blueDark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active SKUs</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: C.blue, marginTop: 4 }}>{cards.activeSkus}</div>
          <div style={{ fontSize: 11, color: C.faint }}>{cards.depleted} depleted</div>
        </Card>
        <Card style={{ padding: 16, background: '#ecfdf5' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RM Stock</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
            <div><div style={{ fontSize: 26, fontWeight: 900, color: '#059669' }}>{cards.rmPallets}</div><div style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>Pallets</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 900, color: '#0891b2' }}>{cards.rmKg}</div><div style={{ fontSize: 10, color: '#0891b2', fontWeight: 700 }}>KG</div></div>
          </div>
          <div style={{ fontSize: 11, color: '#059669' }}>{cards.rmBatches} RM batches</div>
        </Card>
        <Card style={{ padding: 16, background: '#f5f3ff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FG - Pallets</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#7c3aed', marginTop: 4 }}>{cards.fgPallets}</div>
          <div style={{ fontSize: 11, color: '#7c3aed' }}>{cards.fgBatches} FG batches</div>
        </Card>
        <Card style={{ padding: 16, background: '#fffbeb' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FG - Net Wt</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#ea580c', marginTop: 4 }}>{cards.fgNetWt} <span style={{ fontSize: 14 }}>kg</span></div>
          <div style={{ fontSize: 11, color: '#d97706' }}>{cards.fgNos} Nos total</div>
        </Card>
      </div>

      {/* Tabs + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabBtn('ALL', 'All Stock')}{tabBtn('RM', 'RM - KGs')}{tabBtn('FG', 'FG - Pallets')}
        </div>
        <input className="toolbar-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Material code, description, invoice..."
          style={{ flex: '1 1 260px', padding: '9px 14px', border: `1.5px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ padding: '9px 12px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 13, background: '#fff', color: C.sub }}>
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={whF} onChange={e => setWhF(e.target.value)} style={{ padding: '9px 12px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 13, background: '#fff', color: C.sub }}>
          <option value="">All Warehouses</option>
          {warehouses.map(w => <option key={w.code} value={w.code}>{w.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>{filtered.length} records</span>
      </div>

      {/* Table — same columns as the WMS software inventory */}
      <Card>
        <div className="table-scroll" style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 2000 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={th}>Material Code</th>
                <th style={{ ...th, minWidth: 180 }}>Description</th>
                <th style={th}>Category</th>
                <th style={th}>Type of Material</th>
                <th style={th}>HU Unit</th>
                <th style={th}>Invoice No</th>
                <th style={th}>SAP Doc No</th>
                <th style={th}>Gate Serial</th>
                <th style={thR}>Invoice Plt</th>
                <th style={thR}>Rcvd Plt</th>
                <th style={thR}>Invoice Nos</th>
                <th style={thR}>Rcvd Nos</th>
                <th style={thR}>Invoice Wt (kg)</th>
                <th style={thR}>Rcvd Wt (kg)</th>
                <th style={th}>BIN</th>
                <th style={th}>Stock Location</th>
                <th style={th}>Inward Date</th>
                <th style={th}>Created By</th>
                <th style={th}>TAT Remarks</th>
                <th style={thR}>Short Plt</th>
                <th style={thR}>Short/Excess Qty</th>
                <th style={thR}>Short/Excess Kg</th>
                <th style={th}>Disc Remarks</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={24} style={{ ...td, textAlign: 'center', padding: 48, color: C.faint }}>
                  No inventory found. Records appear here once staff commit inward entries in the WMS.
                </td></tr>
              )}
              {filtered.map((i, idx) => {
                const disc = i.isDiscrepancy;
                const bg = disc ? '#fff5f5' : (i.quantity <= 0 ? '#fafafa' : idx % 2 === 0 ? '#fff' : '#fafafa');
                return (
                  <tr key={i.id} style={{ background: bg, borderLeft: disc ? '3px solid #dc2626' : '3px solid transparent', opacity: i.quantity <= 0 ? 0.7 : 1 }}>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', background: '#eff6ff', padding: '2px 6px', borderRadius: 5 }}>{i.material?.code || '-'}</span></td>
                    <td style={{ ...td, minWidth: 180, whiteSpace: 'normal' }}>{i.material?.description || '-'}</td>
                    <td style={td}><span style={{ background: i.category.includes('FG') ? '#f5f3ff' : '#ecfdf5', color: i.category.includes('FG') ? '#7c3aed' : '#059669', border: `1px solid ${i.category.includes('FG') ? '#ddd6fe' : '#a7f3d0'}`, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{i.category || '-'}</span></td>
                    <td style={{ ...td, color: '#0891b2' }}>{i.materialType || '-'}</td>
                    <td style={{ ...td, color: '#64748b' }}>{i.huUnit || '-'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', color: '#64748b' }}>{i.invoiceNo || '-'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', color: i.sapDocNo ? '#374151' : '#cbd5e1' }}>{i.sapDocNo || '-'}</td>
                    <td style={{ ...td, color: i.gateSerialNo ? '#0369a1' : '#cbd5e1' }}>{i.gateSerialNo || '-'}</td>
                    <td style={{ ...tdR, color: i.invoiceQtyInPallet > 0 ? '#6d28d9' : '#cbd5e1', fontWeight: 600 }}>{num(i.invoiceQtyInPallet)}</td>
                    <td style={{ ...tdR, color: i.receivedQtyInPallets > 0 ? '#7c3aed' : '#cbd5e1', fontWeight: 700 }}>{num(i.receivedQtyInPallets)}</td>
                    <td style={{ ...tdR, color: i.invoiceQtyInNos > 0 ? '#374151' : '#cbd5e1', fontWeight: 600 }}>{num(i.invoiceQtyInNos)}</td>
                    <td style={{ ...tdR, color: i.receivedQtyInNos > 0 ? '#059669' : '#cbd5e1', fontWeight: 700 }}>{num(i.receivedQtyInNos)}</td>
                    <td style={{ ...tdR, color: i.invoiceNetWeight > 0 ? '#374151' : '#cbd5e1', fontWeight: 600 }}>{num(i.invoiceNetWeight, 1)}</td>
                    <td style={{ ...tdR, color: i.receivedNetWeight > 0 ? '#059669' : '#cbd5e1', fontWeight: 700 }}>{num(i.receivedNetWeight, 1)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', color: i.binLocation ? '#2563eb' : '#cbd5e1', fontWeight: i.binLocation ? 700 : 400 }}>{i.binLocation || '-'}</td>
                    <td style={{ ...td, color: i.stockLocation ? '#374151' : '#cbd5e1' }}>{i.stockLocation || '-'}</td>
                    <td style={{ ...td, color: '#64748b' }}>{i.inwardDate || (i.receiptDate ? new Date(i.receiptDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')}</td>
                    <td style={{ ...td, color: '#374151' }}>{i.createdBy || '-'}</td>
                    <td style={{ ...td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={i.tatRemarks}>{i.tatRemarks || '-'}</td>
                    <td style={{ ...tdR, color: i.shortInPallet !== 0 ? '#b91c1c' : '#cbd5e1', fontWeight: i.shortInPallet !== 0 ? 700 : 400 }}>{i.shortInPallet !== 0 ? i.shortInPallet : '-'}</td>
                    <td style={{ ...tdR, color: i.shortExcessInQty !== 0 ? '#b91c1c' : '#cbd5e1', fontWeight: i.shortExcessInQty !== 0 ? 700 : 400 }}>{i.shortExcessInQty !== 0 ? i.shortExcessInQty : '-'}</td>
                    <td style={{ ...tdR, color: i.shortExcessInKg !== 0 ? '#b91c1c' : '#cbd5e1', fontWeight: i.shortExcessInKg !== 0 ? 700 : 400 }}>{i.shortExcessInKg !== 0 ? i.shortExcessInKg : '-'}</td>
                    <td style={{ ...td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', color: i.discrepancyRemarks ? '#7f1d1d' : '#cbd5e1' }} title={i.discrepancyRemarks}>{i.discrepancyRemarks || '-'}</td>
                    <td style={td}><span style={{ background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{i.stockStatus}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 14px', fontSize: 11, color: C.faint, display: 'flex', justifyContent: 'space-between' }}>
          <span>↓ Inward adds to stock · ↑ Outward reduces stock</span>
          <span>{filtered.length} of {active.length} items</span>
        </div>
      </Card>
    </div>
  );
}
