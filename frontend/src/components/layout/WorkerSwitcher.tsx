import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import type { SelectedWorker } from '../../store/authStore';
import { Users, ChevronDown } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

interface WorkerRecord {
  username: string;
  name: string;
  location: string;
  warehouseCode: string | null;
  task?: string | null;
}

export default function WorkerSwitcher() {
  const { user, selectedWorker, setSelectedWorker } = useAuthStore();
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [open, setOpen] = useState(false);

  const isCustomer = user?.role === 'CUSTOMER';
  const customerCodes = user?.warehouseCodes || [];

  useEffect(() => {
    if (isCustomer) { setWorkers((user?.team || []) as WorkerRecord[]); return; }
    fetch(`${API}/auth/workers`)
      .then(r => r.json())
      .then(json => setWorkers(json.workers || []))
      .catch(() => {});
  }, [isCustomer, user]);

  const allLabel = isCustomer ? 'All my areas' : 'All Warehouses';
  const allSub   = isCustomer ? 'Combined view' : 'Aggregated view';
  const isAllSelected = isCustomer
    ? (!!selectedWorker?.warehouseCodes && !selectedWorker?.warehouseCode)
    : !selectedWorker;

  const current = selectedWorker
    ? (selectedWorker.warehouseCodes && !selectedWorker.warehouseCode
        ? allLabel
        : `${selectedWorker.name} (${selectedWorker.warehouseCode || 'N/A'})`)
    : allLabel;

  const selectAll = () => {
    if (isCustomer && customerCodes.length) {
      setSelectedWorker({ username: '__all__', name: 'All my areas', location: user?.location || '', warehouseCode: null, warehouseCodes: customerCodes });
    } else {
      setSelectedWorker(null);
    }
    setOpen(false);
  };

  const select = (w: WorkerRecord | null) => {
    if (!w) { selectAll(); return; }
    const sw: SelectedWorker = { username: w.username, name: w.name, location: w.location, warehouseCode: w.warehouseCode };
    setSelectedWorker(sw);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', margin: '10px 10px 2px' }}>
      {/* Label */}
      <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px', paddingLeft: '2px' }}>
        {isCustomer ? `Your Workers · ${workers.length}` : 'Viewing Worker'}
      </div>

      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '7px 10px',
          background: selectedWorker ? '#eff6ff' : '#f8fafc',
          border: `1px solid ${selectedWorker ? '#bfdbfe' : '#e2e8f0'}`,
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          color: selectedWorker ? '#1d4ed8' : '#475569',
          textAlign: 'left',
          transition: 'all 0.12s',
        }}
      >
        <Users size={13} style={{ color: selectedWorker ? '#2563eb' : '#94a3b8', flexShrink: 0 }} />
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current}
        </span>
        <ChevronDown size={12} style={{ color: '#94a3b8', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* All Warehouses option */}
          <button
            onClick={selectAll}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 12px',
              background: isAllSelected ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: '1px solid #f1f5f9',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: isAllSelected ? 700 : 500,
              color: isAllSelected ? '#1d4ed8' : '#374151',
              textAlign: 'left',
            }}
          >
            <div style={{
              width: '24px', height: '24px', borderRadius: '6px',
              background: '#f1f5f9', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}>
              <Users size={12} style={{ color: '#64748b' }} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>{allLabel}</div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{allSub}</div>
            </div>
          </button>

          {/* Worker list */}
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {workers.length === 0 && (
              <div style={{ padding: '12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                No workers found
              </div>
            )}
            {workers.map(w => {
              const isSelected = selectedWorker?.username === w.username;
              const initials = w.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              return (
                <button
                  key={w.username}
                  onClick={() => select(w)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 12px',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #f8fafc',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? '#1d4ed8' : '#374151',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: isSelected ? '#2563eb' : '#e0e7ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: '9px', fontWeight: 800,
                    color: isSelected ? '#fff' : '#4338ca',
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {w.name}
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {w.warehouseCode || 'No warehouse'} · {w.task || w.username}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
