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
  token: string | null;
  selectedWorker: SelectedWorker | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  setSelectedWorker: (worker: SelectedWorker | null) => void;
}

const SESSION_KEY    = 'jsm_wms_user';
const TOKEN_KEY       = 'jsm_wms_token';
const WORKER_SEL_KEY = 'jsm_wms_selected_worker';

function loadUser(): AuthUser | null {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function loadToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
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
  token: loadToken(),
  selectedWorker: loadSelectedWorker(),
  login: (user, token) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    sessionStorage.setItem(TOKEN_KEY, token);
    // Scope non-admins to their own warehouse(s):
    //  • CUSTOMER → all areas of their workers (combined)
    //  • WORKER   → just their own warehouse (so they never see other sites) — UNLESS this
    //    worker is explicitly shared across multiple warehouses (e.g. "chennaippd" handles
    //    both CM35 and FG05), in which case the backend login response includes a
    //    warehouseCodes array with more than one entry and we combine-scope them the same
    //    way a CUSTOMER's areas are combined, instead of locking them to a single code.
    let initialScope: SelectedWorker | null = null;
    if (user.role === 'CUSTOMER') initialScope = combinedScope(user);
    else if (user.role === 'WORKER' && user.warehouseCodes && user.warehouseCodes.length > 1) {
      initialScope = combinedScope(user);
    } else if (user.role === 'WORKER' && user.warehouseCode) {
      initialScope = { username: user.username, name: user.name, location: user.location || '', warehouseCode: user.warehouseCode };
    }
    if (initialScope) sessionStorage.setItem(WORKER_SEL_KEY, JSON.stringify(initialScope));
    else sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ user, token, selectedWorker: initialScope });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ user: null, token: null, selectedWorker: null });
  },
  setSelectedWorker: (worker) => {
    if (worker) sessionStorage.setItem(WORKER_SEL_KEY, JSON.stringify(worker));
    else sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ selectedWorker: worker });
  },
}));
