/**
 * DiskSpaceDiagnostic
 *
 * Free space on the filesystem backing `~/.shep`. A full disk does not
 * announce itself: SQLite writes start failing, worktrees stop being
 * created, and the run that dies looks like an agent problem.
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

/** Below this, a feature run will plausibly fail mid-flight. */
export const DISK_FAIL_THRESHOLD_BYTES = BYTES_PER_GIB;

/** Below this, there is room for the current run and not much else. */
export const DISK_WARN_THRESHOLD_BYTES = 5 * BYTES_PER_GIB;

@injectable()
export class DiskSpaceDiagnostic implements IDiagnostic {
  readonly name = 'disk-space';

  constructor(
    @inject('IShepEnvironmentInspector')
    private readonly inspector: IShepEnvironmentInspector
  ) {}

  async run(): Promise<DiagnosticResult> {
    const home = this.inspector.getShepHomePath();
    try {
      const space = await this.inspector.readDiskSpace();
      if (space === null) {
        return {
          name: this.name,
          status: DiagnosticStatus.Warn,
          detail: `Could not determine free space on the filesystem holding ${home}`,
          fixHint: 'Check free space manually before starting a long run',
        };
      }

      const detail = `${formatBytes(space.freeBytes)} free of ${formatBytes(space.totalBytes)} on ${home}`;
      if (space.freeBytes < DISK_FAIL_THRESHOLD_BYTES) {
        return {
          name: this.name,
          status: DiagnosticStatus.Fail,
          detail,
          fixHint: `Free up space — below ${formatBytes(DISK_FAIL_THRESHOLD_BYTES)} worktrees and SQLite writes start failing. Try \`shep logs prune\``,
        };
      }
      if (space.freeBytes < DISK_WARN_THRESHOLD_BYTES) {
        return {
          name: this.name,
          status: DiagnosticStatus.Warn,
          detail,
          fixHint: `Under ${formatBytes(DISK_WARN_THRESHOLD_BYTES)} free — consider \`shep logs prune\``,
        };
      }
      return { name: this.name, status: DiagnosticStatus.Ok, detail };
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Could not read free space for ${home}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        fixHint: 'Check that the Shep home directory exists',
      };
    }
  }
}
