/**
 * DaemonReachableDiagnostic
 *
 * Asks the daemon's own readiness endpoint whether it can serve a request.
 * `shep doctor` had no daemon check at all, and the readiness endpoint —
 * which resolves use cases from DI and does live database reads — was
 * never called by anything outside a browser.
 *
 * A daemon that is not running is a WARN, not a FAIL: plenty of CLI work
 * happens with no daemon up. A daemon that is running and cannot answer is
 * a FAIL, because that is the state where the UI looks alive and is not.
 */

import { inject, injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type { DaemonHealthReport } from '../../../ports/output/services/daemon-health-probe.interface.js';
import type { IDaemonHealthProbe } from '../../../ports/output/services/daemon-health-probe.interface.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';

@injectable()
export class DaemonReachableDiagnostic implements IDiagnostic {
  readonly name = 'daemon-reachable';

  constructor(
    @inject('IDaemonHealthProbe')
    private readonly probe: IDaemonHealthProbe
  ) {}

  async run(): Promise<DiagnosticResult> {
    let report: DaemonHealthReport;
    try {
      report = await this.probe.probe();
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Daemon health probe failed: ${messageOf(err)}`,
        fixHint: 'Run `shep status` and check ~/.shep/daemon.log',
      };
    }

    if (!report.daemonRunning) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: `No daemon running (${report.error ?? 'no daemon record'})`,
        fixHint: 'Run `shep start` if you expect the web UI to be up',
      };
    }

    if (!report.reachable) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Daemon is running but its readiness endpoint did not answer: ${
          report.error ?? 'unknown error'
        }`,
        fixHint: 'Check ~/.shep/daemon.log, then `shep restart`',
      };
    }

    const failing = report.checks.filter((check) => !check.ok);
    if (!report.healthy || failing.length > 0) {
      const summary = failing
        .map((check) => `${check.name}${check.detail ? `: ${check.detail}` : ''}`)
        .join('; ');
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Daemon readiness reported unhealthy (HTTP ${report.httpStatus ?? '?'})${
          summary.length > 0 ? ` — ${summary}` : ''
        }`,
        fixHint: 'Check ~/.shep/daemon.log, then `shep restart`',
      };
    }

    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: `Daemon ready at ${report.url ?? 'unknown url'} (${report.checks.length} check(s) healthy)`,
    };
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
