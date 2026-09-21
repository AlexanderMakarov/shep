/**
 * `shep logs prune`
 *
 * Reports — and, with `--yes`, removes — worker logs older than a cutoff.
 * Nothing else in Shep ever deletes `~/.shep/logs/worker-*.log`.
 *
 * DRY RUN IS THE DEFAULT. A worker log is the only record of what an agent
 * actually did; deleting one has to be asked for.
 *
 * Presentation only: `PruneLogsUseCase` owns selection, deletion and the
 * byte arithmetic; this command owns flags and formatting.
 */

import { Command } from 'commander';

import { container } from '@/infrastructure/di/container.js';
import {
  DEFAULT_PRUNE_OLDER_THAN,
  PruneLogsUseCase,
} from '@/application/use-cases/logs/prune-logs.use-case.js';
import type { PruneLogsResult } from '@/application/use-cases/logs/prune-logs.use-case.js';
import { formatBytes } from '@/domain/shared/format-bytes.js';
import { colors, fmt, messages } from '../../ui/index.js';

/** Files listed individually before the output collapses to a count. */
const MAX_LISTED_FILES = 20;

export interface PruneLogsCommandOptions {
  /** Resolver override — exposed for testing. */
  resolveUseCase?: () => Pick<PruneLogsUseCase, 'execute'>;
  /** Output sink override — exposed for testing. */
  out?: (line: string) => void;
}

interface PruneCliFlags {
  olderThan?: string;
  yes?: boolean;
  json?: boolean;
}

export function createLogsPruneCommand(options: PruneLogsCommandOptions = {}): Command {
  return new Command('prune')
    .description('Report (and optionally delete) old feature-agent worker logs')
    .option(
      '--older-than <duration>',
      `Only consider logs older than this (e.g. 7d, 12h)`,
      DEFAULT_PRUNE_OLDER_THAN
    )
    .option('--yes', 'Actually delete — without this the command only reports')
    .option('--json', 'Emit machine-readable JSON')
    .addHelpText(
      'after',
      `
Examples:
  $ shep logs prune                        Show what a 14d prune would remove
  $ shep logs prune --older-than 7d        Show what a 7d prune would remove
  $ shep logs prune --older-than 7d --yes  Delete them
  $ shep logs prune --json                 Machine-readable report`
    )
    .action(async (flags: PruneCliFlags) => {
      const out = options.out ?? ((line: string) => console.log(line));
      try {
        const useCase = options.resolveUseCase
          ? options.resolveUseCase()
          : container.resolve(PruneLogsUseCase);
        const result = await useCase.execute({
          ...(flags.olderThan === undefined ? {} : { olderThan: flags.olderThan }),
          dryRun: flags.yes !== true,
        });

        if (flags.json === true) {
          out(JSON.stringify(result, null, 2));
        } else {
          renderResult(result, out);
        }
        process.exitCode = result.failures.length > 0 ? 1 : 0;
      } catch (err) {
        messages.error(
          'shep logs prune failed',
          err instanceof Error ? err : new Error(String(err))
        );
        process.exitCode = 1;
      }
    });
}

function renderResult(result: PruneLogsResult, out: (line: string) => void): void {
  out('');
  out(`  ${fmt.heading('shep logs prune')}`);
  out('');
  out(`  ${colors.muted('Directory:')} ${result.logsDirectory}`);
  out(
    `  ${colors.muted('Total:')}     ${result.totalFiles} file(s), ${formatBytes(result.totalBytes)}`
  );
  out('');

  if (result.candidates.length === 0) {
    out(`  ${colors.success('Nothing to prune')} — no log is older than the cutoff.`);
    out('');
    return;
  }

  const verb = result.dryRun ? 'Would delete' : 'Deleted';
  out(
    `  ${colors.muted(`${verb}:`)} ${result.candidates.length} file(s), ${formatBytes(
      result.dryRun ? result.reclaimableBytes : result.reclaimedBytes
    )}`
  );
  for (const file of result.candidates.slice(0, MAX_LISTED_FILES)) {
    out(
      `    ${file.name}  ${colors.muted(
        `${formatBytes(file.sizeBytes)}  ${file.modifiedAt.toISOString()}`
      )}`
    );
  }
  if (result.candidates.length > MAX_LISTED_FILES) {
    out(`    ${colors.muted(`… and ${result.candidates.length - MAX_LISTED_FILES} more`)}`);
  }

  if (result.failures.length > 0) {
    out('');
    out(`  ${colors.error(`${result.failures.length} file(s) could not be deleted:`)}`);
    for (const failure of result.failures) {
      out(`    ${failure.path}  ${colors.muted(failure.error)}`);
    }
  }

  out('');
  if (result.dryRun) {
    out(`  ${colors.muted('Dry run.')} Re-run with ${fmt.code('--yes')} to delete.`);
    out('');
  }
}
