import { useEffect, useRef } from 'react';

/**
 * Keeps a customer-portal page in sync with changes warehouse staff make in
 * the WMS software. Every page here loads its data once on mount and never
 * again, so an inward/outward/cycle-count update made on the desktop app
 * would otherwise sit invisible until the customer manually reloads.
 *
 * This re-runs `fn` on a fixed interval, and immediately whenever the tab
 * regains focus or becomes visible again (e.g. switching back to the app
 * on a phone) — the most common moment a customer actually wants fresh data.
 *
 * Tuned to stay light on mobile: the interval skips entirely while the tab
 * is backgrounded, focus/visibility firing together only trigger one fetch
 * (they're throttled to a shared cooldown), and calls never overlap.
 */
export function useLiveRefresh(fn: () => void, intervalMs = 45000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const inFlightRef = useRef(false);
  const lastRunRef = useRef(0);
  const MIN_GAP_MS = 4000; // guards against focus + visibilitychange both firing at once

  useEffect(() => {
    const tick = async () => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (now - lastRunRef.current < MIN_GAP_MS) return;
      lastRunRef.current = now;
      inFlightRef.current = true;
      try {
        await fnRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, intervalMs);

    const onFocus = () => tick();
    const onVisibility = () => { if (document.visibilityState === 'visible') tick(); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
