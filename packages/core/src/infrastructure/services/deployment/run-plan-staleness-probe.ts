/**
 * Run Plan Staleness Probe (infrastructure adapter)
 *
 * Thin adapter over the two on-disk facts the run-plan use cases need:
 * `computeConfigHash` for drift, and the `.shep/dev.json` reader for "is a
 * committed override in charge here?". Both live in infrastructure because
 * both read the filesystem; this class is what lets the application layer use
 * them through a port instead of importing them.
 *
 * Neither method throws. A plan lookup must survive an unreadable repository:
 * a failed hash reads as "changed" (worst case, one re-analysis) and a failed
 * config read reads as "no committed override" (worst case, an override the
 * user can still save).
 */

import { injectable } from 'tsyringe';

import type { IRunPlanStalenessProbe } from '../../../application/ports/output/services/run-plan-staleness-probe.interface.js';
import { computeConfigHash } from './config-hash.js';
import { readValidatedRepoDevConfig } from './repo-dev-config-reader.js';

@injectable()
export class RunPlanStalenessProbe implements IRunPlanStalenessProbe {
  currentConfigHash(repoPath: string): string {
    try {
      return computeConfigHash(repoPath);
    } catch {
      return '';
    }
  }

  /**
   * Whether the repository DECLARES a valid dev config.
   *
   * Deliberately the pre-consent reader: this answers "is there a committed
   * declaration whose staleness matters?", and a file awaiting approval is
   * still a declaration. Gating it on consent would report a repo-config
   * repository as having none, which is a different question.
   */
  hasRepoDevConfig(repoPath: string): boolean {
    try {
      return readValidatedRepoDevConfig(repoPath) !== null;
    } catch {
      return false;
    }
  }
}
