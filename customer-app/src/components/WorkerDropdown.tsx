import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { C, IconUser, IconChevron } from '../ui';

// Lets the customer see how many workers are assigned and pick whose area to view.
export default function WorkerDropdown() {
  const team = useAuthStore(s => s.team);
  const selected = useAuthStore(s => s.selectedWorkerCode);
  const setSelected = useAuthStore(s => s.setSelectedWorkerCode);
  const [open, setOpen] = useState(false);

  if (!team.length) return null;

  const current = selected ? team.find(w => w.warehouseCode === selected) : null;
  const label = current ? current.name : 'All areas';
  const pick = (code: string | null) => { setSelected(code); setOpen(false); };

  const row = (active: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
    borderBottom: '1px solid #f1f5f9', background: active ? C.blue : 'transparent', cursor: 'pointer',
    color: active ? '#fff' : C.ink,
  });

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="btn"
        style={{ background: selected ? '#eff6ff' : '#fff', color: selected ? C.blueDark : C.sub, border: `1px solid ${selected ? '#bfdbfe' : C.line}`, boxShadow: 'none' }}
        title="Choose which worker's area to view">
        <IconUser size={15} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: C.blue, background: '#dbeafe', borderRadius: 999, padding: '1px 7px' }}>{team.length}</span>
        <IconChevron size={14} style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div className="card" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 250, zIndex: 50, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.line}`, fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {team.length} worker{team.length === 1 ? '' : 's'} assigned
            </div>
            <button onClick={() => pick(null)} style={row(!selected)}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>All areas</div>
              <div style={{ fontSize: 11, color: !selected ? '#dbeafe' : C.faint }}>Combined view</div>
            </button>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {team.map(w => {
                const active = selected === w.warehouseCode;
                return (
                  <button key={w.username} onClick={() => pick(w.warehouseCode)} style={row(active)}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                    <div style={{ fontSize: 11, color: active ? '#dbeafe' : C.faint }}>{w.warehouseCode || 'No area'}{w.task ? ` · ${w.task}` : ''}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
