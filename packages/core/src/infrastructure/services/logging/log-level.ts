/**
 * Log levels — the resolution rules behind `settings.system.logLevel`.
 *
 * `settings.system.logLevel` has always defaulted to `'info'`, persisted as
 * `sys_log_level` and appeared in the generated domain type, while no code
 * read it: a settable knob with no effect. This module is the single place
 * that turns the stored string into a decision, so the CLI flag, the
 * `SHEP_LOG_LEVEL` env override and the persisted setting cannot drift.
 *
 * Precedence, highest first:
 *   1. `SHEP_LOG_LEVEL` in the environment (also how a parent process hands
 *      the level to a forked worker, which inherits `process.env`)
 *   2. `settings.system.logLevel` as persisted in the database
 *   3. {@link DEFAULT_LOG_LEVEL}
 *
 * `logLevel` is typed `string` in the generated domain model (TypeSpec
 * `settings.tsp` declares `logLevel: string = "info"`), so parsing is this
 * module's job. Promoting it to a TypeSpec enum would type the field at the
 * domain boundary — see the report note; it is deliberately not done here
 * because it changes the generated output and the settings row mapper.
 */

/** The levels Shep understands, ordered least to most severe. */
export const LogLevel = {
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
  /** Emit nothing at all. */
  Silent: 'silent',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** Applied when neither the environment nor the settings row says otherwise. */
export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.Info;

/** Environment variable that overrides the persisted level. */
export const LOG_LEVEL_ENV_VAR = 'SHEP_LOG_LEVEL';

/**
 * Severity ranking. Only the ordering matters; the gaps leave room to
 * insert a level (`trace`, `fatal`) without renumbering.
 */
const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  [LogLevel.Debug]: 10,
  [LogLevel.Info]: 20,
  [LogLevel.Warn]: 30,
  [LogLevel.Error]: 40,
  [LogLevel.Silent]: 100,
};

const LOG_LEVEL_VALUES = new Set<string>(Object.values(LogLevel));

/**
 * Parse an untrusted value (env var, settings row, CLI argument) into a
 * level. Returns `null` rather than throwing — a bad value must never stop
 * the CLI from running, it just falls through to the next source.
 */
export function parseLogLevel(value: unknown): LogLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return LOG_LEVEL_VALUES.has(normalized) ? (normalized as LogLevel) : null;
}

/**
 * Whether a message logged at `messageLevel` should be emitted when the
 * logger is configured at `configuredLevel`.
 */
export function isLevelEnabled(configuredLevel: LogLevel, messageLevel: LogLevel): boolean {
  if (configuredLevel === LogLevel.Silent) return false;
  return LOG_LEVEL_SEVERITY[messageLevel] >= LOG_LEVEL_SEVERITY[configuredLevel];
}

/** The ordered sources {@link resolveLogLevel} consults. */
export interface LogLevelSources {
  /** Raw `SHEP_LOG_LEVEL` value, if set. */
  envValue?: string | undefined;
  /** Raw `settings.system.logLevel` value, if settings are available. */
  settingsValue?: string | undefined;
}

/**
 * Resolve the effective level from the environment, then the persisted
 * setting, then the default. An unparseable value at any step is skipped.
 */
export function resolveLogLevel(sources: LogLevelSources): LogLevel {
  return (
    parseLogLevel(sources.envValue) ?? parseLogLevel(sources.settingsValue) ?? DEFAULT_LOG_LEVEL
  );
}

/** The verbosity flags a presentation layer can offer. */
export interface VerbosityFlags {
  verbose?: boolean | undefined;
  debug?: boolean | undefined;
  /** Explicit level, e.g. `--log-level warn`. Beats the boolean flags. */
  logLevel?: string | undefined;
}

/**
 * Map presentation-layer verbosity flags onto a level, or `null` when the
 * user asked for nothing (so the configured level stands) or asked for
 * something unparseable (so the caller can report it).
 *
 * Lives in core rather than in the CLI command because every presentation
 * layer needs the same mapping.
 */
export function logLevelForVerbosity(flags: VerbosityFlags): LogLevel | null {
  if (flags.logLevel !== undefined) return parseLogLevel(flags.logLevel);
  if (flags.debug === true || flags.verbose === true) return LogLevel.Debug;
  return null;
}
