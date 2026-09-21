/**
 * CheckDaemonHealthUseCase
 *
 * Wraps the daemon readiness probe so every presentation layer asks the
 * same question the same way and gets an answer it can render without
 * further work. `shep status` used to report daemon.json plus `ps` output
 * — evidence that a process exists, not that it can serve a request — and
 * the readiness endpoint that could answer properly was never called.
 */

import { inject, injectable } from 'tsyringe';

import type {
  DaemonHealthCheck,
  DaemonHealthReport,
  IDaemonHealthProbe,
} from '../../ports/output/services/daemon-health-probe.interface.js';

export interface DaemonHealthResult extends DaemonHealthReport {
  /** The checks that came back unhealthy; empty when all is well. */
  failingChecks: DaemonHealthCheck[];
  /** One line, ready to print. */
  summary: string;
}

@injectable()
export class CheckDaemonHealthUseCase {
  constructor(
    @inject('IDaemonHealthProbe')
    private readonly probe: IDaemonHealthProbe
  ) {}

  async execute(): Promise<DaemonHealthResult> {
    let report: DaemonHealthReport;
    try {
      report = await this.probe.probe();
    } catch (err) {
      report = {
        daemonRunning: false,
        reachable: false,
        healthy: false,
        url: null,
        httpStatus: null,
        checks: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const failingChecks = report.checks.filter((check) => !check.ok);
    return { ...report, failingChecks, summary: summarise(report, failingChecks) };
  }
}

function summarise(report: DaemonHealthReport, failingChecks: DaemonHealthCheck[]): string {
  if (!report.daemonRunning) {
    return `Not running${report.error === null ? '' : ` (${report.error})`}`;
  }
  if (!report.reachable) {
    return `Unreachable${report.error === null ? '' : ` (${report.error})`}`;
  }
  if (!report.healthy || failingChecks.length > 0) {
    const named = failingChecks
      .map((check) => `${check.name}${check.detail === undefined ? '' : `: ${check.detail}`}`)
      .join('; ');
    return `Unhealthy (HTTP ${report.httpStatus ?? '?'})${named.length > 0 ? ` — ${named}` : ''}`;
  }
  return `Ready — ${report.checks.length} check(s) healthy (HTTP ${report.httpStatus ?? 200})`;
}
