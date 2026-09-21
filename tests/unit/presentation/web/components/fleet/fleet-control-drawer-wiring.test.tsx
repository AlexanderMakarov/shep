/**
 * FleetControl → FleetTriageDrawer wiring (spec 111).
 *
 * `fleet-control.tsx` used to hand the drawer `items={data?.triageItems ?? []}`
 * and nothing else, so an empty array meant two different things — "the fleet
 * is clear" and "we have not read the fleet yet" — and the drawer rendered the
 * all-clear for both. The distinction lives in a `loading` prop, and the only
 * place it can be observed is the boundary between the two components, so this
 * file stubs the drawer to record what it was given.
 *
 * It is a separate file because `vi.mock` is hoisted per module: the sibling
 * `fleet-control.test.tsx` needs the real drawer to exercise the open path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { FleetOverview, FleetTriageItem } from '@shepai/core/domain/generated/output';
import { FleetTriageCategory, FleetTriagePriority } from '@shepai/core/domain/generated/output';

const getFleetData = vi.fn();
vi.mock('@/app/actions/fleet-data', () => ({
  getFleetData: (...args: unknown[]) => getFleetData(...args),
}));

const drawerProps = vi.fn();
vi.mock('@/components/fleet/fleet-triage-drawer', () => ({
  FleetTriageDrawer: (props: Record<string, unknown>) => {
    drawerProps(props);
    return null;
  },
}));

const { FleetControl } = await import('@/components/fleet/fleet-control');

const NOW = '2026-09-11T12:00:00.000Z';

const OVERVIEW: FleetOverview = {
  counts: {
    total: 52,
    cruising: 42,
    queued: 5,
    attentionNeeded: 2,
    failed: 1,
    waitingApproval: 2,
    blockedQuestions: 0,
  },
  circuitBreakerTripped: false,
  activeTriageCount: 1,
  consecutiveFailures: 0,
  timestamp: NOW,
};

const ITEMS: FleetTriageItem[] = [
  {
    featureId: 'feat-1',
    featureName: 'Needs Plan Approval',
    slug: 'needs-plan',
    priority: FleetTriagePriority.p1,
    category: FleetTriageCategory.gate,
    reason: 'Waiting on the plan approval gate',
    runId: 'run-1',
    gateType: 'plan',
    createdAt: NOW,
  },
];

/** The props of the most recent drawer render. */
function lastProps(): Record<string, unknown> {
  const calls = drawerProps.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('FleetControl → FleetTriageDrawer', () => {
  beforeEach(() => {
    getFleetData.mockReset();
    drawerProps.mockReset();
  });

  it('marks the feed as loading while the first read is still in flight', () => {
    getFleetData.mockImplementation(() => new Promise(() => undefined));

    render(<FleetControl />);

    expect(lastProps().loading).toBe(true);
    expect(lastProps().items).toEqual([]);
  });

  it('clears the loading flag once the items land', async () => {
    getFleetData.mockResolvedValue({ overview: OVERVIEW, triageItems: ITEMS });

    render(<FleetControl />);

    await waitFor(() => expect(lastProps().loading).toBe(false));
    expect(lastProps().items).toEqual(ITEMS);
  });

  it('never marks a server-rendered snapshot as loading', () => {
    render(<FleetControl initialData={{ overview: OVERVIEW, triageItems: ITEMS }} />);

    expect(lastProps().loading).toBe(false);
    expect(lastProps().items).toEqual(ITEMS);
  });

  it('does not claim to be loading when the read failed — that is an error, not a wait', async () => {
    getFleetData.mockRejectedValue(new Error('container unavailable'));

    render(<FleetControl />);

    await waitFor(() => expect(lastProps().loading).toBe(false));
  });
});
