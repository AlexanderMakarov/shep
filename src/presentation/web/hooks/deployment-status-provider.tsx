'use client';

/**
 * DeploymentStatusProvider
 *
 * Wraps the dashboard with a shared deployment-status store seeded from
 * SSR data (ListDeploymentsUseCase via get-graph-data). All components
 * that call `useDeployAction(targetId)` subscribe to the same store, so
 * the "click Run on node → tab shows URL instantly" bug and the
 * "URL lost after refresh" bug are both resolved by construction.
 *
 * All business logic lives in use cases on the backend. This provider
 * owns only UI state transitions: which entries are hydrated, which are
 * loading, which have errors, and which need polling.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { deployFeature } from '@/app/actions/deploy-feature';
import { deployRepository } from '@/app/actions/deploy-repository';
import { deployApplication } from '@/app/actions/deploy-application';
import { stopDeployment } from '@/app/actions/stop-deployment';
import { getDeploymentStatus } from '@/app/actions/get-deployment-status';
import { createLogger } from '@/lib/logger';
import {
  DeploymentStatusStore,
  isDeploymentActive,
  type DeploymentEntryState,
  EMPTY_ENTRY,
} from './deployment-status-store';

const log = createLogger('[DeploymentStatusProvider]');

const POLL_INTERVAL_MS = 3000;
/** Ceiling for the failed-poll backoff — a dead daemon is retried at most this often. */
const MAX_POLL_BACKOFF_MS = 30_000;
/** One toast for the whole provider, however many targets go stale at once. */
const STALE_TOAST_ID = 'deployment-status-stale';

const EMPTY_STALE_SET: ReadonlySet<string> = new Set();

/** 3s → 6s → 12s → 24s → 30s (capped). */
function pollBackoffMs(consecutiveFailures: number): number {
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, MAX_POLL_BACKOFF_MS);
}

export interface DeployActionInput {
  targetId: string;
  targetType: 'feature' | 'repository' | 'application';
  repositoryPath: string;
  branch?: string;
}

interface DeploymentContextValue {
  store: DeploymentStatusStore;
  deploy: (input: DeployActionInput) => Promise<void>;
  stop: (targetId: string) => Promise<void>;
  ensureHydrated: (targetId: string) => void;
  /**
   * Targets whose status poll is currently failing. Their entry in the
   * store still holds the LAST KNOWN state — it is not fresh, and it is
   * not "not deployed". Surfaces such as a node badge or the deploy panel
   * can mark it accordingly; the set is React state, so consumers of this
   * context re-render when staleness changes.
   */
  staleTargetIds: ReadonlySet<string>;
}

const DeploymentStatusContext = createContext<DeploymentContextValue | null>(null);

