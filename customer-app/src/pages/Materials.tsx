import { useEffect, useMemo, useState } from 'react';
import { fetchMaterials, type MaterialRow } from '../api';
import { Card, PageHeader, Spinner, EmptyState, thStyle, tdStyle, C } from '../ui';

export default function Materials() {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const data = await fetchMaterials();
        if (alive) setRows(data);
      } catch (e: any) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => [r.code, r.description, r.materialType, r.category]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(t)));
  }, [rows, q]);

  if (loading) return <Spinner label="Loading materials..." />;
  if (error) return <Card style={{ padding: 20, color: '#b91c1c' }}>Could not load materials: {error}</Card>;

  return (
    <div>
      <PageHeader
        title="Material Master"
        subtitle={`${filtered.length} material${filtered.length === 1 ? '' : 's'} in catalog`}
        right={
          <input className="toolbar-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code or description..."
            style={{ padding: '9px 14px', border: `1.5px solid ${C.line}`, borderRadius: 10, fontSize: 13, width: 280, maxWidth: '100%', outline: 'none' }} />
        }
      />
      <Card>
        {filtered.length ? (
          <div className="table-scroll">
            <table style={{ width: '100%' }}>
              <thead><tr>
                <th style={thStyle}>Code</th><th style={thStyle}>Description</th>
                <th style={thStyle}>Type</th><th style={thStyle}>Unit</th><th style={thStyle}>Category</th>
              </tr></thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{m.code}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', minWidth: 240 }}>{m.description}</td>
                    <td style={tdStyle}>{m.materialType || '-'}</td>
                    <td style={tdStyle}>{m.huUnit || '-'}</td>
                    <td style={tdStyle}>{m.category || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message={rows.length ? 'No matches for your search.' : 'No materials in the catalog yet.'} />
        )}
      </Card>
    </div>
  );
}
