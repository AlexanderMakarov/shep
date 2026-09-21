/**
 * CheckDaemonHealthUseCase — the single entry point every presentation
 * layer uses to ask "can the daemon actually serve a request?".
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { CheckDaemonHealthUseCase } from '@/application/use-cases/daemon/check-daemon-health.use-case.js';
import type {
  DaemonHealthReport,
  IDaemonHealthProbe,
} from '@/application/ports/output/services/daemon-health-probe.interface.js';

function probe(overrides: Partial<DaemonHealthReport> = {}): IDaemonHealthProbe {
  return {
    probe: async () => ({
      daemonRunning: true,
      reachable: true,
      healthy: true,
      url: 'http://localhost:3417/api/health',
      httpStatus: 200,
      checks: [{ name: 'container', ok: true }],
      error: null,
      ...overrides,
    }),
  };
}

describe('CheckDaemonHealthUseCase', () => {
  it('returns the probe report with a ready-to-render summary', async () => {
    const result = await new CheckDaemonHealthUseCase(probe()).execute();
    expect(result.healthy).toBe(true);
    expect(result.summary).toMatch(/ready|healthy/i);
    expect(result.failingChecks).toEqual([]);
  });

  it('extracts the failing checks so the caller does not filter them', async () => {
    const result = await new CheckDaemonHealthUseCase(
      probe({
        healthy: false,
        httpStatus: 503,
        checks: [
          { name: 'container', ok: true },
          { name: 'features', ok: false, detail: 'database is locked' },
        ],
      })
    ).execute();
    expect(result.failingChecks).toEqual([
      { name: 'features', ok: false, detail: 'database is locked' },
    ]);
    expect(result.summary).toContain('features');
  });

  it('summarises a stopped daemon without calling it a failure', async () => {
    const result = await new CheckDaemonHealthUseCase(
      probe({ daemonRunning: false, reachable: false, healthy: false, error: 'no record' })
    ).execute();
    expect(result.daemonRunning).toBe(false);
    expect(result.summary).toMatch(/not running/i);
  });

  it('summarises a live-but-unreachable daemon as unreachable', async () => {
    const result = await new CheckDaemonHealthUseCase(
      probe({ reachable: false, healthy: false, error: 'ECONNREFUSED' })
    ).execute();
    expect(result.summary).toMatch(/unreachable/i);
    expect(result.summary).toContain('ECONNREFUSED');
  });

  it('never throws when the probe rejects', async () => {
    const throwing: IDaemonHealthProbe = {
      probe: async () => {
        throw new Error('probe exploded');
      },
    };
    const result = await new CheckDaemonHealthUseCase(throwing).execute();
    expect(result.healthy).toBe(false);
    expect(result.summary).toContain('probe exploded');
  });
});
