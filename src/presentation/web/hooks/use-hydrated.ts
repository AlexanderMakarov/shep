'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {
  // Hydration is the only snapshot change.
};

/** Keep server-rendered controls disabled until their event handlers are ready. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
