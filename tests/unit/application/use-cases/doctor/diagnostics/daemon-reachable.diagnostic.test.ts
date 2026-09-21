/**
 * DaemonReachableDiagnostic — `shep doctor` was blind to whether the
 * daemon was running at all, while a genuine readiness endpoint sat
 * unused under `/api/agent-events/health`.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { DaemonReachableDiagnostic } from '@/application/use-cases/doctor/diagnostics/daemon-reachable.diagnostic.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type {
  DaemonHealthReport,
  IDaemonHealthProbe,
} from '@/application/ports/output/services/daemon-health-probe.interface.js';

function probe(report: Partial<DaemonHealthReport>): IDaemonHealthProbe {
  return {
    probe: async () => ({
      daemonRunning: true,
      reachable: true,
      healthy: true,
      url: 'http://localhost:3417/api/health',
      httpStatus: 200,
      checks: [],
      error: null,
      ...report,
    }),
  };
}

describe('DaemonReachableDiagnostic', () => {
  it('has a stable name', () => {
    expect(new DaemonReachableDiagnostic(probe({})).name).toBe('daemon-reachable');
  });

  it('is ok when the readiness endpoint reports healthy', async () => {
    const result = await new DaemonReachableDiagnostic(
      probe({ checks: [{ name: 'container', ok: true }] })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('3417');
  });

  it('warns rather than fails when no daemon is running — that is a normal state', async () => {
    const result = await new DaemonReachableDiagnostic(
      probe({
        daemonRunning: false,
        reachable: false,
        healthy: false,
        url: null,
        error: 'no record',
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.fixHint).toContain('shep start');
  });

  it('fails when a live daemon does not answer its readiness endpoint', async () => {
    const result = await new DaemonReachableDiagnostic(
      probe({ reachable: false, healthy: false, error: 'ECONNREFUSED' })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('ECONNREFUSED');
  });

  it('fails and names the failing check when readiness reports unhealthy', async () => {
    const result = await new DaemonReachableDiagnostic(
      probe({
        healthy: false,
        httpStatus: 503,
        checks: [
          { name: 'container', ok: true },
          { name: 'features', ok: false, detail: 'database is locked' },
        ],
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('features');
    expect(result.detail).toContain('database is locked');
  });

  it('never throws, even when the probe rejects', async () => {
    const throwing: IDaemonHealthProbe = {
      probe: async () => {
        throw new Error('probe exploded');
      },
    };
    const result = await new DaemonReachableDiagnostic(throwing).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('probe exploded');
  });
});
