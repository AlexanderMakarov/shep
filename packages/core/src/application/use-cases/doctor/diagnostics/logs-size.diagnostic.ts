/**
 * LogsSizeDiagnostic
 *
 * Nothing rotates, caps or deletes `~/.shep/logs/worker-*.log`, and the
 * worker log is large by design — `[tool]` lines carry full tool-input
 * JSON and `[text]` lines full assistant prose. Left alone it grows until
 * the disk does, which surfaces as unrelated-looking failures elsewhere.
 */

import { inject, injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import { formatBytes } from '../../../../domain/shared/format-bytes.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IShepEnvironmentInspector } from '../../../ports/output/services/shep-environment-inspector.interface.js';

const BYTES_PER_GIB = 1024 ** 3;

/** Worth pruning. */
export const LOGS_WARN_THRESHOLD_BYTES = BYTES_PER_GIB / 2;

/** Large enough that it is now a disk-space problem in its own right. */
export const LOGS_FAIL_THRESHOLD_BYTES = 2 * BYTES_PER_GIB;

/** The command that fixes this, named once. */
const PRUNE_COMMAND = 'shep logs prune';

@injectable()
export class LogsSizeDiagnostic implements IDiagnostic {
  readonly name = 'logs-size';

  constructor(
    @inject('IShepEnvironmentInspector')
    private readonly inspector: IShepEnvironmentInspector
  ) {}

  async run(): Promise<DiagnosticResult> {
    const logsPath = this.inspector.getLogsPath();
    try {
      const footprint = await this.inspector.readLogsFootprint();
      const oldestSuffix =
        footprint.oldestModifiedAt === null
          ? ''
          : `, oldest ${footprint.oldestModifiedAt.toISOString()}`;
      const detail = `${formatBytes(footprint.totalBytes)} across ${footprint.fileCount} file(s) in ${logsPath}${oldestSuffix}`;

      if (footprint.totalBytes > LOGS_FAIL_THRESHOLD_BYTES) {
        return {
          name: this.name,
          status: DiagnosticStatus.Fail,
          detail,
          fixHint: `Run \`${PRUNE_COMMAND} --older-than 7d --yes\` — worker logs are never rotated`,
        };
      }
      if (footprint.totalBytes > LOGS_WARN_THRESHOLD_BYTES) {
        return {
          name: this.name,
          status: DiagnosticStatus.Warn,
          detail,
          fixHint: `Run \`${PRUNE_COMMAND}\` to see what can be removed`,
        };
      }
      return { name: this.name, status: DiagnosticStatus.Ok, detail };
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Could not measure ${logsPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        fixHint: `Check that ${logsPath} is readable`,
      };
    }
  }
}
