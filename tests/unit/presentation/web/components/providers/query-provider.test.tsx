import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/components/providers/query-provider';

function DefaultOptionsProbe() {
  const client = useQueryClient();
  const { refetchOnWindowFocus, staleTime, gcTime } = client.getDefaultOptions().queries ?? {};
  return React.createElement(
    'div',
    { 'data-testid': 'probe' },
    JSON.stringify({ refetchOnWindowFocus, staleTime, gcTime })
  );
}

describe('QueryProvider default query options', () => {
  it('refetches stale queries when the window regains focus', () => {
    render(React.createElement(QueryProvider, null, React.createElement(DefaultOptionsProbe)));

    const probe = JSON.parse(screen.getByTestId('probe').textContent ?? '{}');
    expect(probe.refetchOnWindowFocus).toBe(true);
    expect(probe.staleTime).toBe(30_000);
    expect(probe.gcTime).toBe(5 * 60_000);
  });
});
