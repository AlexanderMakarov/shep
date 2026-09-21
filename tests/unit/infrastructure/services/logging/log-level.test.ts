/**
 * LogLevel resolution — tests for the verbosity knob that
 * `settings.system.logLevel` promises and nothing used to read.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOG_LEVEL,
  LOG_LEVEL_ENV_VAR,
  LogLevel,
  isLevelEnabled,
  logLevelForVerbosity,
  parseLogLevel,
  resolveLogLevel,
} from '@/infrastructure/services/logging/log-level.js';

describe('parseLogLevel', () => {
  it('accepts every documented level', () => {
    for (const level of Object.values(LogLevel)) {
      expect(parseLogLevel(level)).toBe(level);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(parseLogLevel('  DEBUG ')).toBe(LogLevel.Debug);
  });

  it('returns null for an unknown or non-string value', () => {
    expect(parseLogLevel('loud')).toBeNull();
    expect(parseLogLevel(undefined)).toBeNull();
    expect(parseLogLevel(7)).toBeNull();
  });
});

describe('isLevelEnabled', () => {
  it('suppresses messages below the configured level', () => {
    expect(isLevelEnabled(LogLevel.Info, LogLevel.Debug)).toBe(false);
    expect(isLevelEnabled(LogLevel.Warn, LogLevel.Info)).toBe(false);
    expect(isLevelEnabled(LogLevel.Error, LogLevel.Warn)).toBe(false);
  });

  it('emits messages at or above the configured level', () => {
    expect(isLevelEnabled(LogLevel.Info, LogLevel.Info)).toBe(true);
    expect(isLevelEnabled(LogLevel.Info, LogLevel.Error)).toBe(true);
    expect(isLevelEnabled(LogLevel.Debug, LogLevel.Debug)).toBe(true);
  });

  it('suppresses everything at silent', () => {
    for (const level of [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error]) {
      expect(isLevelEnabled(LogLevel.Silent, level)).toBe(false);
    }
  });
});

describe('resolveLogLevel', () => {
  it('falls back to the default when nothing is configured', () => {
    expect(resolveLogLevel({})).toBe(DEFAULT_LOG_LEVEL);
    expect(DEFAULT_LOG_LEVEL).toBe(LogLevel.Info);
  });

  it('reads the persisted settings value', () => {
    expect(resolveLogLevel({ settingsValue: 'warn' })).toBe(LogLevel.Warn);
  });

  it('lets the env override beat the persisted setting', () => {
    expect(resolveLogLevel({ settingsValue: 'error', envValue: 'debug' })).toBe(LogLevel.Debug);
  });

  it('ignores an unparseable env value rather than throwing', () => {
    expect(resolveLogLevel({ settingsValue: 'warn', envValue: 'nonsense' })).toBe(LogLevel.Warn);
  });

  it('names the env var it reads so callers do not re-invent it', () => {
    expect(LOG_LEVEL_ENV_VAR).toBe('SHEP_LOG_LEVEL');
  });
});

describe('logLevelForVerbosity', () => {
  it('maps --debug and --verbose to the debug level', () => {
    expect(logLevelForVerbosity({ debug: true })).toBe(LogLevel.Debug);
    expect(logLevelForVerbosity({ verbose: true })).toBe(LogLevel.Debug);
  });

  it('maps an explicit --log-level value', () => {
    expect(logLevelForVerbosity({ logLevel: 'warn' })).toBe(LogLevel.Warn);
  });

  it('lets an explicit level win over the boolean flags', () => {
    expect(logLevelForVerbosity({ verbose: true, logLevel: 'error' })).toBe(LogLevel.Error);
  });

  it('returns null when no verbosity flag was passed', () => {
    expect(logLevelForVerbosity({})).toBeNull();
    expect(logLevelForVerbosity({ verbose: false, debug: false })).toBeNull();
  });

  it('returns null for an unparseable explicit level so the caller can complain', () => {
    expect(logLevelForVerbosity({ logLevel: 'loud' })).toBeNull();
  });
});
