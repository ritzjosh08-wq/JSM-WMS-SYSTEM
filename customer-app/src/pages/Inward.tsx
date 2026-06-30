import { Fragment, useEffect, useMemo, useState } from 'react';
import { fetchInwardForCodes, type InwardEntry } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, PageHeader, Spinner, EmptyState, StatusBadge, thStyle, tdStyle, fmtDate, C } from '../ui';

export default function Inward() {
  const codes = useAuthStore(s => s.allowedCodes);
  const [entries, setEntries] = useState<InwardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const data = await fetchInwardForCodes(codes);
        if (alive) setEntries(data);
      } catch (e: any) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [codes]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter(e =>
      [e.inwardNumber, e.truckNumber, e.transporter, e.invoiceNumber, e.lrNumber]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(t)));
  }, [entries, q]);

  if (loading) return <Spinner label="Loading inward entries…" />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load: {error}</Card>;

  return (
    <div>
      <PageHeader
        title="Inward Entries"
        subtitle={`${filtered.length} incoming shipment${filtered.length === 1 ? '' : 's'}`}
        right={
          <input className="toolbar-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search inward #, truck, invoice…"
            style={{ padding: '9px 14px', border: `1.5px solid ${C.line}`, borderRadius: 10, fontSize: 13, width: 280, maxWidth: '100%', outline: 'none' }} />
        }
      />
      <Card>
        {filtered.length ? (
          <div className="table-scroll">
            <table style={{ width: '100%' }}>
              <thead><tr>
                <th style={thStyle}>Inward #</th><th style={thStyle}>Date</th><th style={thStyle}>Truck</th>
                <th style={thStyle}>Transporter</th><th style={thStyle}>Invoice</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Items</th><th style={thStyle}>Status</th>
              </tr></thead>
              <tbody>
                {filtered.map(e => (
                  <Fragment key={e.id}>
                    <tr onClick={() => setOpen(open === e.id ? null : e.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.blue }}>{e.inwardNumber}</td>
                      <td style={tdStyle}>{fmtDate(e.inwardDate || e.createdAt)}</td>
                      <td style={tdStyle}>{e.truckNumber}</td>
                      <td style={tdStyle}>{e.transporter || '—'}</td>
                      <td style={tdStyle}>{e.invoiceNumber || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{e.lineItems?.length || 0}</td>
                      <td style={tdStyle}><StatusBadge status={e.status} /></td>
                    </tr>
                    {open === e.id && e.lineItems?.length > 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: '#f8fafc' }}>
                          <table style={{ width: '100%' }}>
                            <thead><tr>
                              <th style={{ ...thStyle, background: '#f1f5f9' }}>Material</th>
                              <th style={{ ...thStyle, background: '#f1f5f9' }}>Description</th>
                              <th style={{ ...thStyle, background: '#f1f5f9' }}>Batch</th>
                              <th style={{ ...thStyle, background: '#f1f5f9', textAlign: 'right' }}>Qty</th>
                              <th style={{ ...thStyle, background: '#f1f5f9' }}>Status</th>
                            </tr></thead>
                            <tbody>
                              {e.lineItems.map((li, i) => (
                                <tr key={i}>
                                  <td style={tdStyle}>{li.materialCode}</td>
                                  <td style={{ ...tdStyle, whiteSpace: 'normal' }}>{li.description || '—'}</td>
                                  <td style={tdStyle}>{li.batchNumber}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right' }}>{li.quantity?.toLocaleString()}</td>
                                  <td style={tdStyle}><StatusBadge status={li.lineItemStatus} /></td>
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
          <EmptyState message={entries.length ? 'No matches for your search.' : 'No inward entries yet.'} />
        )}
      </Card>
      <p style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>Tip: click a row to see its line items.</p>
    </div>
  );
}
