/**
 * Log-line redaction.
 *
 * The audit's finding: `redactSecrets` exists and is wired into ASPM
 * ingestion only — no logging call site calls it, while worker logs carry
 * `git push https://x-access-token:ghs_…@github.com/o/r` verbatim.
 *
 * These tests pin BOTH halves of the contract: secrets are masked, and
 * ordinary log content (long paths, branch names) survives, because a
 * redactor that eats the message is a redactor operators turn off.
 */

import { describe, it, expect } from 'vitest';
import { redactLogLine, redactLogMeta } from '@/infrastructure/services/logging/redact-log-line.js';

describe('redactLogLine', () => {
  it('masks a GitHub token embedded in a push URL', () => {
    const line =
      'git push https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz012345@github.com/o/r';
    const out = redactLogLine(line);
    expect(out).not.toContain('ghs_abcdefghijklmnopqrstuvwxyz012345');
    expect(out).toContain('[REDACTED:github-personal-access-token]');
  });

  it('masks an Anthropic API key', () => {
    const out = redactLogLine('ANTHROPIC key sk-ant-api03-abcdefghijklmnopqrstuvwxyz in env');
    expect(out).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
  });

  it('masks a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p';
    expect(redactLogLine(`auth ${jwt}`)).not.toContain(jwt);
  });

  it('masks the value of a secret-looking assignment even in an unnamed shape', () => {
    const out = redactLogLine('running with API_TOKEN=Zm9vYmFyYmF6cXV4MTIzNA and more');
    expect(out).not.toContain('Zm9vYmFyYmF6cXV4MTIzNA');
    expect(out).toContain('API_TOKEN=');
  });

  it('masks credentials embedded in a URL userinfo segment', () => {
    const out = redactLogLine('cloning https://ben:hunter2swordfish@git.example.com/o/r.git');
    expect(out).not.toContain('hunter2swordfish');
    expect(out).toContain('git.example.com');
  });

  it('leaves a long absolute path intact', () => {
    const line = 'worker log at /home/ben/Documents/ben-is-a-dev/shep/packages/core/index.ts';
    expect(redactLogLine(line)).toBe(line);
  });

  it('leaves a long hyphenated branch name intact', () => {
    const line = 'branch shep/feat-097-add-observability-diagnostics pushed';
    expect(redactLogLine(line)).toBe(line);
  });

  it('returns the empty string unchanged', () => {
    expect(redactLogLine('')).toBe('');
  });
});

describe('redactLogMeta', () => {
  it('redacts string values in a flat meta object', () => {
    const out = redactLogMeta({
      repo: 'o/r',
      cmd: 'git push https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz012345@github.com/o/r',
    });
    expect(JSON.stringify(out)).not.toContain('ghs_abcdefghijklmnopqrstuvwxyz012345');
    expect(out?.repo).toBe('o/r');
  });

  it('redacts nested strings and array members', () => {
    const out = redactLogMeta({
      nested: { token: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz' },
      args: ['--token', 'ghp_abcdefghijklmnopqrstuvwxyz012345'],
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
    expect(serialized).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
  });

  it('preserves non-string values and undefined input', () => {
    expect(redactLogMeta(undefined)).toBeUndefined();
    expect(redactLogMeta({ count: 3, ok: true, missing: null })).toEqual({
      count: 3,
      ok: true,
      missing: null,
    });
  });

  it('does not blow up on a cyclic meta object', () => {
    const cyclic: Record<string, unknown> = { name: 'run' };
    cyclic.self = cyclic;
    expect(() => redactLogMeta(cyclic)).not.toThrow();
  });
});
