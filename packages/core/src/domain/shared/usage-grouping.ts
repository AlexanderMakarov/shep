/**
 * Usage-report grouping dimensions.
 *
 * `shep usage --by phase|agent|feature|model`. Declared here rather than as
 * raw strings in the command so the CLI, the use case and any future web
 * view branch on the same closed set.
 *
 * NOTE for a follow-up: per the TypeSpec-first rule this belongs in
 * `tsp/common/enums/` so it lands in the generated domain model. It is kept
 * here for now to avoid regenerating `domain/generated/output.ts` while
 * other work is in flight; see the report.
 */

export const UsageGroupBy = {
  Phase: 'phase',
  Agent: 'agent',
  Feature: 'feature',
  Model: 'model',
} as const;

export type UsageGroupBy = (typeof UsageGroupBy)[keyof typeof UsageGroupBy];

/** Default dimension when the caller names none. */
export const DEFAULT_USAGE_GROUP_BY: UsageGroupBy = UsageGroupBy.Phase;

const USAGE_GROUP_BY_VALUES = new Set<string>(Object.values(UsageGroupBy));

/** Parse an untrusted `--by` value; `null` when it is not a known dimension. */
export function parseUsageGroupBy(value: unknown): UsageGroupBy | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return USAGE_GROUP_BY_VALUES.has(normalized) ? (normalized as UsageGroupBy) : null;
}

/** Human-readable list for an error message. */
export const USAGE_GROUP_BY_HINT = Object.values(UsageGroupBy).join(' | ');

/**
 * `phase_timings.phase` carries an iteration suffix (`implement:2`) when a
 * phase runs again after a rejection loop. Grouping strips it: "how long
 * does implement take" is a question about the phase, not the attempt.
 */
export const PHASE_ITERATION_SEPARATOR = ':';

/** Prefix marking a zero-duration lifecycle row (`run:started`, `run:failed`, …). */
export const LIFECYCLE_PHASE_PREFIX = 'run:';

/** `phase_timings.exit_code` value written on a clean phase. */
export const PHASE_EXIT_CODE_SUCCESS = 'success';

/** Strip the iteration suffix from a recorded phase name. */
export function basePhaseName(phase: string): string {
  const index = phase.indexOf(PHASE_ITERATION_SEPARATOR);
  return index === -1 ? phase : phase.slice(0, index);
}

/** Whether a recorded phase is a lifecycle marker rather than real work. */
export function isLifecyclePhase(phase: string): boolean {
  return phase.startsWith(LIFECYCLE_PHASE_PREFIX);
}
