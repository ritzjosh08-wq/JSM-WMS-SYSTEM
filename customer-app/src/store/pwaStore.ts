import { create } from 'zustand';

// Captures the browser's install prompt so we can offer an "Install app" button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAState {
  deferred: BeforeInstallPromptEvent | null;
  canInstall: boolean;
  installed: boolean;
  setDeferred: (e: BeforeInstallPromptEvent | null) => void;
  setInstalled: (v: boolean) => void;
  promptInstall: () => Promise<void>;
}

export const usePWAStore = create<PWAState>((set, get) => ({
  deferred: null,
  canInstall: false,
  installed: false,
  setDeferred: (e) => set({ deferred: e, canInstall: !!e }),
  setInstalled: (v) => set({ installed: v, canInstall: false, deferred: null }),
  promptInstall: async () => {
    const e = get().deferred;
    if (!e) return;
    await e.prompt();
    try {
      const choice = await e.userChoice;
      if (choice.outcome === 'accepted') set({ installed: true });
    } catch { /* ignore */ }
    set({ deferred: null, canInstall: false });
  },
}));

// Wire up the global PWA events once, from app entry.
export function initPWA() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePWAStore.getState().setDeferred(e as BeforeInstallPromptEvent);
  });

  window.addEventListener('appinstalled', () => {
    usePWAStore.getState().setInstalled(true);
  });

  // Already running as an installed app?
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  if (standalone) usePWAStore.getState().setInstalled(true);

  // Register the service worker (only meaningful over https or on localhost).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}
