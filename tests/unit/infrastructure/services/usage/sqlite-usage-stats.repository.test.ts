import 'reflect-metadata';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';

import { SqliteUsageStatsRepository } from '@/infrastructure/services/usage/sqlite-usage-stats.repository.js';

let db: Database.Database;

const T0 = new Date('2026-09-20T00:00:00.000Z').getTime();

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE agent_runs (id TEXT PRIMARY KEY, agent_type TEXT);
    CREATE TABLE features (id TEXT PRIMARY KEY, name TEXT, agent_run_id TEXT);
    CREATE TABLE phase_timings (
      id TEXT PRIMARY KEY,
      agent_run_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER,
      duration_api_ms INTEGER,
      model_id TEXT,
      agent_type TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_creation_input_tokens INTEGER,
      cache_read_input_tokens INTEGER,
      cost_usd REAL,
      num_turns INTEGER,
      exit_code TEXT,
      error_message TEXT
    );
  `);
});

function insertTiming(overrides: Record<string, unknown> = {}): void {
  const row = {
    id: `t-${Math.random()}`,
    agent_run_id: 'run-1',
    phase: 'implement',
    started_at: T0,
    completed_at: T0 + 1000,
    duration_ms: 1000,
    duration_api_ms: 800,
    model_id: 'claude-sonnet-4-6',
    agent_type: 'claude-code',
    input_tokens: 100,
    output_tokens: 20,
    cache_creation_input_tokens: 5,
    cache_read_input_tokens: 50,
    cost_usd: 0.5,
    num_turns: 3,
    exit_code: 'success',
    error_message: null,
    ...overrides,
  };
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO phase_timings (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`
  ).run(...Object.values(row));
}

describe('SqliteUsageStatsRepository', () => {
  it('returns nothing for an empty table', async () => {
    expect(await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0))).toEqual([]);
  });

  it('maps every recorded column onto the sample', async () => {
    db.prepare('INSERT INTO agent_runs (id, agent_type) VALUES (?, ?)').run('run-1', 'claude-code');
    db.prepare('INSERT INTO features (id, name, agent_run_id) VALUES (?, ?, ?)').run(
      'feat-1',
      'add-login',
      'run-1'
    );
    insertTiming();

    const [sample] = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0 - 1));

    expect(sample).toMatchObject({
      agentRunId: 'run-1',
      phase: 'implement',
      featureId: 'feat-1',
      featureName: 'add-login',
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      durationMs: 1000,
      durationApiMs: 800,
      inputTokens: 100,
      outputTokens: 20,
      cacheCreationInputTokens: 5,
      cacheReadInputTokens: 50,
      costUsd: 0.5,
      numTurns: 3,
      exitCode: 'success',
      errorMessage: null,
    });
    expect(sample?.startedAt).toEqual(new Date(T0));
    expect(sample?.completedAt).toEqual(new Date(T0 + 1000));
  });

  it('excludes rows that started before the window', async () => {
    insertTiming({ started_at: T0 - 10_000 });
    insertTiming({ started_at: T0 + 10_000 });

    const samples = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0));

    expect(samples).toHaveLength(1);
    expect(samples[0]?.startedAt).toEqual(new Date(T0 + 10_000));
  });

  it('includes a row whose run and feature were deleted — it still cost time', async () => {
    insertTiming({ agent_run_id: 'orphan' });
    const [sample] = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0 - 1));
    expect(sample?.featureId).toBeNull();
    expect(sample?.durationMs).toBe(1000);
  });

  it('falls back to the run agent type for rows written before the phase column existed', async () => {
    db.prepare('INSERT INTO agent_runs (id, agent_type) VALUES (?, ?)').run('run-1', 'openrouter');
    insertTiming({ agent_type: null });

    const [sample] = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0 - 1));

    expect(sample?.agentType).toBe('openrouter');
  });

  it('preserves a NULL cost as null rather than coercing it to zero', async () => {
    insertTiming({ cost_usd: null });
    const [sample] = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0 - 1));
    expect(sample?.costUsd).toBeNull();
  });

  it('preserves a genuine zero cost as zero', async () => {
    insertTiming({ cost_usd: 0 });
    const [sample] = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0 - 1));
    expect(sample?.costUsd).toBe(0);
  });

  it('returns lifecycle rows too, so run outcomes can be counted', async () => {
    insertTiming({ phase: 'run:failed', duration_ms: 0, exit_code: null });
    const samples = await new SqliteUsageStatsRepository(db).findSamplesSince(new Date(T0 - 1));
    expect(samples[0]?.phase).toBe('run:failed');
  });
});
