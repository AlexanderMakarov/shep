/**
 * `shep usage`
 *
 * Answers "why is my fleet slow or expensive today?" from data that was
 * already being written and never read in aggregate: p50/p95 phase
 * duration, token totals, cost and failure rate over a window, grouped by
 * phase, agent, feature or model.
 *
 * COST HONESTY. `costUsd` is populated ONLY by the Claude executors; the
 * shared AI-SDK base (OpenRouter / Together / Ollama / LLMProxy) maps
 * tokens and never sets cost. So a cell here reads `n/a (agent does not
 * report cost)` rather than `$0.00`, and the TOTAL is labelled partial
 * whenever any phase in the window had no cost data, naming the agents
 * responsible. The web UI already sums the missing data as zero and
 * presents the result as fact; this command must not repeat that.
 *
 * Presentation only: `GetUsageStatsUseCase` owns the aggregation.
 */

import { Command } from 'commander';

import { container } from '@/infrastructure/di/container.js';
import {
  DEFAULT_USAGE_WINDOW,
  GetUsageStatsUseCase,
} from '@/application/use-cases/usage/get-usage-stats.use-case.js';
import type {
  UsageGroupStats,
  UsageStatsResult,
} from '@/application/use-cases/usage/get-usage-stats.use-case.js';
import {
  DEFAULT_USAGE_GROUP_BY,
  USAGE_GROUP_BY_HINT,
  parseUsageGroupBy,
} from '@/domain/shared/usage-grouping.js';
import { colors, fmt, messages, symbols } from '../ui/index.js';

/** Rendered in a cost cell for an agent that reports no cost at all. */
export const COST_NOT_REPORTED = 'n/a (agent does not report cost)';

/** Shorter form used inside the per-group table, where width matters. */
export const COST_NOT_REPORTED_SHORT = 'n/a';

const KEY_WIDTH = 24;
const NUMBER_WIDTH = 10;
const COST_WIDTH = 12;

/** Tokens are printed in thousands past this many. */
const TOKENS_PER_K = 1000;

/** Dollar amounts are shown to this many decimals. */
const COST_FRACTION_DIGITS = 2;

/** Percentages are shown to this many decimals. */
const RATE_FRACTION_DIGITS = 1;

export interface UsageCommandOptions {
  /** Resolver override — exposed for testing. */
  resolveUseCase?: () => Pick<GetUsageStatsUseCase, 'execute'>;
  /** Output sink override — exposed for testing. */
  out?: (line: string) => void;
}

interface UsageCliFlags {
  since?: string;
  by?: string;
  json?: boolean;
}

export function createUsageCommand(options: UsageCommandOptions = {}): Command {
  return new Command('usage')
    .description('Report agent duration, token, cost and failure statistics over a window')
    .option('--since <duration>', 'Window to report on (e.g. 7d, 24h)', DEFAULT_USAGE_WINDOW)
    .option('--by <dimension>', `Group by: ${USAGE_GROUP_BY_HINT}`, DEFAULT_USAGE_GROUP_BY)
    .option('--json', 'Emit machine-readable JSON')
    .addHelpText(
      'after',
      `
Examples:
  $ shep usage                        Last 7 days by phase
  $ shep usage --since 24h --by agent Last day by agent
  $ shep usage --by feature           Which feature ate the week
  $ shep usage --by model --json      Machine-readable, grouped by model

Cost is reported only by agents that report it. Agents that do not (the
shared AI-SDK providers) show "n/a", and the total is marked partial.`
    )
    .action(async (flags: UsageCliFlags) => {
      const out = options.out ?? ((line: string) => console.log(line));
      try {
        const by = parseUsageGroupBy(flags.by ?? DEFAULT_USAGE_GROUP_BY);
        if (by === null) {
          throw new Error(
            `Unknown --by value "${flags.by}". Expected one of: ${USAGE_GROUP_BY_HINT}`
          );
        }

        const useCase = options.resolveUseCase
          ? options.resolveUseCase()
          : container.resolve(GetUsageStatsUseCase);
        const result = await useCase.execute({
          ...(flags.since === undefined ? {} : { since: flags.since }),
          by,
        });

        if (flags.json === true) {
          out(JSON.stringify(result, null, 2));
        } else {
          renderReport(result, out);
        }
        process.exitCode = 0;
      } catch (err) {
        messages.error('shep usage failed', err instanceof Error ? err : new Error(String(err)));
        process.exitCode = 1;
      }
    });
}

