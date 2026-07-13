import { create } from 'zustand';
import type { AuthUser, TeamWorker } from '../api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  allowedCodes: string[];
  team: TeamWorker[];
  selectedWorkerCode: string | null;
  setSession: (user: AuthUser, allowedCodes: string[], token: string) => void;
  setSelectedWorkerCode: (code: string | null) => void;
  logout: () => void;
}

const USER_KEY = 'jsm_customer_user';
const TOKEN_KEY = 'jsm_customer_token';
const CODES_KEY = 'jsm_customer_codes';
const TEAM_KEY = 'jsm_customer_team';
const SEL_KEY = 'jsm_customer_selworker';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: load<AuthUser | null>(USER_KEY, null),
  token: load<string | null>(TOKEN_KEY, null),
  allowedCodes: load<string[]>(CODES_KEY, []),
  team: load<TeamWorker[]>(TEAM_KEY, []),
  selectedWorkerCode: load<string | null>(SEL_KEY, null),

  setSession: (user, allowedCodes, token) => {
    const team = user.team || [];
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    sessionStorage.setItem(CODES_KEY, JSON.stringify(allowedCodes));
    sessionStorage.setItem(TEAM_KEY, JSON.stringify(team));
    sessionStorage.removeItem(SEL_KEY);
    set({ user, token, allowedCodes, team, selectedWorkerCode: null });
  },

  setSelectedWorkerCode: (code) => {
    if (code) sessionStorage.setItem(SEL_KEY, JSON.stringify(code));
    else sessionStorage.removeItem(SEL_KEY);
    set({ selectedWorkerCode: code });
  },

  logout: () => {
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CODES_KEY);
    sessionStorage.removeItem(TEAM_KEY);
    sessionStorage.removeItem(SEL_KEY);
    set({ user: null, token: null, allowedCodes: [], team: [], selectedWorkerCode: null });
  },
}));
