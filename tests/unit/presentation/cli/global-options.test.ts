/**
 * Global CLI verbosity flags.
 *
 * Before this, no CLI command accepted `--verbose` or `--debug`, and the
 * only verbosity switch in the tree was `process.env.DEBUG`, honoured in
 * exactly two files.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  DEBUG_ENV_VAR,
  applyVerbosityToEnvironment,
  registerGlobalVerbosityOptions,
} from '../../../../src/presentation/cli/global-options.js';
import { LOG_LEVEL_ENV_VAR, LogLevel } from '@/infrastructure/services/logging/log-level.js';

describe('applyVerbosityToEnvironment', () => {
  it('writes the debug level for --verbose', () => {
    const env: Record<string, string | undefined> = {};
    expect(applyVerbosityToEnvironment({ verbose: true }, env)).toBe(LogLevel.Debug);
    expect(env[LOG_LEVEL_ENV_VAR]).toBe(LogLevel.Debug);
  });

  it('also sets DEBUG so the existing DEBUG-gated output lights up', () => {
    const env: Record<string, string | undefined> = {};
    applyVerbosityToEnvironment({ debug: true }, env);
    expect(env[DEBUG_ENV_VAR]).toBeTruthy();
  });

  it('honours an explicit --log-level', () => {
    const env: Record<string, string | undefined> = {};
    expect(applyVerbosityToEnvironment({ logLevel: 'warn' }, env)).toBe(LogLevel.Warn);
    expect(env[LOG_LEVEL_ENV_VAR]).toBe(LogLevel.Warn);
    expect(env[DEBUG_ENV_VAR]).toBeUndefined();
  });

  it('leaves the environment alone when no flag was passed', () => {
    const env: Record<string, string | undefined> = {};
    expect(applyVerbosityToEnvironment({}, env)).toBeNull();
    expect(env[LOG_LEVEL_ENV_VAR]).toBeUndefined();
  });

  it('does not clobber an env value the user already exported', () => {
    const env: Record<string, string | undefined> = { [LOG_LEVEL_ENV_VAR]: LogLevel.Error };
    expect(applyVerbosityToEnvironment({}, env)).toBeNull();
    expect(env[LOG_LEVEL_ENV_VAR]).toBe(LogLevel.Error);
  });

  it('rejects an unparseable explicit level instead of silently defaulting', () => {
    const env: Record<string, string | undefined> = {};
    expect(() => applyVerbosityToEnvironment({ logLevel: 'loud' }, env)).toThrow(/loud/);
    expect(env[LOG_LEVEL_ENV_VAR]).toBeUndefined();
  });
});

describe('registerGlobalVerbosityOptions', () => {
  it('adds --verbose, --debug and --log-level to the program', () => {
    const program = registerGlobalVerbosityOptions(new Command(), {});
    const longs = program.options.map((o) => o.long);
    expect(longs).toContain('--verbose');
    expect(longs).toContain('--debug');
    expect(longs).toContain('--log-level');
  });

  it('applies the level before a subcommand action runs', async () => {
    const env: Record<string, string | undefined> = {};
    const program = registerGlobalVerbosityOptions(new Command(), env);
    let levelSeenByAction: string | undefined;
    program.command('probe').action(() => {
      levelSeenByAction = env[LOG_LEVEL_ENV_VAR];
    });

    await program.parseAsync(['node', 'shep', '--verbose', 'probe']);
    expect(levelSeenByAction).toBe(LogLevel.Debug);
  });

  it('leaves the environment untouched when the flag is absent', async () => {
    const env: Record<string, string | undefined> = {};
    const program = registerGlobalVerbosityOptions(new Command(), env);
    program.command('probe').action(() => undefined);
    await program.parseAsync(['node', 'shep', 'probe']);
    expect(env[LOG_LEVEL_ENV_VAR]).toBeUndefined();
  });
});
