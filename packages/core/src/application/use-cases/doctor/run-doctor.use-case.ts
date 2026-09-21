/**
 * RunDoctorUseCase
 *
 * Orchestrates the `shep doctor` strategy pipeline. Resolves a list of
 * `IDiagnostic` strategies and an `IDiagnosticRunner`, executes them via
 * the runner (parallel + per-diagnostic timeout, see infrastructure
 * adapter), and returns the aggregated `DoctorReport`.
 *
 * Pure orchestration: NO presentation concerns (no formatting, no exit
 * codes). The CLI layer maps `overallStatus` to an exit code; web layers
 * render the report into a table or summary block.
 */

import { inject, injectable, injectAll } from 'tsyringe';

import { DiagnosticStatus } from '../../../domain/generated/output.js';
import {
  formatBuildIdentityLine,
  type BuildIdentity,
} from '../../../domain/value-objects/build-identity.js';
import type {
  DoctorReport,
  IDiagnostic,
  IDiagnosticRunner,
} from '../../ports/output/services/diagnostic.interface.js';
import type { IVersionService } from '../../ports/output/services/version-service.interface.js';

export interface DoctorReportSummary {
  ok: number;
  warn: number;
  fail: number;
}

export interface DoctorReportWithSummary extends DoctorReport {
  summary: DoctorReportSummary;
  /**
   * The build this report was produced by, or `null` when it could not be
   * read. `shep doctor` is the command users are told to run for a bug
   * report, so the report carries the build identity rather than leaving
   * each presentation layer to assemble it.
   */
  buildIdentity: BuildIdentity | null;
  /** Paste-ready one-line rendering of {@link buildIdentity}. */
  buildIdentityLine: string | null;
}

@injectable()
export class RunDoctorUseCase {
  constructor(
    @inject('IDiagnosticRunner')
    private readonly runner: IDiagnosticRunner,
    @injectAll('IDiagnostic')
    private readonly diagnostics: readonly IDiagnostic[],
    @inject('IVersionService')
    private readonly versionService: IVersionService
  ) {}

  async execute(): Promise<DoctorReportWithSummary> {
    const report = await this.runner.runAll(this.diagnostics);
    const buildIdentity = this.readBuildIdentity();
    return {
      ...report,
      summary: countByStatus(report),
      buildIdentity,
      buildIdentityLine: buildIdentity === null ? null : formatBuildIdentityLine(buildIdentity),
    };
  }

  /**
   * A doctor run that cannot read its own version must still report the ten
   * diagnostics — losing the whole report to a missing package.json is the
   * opposite of what this command is for.
   */
  private readBuildIdentity(): BuildIdentity | null {
    try {
      return this.versionService.getBuildIdentity();
    } catch {
      return null;
    }
  }
}

function countByStatus(report: DoctorReport): DoctorReportSummary {
  const summary: DoctorReportSummary = { ok: 0, warn: 0, fail: 0 };
  for (const r of report.results) {
    if (r.status === DiagnosticStatus.Ok) summary.ok += 1;
    else if (r.status === DiagnosticStatus.Warn) summary.warn += 1;
    else if (r.status === DiagnosticStatus.Fail) summary.fail += 1;
  }
  return summary;
}
