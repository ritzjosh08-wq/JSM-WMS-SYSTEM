import { Fragment, useEffect, useMemo, useState } from 'react';
import { fetchCycleCountForCodes, type CycleCountRecord } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, thStyle, tdStyle, fmtDate, C, IconCycle, IconAlert, IconRefresh } from '../ui';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING:     { label: 'Pending',     color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  OVERDUE:     { label: 'Overdue',     color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  COMPLETED:   { label: 'Completed',   color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
};
function meta(s: string) { return STATUS_META[s] || { label: s || '—', color: C.sub, bg: '#f1f5f9', border: C.line }; }

function Pill({ status }: { status: string }) {
  const m = meta(status);
  return <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}`, borderRadius: 999, padding: '3px 11px', fontSize: 11, fontWeight: 800 }}>{m.label}</span>;
}

function Kpi({ label, value, accent, bg, Icon, sub }: { label: string; value: string | number; accent: string; bg: string; Icon: any; sub?: string }) {
  return (
    <div className="kpi">
      <div className="chip" style={{ background: bg, color: accent }}><Icon size={18} /></div>
      <div className="label">{label}</div>
      <div className="value" style={{ color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Small green check / red alert icons (inline)
const IconCheck = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

export default function CycleCount() {
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const codes = selWorker ? [selWorker] : allowedCodes;
  const [records, setRecords] = useState<CycleCountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError('');
    try { setRecords(await fetchCycleCountForCodes(codes)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selWorker, allowedCodes.join(',')]);
  useLiveRefresh(() => load({ silent: true }));

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return records;
    return records.filter(r =>
      [r.warehouseCode, r.warehouseName, r.weekStart, r.weekEnd, r.status]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(t)));
  }, [records, q]);

  const tot = useMemo(() => {
    const bins = filtered.reduce((s, r) => s + (r.totalBins || 0), 0);
    const ok = filtered.reduce((s, r) => s + (r.okCount || 0), 0);
    const disc = filtered.reduce((s, r) => s + (r.discrepancyCount || 0), 0);
    const completed = filtered.filter(r => r.status === 'COMPLETED').length;
    const checked = ok + disc;
    const accuracy = checked ? Math.round((ok / checked) * 100) : 0;
    return { bins, ok, disc, completed, accuracy };
  }, [filtered]);

  if (loading) return <Spinner label="Loading cycle counts…" />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load cycle counts: {error}</Card>;

  return (
    <div>
      <PageHeader
        title="Cycle Count"
        subtitle={`${filtered.length} count${filtered.length === 1 ? '' : 's'} · ${tot.accuracy}% stock accuracy`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="toolbar-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search week, warehouse…"
              style={{ padding: '9px 14px', border: `1.5px solid ${C.line}`, borderRadius: 10, fontSize: 13, width: 220, maxWidth: '100%', outline: 'none' }} />
            <button onClick={() => load()} className="btn btn-primary"><IconRefresh size={15} /> Refresh</button>
          </div>
        }
      />

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi label="Completed Counts" value={tot.completed} accent={C.blue} bg="#eff6ff" Icon={IconCycle} sub={`${filtered.length} total`} />
        <Kpi label="Bins Checked" value={tot.bins.toLocaleString()} accent="#0891b2" bg="#ecfeff" Icon={IconCycle} />
        <Kpi label="Matched (OK)" value={tot.ok.toLocaleString()} accent="#059669" bg="#ecfdf5" Icon={IconCheck} />
        <Kpi label="Discrepancies" value={tot.disc.toLocaleString()} accent="#dc2626" bg="#fef2f2" Icon={IconAlert} />
        <Kpi label="Stock Accuracy" value={`${tot.accuracy}%`} accent="#7c3aed" bg="#f5f3ff" Icon={IconCheck} />
      </div>

      {/* Records as cards */}
      {filtered.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => {
            const checked = (r.okCount || 0) + (r.discrepancyCount || 0);
            const acc = checked ? Math.round((r.okCount / checked) * 100) : 0;
            const isOpen = open === r.id;
            return (
              <Card key={r.id} style={{ overflow: 'hidden' }}>
                <div onClick={() => setOpen(isOpen ? null : r.id)} style={{ cursor: 'pointer', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{fmtDate(r.weekStart)} – {fmtDate(r.weekEnd)}</span>
                        <span style={{ background: '#eff6ff', color: C.blueDark, border: '1px solid #bfdbfe', borderRadius: 7, padding: '2px 9px', fontSize: 11, fontWeight: 800 }}>{r.warehouseCode}</span>
                        <Pill status={r.status} />
                      </div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
                        {r.warehouseName || 'Warehouse'}{r.completedAt ? ` · completed ${fmtDate(r.completedAt)}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: acc >= 98 ? '#059669' : acc >= 90 ? '#d97706' : '#dc2626', lineHeight: 1 }}>{acc}%</div>
                      <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>accuracy</div>
                    </div>
                  </div>

                  {/* metric chips */}
                  <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
                    {[
                      { k: 'Bins', v: r.totalBins, c: C.ink },
                      { k: 'OK', v: r.okCount, c: '#059669' },
                      { k: 'Discrepancy', v: r.discrepancyCount, c: r.discrepancyCount ? '#dc2626' : C.faint },
                      { k: 'Unchecked', v: r.uncheckedCount, c: r.uncheckedCount ? '#d97706' : C.faint },
                    ].map(m => (
                      <div key={m.k}><span style={{ fontSize: 18, fontWeight: 800, color: m.c }}>{m.v}</span> <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>{m.k}</span></div>
                    ))}
                  </div>

                  {/* accuracy bar */}
                  <div style={{ height: 8, borderRadius: 999, background: '#eef2f7', overflow: 'hidden', marginTop: 12, display: 'flex' }}>
                    <div style={{ width: `${checked ? (r.okCount / r.totalBins) * 100 : 0}%`, background: '#22c55e' }} />
                    <div style={{ width: `${r.totalBins ? (r.discrepancyCount / r.totalBins) * 100 : 0}%`, background: '#ef4444' }} />
                    <div style={{ width: `${r.totalBins ? (r.uncheckedCount / r.totalBins) * 100 : 0}%`, background: '#fbbf24' }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginTop: 10 }}>{isOpen ? '▲ Hide day-by-day breakdown' : '▼ Show day-by-day breakdown'}</div>
                </div>

                {isOpen && r.sessionSummaries?.length > 0 && (
                  <div className="table-scroll" style={{ borderTop: `1px solid ${C.line}`, background: '#f8fafc' }}>
                    <table style={{ width: '100%' }}>
                      <thead><tr>
                        <th style={{ ...thStyle, background: '#f1f5f9' }}>Day</th>
                        <th style={{ ...thStyle, background: '#f1f5f9', textAlign: 'right' }}>Bins</th>
                        <th style={{ ...thStyle, background: '#f1f5f9', textAlign: 'right' }}>OK</th>
                        <th style={{ ...thStyle, background: '#f1f5f9', textAlign: 'right' }}>Discrepancy</th>
                        <th style={{ ...thStyle, background: '#f1f5f9', textAlign: 'right' }}>Unchecked</th>
                        <th style={{ ...thStyle, background: '#f1f5f9' }}>Status</th>
                      </tr></thead>
                      <tbody>
                        {r.sessionSummaries.map((s, i) => (
                          <tr key={i}>
                            <td style={tdStyle}>{fmtDate(s.date)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{s.total}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{s.ok}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: s.disc ? '#b91c1c' : C.sub, fontWeight: 600 }}>{s.disc}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{s.unchecked}</td>
                            <td style={tdStyle}><Pill status={s.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><EmptyState message={records.length ? 'No matches for your search.' : 'No completed cycle counts yet. They appear here once staff finish a weekly count in the WMS.'} icon={<IconCycle size={36} />} /></Card>
      )}
    </div>
  );
}
