/**
 * A failed status poll is not an answer.
 *
 * The poll's catch block called `setStatus(targetId, null)` and
 * `stopPolling(targetId)`, so ONE failed request (daemon restarting, a
 * dropped socket) permanently downgraded a RUNNING preview to "not
 * deployed" — and, because polling had stopped, it never recovered. The
 * provider must keep the last known state, say that it is stale, and keep
 * polling with backoff; only a definitive answer (no deployment, or
 * Stopped) may clear the state and end the poll.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { useDeployAction } from '@/hooks/use-deploy-action';
import {
  DeploymentStatusProvider,
  useDeploymentStatusContext,
} from '@/hooks/deployment-status-provider';

const toastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const mockDeployFeature = vi.fn();
const mockGetDeploymentStatus = vi.fn();

vi.mock('@/app/actions/deploy-feature', () => ({
  deployFeature: (...args: unknown[]) => mockDeployFeature(...args),
}));
vi.mock('@/app/actions/deploy-repository', () => ({ deployRepository: vi.fn() }));
vi.mock('@/app/actions/deploy-application', () => ({ deployApplication: vi.fn() }));
vi.mock('@/app/actions/stop-deployment', () => ({ stopDeployment: vi.fn() }));
vi.mock('@/app/actions/get-deployment-status', () => ({
  getDeploymentStatus: (...args: unknown[]) => mockGetDeploymentStatus(...args),
}));

const POLL_INTERVAL_MS = 3000;

const featureInput = {
  targetId: 'feature-poll',
  targetType: 'feature' as const,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/my-feature',
};

function withProvider(children: ReactNode) {
  return <DeploymentStatusProvider initialDeployments={[]}>{children}</DeploymentStatusProvider>;
}

function useProbe() {
  const deploy = useDeployAction(featureInput);
  const { staleTargetIds } = useDeploymentStatusContext();
  return { ...deploy, stale: staleTargetIds.has(featureInput.targetId) };
}

/** Deploy, then advance to a Ready + polling steady state. */
async function renderRunningDeployment() {
  mockDeployFeature.mockResolvedValue({ success: true, state: DeploymentState.Booting });
  const rendered = renderHook(() => useProbe(), {
    wrapper: ({ children }) => withProvider(children),
  });

  await act(async () => {
    await rendered.result.current.deploy();
  });

  mockGetDeploymentStatus.mockResolvedValueOnce({
    state: DeploymentState.Ready,
    url: 'http://localhost:5173',
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  });
  expect(rendered.result.current.status).toBe(DeploymentState.Ready);
  return rendered;
}

describe('DeploymentStatusProvider failed polls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the last known state instead of reporting "not deployed"', async () => {
    const { result } = await renderRunningDeployment();

    mockGetDeploymentStatus.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    expect(result.current.status).toBe(DeploymentState.Ready);
    expect(result.current.url).toBe('http://localhost:5173');
  });

  it('marks the target stale and says so once', async () => {
    const { result } = await renderRunningDeployment();

    mockGetDeploymentStatus.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    expect(result.current.stale).toBe(true);
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a failure and recovers on the next success', async () => {
    const { result } = await renderRunningDeployment();
    const callsBefore = mockGetDeploymentStatus.mock.calls.length;

    mockGetDeploymentStatus.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGetDeploymentStatus.mock.calls.length).toBe(callsBefore + 1);
    expect(result.current.stale).toBe(true);

    // Backed off, so the next attempt is later than the normal interval —
    // but it MUST still happen. Answer every subsequent poll too: a bare
    // `undefined` from an exhausted `...Once` mock is a *definitive* "no
    // deployment", which would end the poll for an unrelated reason.
    mockGetDeploymentStatus.mockResolvedValue({
      state: DeploymentState.Ready,
      url: 'http://localhost:5173',
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mockGetDeploymentStatus.mock.calls.length).toBeGreaterThan(callsBefore + 1);
    expect(result.current.status).toBe(DeploymentState.Ready);
    expect(result.current.stale).toBe(false);
  });

  it('backs off rather than hammering the daemon while it is down', async () => {
    await renderRunningDeployment();
    mockGetDeploymentStatus.mockRejectedValue(new Error('ECONNREFUSED'));

    const callsBefore = mockGetDeploymentStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    const attempts = mockGetDeploymentStatus.mock.calls.length - callsBefore;
    // A fixed 3s interval would be 20 attempts in the same window.
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThan(10);
  });

  it('still clears the state and stops polling on a definitive Stopped', async () => {
    const { result } = await renderRunningDeployment();

    mockGetDeploymentStatus.mockResolvedValueOnce({ state: DeploymentState.Stopped, url: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(result.current.status).toBeNull();

    const callsAfterStop = mockGetDeploymentStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(mockGetDeploymentStatus.mock.calls.length).toBe(callsAfterStop);
  });
});
