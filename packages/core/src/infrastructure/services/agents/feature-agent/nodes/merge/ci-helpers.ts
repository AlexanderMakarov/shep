/**
 * CI Helper Utilities
 *
 * Shared helpers for the CI watch/fix loop and merge node:
 * - extractRunId: parse GitHub Actions run ID from URL
 * - hasCiWorkflowConfig: does this checkout define any CI at all?
 * - ciStatusBlocksAutoMerge: may a given CiStatus proceed to auto-merge?
 * - handleCiTerminalFailure: update feature repo on CI failure
 * - buildCiExhaustedError: structured error for exhausted/timed-out loops
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { PrStatus, CiStatus, type CiFixRecord } from '@/domain/generated/output.js';

/** Repo-relative directory that holds GitHub Actions workflow definitions. */
const WORKFLOWS_DIR_SEGMENTS = ['.github', 'workflows'] as const;

/** Workflow definitions are YAML; anything else in that directory is not CI. */
const WORKFLOW_FILE_RE = /\.ya?ml$/i;

/**
 * Does this checkout define any CI that a push is expected to trigger?
 *
 * Used to tell two very different "no CI run was detected" situations apart:
 *
 * - **No workflows at all** — the repository simply has no CI. There is
 *   nothing to wait for and nothing to report, so the merge must not be
 *   blocked. (Recording `Success` here would be the very lie this check
 *   exists to prevent; the loop records no CI status at all instead.)
 * - **Workflows exist but no run was observed** — CI was expected and we
 *   could not read it. That is {@link CiStatus.Indeterminate} and it blocks.
 *
 * The CI loop is GitHub-Actions-shaped throughout (`gh run list`,
 * `gh pr checks`), so GitHub Actions is the only CI this can detect. A repo
 * driven by some other provider reads as "no CI configured" and keeps the
 * pre-existing non-blocking behaviour — deliberately the usable side of the
 * trade-off, since a false block would stall every such repository.
 */
export function hasCiWorkflowConfig(cwd: string): boolean {
  try {
    return readdirSync(join(cwd, ...WORKFLOWS_DIR_SEGMENTS)).some((entry) =>
      WORKFLOW_FILE_RE.test(entry)
    );
  } catch {
    // Directory missing or unreadable — no GitHub Actions CI here.
    return false;
  }
}

/**
 * May a feature auto-merge on this CI status?
 *
 * Exhaustive on purpose: the `never` assignment below stops compiling the
 * moment {@link CiStatus} gains a member, forcing the new member's merge
 * semantics to be stated here rather than defaulting to "allowed".
 */
export function ciStatusBlocksAutoMerge(status: CiStatus): boolean {
  switch (status) {
    case CiStatus.Success:
      return false;
    // Failure and Pending are self-evident. Indeterminate means the gate
    // produced no evidence either way, so it escalates to the human merge
    // gate instead of silently passing.
    case CiStatus.Failure:
    case CiStatus.Pending:
    case CiStatus.Indeterminate:
      return true;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/**
 * Extract the numeric GitHub Actions run ID from a run URL.
 * Example: https://github.com/org/repo/actions/runs/12345 → "12345"
 */
export function extractRunId(runUrl: string): string | undefined {
  const match = runUrl.match(/\/runs\/(\d+)/);
  return match ? match[1] : undefined;
}

/**
 * Update the feature repository to mark CI as failed before throwing.
 */
export async function handleCiTerminalFailure(
  feature: Awaited<ReturnType<Pick<IFeatureRepository, 'findById'>['findById']>>,
  prUrl: string | null,
  prNumber: number | null,
  featureRepository: Pick<IFeatureRepository, 'findById' | 'update'>,
  messages: string[]
): Promise<void> {
  if (feature && prUrl && prNumber) {
    await featureRepository.update({
      ...feature,
      lifecycle: feature.lifecycle,
      pr: {
        url: prUrl,
        number: prNumber,
        status: PrStatus.Open,
        ciStatus: CiStatus.Failure,
      },
      updatedAt: new Date(),
    });
  }
  messages.push(`[merge] CI watch/fix loop failed — feature halted`);
}

/**
 * Build a structured error message describing the CI fix loop outcome.
 */
export function buildCiExhaustedError(
  attempts: number,
  history: CiFixRecord[],
  reason: 'exhausted' | 'timeout'
): Error {
  const reasonStr =
    reason === 'timeout' ? 'CI watch timed out' : `all ${attempts} fix attempt(s) exhausted`;
  const historyStr = history
    .map((r) => `  - Attempt ${r.attempt}: ${r.outcome} (started ${r.startedAt})`)
    .join('\n');
  const detail = historyStr ? `\nAttempt history:\n${historyStr}` : '';
  return new Error(
    `CI watch/fix loop failed — ${reasonStr}.${detail}\nReview CI logs and fix manually.`
  );
}
