/**
 * Route-level error boundaries for the dashboard segment.
 *
 * The app had no `error.tsx` in ANY segment, so a throw from a server
 * component (or an uncaught client render error) escaped to Next's root
 * handling: a blank screen in production with no message and no way back
 * except a manual reload. The drawer slot needs its own boundary too — it
 * is a parallel route, so without one a drawer failure takes the whole
 * dashboard page down with it.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import DashboardError from '@/app/(dashboard)/error';
import DrawerError from '@/app/(dashboard)/@drawer/error';

describe('dashboard route error boundaries', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the failure and offers a recovery action on the page boundary', async () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error('graph data unavailable')} reset={reset} />);

    expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    expect(screen.getByText(/graph data unavailable/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('dashboard-error-retry'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the digest when Next provides one, so a server error is traceable', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });
    render(<DashboardError error={error} reset={vi.fn()} />);

    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('logs the error rather than swallowing it', () => {
    render(<DashboardError error={new Error('boom')} reset={vi.fn()} />);
    expect(consoleError).toHaveBeenCalled();
  });

  it('shows the failure and offers a recovery action on the drawer boundary', async () => {
    const reset = vi.fn();
    render(<DrawerError error={new Error('feature lookup failed')} reset={reset} />);

    expect(screen.getByTestId('drawer-error')).toBeInTheDocument();
    expect(screen.getByText(/feature lookup failed/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('drawer-error-retry'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('lets the user close a drawer that cannot be opened', async () => {
    render(<DrawerError error={new Error('feature lookup failed')} reset={vi.fn()} />);

    await userEvent.click(screen.getByTestId('drawer-error-close'));
    expect(push).toHaveBeenCalledWith('/control-center');
  });
});
