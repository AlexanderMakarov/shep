/**
 * ConsoleLogger — the file the audit found had NO test at all and NO level
 * filter: `debug()` always reached `console.debug`, so
 * `settings.system.logLevel` was a settable knob with no effect.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger } from '@/infrastructure/services/logging/console-logger.js';
import { LOG_LEVEL_ENV_VAR, LogLevel } from '@/infrastructure/services/logging/log-level.js';

interface Sinks {
  debug: ReturnType<typeof vi.spyOn>;
  info: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
}

let sinks: Sinks;

beforeEach(() => {
  sinks = {
    debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsoleLogger level filtering', () => {
  it('drops debug output at the default (info) level', () => {
    const logger = new ConsoleLogger({ env: {} });
    logger.debug('cache hit');
    expect(sinks.debug).not.toHaveBeenCalled();
    logger.info('started');
    expect(sinks.info).toHaveBeenCalledOnce();
  });

  it('emits debug output when the persisted setting says debug', () => {
    const logger = new ConsoleLogger({ env: {}, readSettingsLogLevel: () => LogLevel.Debug });
    logger.debug('cache hit');
    expect(sinks.debug).toHaveBeenCalledWith('cache hit');
  });

  it('lets the SHEP_LOG_LEVEL env var override the persisted setting', () => {
    const logger = new ConsoleLogger({
      env: { [LOG_LEVEL_ENV_VAR]: LogLevel.Debug },
      readSettingsLogLevel: () => LogLevel.Error,
    });
    logger.debug('cache hit');
    expect(sinks.debug).toHaveBeenCalledOnce();
  });

  it('suppresses info and warn but keeps error at the error level', () => {
    const logger = new ConsoleLogger({ env: { [LOG_LEVEL_ENV_VAR]: LogLevel.Error } });
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(sinks.debug).not.toHaveBeenCalled();
    expect(sinks.info).not.toHaveBeenCalled();
    expect(sinks.warn).not.toHaveBeenCalled();
    expect(sinks.error).toHaveBeenCalledOnce();
  });

  it('suppresses every level at silent', () => {
    const logger = new ConsoleLogger({ env: { [LOG_LEVEL_ENV_VAR]: LogLevel.Silent } });
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(sinks.debug).not.toHaveBeenCalled();
    expect(sinks.info).not.toHaveBeenCalled();
    expect(sinks.warn).not.toHaveBeenCalled();
    expect(sinks.error).not.toHaveBeenCalled();
  });

  it('falls back to the default level when reading settings throws', () => {
    const logger = new ConsoleLogger({
      env: {},
      readSettingsLogLevel: () => {
        throw new Error('settings not initialized');
      },
    });
    expect(() => logger.info('still works')).not.toThrow();
    expect(sinks.info).toHaveBeenCalledOnce();
    logger.debug('dropped');
    expect(sinks.debug).not.toHaveBeenCalled();
  });

  it('re-reads the level on every call so a late --verbose still takes effect', () => {
    const env: Record<string, string | undefined> = {};
    const logger = new ConsoleLogger({ env });
    logger.debug('before');
    expect(sinks.debug).not.toHaveBeenCalled();
    env[LOG_LEVEL_ENV_VAR] = LogLevel.Debug;
    logger.debug('after');
    expect(sinks.debug).toHaveBeenCalledOnce();
  });

  it('exposes the resolved level for callers that want to report it', () => {
    const logger = new ConsoleLogger({ env: { [LOG_LEVEL_ENV_VAR]: LogLevel.Warn } });
    expect(logger.getLevel()).toBe(LogLevel.Warn);
  });
});

describe('ConsoleLogger secret redaction', () => {
  it('redacts a token in the message before it reaches the console', () => {
    const logger = new ConsoleLogger({ env: {} });
    logger.info('git push https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz012345@github.com');
    const emitted = String(sinks.info.mock.calls[0]?.[0]);
    expect(emitted).not.toContain('ghs_abcdefghijklmnopqrstuvwxyz012345');
    expect(emitted).toContain('[REDACTED:github-personal-access-token]');
  });

  it('redacts secrets inside the meta object too', () => {
    const logger = new ConsoleLogger({ env: {} });
    logger.error('spawn failed', { argv: ['--token', 'ghp_abcdefghijklmnopqrstuvwxyz012345'] });
    expect(JSON.stringify(sinks.error.mock.calls[0])).not.toContain(
      'ghp_abcdefghijklmnopqrstuvwxyz012345'
    );
  });

  it('passes the message through untouched when it holds no secret', () => {
    const logger = new ConsoleLogger({ env: {} });
    logger.warn('poll failed for /home/ben/Documents/ben-is-a-dev/shep/packages/core');
    expect(sinks.warn).toHaveBeenCalledWith(
      'poll failed for /home/ben/Documents/ben-is-a-dev/shep/packages/core'
    );
  });

  it('omits the meta argument entirely when none was supplied', () => {
    const logger = new ConsoleLogger({ env: {} });
    logger.info('plain');
    expect(sinks.info).toHaveBeenCalledWith('plain');
    expect(sinks.info.mock.calls[0]).toHaveLength(1);
  });
});
