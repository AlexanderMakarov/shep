/**
 * ConsoleLogger — the `ILogger` implementation backing the DI token.
 *
 * Two defects this class used to carry, both found by the observability
 * audit and both fixed here:
 *
 *   1. NO level filter. `debug()` always called `console.debug`, so
 *      `settings.system.logLevel` — persisted as `sys_log_level`, present
 *      in the generated domain type — changed nothing. The level is now
 *      resolved per call from `SHEP_LOG_LEVEL`, then the persisted
 *      setting, then {@link DEFAULT_LOG_LEVEL}. Per call, not per
 *      construction, because the logger is a container singleton built
 *      before Commander has parsed `--verbose`.
 *
 *   2. NO redaction. Every line now passes through {@link redactLogLine},
 *      which masks credentials without eating file paths.
 *
 * Settings are read through an injected reader rather than by importing
 * `getSettings()` here, so a test can drive the level without patching a
 * module and so the class works before settings are initialised.
 */

import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import { LOG_LEVEL_ENV_VAR, LogLevel, isLevelEnabled, resolveLogLevel } from './log-level';
import { redactLogLine, redactLogMeta } from './redact-log-line';

/** Minimal environment shape — anything with string-ish values will do. */
export type LogEnvironment = Record<string, string | undefined>;

export interface ConsoleLoggerOptions {
  /** Environment to read {@link LOG_LEVEL_ENV_VAR} from. Defaults to `process.env`. */
  env?: LogEnvironment;
  /**
   * Reads `settings.system.logLevel`. May throw (settings not yet
   * initialised) — the logger treats a throw as "no persisted level".
   */
  readSettingsLogLevel?: () => string | undefined;
}

/* eslint-disable no-console */
// Deliberately NOT @injectable(): this class is registered as a prebuilt
// instance (it needs a settings reader that tsyringe cannot resolve), and
// the daemon-resident watchers construct it as a default. A tsyringe
// decorator here would drag the DI runtime — and its reflect-metadata
// requirement — into every module that merely wants to log.
export class ConsoleLogger implements ILogger {
  private readonly env: LogEnvironment;
  private readonly readSettingsLogLevel: () => string | undefined;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.env = options.env ?? (process.env as LogEnvironment);
    this.readSettingsLogLevel = options.readSettingsLogLevel ?? (() => undefined);
  }

  /**
   * The level in force right now. Public so `shep doctor` / `shep status`
   * can report the verbosity the user is actually running at.
   */
  getLevel(): LogLevel {
    let settingsValue: string | undefined;
    try {
      settingsValue = this.readSettingsLogLevel();
    } catch {
      // Settings not initialised yet (early bootstrap, worker process, a
      // test with no container) — fall through to env + default.
      settingsValue = undefined;
    }
    return resolveLogLevel({ envValue: this.env[LOG_LEVEL_ENV_VAR], settingsValue });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.Debug, console.debug, message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.Info, console.info, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.Warn, console.warn, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.Error, console.error, message, meta);
  }

  private emit(
    level: LogLevel,
    sink: (message: string, ...rest: unknown[]) => void,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    if (!isLevelEnabled(this.getLevel(), level)) return;

    const safeMessage = redactLogLine(message);
    if (meta === undefined) {
      sink(safeMessage);
      return;
    }
    sink(safeMessage, redactLogMeta(meta));
  }
}
/* eslint-enable no-console */
