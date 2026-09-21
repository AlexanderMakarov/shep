/**
 * Global CLI verbosity flags.
 *
 * `--verbose` / `--debug` / `--log-level <level>` on the root command, so
 * every subcommand gets them. Before this there was no verbosity switch at
 * all beyond `process.env.DEBUG`, which only two files read.
 *
 * The flag is applied by writing `SHEP_LOG_LEVEL` into the environment
 * rather than by poking the logger instance. That is deliberate:
 *
 *   - the DI container's `ILogger` is built during bootstrap, before
 *     Commander has parsed anything, and re-reads the level per line;
 *   - the environment is inherited by every child process this CLI spawns,
 *     so `shep --verbose feat run` raises the level in the daemon and the
 *     forked worker too (subject to the fork() patch in the report, which
 *     passes an explicit `env`).
 *
 * The mapping itself lives in core (`logLevelForVerbosity`); this module
 * only wires flags to it, which keeps the presentation layer thin.
 */

import type { Command } from 'commander';

import {
  LOG_LEVEL_ENV_VAR,
  type LogLevel,
  type VerbosityFlags,
  logLevelForVerbosity,
} from '@/infrastructure/services/logging/log-level.js';

/** Legacy verbosity switch, still read by `ui/messages.ts` and the deployment logger. */
export const DEBUG_ENV_VAR = 'DEBUG';

/** Value written to {@link DEBUG_ENV_VAR} when `--verbose`/`--debug` is passed. */
const DEBUG_ENV_ENABLED_VALUE = '1';

/** Minimal environment shape so tests can pass a plain object. */
export type MutableEnvironment = Record<string, string | undefined>;

/**
 * Translate verbosity flags into environment variables.
 *
 * @returns the level that was applied, or `null` when no flag was passed.
 * @throws when an explicit `--log-level` value cannot be parsed — a
 *   silently-ignored typo is how a knob becomes decorative, which is the
 *   defect this whole change exists to fix.
 */
export function applyVerbosityToEnvironment(
  flags: VerbosityFlags,
  env: MutableEnvironment
): LogLevel | null {
  const level = logLevelForVerbosity(flags);
  if (level === null) {
    if (flags.logLevel !== undefined) {
      throw new Error(
        `Unknown --log-level "${flags.logLevel}". Expected one of: debug, info, warn, error, silent`
      );
    }
    return null;
  }

  env[LOG_LEVEL_ENV_VAR] = level;
  // Only the blunt flags turn on the legacy DEBUG paths; an explicit
  // `--log-level warn` must not make the CLI more chatty than asked.
  if (flags.logLevel === undefined) {
    env[DEBUG_ENV_VAR] = DEBUG_ENV_ENABLED_VALUE;
  }
  return level;
}

/**
 * Add the verbosity options to a Commander program and apply them before
 * any subcommand action runs.
 */
export function registerGlobalVerbosityOptions(
  program: Command,
  env: MutableEnvironment = process.env as MutableEnvironment
): Command {
  return program
    .option('--verbose', 'Log at debug level (same as --debug)')
    .option('--debug', 'Log at debug level')
    .option('--log-level <level>', 'Log level: debug, info, warn, error, silent')
    .hook('preAction', (thisCommand) => {
      applyVerbosityToEnvironment(thisCommand.opts<VerbosityFlags>(), env);
    });
}
