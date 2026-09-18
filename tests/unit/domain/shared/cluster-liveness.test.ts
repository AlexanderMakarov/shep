/**
 * Cluster Provisioning Staleness Rules Unit Tests
 *
 * `isProvisioningStale` is the single definition of "worker likely dead/hung"
 * shared by ReconcileStuckClusterUseCase and its tests, so its boundary
 * behavior is pinned here.
 */

import { describe, it, expect } from 'vitest';
import {
  PROVISIONING_STALENESS_THRESHOLD_MS,
  isProvisioningStale,
} from '@/domain/shared/cluster-liveness.js';

describe('isProvisioningStale', () => {
  const now = new Date('2026-03-22T10:00:00Z');

  it('returns false when lastHealthCheckAt is well within the threshold', () => {
    const lastHealthCheckAt = new Date(now.getTime() - 10_000);
    expect(isProvisioningStale(lastHealthCheckAt, now)).toBe(false);
  });

  it('returns false exactly at the threshold boundary', () => {
    const lastHealthCheckAt = new Date(now.getTime() - PROVISIONING_STALENESS_THRESHOLD_MS);
    expect(isProvisioningStale(lastHealthCheckAt, now)).toBe(false);
  });

  it('returns true when lastHealthCheckAt exceeds the threshold', () => {
    const lastHealthCheckAt = new Date(now.getTime() - 181_000);
    expect(isProvisioningStale(lastHealthCheckAt, now)).toBe(true);
  });

  it('returns true when lastHealthCheckAt is undefined', () => {
    expect(isProvisioningStale(undefined, now)).toBe(true);
  });
});
