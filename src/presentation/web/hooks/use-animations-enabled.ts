'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'shep-animations-enabled';
const SYNC_EVENT = 'shep:animations-toggle';
const BODY_CLASS = 'no-animations';
/**
 * Marks "the user explicitly asked for animations". globals.css disables
 * animations under `@media (prefers-reduced-motion: reduce)` from the first
 * paint, and that block is scoped to `body:not(.animations-forced)` so this
 * class is what lets a stored opt-in beat the OS preference.
 */
const FORCED_CLASS = 'animations-forced';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

export interface UseAnimationsEnabledResult {
  enabled: boolean;
  toggle: () => void;
}

/** `matchMedia` does not exist during SSR, and is absent in some test envs. */
function reduceMotionQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(REDUCE_QUERY);
}

function readStoredChoice(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Private mode / blocked storage: fall back to the OS preference.
  }
  return null;
}

function applyToBody(enabled: boolean, explicit: boolean) {
  document.body.classList.toggle(BODY_CLASS, !enabled);
  document.body.classList.toggle(FORCED_CLASS, enabled && explicit);
}

export function useAnimationsEnabled(): UseAnimationsEnabledResult {
  // Seeded optimistically so the server render and the first client render
  // agree; the effect below reconciles with storage and the OS immediately.
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const query = reduceMotionQuery();

    const resolve = (prefersReduce: boolean) => {
      const stored = readStoredChoice();
      // An explicit stored choice always wins over the OS preference.
      const next = stored ?? !prefersReduce;
      setEnabled(next);
      applyToBody(next, stored !== null);
    };

    resolve(query?.matches ?? false);

    const onPreferenceChange = (event: MediaQueryListEvent) => {
      resolve(event.matches);
    };
    query?.addEventListener('change', onPreferenceChange);

    const onSync = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      setEnabled(next);
      // A sync event only ever follows a toggle, which is explicit by nature.
      applyToBody(next, true);
    };
    window.addEventListener(SYNC_EVENT, onSync);

    return () => {
      query?.removeEventListener('change', onPreferenceChange);
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Preference is still applied for this session.
    }
    setEnabled(next);
    applyToBody(next, true);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
  }, [enabled]);

  return { enabled, toggle };
}
