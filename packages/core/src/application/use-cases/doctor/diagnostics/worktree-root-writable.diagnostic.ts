/**
 * WorktreeRootWritableDiagnostic
 *
 * Every feature run creates a git worktree under `<shep home>/repos`. If
 * that path cannot be written — read-only mount, wrong owner after a
 * `sudo` run, a full disk — the run fails at the point where it has
 * already been queued and reported as started.
 */

import { inject, injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IShepEnvironmentInspector } from '../../../ports/output/services/shep-environment-inspector.interface.js';

@injectable()
export class WorktreeRootWritableDiagnostic implements IDiagnostic {
  readonly name = 'worktree-root-writable';

  constructor(
    @inject('IShepEnvironmentInspector')
    private readonly inspector: IShepEnvironmentInspector
  ) {}

  async run(): Promise<DiagnosticResult> {
    const root = this.inspector.getWorktreeRootPath();
    try {
      const writable = await this.inspector.isWritable(root);
      if (!writable) {
        return {
          name: this.name,
          status: DiagnosticStatus.Fail,
          detail: `Worktree root ${root} is not writable — every feature run needs a worktree here`,
          fixHint: `Check ownership and free space: \`ls -ld ${root}\``,
        };
      }
      return {
        name: this.name,
        status: DiagnosticStatus.Ok,
        detail: `Worktree root ${root} is writable`,
      };
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Could not verify ${root}: ${err instanceof Error ? err.message : String(err)}`,
        fixHint: `Check ownership and free space: \`ls -ld ${root}\``,
      };
    }
  }
}
