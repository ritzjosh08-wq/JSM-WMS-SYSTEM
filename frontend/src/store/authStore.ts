import { create } from 'zustand';

interface AuthUser {
  username: string;
  name: string;
  role: string;
  location?: string;
  warehouseCode?: string;
}

export interface SelectedWorker {
  username: string;
  name: string;
  location: string;
  warehouseCode: string | null;
}

interface AuthStore {
  user: AuthUser | null;
  selectedWorker: SelectedWorker | null; // Admin only — which worker is being viewed
  login: (user: AuthUser) => void;
  logout: () => void;
  setSelectedWorker: (worker: SelectedWorker | null) => void;
}

const SESSION_KEY    = 'jsm_wms_user';
const WORKER_SEL_KEY = 'jsm_wms_selected_worker';

function loadUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadSelectedWorker(): SelectedWorker | null {
  try {
    const raw = sessionStorage.getItem(WORKER_SEL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: loadUser(),
  selectedWorker: loadSelectedWorker(),

  login: (user) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    // Clear any leftover worker selection on fresh login
    sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ user, selectedWorker: null });
  },

  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(WORKER_SEL_KEY);
    set({ user: null, selectedWorker: null });
  },

  setSelectedWorker: (worker) => {
    if (worker) {
      sessionStorage.setItem(WORKER_SEL_KEY, JSON.stringify(worker));
    } else {
      sessionStorage.removeItem(WORKER_SEL_KEY);
    }
    set({ selectedWorker: worker });
  },
}));
