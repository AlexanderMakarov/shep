/**
 * ErrorBoundary fallback contract.
 *
 * `render()` chose the fallback with a TRUTHINESS check
 * (`if (this.props.fallback)`), so an EXPLICIT `fallback={null}` — the way
 * every global overlay in the app shell asks for "render nothing" — fell
 * through to the default 200px dashed error card and injected it into the
 * layout on behalf of a dialog that should occupy no space at all.
 *
 * The boundary must distinguish "no fallback prop" from "fallback given as
 * null", and must be able to tell its owner that it caught something, since
 * a silent boundary is how a crashed Cmd+K dialog goes unnoticed forever.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/common/error-boundary';

function Boom(): React.ReactElement {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs the caught error tree; the boundary itself also logs.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the default card when no fallback prop is given', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('renders NOTHING when an explicit fallback={null} is given', () => {
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a supplied fallback element', () => {
    render(
      <ErrorBoundary fallback={<span>custom fallback</span>}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('custom fallback')).toBeInTheDocument();
  });

  it('notifies onError once with the caught error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={null} onError={onError}>
        <Boom />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('kaboom');
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary fallback={null}>
        <span>healthy</span>
      </ErrorBoundary>
    );

    expect(screen.getByText('healthy')).toBeInTheDocument();
  });
});
