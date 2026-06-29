import { useEffect, useState, useCallback } from 'react';
import {
  CalendarDays, CheckCircle2, AlertTriangle, Clock, Play,
  Search, RefreshCw, ListChecks, Building2, XCircle, FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../store/authStore';

const API = 'http://localhost:5001/api';

const DAY_NAMES  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${DAY_NAMES[((d.getDay() + 6) % 7)]} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
}

function getMondayOfWeek(now = new Date()) {
  const d   = new Date(now);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekLabel(mondayIso: string) {
  const mon = new Date(mondayIso + 'T00:00:00');
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  return `${mon.getDate()} ${MONTH_ABBR[mon.getMonth()]} – ${sat.getDate()} ${MONTH_ABBR[sat.getMonth()]} ${sat.getFullYear()}`;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  PENDING:    { label: 'Pending',     color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: Clock         },
  IN_PROGRESS:{ label: 'In Progress', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: Play          },
  OVERDUE:    { label: 'Overdue',     color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: AlertTriangle  },
  COMPLETED:  { label: 'Completed',   color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: CheckCircle2   },
};

export default function CycleCount() {
  const user           = useAuthStore(s => s.user);
  const selectedWorker = useAuthStore(s => s.selectedWorker);

  // ── State ──────────────────────────────────────────────────────────────────
  const [warehouses,     setWarehouses]     = useState<any[]>([]);
  const [selectedWHId,   setSelectedWHId]   = useState('');
  const [plan,           setPlan]           = useState<any>(null);
  const [sessions,       setSessions]       = useState<any[]>([]);
  const [pendingOther,   setPendingOther]   = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [generating,     setGenerating]     = useState(false);
  const [openId,         setOpenId]         = useState<string | null>(null);
  const [session,        setSession]        = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [search,         setSearch]         = useState('');
  const [filter,         setFilter]         = useState<'ALL'|'PENDING'|'CHECKED'>('ALL');
  const [saving,         setSaving]         = useState<string | null>(null);
  const [completing,     setCompleting]     = useState(false);
  const [error,          setError]          = useState('');
  // Discrepancy remarks — holds the binId + text while user is typing
  const [pendingDisc, setPendingDisc]       = useState<{ binId: string; text: string } | null>(null);

  const _now  = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  // ── Load warehouses on mount ───────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/cycle-count/warehouses`)
      .then(r => r.json())
      .then(json => {
        const whs = json.warehouses || [];
        setWarehouses(whs);
        const activeCode = selectedWorker?.warehouseCode || selectedWorker?.warehouseCodes?.[0];
        const workerWH = activeCode
          ? whs.find((w: any) => w.code === activeCode)
          : null;
        const pick = workerWH || whs.find((w: any) => w.binCount > 0) || whs[0];
        if (pick) setSelectedWHId(pick.id);
      })
      .catch(() => {});
  }, [selectedWorker]);

  // ── Reset (delete) current week's plan ────────────────────────────────────
  const [resetting, setResetting] = useState(false);

  async function resetWeek() {
    if (!selectedWHId) return;
    if (!confirm('Delete this week\'s plan and all check progress? This cannot be undone.')) return;
    setResetting(true);
    try {
      await fetch(`${API}/cycle-count/plan/current?warehouseId=${selectedWHId}`, { method: 'DELETE' });
      setPlan(null); setSessions([]); setOpenId(null); setSession(null); setPendingDisc(null);
    } finally { setResetting(false); }
  }

  // ── Export a day's bins + inventory to Excel ───────────────────────────────
  const [exporting, setExporting] = useState<string | null>(null);

  async function exportDay(s: any) {
    setExporting(s.id);
    try {
      const res  = await fetch(`${API}/cycle-count/session/${s.id}/export-data`);
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Export failed'); return; }

      const { warehouseCode, warehouseName, dayNumber, scheduledDate, bins } = data;

      // ── Build rows ──
      const MONTH_A = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const dObj = new Date(scheduledDate + 'T00:00:00');
      const dateLabel = `${dObj.getDate()} ${MONTH_A[dObj.getMonth()]} ${dObj.getFullYear()}`;

      const headerRows = [
        ['JSM LOGISTICS — CYCLE COUNT CHECKLIST'],
        [`Warehouse: ${warehouseCode} (${warehouseName})`, '', `Date: ${dateLabel}`, '', `Day: ${dayNumber} of 6`],
        [],
        ['S.No', 'Bin Code', 'Location Type', 'Zone / Rack', 'Material Code', 'Description', 'Material Type', 'Batch No', 'Quantity', 'HU Unit', 'Pallets', 'Stock Status', 'Receipt Date'],
      ];

      const dataRows: any[][] = [];
      let sno = 1;

      for (const bin of (bins as any[])) {
        if (bin.materials.length === 0) {
          dataRows.push([
            sno++,
            bin.code,
            bin.type === 'FLOOR' ? 'Floor' : 'Rack Bin',
            bin.rackCode || '',
            'EMPTY', '', '', '', '', '', '', '', '',
          ]);
        } else {
          for (const m of bin.materials) {
            const rd = m.receiptDate ? new Date(m.receiptDate) : null;
            const rdLabel = rd ? `${rd.getDate()} ${MONTH_A[rd.getMonth()]} ${rd.getFullYear()}` : '';
            // Use receivedQtyInNos for Quantity and receivedQtyInPallets for Pallets
            const qtyNos  = m.receivedNos  != null ? m.receivedNos  : m.quantity;
            const pallets = m.pallets      != null ? m.pallets      : '';
            dataRows.push([
              sno++,
              bin.code,
              bin.type === 'FLOOR' ? 'Floor' : 'Rack Bin',
              bin.rackCode || '',
              m.materialCode,
              m.description || '',
              m.materialType || '',
              m.batchNumber,
              qtyNos,
              m.huUnit || '',
              pallets,
              m.stockStatus,
              rdLabel,
            ]);
          }
        }
      }

      // ── Build workbook ──
      const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);

      // Column widths
      ws['!cols'] = [
        { wch: 5  },  // S.No
        { wch: 14 },  // Bin Code
        { wch: 12 },  // Type
        { wch: 12 },  // Zone/Rack
        { wch: 16 },  // Material Code
        { wch: 30 },  // Description
        { wch: 14 },  // Material Type
        { wch: 16 },  // Batch No
        { wch: 10 },  // Quantity
        { wch: 10 },  // HU Unit
        { wch: 9  },  // Pallets
        { wch: 13 },  // Stock Status
        { wch: 14 },  // Receipt Date
      ];

      // Merge title row across all columns
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Day${dayNumber} ${dateLabel}`);

      const fileName = `CycleCount_${warehouseCode}_Day${dayNumber}_${scheduledDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } finally { setExporting(null); }
  }

  // ── Load plan when warehouse changes ──────────────────────────────────────
  const loadPlan = useCallback(async (whId: string) => {
    if (!whId) return;
    setLoading(true); setError(''); setPlan(null); setSessions([]); setOpenId(null); setSession(null);
    try {
      const [planRes, pendingRes] = await Promise.all([
        fetch(`${API}/cycle-count/plan/current?warehouseId=${whId}`).then(r => r.json()),
        fetch(`${API}/cycle-count/pending`).then(r => r.json()),
      ]);
      setPlan(planRes.plan);
      setSessions(planRes.sessions || []);
      const monday = getMondayOfWeek().toISOString().split('T')[0];
      setPendingOther((pendingRes.sessions || []).filter((s: any) => s.weekStart !== monday && s.warehouseId === whId));
    } catch {
      setError('Failed to load cycle count plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedWHId) loadPlan(selectedWHId); }, [selectedWHId, loadPlan]);

  // ── Generate plan ──────────────────────────────────────────────────────────
  async function generate() {
    if (!selectedWHId) return;
    setGenerating(true); setError('');
    try {
      const res  = await fetch(`${API}/cycle-count/plan/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId: selectedWHId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to generate'); return; }
      setPlan(json.plan); setSessions(json.sessions || []);
    } finally { setGenerating(false); }
  }

  // ── Open / close a session ─────────────────────────────────────────────────
  async function openSession(sid: string) {
    if (openId === sid) { setOpenId(null); setSession(null); setPendingDisc(null); return; }
    setOpenId(sid); setSession(null); setSessionLoading(true); setPendingDisc(null);
    try {
      const json = await fetch(`${API}/cycle-count/session/${sid}`).then(r => r.json());
      setSession(json.session);
    } finally { setSessionLoading(false); }
  }

  // ── Toggle bin status — intercepts OK→DISCREPANCY to collect remarks ───────
  async function toggleBin(binId: string, current: string, remarks?: string) {
    if (!session) return;

    // Intercept OK→DISCREPANCY: open remarks box instead of saving immediately
    if (current === 'OK' && remarks === undefined) {
      setPendingDisc({ binId, text: '' });
      return;
    }

    const next = current === 'PENDING' ? 'OK'
               : current === 'OK'      ? 'DISCREPANCY'
               :                         'UNCHECKED';

    setSaving(binId);
    try {
      const res = await fetch(`${API}/cycle-count/session/${session.id}/check-bin`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binId, status: next, remarks: remarks || '', checkedBy: user?.username || 'admin' }),
      });
      const json = await res.json();
      if (!res.ok) return;

      setSession((prev: any) => {
        if (!prev) return prev;
        let checked: any[] = [...prev.checkedBins];
        if (next === 'UNCHECKED') {
          checked = checked.filter((b: any) => b.id !== binId);
        } else {
          const entry = { id: binId, status: next, remarks: remarks || '', checkedAt: new Date().toISOString(), checkedBy: user?.username || 'admin' };
          const idx = checked.findIndex((b: any) => b.id === binId);
          if (idx >= 0) checked[idx] = entry; else checked.push(entry);
        }
        const newStatus = json.checkedCount === 0 ? prev.status
          : json.checkedCount < json.totalBins ? (prev.status === 'OVERDUE' ? 'OVERDUE' : 'IN_PROGRESS')
          : prev.status;
        return { ...prev, checkedBins: checked, status: newStatus };
      });
      setSessions(prev => prev.map(s => s.id === session.id
        ? { ...s, status: json.checkedCount === 0 ? s.status : json.checkedCount < json.totalBins ? (s.status === 'OVERDUE' ? 'OVERDUE' : 'IN_PROGRESS') : s.status }
        : s
      ));
    } finally { setSaving(null); }
  }

  // ── Confirm discrepancy with remarks ──────────────────────────────────────
  async function confirmDiscrepancy() {
    if (!pendingDisc || !session) return;
    await toggleBin(pendingDisc.binId, 'OK', pendingDisc.text);
    setPendingDisc(null);
  }

  // ── Mark all bins OK ──────────────────────────────────────────────────────
  async function markAllOK() {
    if (!session) return;
    setSaving('ALL');
    try {
      for (const bin of session.binIds) {
        const already = session.checkedBins.find((c: any) => c.id === bin.id);
        if (already?.status === 'OK') continue;
        await fetch(`${API}/cycle-count/session/${session.id}/check-bin`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ binId: bin.id, status: 'OK', remarks: '', checkedBy: user?.username || 'admin' }),
        });
      }
      const json = await fetch(`${API}/cycle-count/session/${session.id}`).then(r => r.json());
      setSession(json.session);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'IN_PROGRESS' } : s));
    } finally { setSaving(null); }
  }

  // ── Complete session ───────────────────────────────────────────────────────
  async function complete(sid: string) {
    setCompleting(true);
    try {
      await fetch(`${API}/cycle-count/session/${sid}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedBy: user?.username || 'admin' }),
      });
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, status: 'COMPLETED' } : s));
      setPendingOther(prev => prev.filter(s => s.id !== sid));
      setOpenId(null); setSession(null); setPendingDisc(null);
    } finally { setCompleting(false); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedWH    = warehouses.find(w => w.id === selectedWHId);
  const completedDays = sessions.filter(s => s.status === 'COMPLETED').length;
  const totalChecked  = sessions.reduce((sum, s) => sum + (s.checkedBins?.length || 0), 0);
  const mondayIso     = plan?.weekStart;

  function getBinStatus(binId: string) {
    if (!session) return 'PENDING';
    return session.checkedBins.find((b: any) => b.id === binId)?.status || 'PENDING';
  }

  const filteredBins = (session?.binIds || []).filter((b: any) => {
    if (search) {
      const q = search.toLowerCase();
      if (!b.code.toLowerCase().includes(q) &&
          !b.rackCode?.toLowerCase().includes(q) &&
          !(b.type === 'FLOOR' ? 'floor zone' : 'rack').includes(q)) return false;
    }
    const st = getBinStatus(b.id);
    if (filter === 'PENDING' && st !== 'PENDING')  return false;
    if (filter === 'CHECKED' && st === 'PENDING')  return false;
    return true;
  });

  const checkedInSession = session?.checkedBins?.length || 0;
  const totalInSession   = session?.binIds?.length || 0;
  const canComplete      = checkedInSession > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#64748b', fontSize: '14px' }}>
      Loading cycle count plan...
    </div>
  );

  // ── Day card (compact, used in left panel) ─────────────────────────────────
  function DayCard({ s, overdue = false }: { s: any; overdue?: boolean }) {
    const isExporting = exporting === s.id;
    const meta    = STATUS_META[s.status] || STATUS_META.PENDING;
    const Icon    = meta.icon;
    const checked = s.checkedBins?.length || 0;
    const total   = s.binIds?.length || 0;
    const isToday = s.scheduledDate === today;
    const isOpen  = openId === s.id;
    const pct     = total > 0 ? Math.round((checked / total) * 100) : 0;

    return (
      <div
        onClick={() => openSession(s.id)}
        style={{
          background: '#fff',
          border: `1.5px solid ${isOpen ? '#2563eb' : overdue ? '#fecaca' : isToday ? '#bfdbfe' : meta.border}`,
          borderRadius: '10px', padding: '10px 12px', cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: overdue ? '#dc2626' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {overdue ? `Week ${weekLabel(s.weekStart)} · Day ${s.dayNumber}` : `Day ${s.dayNumber}`}
              {isToday && <span style={{ color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '0px 5px', marginLeft: '4px', fontSize: '8px' }}>TODAY</span>}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginTop: '1px' }}>{fmtDate(s.scheduledDate)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: '6px', padding: '2px 6px' }}>
            <Icon size={9} style={{ color: meta.color }} />
            <span style={{ fontSize: '8px', fontWeight: 700, color: meta.color }}>{meta.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ fontSize: '15px', fontWeight: 900, color: s.status === 'COMPLETED' ? '#059669' : '#1e293b' }}>
            {checked}<span style={{ fontSize: '10px', fontWeight: 500, color: '#94a3b8' }}>/{total} bins</span>
          </span>
          <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>{pct}%</span>
        </div>
        <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{ height: '100%', borderRadius: '2px', transition: 'width 0.4s', background: s.status === 'COMPLETED' ? '#10b981' : s.status === 'OVERDUE' ? '#ef4444' : '#2563eb', width: `${pct}%` }} />
        </div>
        {/* Export button — stops propagation so it doesn't open the session */}
        <button
          onClick={e => { e.stopPropagation(); exportDay(s); }}
          disabled={isExporting}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            fontSize: '10px', fontWeight: 700,
            background: isExporting ? '#f1f5f9' : '#f0fdf4',
            color: isExporting ? '#94a3b8' : '#059669',
            border: `1px solid ${isExporting ? '#e2e8f0' : '#a7f3d0'}`,
            borderRadius: '6px', padding: '4px 8px', cursor: isExporting ? 'not-allowed' : 'pointer',
          }}
        >
          <FileDown size={10} />
          {isExporting ? 'Generating...' : 'Export Excel'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>Cycle Count</h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Weekly location-check assignments · {selectedWH?.binCount ?? '–'} total locations</p>
        </div>
        {warehouses.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={14} style={{ color: '#64748b' }} />
            <select
              value={selectedWHId}
              onChange={e => setSelectedWHId(e.target.value)}
              style={{ fontSize: '12px', fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', color: '#374151', background: '#fff', cursor: 'pointer' }}
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.code} — {w.name} ({w.binCount} bins)</option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={() => loadPlan(selectedWHId)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 12px', color: '#64748b', cursor: 'pointer' }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ── No plan — Generate CTA ── */}
      {!plan && (
        <div style={{ background: '#fff', border: '2px dashed #e2e8f0', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CalendarDays size={24} style={{ color: '#2563eb' }} />
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>No plan for this week</h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', maxWidth: '360px', margin: '0 auto 24px' }}>
            Generate this week's cycle count plan. All <strong>{selectedWH?.binCount ?? '–'}</strong> bins in <strong>{selectedWH?.code}</strong> will be randomly distributed across 6 days ({selectedWH?.binCount ? Math.ceil(selectedWH.binCount / 6) : '–'} bins/day).
          </p>
          <button
            onClick={generate} disabled={generating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 700, background: generating ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 24px', cursor: generating ? 'not-allowed' : 'pointer' }}
          >
            <CalendarDays size={15} />
            {generating ? 'Generating...' : 'Generate This Week\'s Plan'}
          </button>
        </div>
      )}

      {/* ── Plan exists ── */}
      {plan && (
        <>
          {/* Week summary bar */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <CalendarDays size={16} style={{ color: '#2563eb' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Week of {weekLabel(mondayIso)}</span>
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {[
                { label: 'Total Bins',   value: plan.totalBins },
                { label: 'Bins / Day',   value: plan.binsPerDay },
                { label: 'Days Done',    value: `${completedDays} / 6` },
                { label: 'Bins Checked', value: `${totalChecked} / ${plan.totalBins}` },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb' }}>{item.value}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{item.label}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: '0 0 180px' }}>
              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                Week Progress — {Math.round((totalChecked / (plan.totalBins || 1)) * 100)}%
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', width: `${Math.min(100, (totalChecked / (plan.totalBins || 1)) * 100)}%`, transition: 'width 0.4s' }} />
              </div>
            </div>
          </div>

          {/* Reset button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={resetWeek} disabled={resetting}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, background: resetting ? '#f1f5f9' : '#fff', color: resetting ? '#94a3b8' : '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 12px', cursor: resetting ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw size={11} />
              {resetting ? 'Clearing...' : 'Reset Week & Regenerate'}
            </button>
          </div>

          {/* ── Two-panel horizontal layout ── */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

            {/* LEFT PANEL: day cards + overdue cards */}
            <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {sessions.map(s => <DayCard key={s.id} s={s} />)}

              {pendingOther.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 0 4px', borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                    <AlertTriangle size={12} style={{ color: '#dc2626' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Previous Weeks ({pendingOther.length})
                    </span>
                  </div>
                  {pendingOther.map(s => <DayCard key={s.id} s={s} overdue />)}
                </>
              )}
            </div>

            {/* RIGHT PANEL: bin checklist */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {!openId ? (
                <div style={{ background: '#f8fafc', border: '1.5px dashed #e2e8f0', borderRadius: '12px', padding: '56px 32px', textAlign: 'center', color: '#94a3b8' }}>
                  <ListChecks size={36} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.2 }} />
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>Select a day to check bins</div>
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>Click any day card on the left</div>
                </div>
              ) : (
                <BinChecklist
                  session={session}
                  loading={sessionLoading}
                  search={search} setSearch={setSearch}
                  filter={filter} setFilter={setFilter}
                  filteredBins={filteredBins}
                  checkedInSession={checkedInSession}
                  totalInSession={totalInSession}
                  saving={saving}
                  completing={completing}
                  getBinStatus={getBinStatus}
                  toggleBin={toggleBin}
                  markAllOK={markAllOK}
                  canComplete={canComplete}
                  onComplete={() => complete(openId!)}
                  pendingDisc={pendingDisc}
                  setPendingDisc={setPendingDisc}
                  confirmDiscrepancy={confirmDiscrepancy}
                  user={user}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bin Checklist sub-component ────────────────────────────────────────────────
function BinChecklist({
  session, loading, search, setSearch, filter, setFilter,
  filteredBins, checkedInSession, totalInSession,
  saving, completing, getBinStatus, toggleBin, markAllOK, canComplete, onComplete,
  pendingDisc, setPendingDisc, confirmDiscrepancy,
}: any) {

  const BIN_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
    PENDING:     { label: 'Unchecked',   bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
    OK:          { label: 'OK',          bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
    DISCREPANCY: { label: 'Discrepancy', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  };

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading bins...</div>
      ) : !session ? (
        <div style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Could not load session</div>
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ padding: '12px 14px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px', display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px' }}>
              <Search size={12} style={{ color: '#94a3b8' }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bin / rack..."
                style={{ border: 'none', background: 'none', fontSize: '12px', color: '#374151', outline: 'none', flex: 1 }}
              />
            </div>
            {(['ALL', 'PENDING', 'CHECKED'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '7px', border: `1px solid ${filter === f ? '#2563eb' : '#e2e8f0'}`, background: filter === f ? '#eff6ff' : '#fff', color: filter === f ? '#2563eb' : '#64748b', cursor: 'pointer' }}>
                {f === 'ALL' ? 'All' : f === 'PENDING' ? 'Unchecked' : 'Checked'}
              </button>
            ))}
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {checkedInSession} / {totalInSession} checked
            </div>
          </div>

          {/* Action bar */}
          <div style={{ padding: '9px 14px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={markAllOK} disabled={saving === 'ALL'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, background: saving === 'ALL' ? '#94a3b8' : '#ecfdf5', color: saving === 'ALL' ? '#fff' : '#059669', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
            >
              <CheckCircle2 size={13} />
              {saving === 'ALL' ? 'Marking...' : 'Mark All OK'}
            </button>
            <button
              onClick={onComplete} disabled={!canComplete || completing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, background: (!canComplete || completing) ? '#f1f5f9' : '#2563eb', color: (!canComplete || completing) ? '#94a3b8' : '#fff', border: 'none', borderRadius: '8px', padding: '6px 16px', cursor: (!canComplete || completing) ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}
            >
              <ListChecks size={13} />
              {completing ? 'Completing...' : 'Complete Session'}
            </button>
          </div>

          {/* Bin list */}
          <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
            {filteredBins.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No bins match your filter</div>
            ) : (
              filteredBins.map((bin: any, i: number) => {
                const st       = getBinStatus(bin.id);
                const bstyle   = BIN_STYLE[st] || BIN_STYLE.PENDING;
                const isSaving = saving === bin.id;
                const isAwaitingRemarks = pendingDisc?.binId === bin.id;
                const existingRemarks   = st === 'DISCREPANCY'
                  ? session?.checkedBins?.find((c: any) => c.id === bin.id)?.remarks
                  : null;

                return (
                  <div key={bin.id} style={{
                    background: isAwaitingRemarks ? '#fef9c3' : st === 'OK' ? '#f0fdf4' : st === 'DISCREPANCY' ? '#fff5f5' : i % 2 === 0 ? '#fff' : '#fafafa',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    {/* Main row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px' }}>
                      {/* Index */}
                      <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, color: '#475569', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      {/* Location */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{bin.code}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {bin.type === 'FLOOR' ? `Zone ${bin.rackCode}` : `Rack ${bin.rackCode}`}
                        </div>
                      </div>
                      {/* Status badge */}
                      <div style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: bstyle.bg, color: bstyle.color, border: `1px solid ${bstyle.border}`, flexShrink: 0 }}>
                        {bstyle.label}
                      </div>
                      {/* Action button */}
                      <button
                        onClick={() => toggleBin(bin.id, st)}
                        disabled={isSaving || isAwaitingRemarks}
                        style={{
                          width: '76px', padding: '5px 6px', borderRadius: '7px', border: 'none',
                          fontSize: '10px', fontWeight: 700,
                          cursor: (isSaving || isAwaitingRemarks) ? 'wait' : 'pointer',
                          background: isAwaitingRemarks ? '#fbbf24'
                                    : st === 'PENDING'   ? '#2563eb'
                                    : st === 'OK'        ? '#f59e0b'
                                    : '#6b7280',
                          color: '#fff', flexShrink: 0,
                        }}
                      >
                        {isSaving ? '...' : st === 'PENDING' ? '✓ Check' : st === 'OK' ? '⚠ Flag' : '↩ Reset'}
                      </button>
                    </div>

                    {/* Existing discrepancy remarks (read-only) */}
                    {existingRemarks && !isAwaitingRemarks && (
                      <div style={{ padding: '3px 14px 6px 50px', display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                        <AlertTriangle size={10} style={{ color: '#dc2626', marginTop: '1px', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', color: '#b91c1c', fontStyle: 'italic' }}>{existingRemarks}</span>
                      </div>
                    )}

                    {/* Inline remarks input — shown when user clicks ⚠ Flag */}
                    {isAwaitingRemarks && (
                      <div style={{ padding: '10px 14px 12px', background: '#fef9c3', borderTop: '1px solid #fde68a' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <AlertTriangle size={11} />
                          Describe the discrepancy <span style={{ color: '#dc2626' }}>(required)</span>
                        </div>
                        <textarea
                          value={pendingDisc.text}
                          onChange={e => setPendingDisc((p: any) => ({ ...p, text: e.target.value }))}
                          placeholder="e.g. Missing 2 units, damaged packaging, wrong location..."
                          autoFocus
                          rows={2}
                          style={{
                            width: '100%', fontSize: '12px', border: '1px solid #fbbf24',
                            borderRadius: '7px', padding: '7px 10px', resize: 'vertical',
                            outline: 'none', color: '#374151', background: '#fff',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={confirmDiscrepancy}
                            disabled={!pendingDisc.text.trim() || isSaving}
                            style={{
                              fontSize: '11px', fontWeight: 700,
                              background: (!pendingDisc.text.trim() || isSaving) ? '#94a3b8' : '#dc2626',
                              color: '#fff', border: 'none', borderRadius: '7px',
                              padding: '6px 14px', cursor: (!pendingDisc.text.trim() || isSaving) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSaving ? 'Saving...' : 'Confirm Discrepancy'}
                          </button>
                          <button
                            onClick={() => setPendingDisc(null)}
                            style={{ fontSize: '11px', fontWeight: 600, background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <XCircle size={11} /> Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Legend */}
          <div style={{ padding: '9px 14px', background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            {[
              { label: 'Unchecked → ✓ Check to mark OK',       color: '#64748b' },
              { label: 'OK → ⚠ Flag to log a discrepancy',     color: '#059669' },
              { label: 'Discrepancy → ↩ Reset to undo',        color: '#dc2626' },
            ].map(item => (
              <span key={item.label} style={{ fontSize: '10px', color: item.color, fontWeight: 600 }}>{item.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