function renderReport(result: UsageStatsResult, out: (line: string) => void): void {
  out('');
  out(`  ${fmt.heading('shep usage')}`);
  out('');
  out(
    `  ${colors.muted('Window:')} ${result.since.toISOString()} → ${result.now.toISOString()}  ` +
      `${colors.muted('Grouped by:')} ${result.groupBy}`
  );
  out(
    `  ${colors.muted('Runs:')}   ${result.runs.started} started, ${result.runs.completed} completed, ` +
      `${result.runs.failed} failed, ${result.runs.stopped} stopped`
  );
  out('');

  if (result.groups.length === 0) {
    out(`  ${colors.muted('No agent phases recorded in this window.')}`);
    out('');
    return;
  }

  out(
    `  ${colors.muted(result.groupBy.toUpperCase().padEnd(KEY_WIDTH))}` +
      `${colors.muted('RUNS'.padStart(6))}  ` +
      `${colors.muted('P50'.padStart(NUMBER_WIDTH))}  ` +
      `${colors.muted('P95'.padStart(NUMBER_WIDTH))}  ` +
      `${colors.muted('TOKENS'.padStart(NUMBER_WIDTH))}  ` +
      `${colors.muted('COST'.padStart(COST_WIDTH))}  ` +
      `${colors.muted('FAIL')}`
  );
  for (const group of result.groups) {
    out(formatGroupRow(group));
  }

  out('');
  renderTotals(result, out);
  out('');
}

function formatGroupRow(group: UsageGroupStats): string {
  return (
    `  ${truncate(group.key, KEY_WIDTH).padEnd(KEY_WIDTH)}` +
    `${String(group.phases).padStart(6)}  ` +
    `${formatDuration(group.durationP50Ms).padStart(NUMBER_WIDTH)}  ` +
    `${formatDuration(group.durationP95Ms).padStart(NUMBER_WIDTH)}  ` +
    `${formatTokens(group.totalTokens).padStart(NUMBER_WIDTH)}  ` +
    `${formatGroupCost(group).padStart(COST_WIDTH)}  ` +
    `${formatRate(group.failureRate)}`
  );
}

/**
 * A group whose agent never reported cost renders `n/a`, not `$0.00`. A
 * group where only SOME phases reported cost renders the sum with a `+`,
 * because the number is a floor.
 */
function formatGroupCost(group: UsageGroupStats): string {
  if (!group.costReported) return COST_NOT_REPORTED_SHORT;
  const rendered = `$${group.costUsd?.toFixed(COST_FRACTION_DIGITS) ?? '0.00'}`;
  return group.phasesMissingCost > 0 ? `${rendered}+` : rendered;
}

function renderTotals(result: UsageStatsResult, out: (line: string) => void): void {
  const { totals } = result;
  out(
    `  ${colors.muted('Totals:')} ${totals.phases} phase(s), ` +
      `${formatTokens(totals.totalTokens)} tokens, ` +
      `${formatRate(totals.failureRate)} failed`
  );

  if (totals.costUsd === null) {
    out(`  ${colors.muted('Cost:')}   ${COST_NOT_REPORTED}`);
  } else if (totals.costIsPartial) {
    out(
      `  ${colors.warning(`${symbols.warning} Cost: $${totals.costUsd.toFixed(COST_FRACTION_DIGITS)} (PARTIAL)`)}`
    );
  } else {
    out(`  ${colors.muted('Cost:')}   $${totals.costUsd.toFixed(COST_FRACTION_DIGITS)}`);
  }

  if (totals.costIsPartial) {
    out(
      `  ${colors.muted(
        `${totals.phasesMissingCost} of ${totals.phases} phase(s) reported no cost — ` +
          `this total EXCLUDES them. Agents: ${totals.agentsMissingCost.join(', ')}`
      )}`
    );
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(tokens: number): string {
  if (tokens < TOKENS_PER_K) return String(tokens);
  return `${(tokens / TOKENS_PER_K).toFixed(1)}k`;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(RATE_FRACTION_DIGITS)}%`;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}
