/**
 * Usage Stats Repository (port)
 *
 * A windowed read over `phase_timings` joined to its run and feature.
 * Everything `shep usage` needs is already persisted — durationMs,
 * durationApiMs, input/output/cache tokens, costUsd, numTurns, exitCode,
 * errorMessage, iteration suffixes and the `run:*` lifecycle rows — and
 * nothing read it in aggregate: phase timings surfaced only per feature in
 * the web drawer, and `shep fleet status` printed feature counts.
 *
 * The port returns flat rows; the aggregation (percentiles, grouping, the
 * cost-coverage accounting) lives in the use case, where it is testable
 * without a database.
 */

/** One `phase_timings` row, flattened with the run/feature context. */
export interface UsageSample {
  agentRunId: string;
  /** Recorded phase name, iteration suffix included (e.g. `implement:2`). */
  phase: string;
  featureId: string | null;
  featureName: string | null;
  /** Agent that executed the phase; null on older rows. */
  agentType: string | null;
  modelId: string | null;
  durationMs: number | null;
  durationApiMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  /**
   * Cost in USD, or `null` when the executor did not report one. Only the
   * Claude executors populate this; the shared AI-SDK base maps tokens and
   * never sets cost, so those runs legitimately have no value here — as
   * opposed to a value of zero.
   */
  costUsd: number | null;
  numTurns: number | null;
  exitCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface IUsageStatsRepository {
  /**
   * Every phase timing started at or after `since`.
   *
   * @param since - Inclusive lower bound on `started_at`
   */
  findSamplesSince(since: Date): Promise<UsageSample[]>;
}
