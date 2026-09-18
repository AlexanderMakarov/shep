import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationsPageClient } from '@/components/features/applications/applications-page-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/app/actions/list-deployments', () => ({
  listDeployments: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/hooks/deployment-status-provider', () => ({
  DeploymentStatusProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/features/control-center/control-center-empty-state', () => ({
  ControlCenterEmptyState: () => React.createElement('div', { 'data-testid': 'empty-state-stub' }),
}));

vi.mock('@/components/features/applications/application-card', () => ({
  ApplicationCard: ({ application }: { application: { id: string } }) =>
    React.createElement('div', { 'data-testid': `application-card-${application.id}` }),
}));

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ApplicationsPageClient)
    )
  );
}

describe('ApplicationsPageClient auto-refresh', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls /api/applications on an interval instead of fetching only once', async () => {
    vi.useFakeTimers();

    renderWithClient();

    // Flush the microtask queue so the initial queryFn promise resolves
    // under fake timers (testing-library's `waitFor` polls via a real
    // setInterval, which fake timers would otherwise stall).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAfterMount = fetchSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === '/api/applications'
    ).length;
    expect(callsAfterMount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    const callsAfterInterval = fetchSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === '/api/applications'
    ).length;
    expect(callsAfterInterval).toBeGreaterThan(callsAfterMount);
  });

  it('still renders the empty state while data is stale-free on first load', async () => {
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('empty-state-stub')).toBeInTheDocument());
  });
});