export function DeploymentStatusProvider({
  initialDeployments,
  children,
}: {
  initialDeployments: DeploymentStatusEntry[];
  children: ReactNode;
}) {
  // One store per provider instance. Stable across renders.
  const storeRef = useRef<DeploymentStatusStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new DeploymentStatusStore();
    storeRef.current.hydrate(initialDeployments);
  }
  const store = storeRef.current;

  // Re-hydrate when SSR data changes (e.g. after graph-data poll).
  useEffect(() => {
    store.hydrate(initialDeployments);
  }, [initialDeployments, store]);

  // ── Staleness ────────────────────────────────────────────────────────
  // A failed poll is NOT an answer. The previous implementation treated it
  // as one — `setStatus(targetId, null)` + `stopPolling` — so a single
  // dropped request turned a running preview into "not deployed" forever.
  // Now the last known state is kept, the target is flagged stale, and the
  // poll keeps going with backoff.
  const [staleTargetIds, setStaleTargetIds] = useState<ReadonlySet<string>>(EMPTY_STALE_SET);

  const markStale = useCallback((targetId: string) => {
    setStaleTargetIds((prev) => {
      if (prev.has(targetId)) return prev;
      const next = new Set(prev);
      next.add(targetId);
      return next;
    });
  }, []);

  const clearStale = useCallback((targetId: string) => {
    setStaleTargetIds((prev) => {
      if (!prev.has(targetId)) return prev;
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
  }, []);

  // Telling the user is an effect of the state, not of the state setter —
  // a toast fired inside the updater would double up under StrictMode. One
  // message for the whole provider (stable id), not one per target, so a
  // daemon outage with a dozen tracked previews stays a single toast.
  const staleToastShownRef = useRef(false);
  useEffect(() => {
    const anyStale = staleTargetIds.size > 0;
    if (anyStale && !staleToastShownRef.current) {
      staleToastShownRef.current = true;
      toast.warning('Deployment status is out of date — showing the last known state.', {
        id: STALE_TOAST_ID,
      });
    } else if (!anyStale && staleToastShownRef.current) {
      staleToastShownRef.current = false;
      toast.dismiss(STALE_TOAST_ID);
    }
  }, [staleTargetIds]);

  // ── Polling ──────────────────────────────────────────────────────────
  // One self-rescheduling timer per targetId (a plain interval cannot back
  // off). Started when an entry becomes active (Analyzing…Ready) and
  // stopped only by a definitive answer or by reconciliation.
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Targets currently being polled. Tracked separately from the timer map
  // because between firing and rescheduling there IS no timer, and a
  // second startPolling in that window would double the poll rate.
  const pollingTargetsRef = useRef<Set<string>>(new Set());
  const pollFailuresRef = useRef<Map<string, number>>(new Map());

  const stopPolling = useCallback((targetId: string) => {
    const existing = pollTimersRef.current.get(targetId);
    if (existing) clearTimeout(existing);
    pollTimersRef.current.delete(targetId);
    pollingTargetsRef.current.delete(targetId);
    pollFailuresRef.current.delete(targetId);
  }, []);

  const startPolling = useCallback(
    (targetId: string) => {
      if (pollingTargetsRef.current.has(targetId)) return;
      pollingTargetsRef.current.add(targetId);

      const schedule = (delayMs: number) => {
        // A stop() between the poll firing and this reschedule must win.
        if (!pollingTargetsRef.current.has(targetId)) return;
        pollTimersRef.current.set(targetId, setTimeout(poll, delayMs));
      };

      const poll = async () => {
        pollTimersRef.current.delete(targetId);
        let result;
        try {
          result = await getDeploymentStatus(targetId);
        } catch (err) {
          const failures = (pollFailuresRef.current.get(targetId) ?? 0) + 1;
          pollFailuresRef.current.set(targetId, failures);
          log.warn(`poll failed for "${targetId}" (attempt ${String(failures)})`, err);
          // Keep the last known state — the deployment itself has not told
          // us anything. Retry later instead of giving up for good.
          markStale(targetId);
          schedule(pollBackoffMs(failures));
          return;
        }

        pollFailuresRef.current.set(targetId, 0);
        clearStale(targetId);

        // A definitive answer: there is no deployment, or it stopped.
        if (!result || result.state === DeploymentState.Stopped) {
          store.setStatus(targetId, null);
          stopPolling(targetId);
          return;
        }
        store.setStatus(targetId, result);
        schedule(POLL_INTERVAL_MS);
      };

      schedule(POLL_INTERVAL_MS);
    },
    [store, stopPolling, markStale, clearStale]
  );

  // Reconcile polling with store state on every change.
  useEffect(() => {
    const timers = pollTimersRef.current;
    const polling = pollingTargetsRef.current;
    const reconcile = () => {
      // Stop polls for entries that are no longer active.
      for (const targetId of [...polling]) {
        const entry = store.getEntry(targetId);
        if (!isDeploymentActive(entry.status)) {
          stopPolling(targetId);
          clearStale(targetId);
        }
      }
    };
    const unsubscribe = store.subscribeAll(reconcile);
    return () => {
      unsubscribe();
      for (const [, timer] of timers) clearTimeout(timer);
      timers.clear();
      polling.clear();
    };
  }, [store, stopPolling, clearStale]);

  // ── Mount hydration per targetId ─────────────────────────────────────
  // When a hook subscribes to a targetId that was not in the SSR hydration
  // (e.g. a stale page with deployments started in another tab), fetch its
  // status once from the backend via getDeploymentStatus → use case.
  const ensureHydrated = useCallback(
    (targetId: string) => {
      if (!targetId) return;
      const entry = store.getEntry(targetId);
      if (entry.hydrated) return;
      // After the first SSR seed runs, ListDeploymentsUseCase has provided
      // the complete deployment universe — any targetId not in that list
      // is definitively idle, so there is no need to ask the server again.
      // Just mark this id hydrated locally and skip the network call.
      // This kills the burst of N server-action POSTs that happened on
      // canvas mount when most nodes had no active deployment.
      if (store.isFullyHydrated()) {
        store.update(targetId, { hydrated: true });
        return;
      }
      // Mark hydrated immediately to dedupe concurrent callers.
      store.update(targetId, { hydrated: true });
      void (async () => {
        try {
          const result = await getDeploymentStatus(targetId);
          store.setStatus(targetId, result);
          if (result && isDeploymentActive(result.state)) startPolling(targetId);
        } catch (err) {
          log.warn(`ensureHydrated failed for "${targetId}"`, err);
        }
      })();
    },
    [store, startPolling]
  );

  // ── Actions ──────────────────────────────────────────────────────────
  const deploy = useCallback(
    async (input: DeployActionInput) => {
      store.update(input.targetId, { deployLoading: true, deployError: null });
      try {
        const result =
          input.targetType === 'feature'
            ? await deployFeature(input.targetId)
            : input.targetType === 'application'
              ? await deployApplication(input.targetId)
              : await deployRepository(input.repositoryPath);
        if (!result.success) {
          store.update(input.targetId, {
            deployLoading: false,
            deployError: result.error ?? 'An unexpected error occurred',
          });
          return;
        }
        store.update(input.targetId, {
          deployLoading: false,
          status: result.state ?? null,
          url: null,
          hydrated: true,
          targetType: input.targetType,
        });
        startPolling(input.targetId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        store.update(input.targetId, { deployLoading: false, deployError: message });
      }
    },
    [store, startPolling]
  );

  const stop = useCallback(
    async (targetId: string) => {
      if (!targetId) return;
      store.update(targetId, { stopLoading: true });
      try {
        const result = await stopDeployment(targetId);
        if (result.success) {
          stopPolling(targetId);
          clearStale(targetId);
          store.update(targetId, {
            stopLoading: false,
            status: null,
            url: null,
          });
        } else {
          store.update(targetId, { stopLoading: false });
        }
      } catch (err) {
        log.warn('stop error (non-critical)', err);
        store.update(targetId, { stopLoading: false });
      }
    },
    [store, stopPolling, clearStale]
  );

  const value = useMemo<DeploymentContextValue>(
    () => ({ store, deploy, stop, ensureHydrated, staleTargetIds }),
    [store, deploy, stop, ensureHydrated, staleTargetIds]
  );

  return (
    <DeploymentStatusContext.Provider value={value}>{children}</DeploymentStatusContext.Provider>
  );
}

export function useDeploymentStatusContext(): DeploymentContextValue {
  const ctx = useContext(DeploymentStatusContext);
  if (!ctx) {
    throw new Error('useDeploymentStatusContext must be used within a <DeploymentStatusProvider>');
  }
  return ctx;
}

/**
 * Non-throwing variant used by presentational hooks (e.g. useDeployAction)
 * that may render inside Storybook or other isolated contexts without
 * a provider. Returns a stub store/actions that do nothing.
 */
export function useDeploymentStatusContextOptional(): DeploymentContextValue {
  const ctx = useContext(DeploymentStatusContext);
  if (ctx) return ctx;
  return FALLBACK_CONTEXT;
}

const FALLBACK_STORE = new DeploymentStatusStore();
const FALLBACK_CONTEXT: DeploymentContextValue = {
  store: FALLBACK_STORE,
  staleTargetIds: EMPTY_STALE_SET,
  deploy: async () => {
    /* no-op */
  },
  stop: async () => {
    /* no-op */
  },
  ensureHydrated: () => {
    /* no-op */
  },
};

export { EMPTY_ENTRY, type DeploymentEntryState };
