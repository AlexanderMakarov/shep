/**
 * ApplicationPageLoader error path.
 *
 * The loader read `error` only to detect the 404 sentinel. Any other
 * failure (daemon down, 500) left `error` set and `data` undefined, so the
 * `isLoading || !data` branch won and the page spun FOREVER — react-query
 * had already exhausted `retry: 2` and would never fetch again on its own.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationPageLoader } from '@/components/features/application-page/application-page-loader';

// The real `notFound()` throws to unwind the render; this stub only
// records the call, so the component continues rendering past it.
const notFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
}));

vi.mock('@/hooks/agent-events-provider', () => ({
  useApplicationUpdate: () => undefined,
}));

vi.mock('@/hooks/deployment-status-provider', () => ({
  DeploymentStatusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/features/application-page/application-page', () => ({
  ApplicationPage: () => <div data-testid="application-page-stub" />,
}));

function renderLoader() {
  // The component sets its own `retry` predicate (2 attempts for anything
  // that is not the 404 sentinel), so only the delay is worth flattening.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ApplicationPageLoader applicationId="app-1" />
    </QueryClientProvider>
  );
}

describe('ApplicationPageLoader', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an error state with a retry action instead of spinning forever', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

    renderLoader();

    const retry = await screen.findByTestId('application-load-retry', undefined, {
      timeout: 5000,
    });
    expect(screen.getByTestId('application-load-error')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();

    const callsBefore = fetchSpy.mock.calls.length;
    await userEvent.click(retry);
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('still calls notFound() for the 404 sentinel rather than the error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    renderLoader();

    await waitFor(() => expect(notFound).toHaveBeenCalled());
  });

  it('renders the application once the fetch succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ application: { id: 'app-1', name: 'Apollo' } }),
    } as Response);

    renderLoader();

    await waitFor(() => expect(screen.getByTestId('application-page-stub')).toBeInTheDocument());
    expect(screen.queryByTestId('application-load-error')).not.toBeInTheDocument();
  });
});
