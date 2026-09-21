/**
 * Executor Logger Unit Tests
 *
 * The CLI executors used to keep `silent` as a mutable field on a singleton
 * instance, so two parallel agents sharing the cached executor muted each
 * other. The logger is per call instead.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createExecutorLogger } from '@/infrastructure/services/agents/common/executors/executor-logger.js';

describe('createExecutorLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write the message to stdout so it lands in the worker log', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    createExecutorLogger(false)('spawning agent');

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('spawning agent');
  });

  it('should terminate every line so entries cannot run together', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    createExecutorLogger(false)('spawning agent');

    expect(String(write.mock.calls[0][0]).endsWith('\n')).toBe(true);
  });

  it('should write nothing when silenced', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    createExecutorLogger(true)('spawning agent');

    expect(write).not.toHaveBeenCalled();
  });

  it('should treat an absent flag as not silent', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    createExecutorLogger(undefined)('spawning agent');

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('should give each call its own flag, so parallel agents cannot mute each other', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const quiet = createExecutorLogger(true);
    const loud = createExecutorLogger(false);
    quiet('hidden');
    loud('shown');

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('shown');
  });
});

describe('createExecutorLogger — secret redaction', () => {
  let written: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    written = [];
    spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  /**
   * Executors write the agent's raw output into ~/.shep/logs/worker-*.log, and
   * the merge node instructs the agent to push — so a tool call carrying
   * `git push https://x-access-token:ghs_…@github.com/o/r` used to land in that
   * file verbatim. Users paste those logs into GitHub issues.
   *
   * Redacting in the logger rather than at each call site covers all seven
   * executors at once and cannot be forgotten by the next one.
   */
  it('should redact a tokenised git remote from a tool-call line', () => {
    const log = createExecutorLogger(false);

    log(
      '[tool] Bash {"command":"git push https://x-access-token:ghs_AbCdEfGhIjKlMnOpQrStUvWxYz012345@github.com/o/r"}'
    );

    const line = written.join('');
    expect(line).not.toContain('ghs_AbCdEfGhIjKlMnOpQrStUvWxYz012345');
    expect(line).toContain('[REDACTED');
  });

  it.each([
    ['GitHub PAT', 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
    ['Anthropic key', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
  ])('should redact a bare %s', (_label, secret) => {
    const log = createExecutorLogger(false);

    log(`[raw] using ${secret} now`);

    expect(written.join('')).not.toContain(secret);
  });

  it('should redact a credential assignment', () => {
    const log = createExecutorLogger(false);

    log('[raw] GITHUB_TOKEN=supersecretvalue123');

    expect(written.join('')).not.toContain('supersecretvalue123');
  });

  /**
   * A log whose paths have been replaced by [REDACTED] is a log operators turn
   * off, which loses more secrets than it hides. Ordinary content must survive.
   */
  it('should leave ordinary paths and branch names intact', () => {
    const log = createExecutorLogger(false);

    log(
      '[text] editing /home/ben/Documents/ben-is-a-dev/shep/packages/core on feat/add-observability-diagnostics'
    );

    const line = written.join('');
    expect(line).toContain('/home/ben/Documents/ben-is-a-dev/shep/packages/core');
    expect(line).toContain('feat/add-observability-diagnostics');
    expect(line).not.toContain('[REDACTED');
  });

  it('should still write nothing at all when silent', () => {
    const log = createExecutorLogger(true);

    log('[raw] ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');

    expect(written).toEqual([]);
  });
});
