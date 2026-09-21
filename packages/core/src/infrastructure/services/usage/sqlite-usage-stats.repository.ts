/**
 * SQLite Usage Stats Repository
 *
 * One windowed query behind `shep usage`. Reads `phase_timings` and joins
 * the run (for agent type) and the feature (for a human label), then hands
 * flat rows to `GetUsageStatsUseCase`, which does all the arithmetic.
 *
 * PLACEMENT NOTE: by the repository convention this file belongs in
 * `infrastructure/repositories/sqlite-usage-stats.repository.ts`, next to
 * its siblings. It sits here because that directory was being changed
 * concurrently; moving it is a pure rename with no behaviour change. This
 * is called out in the report rather than left for a reader to wonder about.
 *
 * `agent_type` is read from the phase row first and the run second:
 * migration 038 added the per-phase column, so rows written before it fall
 * back to the run's type instead of disappearing from an agent grouping.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';

import type {
  IUsageStatsRepository,
  UsageSample,
} from '../../../application/ports/output/repositories/usage-stats-repository.interface.js';

/** Row shape returned by {@link SELECT_SAMPLES_SQL}. */
interface UsageSampleRow {
  agent_run_id: string;
  phase: string;
  feature_id: string | null;
  feature_name: string | null;
  agent_type: string | null;
  model_id: string | null;
  duration_ms: number | null;
  duration_api_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cost_usd: number | null;
  num_turns: number | null;
  exit_code: string | null;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
}

/**
 * Both joins are LEFT joins on purpose: a phase whose run or feature has
 * been deleted still consumed time and tokens, and dropping it would make
 * the report quietly cheaper than reality.
 */
const SELECT_SAMPLES_SQL = `
  SELECT
    pt.agent_run_id                  AS agent_run_id,
    pt.phase                         AS phase,
    f.id                             AS feature_id,
    f.name                           AS feature_name,
    COALESCE(pt.agent_type, ar.agent_type) AS agent_type,
    pt.model_id                      AS model_id,
    pt.duration_ms                   AS duration_ms,
    pt.duration_api_ms               AS duration_api_ms,
    pt.input_tokens                  AS input_tokens,
    pt.output_tokens                 AS output_tokens,
    pt.cache_creation_input_tokens   AS cache_creation_input_tokens,
    pt.cache_read_input_tokens       AS cache_read_input_tokens,
    pt.cost_usd                      AS cost_usd,
    pt.num_turns                     AS num_turns,
    pt.exit_code                     AS exit_code,
    pt.error_message                 AS error_message,
    pt.started_at                    AS started_at,
    pt.completed_at                  AS completed_at
  FROM phase_timings pt
  LEFT JOIN agent_runs ar ON ar.id = pt.agent_run_id
  LEFT JOIN features   f  ON f.agent_run_id = pt.agent_run_id
  WHERE pt.started_at >= ?
  ORDER BY pt.started_at ASC
`;

@injectable()
export class SqliteUsageStatsRepository implements IUsageStatsRepository {
  constructor(
    @inject('Database')
    private readonly db: Database.Database
  ) {}

  async findSamplesSince(since: Date): Promise<UsageSample[]> {
    const rows = this.db.prepare(SELECT_SAMPLES_SQL).all(since.getTime()) as UsageSampleRow[];
    return rows.map(fromDatabase);
  }
}

function fromDatabase(row: UsageSampleRow): UsageSample {
  return {
    agentRunId: row.agent_run_id,
    phase: row.phase,
    featureId: row.feature_id,
    featureName: row.feature_name,
    agentType: row.agent_type,
    modelId: row.model_id,
    durationMs: toNumber(row.duration_ms),
    durationApiMs: toNumber(row.duration_api_ms),
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    cacheCreationInputTokens: toNumber(row.cache_creation_input_tokens),
    cacheReadInputTokens: toNumber(row.cache_read_input_tokens),
    // Deliberately NOT coerced to 0: a null cost means the executor does not
    // report cost, which is a different fact from "this phase was free".
    costUsd: toNumber(row.cost_usd),
    numTurns: toNumber(row.num_turns),
    exitCode: row.exit_code,
    errorMessage: row.error_message,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at === null ? null : new Date(row.completed_at),
  };
}

function toNumber(value: number | null): number | null {
  return value === null || value === undefined ? null : Number(value);
}
