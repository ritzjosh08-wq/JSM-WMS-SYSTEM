import { create } from 'zustand';

interface AuthUser {
  username: string;
  name: string;
  role: string;
  location?: string;
}

interface AuthStore {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const SESSION_KEY = 'jsm_wms_user';

function loadUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: loadUser(),
  login: (user) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    set({ user: null });
  },
}));
