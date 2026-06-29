import { Fragment, useEffect, useMemo, useState } from 'react';
import { fetchCycleCountForCodes, type CycleCountRecord } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, StatusBadge, thStyle, tdStyle, fmtDate, C } from '../ui';

export default function CycleCount() {
  const allowedCodes = useAuthStore(s => s.allowedCodes);
  const selWorker = useAuthStore(s => s.selectedWorkerCode);
  const codes = selWorker ? [selWorker] : allowedCodes;
  const [records, setRecords] = useState<CycleCountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const data = await fetchCycleCountForCodes(codes);
        if (alive) setRecords(data);
      } catch (e: any) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [selWorker, allowedCodes.join(',')]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return records;
    return records.filter(r =>
      [r.warehouseCode, r.warehouseName, r.weekStart, r.weekEnd, r.status]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(t)));
  }, [records, q]);

  const totalDisc = filtered.reduce((s, r) => s + (r.discrepancyCount || 0), 0);

  if (loading) return <Spinner label="Loading cycle counts..." />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load cycle counts: {error}</Card>;

  return (
    <div>
      <PageHeader
        title="Cycle Count"
        subtitle={`${filtered.length} completed count${filtered.length === 1 ? '' : 's'} - ${totalDisc} discrepanc${totalDisc === 1 ? 'y' : 'ies'}`}
        right={
          <input className="toolbar-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search week, warehouse..."
            style={{ padding: '9px 14px', border: `1.5px solid ${C.line}`, borderRadius: 10, fontSize: 13, width: 280, maxWidth: '100%', outline: 'none' }} />
        }
      />
      <Card>
        {filtered.length ? (
          <div className="table-scroll">
            <table style={{ width: '100%' }}>
              <thead><tr>
                <th style={thStyle}>Week</th>
                <th style={thStyle}>Warehouse</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Bins</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>OK</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Discrepancy</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Unchecked</th>
                <th style={thStyle}>Completed</th>
                <th style={thStyle}>Status</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <Fragment key={r.id}>
                    <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.blue }}>{fmtDate(r.weekStart)} - {fmtDate(r.weekEnd)}</td>
                      <td style={tdStyle}>{r.warehouseCode}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.totalBins}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{r.okCount}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: r.discrepancyCount ? '#b91c1c' : C.sub, fontWeight: 600 }}>{r.discrepancyCount}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.uncheckedCount}</td>
                      <td style={tdStyle}>{fmtDate(r.completedAt)}</td>
                      <td style={tdStyle}><StatusBadge status={r.status} /></td>
                    </tr>
                    {open === r.id && r.sessionSummaries?.length > 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: '#f8fafc' }}>
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
                                  <td style={{ ...tdStyle, textAlign: 'right' }}>{s.ok}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right' }}>{s.disc}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right' }}>{s.unchecked}</td>
                                  <td style={tdStyle}><StatusBadge status={s.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message={records.length ? 'No matches for your search.' : 'No completed cycle counts yet. They appear here once staff finish a weekly count in the WMS.'} />
        )}
      </Card>
      <p style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>Tip: click a row to see the day-by-day breakdown.</p>
    </div>
  );
}
