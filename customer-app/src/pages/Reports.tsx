import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchInventoryForCodes, fetchInwardForCodes, fetchOutwardForCodes, fetchCycleCountForCodes,
  parseCF, type InventoryRow, type InwardEntry, type OutwardEntry, type CycleCountRecord,
} from '../api';
import { useAuthStore } from '../store/authStore';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

// ── inline icons ──────────────────────────────────────────────────────
const I = (d: React.ReactNode, size = 16, style?: React.CSSProperties) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>{d}</svg>;
const ArrowDown = ({ size, style }: any) => I(<><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></>, size, style);
const ArrowUp = ({ size, style }: any) => I(<><path d="M12 21V9" /><path d="m7 12 5-5 5 5" /><path d="M5 3h14" /></>, size, style);
const Package = ({ size, style }: any) => I(<><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>, size, style);
const Clipboard = ({ size, style }: any) => I(<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="M9 12h6M9 16h6" /></>, size, style);
const Alert = ({ size, style }: any) => I(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>, size, style);
const XCircle = ({ size, style }: any) => I(<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>, size, style);
const Calendar = ({ size, style }: any) => I(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, size, style);
const Search = ({ size, style }: any) => I(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>, size, style);
const Bars = ({ size, style }: any) => I(<><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="7" /><rect x="12" y="6" width="3" height="11" /><rect x="17" y="13" width="3" height="4" /></>, size, style);
const Refresh = ({ size, style }: any) => I(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v5h-5" /></>, size, style);
const Download = ({ size, style }: any) => I(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></>, size, style);

type ReportType = 'inward' | 'outward' | 'inventory' | 'cycle-count' | 'discrepancy' | 'cc-discrepancy';
const TABS: { id: ReportType; label: string; Icon: any; color: string; bg: string; border: string }[] = [
  { id: 'inward', label: 'Inward Report', Icon: ArrowDown, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'outward', label: 'Outward Report', Icon: ArrowUp, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  { id: 'inventory', label: 'Inventory Report', Icon: Package, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'cycle-count', label: 'Cycle Count Report', Icon: Clipboard, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { id: 'discrepancy', label: 'Inward Discrepancy', Icon: Alert, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  { id: 'cc-discrepancy', label: 'Cycle Count Discrepancy', Icon: XCircle, color: '#be185d', bg: '#fdf2f8', border: '#f9a8d4' },
];

const TD: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' };
const TH: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' };

function toDate(v: any): Date | null { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
function fmt(v: any): string { const d = toDate(v); return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : (v || '—'); }
function csvCell(v: any): string { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCSV(filename: string, columns: string[], rows: any[][]) {
  const lines = [columns.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Reports() {
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const codes = selWorker ? [selWorker] : allowedCodes;

  const [inv, setInv] = useState<InventoryRow[]>([]);
  const [inward, setInward] = useState<InwardEntry[]>([]);
  const [outward, setOutward] = useState<OutwardEntry[]>([]);
  const [cc, setCc] = useState<CycleCountRecord[]>([]);
  const [fetching, setFetching] = useState(true);

  const [activeTab, setActiveTab] = useState<ReportType | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQ, setSearchQ] = useState('');

  const loadData = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setFetching(true);
    try {
      const [invRes, inw, out, ccRes] = await Promise.all([
        fetchInventoryForCodes(codes),
        fetchInwardForCodes(codes).catch(() => []),
        fetchOutwardForCodes(codes).catch(() => []),
        fetchCycleCountForCodes(codes).catch(() => []),
      ]);
      setInv(invRes.inventory || []); setInward(inw); setOutward(out); setCc(ccRes);
    } catch { /* ignore */ }
    finally { setFetching(false); }
  };
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [selWorker, allowedCodes.join(',')]);
  useLiveRefresh(() => loadData({ silent: true }));

  const activeCfg = TABS.find(t => t.id === activeTab);

  const presets = [
    { label: 'Today', fn: () => { const d = new Date().toISOString().slice(0, 10); setDateFrom(d); setDateTo(d); } },
    { label: '7 days', fn: () => { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - 6); setDateFrom(f.toISOString().slice(0, 10)); setDateTo(t.toISOString().slice(0, 10)); } },
    { label: '30 days', fn: () => { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - 29); setDateFrom(f.toISOString().slice(0, 10)); setDateTo(t.toISOString().slice(0, 10)); } },
    { label: 'This Month', fn: () => { const n = new Date(); setDateFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)); setDateTo(n.toISOString().slice(0, 10)); } },
  ];

  const inRange = (v: any): boolean => {
    const d = toDate(v); if (!d) return !dateFrom && !dateTo;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  };

  const report = useMemo(() => {
    const t = searchQ.trim().toLowerCase();
    const match = (o: any) => !t || Object.values(o).some(v => String(v ?? '').toLowerCase().includes(t));
    if (activeTab === 'inward') {
      const rows: any[] = [];
      inward.forEach(e => { if (!inRange(e.inwardDate || e.createdAt)) return;
        (e.lineItems?.length ? e.lineItems : [{} as any]).forEach((li: any) => rows.push({
          'Inward No': e.inwardNumber, Date: fmt(e.inwardDate || e.createdAt), Truck: e.truckNumber, Invoice: e.invoiceNumber || '',
          Transporter: e.transporter || '', Material: li.materialCode || '', Description: li.description || '', Batch: li.batchNumber || '', Qty: li.quantity ?? '', Status: e.status })); });
      return { columns: ['Inward No', 'Date', 'Truck', 'Invoice', 'Transporter', 'Material', 'Description', 'Batch', 'Qty', 'Status'], rows: rows.filter(match) };
    }
    if (activeTab === 'outward') {
      const rows: any[] = [];
      outward.forEach(e => { if (!inRange(e.dispatchDate || e.createdAt)) return;
        (e.lineItems?.length ? e.lineItems : [{} as any]).forEach((li: any) => rows.push({
          'Outward No': e.outwardNumber, Date: fmt(e.dispatchDate || e.createdAt), Truck: e.truckNumber, Destination: e.destination || '',
          Transporter: e.transporter || '', Material: li.materialCode || '', Description: li.description || '', Batch: li.batchNumber || '', Required: li.requiredQty ?? '', Picked: li.pickedQty ?? '', Status: e.status })); });
      return { columns: ['Outward No', 'Date', 'Truck', 'Destination', 'Transporter', 'Material', 'Description', 'Batch', 'Required', 'Picked', 'Status'], rows: rows.filter(match) };
    }
    if (activeTab === 'inventory') {
      const rows = inv.map(b => { const cf = parseCF(b.customFields); return {
        Material: b.material?.code || '', Description: b.material?.description || '', Category: String(cf.category || '').toUpperCase(),
        Type: cf.materialType || b.material?.materialType || '', Warehouse: b.warehouse?.code || '', BIN: cf.binLocation || b.bin?.code || '',
        Pallets: cf.pallets || 0, 'Net Wt (kg)': cf.netWeight || 0, Qty: b.quantity, Status: b.stockStatus }; });
      return { columns: ['Material', 'Description', 'Category', 'Type', 'Warehouse', 'BIN', 'Pallets', 'Net Wt (kg)', 'Qty', 'Status'], rows: rows.filter(match) };
    }
    if (activeTab === 'cycle-count') {
      const rows = cc.filter(r => inRange(r.weekStart)).map(r => ({
        'Week Start': fmt(r.weekStart), 'Week End': fmt(r.weekEnd), Warehouse: r.warehouseCode, Bins: r.totalBins, OK: r.okCount,
        Discrepancy: r.discrepancyCount, Unchecked: r.uncheckedCount,
        Accuracy: (r.okCount + r.discrepancyCount) ? Math.round((r.okCount / (r.okCount + r.discrepancyCount)) * 100) + '%' : '—',
        Status: r.status, Completed: r.completedAt ? fmt(r.completedAt) : '—' }));
      return { columns: ['Week Start', 'Week End', 'Warehouse', 'Bins', 'OK', 'Discrepancy', 'Unchecked', 'Accuracy', 'Status', 'Completed'], rows: rows.filter(match) };
    }
    if (activeTab === 'cc-discrepancy') {
      const rows: any[] = [];
      cc.filter(r => inRange(r.weekStart)).forEach(r => {
        (r.sessionSummaries || []).filter(s => (s.disc || 0) > 0).forEach(s => rows.push({
          Week: fmt(r.weekStart), Warehouse: r.warehouseCode, Day: fmt(s.date), Bins: s.total, OK: s.ok, Discrepancy: s.disc, Unchecked: s.unchecked, Status: s.status }));
        if (!(r.sessionSummaries || []).some(s => (s.disc || 0) > 0) && r.discrepancyCount > 0)
          rows.push({ Week: fmt(r.weekStart), Warehouse: r.warehouseCode, Day: '—', Bins: r.totalBins, OK: r.okCount, Discrepancy: r.discrepancyCount, Unchecked: r.uncheckedCount, Status: r.status });
      });
      return { columns: ['Week', 'Warehouse', 'Day', 'Bins', 'OK', 'Discrepancy', 'Unchecked', 'Status'], rows: rows.filter(match) };
    }
    // discrepancy (inward)
    const rows: any[] = [];
    inv.forEach(b => { const cf = parseCF(b.customFields);
      const sp = Number(cf.shortInPallet || 0), sq = Number(cf.shortExcessInQty || 0), sk = Number(cf.shortExcessInKg || 0);
      if (!(sp || sq || sk || cf.discrepancy || b.stockStatus === 'DISCREPANCY' || cf.discrepancyRemarks)) return;
      rows.push({ Material: b.material?.code || '', Description: b.material?.description || '', Warehouse: b.warehouse?.code || '',
        Invoice: cf.invoiceNo || b.batchNumber || '', 'Short Plt': sp || '', 'Short/Excess Qty': sq || '', 'Short/Excess Kg': sk || '', Remarks: cf.discrepancyRemarks || '', Status: b.stockStatus }); });
    return { columns: ['Material', 'Description', 'Warehouse', 'Invoice', 'Short Plt', 'Short/Excess Qty', 'Short/Excess Kg', 'Remarks', 'Status'], rows: rows.filter(match) };
  }, [activeTab, inv, inward, outward, cc, dateFrom, dateTo, searchQ]);

  const loadReport = () => { setLoading(true); setTimeout(() => { setLoaded(true); setLoading(false); }, 150); };
  const pickTab = (id: ReportType) => { setActiveTab(id); setLoaded(false); setSearchQ(''); };
  const doExport = () => downloadCSV(`jsm-${activeTab}-report-${new Date().toISOString().slice(0, 10)}.csv`, report.columns, report.rows.map(r => report.columns.map(c => r[c])));

  const dateTab = activeTab === 'inward' || activeTab === 'outward' || activeTab === 'cycle-count' || activeTab === 'cc-discrepancy';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Reports &amp; Exports</h1>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Select a report, filter by date, load data and export records.</p>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => pickTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: active ? tab.bg : '#fff',
                border: `2px solid ${active ? tab.color : '#e2e8f0'}`, borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                color: active ? tab.color : '#64748b', cursor: 'pointer', boxShadow: active ? `0 2px 8px ${tab.bg}` : 'none', transition: 'all 0.15s' }}>
              <tab.Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {!activeTab && (
        <div style={{ background: '#fff', border: '1px dashed #e2e8f0', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
          <Bars size={30} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: '13px', marginTop: 8 }}>Select a report type above to begin.</div>
        </div>
      )}

      {/* Date filter + load */}
      {activeTab && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <Calendar size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Date Range</span>
          {dateTab && presets.map(p => (
            <button key={p.label} onClick={p.fn} style={{ padding: '5px 12px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '7px', fontSize: '12px', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}>{p.label}</button>
          ))}
          {dateTab && <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />}
          {dateTab && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><label style={{ fontSize: '12px', color: '#64748b' }}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#374151', outline: 'none', background: '#f8fafc' }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><label style={{ fontSize: '12px', color: '#64748b' }}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#374151', outline: 'none', background: '#f8fafc' }} /></div>
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear</button>}
          </>)}
          {!dateTab && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Snapshot report (no date range)</span>}
          <button onClick={loadReport} disabled={loading || fetching}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px', background: activeCfg?.color || '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: (loading || fetching) ? 'not-allowed' : 'pointer', opacity: fetching ? 0.7 : 1 }}>
            {(loading || fetching) ? <><Refresh size={13} style={{ animation: 'spin 1s linear infinite' }} /> {fetching ? 'Fetching…' : 'Loading…'}</> : <><Bars size={13} /> Load Report</>}
          </button>
        </div>
      )}

      {/* Data table */}
      {loaded && activeCfg && (
        <div style={{ background: '#fff', border: `1px solid ${activeCfg.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <activeCfg.Icon size={16} style={{ color: activeCfg.color }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: activeCfg.color }}>{activeCfg.label}</span>
              <span style={{ background: activeCfg.bg, color: activeCfg.color, border: `1px solid ${activeCfg.border}`, borderRadius: '20px', padding: '1px 10px', fontSize: '11px', fontWeight: 700 }}>{report.rows.length} record{report.rows.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '280px' }}>
              <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…"
                style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px 6px 27px', fontSize: '12px', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={doExport} disabled={!report.rows.length}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: activeCfg.bg, border: `1.5px solid ${activeCfg.border}`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: activeCfg.color, cursor: 'pointer', opacity: report.rows.length ? 1 : 0.5 }}>
                <Download size={12} /> Export CSV
              </button>
              <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>Print</button>
            </div>
          </div>

          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}><tr>{report.columns.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr><td colSpan={report.columns.length} style={{ ...TD, textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No records for this report and filter.</td></tr>
                ) : report.rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                    {report.columns.map(c => (
                      <td key={c} style={{ ...TD, ...(c === 'Material' || c === 'Inward No' || c === 'Outward No' ? { fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' } : {}) }}>
                        {r[c] === '' || r[c] == null ? '-' : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' }} />
    </div>
  );
}
