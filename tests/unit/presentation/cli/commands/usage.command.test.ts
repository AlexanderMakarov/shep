// @vitest-environment node

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  COST_NOT_REPORTED,
  COST_NOT_REPORTED_SHORT,
  createUsageCommand,
} from '../../../../../src/presentation/cli/commands/usage.command.js';
import type {
  UsageGroupStats,
  UsageStatsResult,
} from '@/application/use-cases/usage/get-usage-stats.use-case.js';
import { UsageGroupBy } from '@/domain/shared/usage-grouping.js';

function makeGroup(overrides: Partial<UsageGroupStats> = {}): UsageGroupStats {
  return {
    key: 'implement',
    phases: 4,
    failures: 1,
    failureRate: 0.25,
    durationP50Ms: 5000,
    durationP95Ms: 90_000,
    totalDurationMs: 120_000,
    totalApiDurationMs: 100_000,
    inputTokens: 1000,
    outputTokens: 200,
    cacheCreationInputTokens: 100,
    cacheReadInputTokens: 700,
    totalTokens: 2000,
    costUsd: 1.5,
    costReported: true,
    phasesMissingCost: 0,
    numTurns: 12,
    ...overrides,
  };
}

function makeResult(overrides: Partial<UsageStatsResult> = {}): UsageStatsResult {
  return {
    since: new Date('2026-09-13T12:00:00.000Z'),
    now: new Date('2026-09-20T12:00:00.000Z'),
    windowMs: 7 * 86_400_000,
    groupBy: UsageGroupBy.Phase,
    totalPhases: 4,
    groups: [makeGroup()],
    totals: {
      phases: 4,
      failures: 1,
      failureRate: 0.25,
      totalDurationMs: 120_000,
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 700,
      totalTokens: 2000,
      costUsd: 1.5,
      costIsPartial: false,
      phasesMissingCost: 0,
      agentsMissingCost: [],
    },
    runs: { started: 2, completed: 1, failed: 1, stopped: 0 },
    ...overrides,
  };
}

function run(result: UsageStatsResult, argv: string[] = []): Promise<string[]> {
  const lines: string[] = [];
  const cmd = createUsageCommand({
    resolveUseCase: () => ({ execute: async () => result }),
    out: (line) => lines.push(line),
  });
  return cmd.parseAsync(['node', 'shep', ...argv]).then(() => lines);
}

describe('createUsageCommand', () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('accepts --since, --by and --json', () => {
    const longs = createUsageCommand().options.map((o) => o.long);
    expect(longs).toEqual(expect.arrayContaining(['--since', '--by', '--json']));
  });

  it('passes the window and dimension to the use case', async () => {
    let received: { since?: string; by?: string } = {};
    const cmd = createUsageCommand({
      resolveUseCase: () => ({
        execute: async (input) => {
          received = (input ?? {}) as { since?: string; by?: string };
          return makeResult();
        },
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep', '--since', '24h', '--by', 'agent']);

    expect(received.since).toBe('24h');
    expect(received.by).toBe(UsageGroupBy.Agent);
  });

  it('rejects an unknown --by value', async () => {
    const cmd = createUsageCommand({
      resolveUseCase: () => ({ execute: async () => makeResult() }),
      out: () => undefined,
    });
    await cmd.parseAsync(['node', 'shep', '--by', 'colour']);
    expect(process.exitCode).toBe(1);
  });

  it('renders p50, p95, tokens and failure rate per group', async () => {
    const output = (await run(makeResult())).join('\n');
    expect(output).toContain('implement');
    expect(output).toContain('5.0s');
    expect(output).toContain('1.5m');
    expect(output).toContain('2.0k');
    expect(output).toContain('25.0%');
  });

  it('renders run lifecycle counts', async () => {
    const output = (await run(makeResult())).join('\n');
    expect(output).toContain('2 started');
    expect(output).toContain('1 failed');
  });

  it('emits JSON with --json', async () => {
    const output = (await run(makeResult(), ['--json'])).join('\n');
    expect(JSON.parse(output).groups[0].key).toBe('implement');
  });

  it('says so when no phases were recorded', async () => {
    const output = (await run(makeResult({ groups: [], totalPhases: 0 }))).join('\n');
    expect(output).toContain('No agent phases recorded');
  });

  it('exits non-zero when the use case throws', async () => {
    const cmd = createUsageCommand({
      resolveUseCase: () => ({
        execute: async () => {
          throw new Error('Invalid --since value "forever".');
        },
      }),
      out: () => undefined,
    });
    await cmd.parseAsync(['node', 'shep', '--since', 'forever']);
    expect(process.exitCode).toBe(1);
  });
});

describe('createUsageCommand cost honesty', () => {
  it('renders n/a — never $0.00 — for a group whose agent reports no cost', async () => {
    const output = (
      await run(
        makeResult({
          groups: [
            makeGroup({
              key: 'openrouter',
              costUsd: null,
              costReported: false,
              phasesMissingCost: 4,
            }),
          ],
        })
      )
    ).join('\n');

    expect(output).toContain(COST_NOT_REPORTED_SHORT);
    expect(output).not.toContain('$0.00');
  });

  it('marks a group cost as a floor when only some phases reported cost', async () => {
    const output = (
      await run(makeResult({ groups: [makeGroup({ costUsd: 1.5, phasesMissingCost: 2 })] }))
    ).join('\n');
    expect(output).toContain('$1.50+');
  });

  it('labels the window total PARTIAL when any phase lacked cost data', async () => {
    const result = makeResult();
    result.totals.costIsPartial = true;
    result.totals.phasesMissingCost = 2;
    result.totals.agentsMissingCost = ['openrouter', 'ollama'];

    const output = (await run(result)).join('\n');

    expect(output).toContain('PARTIAL');
    expect(output).toContain('EXCLUDES');
    expect(output).toContain('openrouter');
    expect(output).toContain('ollama');
  });

  it('does not claim a zero total when nothing in the window reported cost', async () => {
    const result = makeResult();
    result.totals.costUsd = null;
    result.totals.costIsPartial = true;
    result.totals.phasesMissingCost = 4;
    result.totals.agentsMissingCost = ['ollama'];

    const output = (await run(result)).join('\n');

    expect(output).toContain(COST_NOT_REPORTED);
    expect(output).not.toMatch(/Cost:\s+\$0\.00/);
  });

  it('renders a plain total when every phase reported cost', async () => {
    const output = (await run(makeResult())).join('\n');
    expect(output).toContain('$1.50');
    expect(output).not.toContain('PARTIAL');
  });
});
