import { create } from 'zustand';

export interface TeamWorker {
  username: string;
  name: string;
  location: string;
  warehouseCode: string | null;
  task?: string | null;
}

interface AuthUser {
  username: string;
  name: string;
  role: string;
  location?: string;
  warehouseCode?: string;
  task?: string | null;
  allowedLocations?: string[];
  warehouseCodes?: string[];
  team?: TeamWorker[];
}

export interface SelectedWorker {
  username: string;
  name: string;
  location: string;
  warehouseCode: string | null;
  warehouseCodes?: string[];
}

interface AuthStore {
  user: AuthUser | null;
  selectedWorker: SelectedWorker | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  setSelectedWorker: (worker: SelectedWorker | null) => void;
}

const SESSION_KEY    = 'jsm_wms_user';
const WORKER_SEL_KEY = 'jsm_wms_selected_worker';

function loadUser(): AuthUser | null {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function loadSelectedWorker(): SelectedWorker | null {
  try { const raw = sessionStorage.getItem(WORKER_SEL_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function whQuery(sw: SelectedWorker | null, joiner: '?' | '&' = '?'): string {
  if (!sw) return '';
  if (sw.warehouseCodes && sw.warehouseCodes.length) return `${joiner}warehouseCodes=${sw.warehouseCodes.join(',')}`;
  if (sw.warehouseCode) return `${joiner}warehouseCode=${sw.warehouseCode}`;
  return '';
}

function combinedScope(user: AuthUser): SelectedWorker | null {
  const codes = user.warehouseCodes || [];
  if (!codes.length) return null;
  return { username: '__all__', name: 'All my areas', location: user.location || '', warehouseCode: null, warehouseCodes: codes };
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: loadUser(),
  selectedWorker: loadSelectedWorker(),
  login: (user) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    const initialScope = user.role === 'CUSTOMER' ? combinedScope(user) : null;
    if (initialScope) sessionStorage.setItem(WORKER_SEL_KEY, JSON.stringify(initialScope));
    else sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ user, selectedWorker: initialScope });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ user: null, selectedWorker: null });
  },
  setSelectedWorker: (worker) => {
    if (worker) sessionStorage.setItem(WORKER_SEL_KEY, JSON.stringify(worker));
    else sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ selectedWorker: worker });
  },
}));
