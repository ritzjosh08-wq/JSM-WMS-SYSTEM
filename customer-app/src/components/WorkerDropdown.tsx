import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAuthStore } from '../store/authStore';
import { C } from '../ui';

// Lets the customer see how many workers are assigned and pick whose area to
// view. "All areas" shows the combined view across every worker.
export default function WorkerDropdown() {
  const team = useAuthStore(s => s.team);
  const selected = useAuthStore(s => s.selectedWorkerCode);
  const setSelected = useAuthStore(s => s.setSelectedWorkerCode);
  const [open, setOpen] = useState(false);

  if (!team.length) return null;

  const current = selected
    ? team.find(w => w.warehouseCode === selected)
    : null;
  const label = current ? current.name : 'All areas';

  const pick = (code: string | null) => { setSelected(code); setOpen(false); };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: selected ? '#eff6ff' : '#f8fafc',
          border: `1px solid ${selected ? '#bfdbfe' : C.line}`,
          borderRadius: 9, padding: '7px 12px', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: selected ? C.blueDark : C.sub, whiteSpace: 'nowrap',
        }}
        title="Choose which worker's area to view"
      >
        <span aria-hidden style={{ fontSize: 13 }}>👤</span>
        <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: C.blue, background: '#dbeafe',
          borderRadius: 10, padding: '1px 7px',
        }}>{team.length}</span>
        <span style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 240,
            background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 50, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.line}`, fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {team.length} worker{team.length === 1 ? '' : 's'} assigned
            </div>

            <button onClick={() => pick(null)} style={rowStyle(!selected)}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>All areas</div>
              <div style={{ fontSize: 11, color: C.faint }}>Combined view</div>
            </button>

            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {team.map(w => (
                <button key={w.username} onClick={() => pick(w.warehouseCode)} style={rowStyle(selected === w.warehouseCode)}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>
                    {w.warehouseCode || 'No area'}{w.task ? ` · ${w.task}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function rowStyle(active: boolean): CSSProperties {
  return {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '9px 14px', border: 'none', borderBottom: '1px solid #f8fafc',
    background: active ? '#eff6ff' : 'transparent', cursor: 'pointer',
    color: active ? C.blueDark : C.ink,
  };
}
