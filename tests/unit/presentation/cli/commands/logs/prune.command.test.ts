// @vitest-environment node

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createLogsPruneCommand } from '../../../../../../src/presentation/cli/commands/logs/prune.command.js';
import type { PruneLogsResult } from '@/application/use-cases/logs/prune-logs.use-case.js';

function makeResult(overrides: Partial<PruneLogsResult> = {}): PruneLogsResult {
  return {
    logsDirectory: '/home/u/.shep/logs',
    olderThanMs: 7 * 86_400_000,
    dryRun: true,
    totalFiles: 2,
    totalBytes: 3000,
    candidates: [
      {
        path: '/home/u/.shep/logs/worker-a.log',
        name: 'worker-a.log',
        sizeBytes: 2000,
        modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    reclaimableBytes: 2000,
    deleted: [],
    reclaimedBytes: 0,
    failures: [],
    ...overrides,
  };
}

describe('createLogsPruneCommand', () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('defaults to a dry run and says so', async () => {
    const lines: string[] = [];
    let received: { dryRun?: boolean } = {};
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({
        execute: async (input) => {
          received = input ?? {};
          return makeResult();
        },
      }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(received.dryRun).toBe(true);
    const output = lines.join('\n');
    expect(output).toContain('Would delete');
    expect(output).toContain('--yes');
  });

  it('passes --older-than through to the use case', async () => {
    let received: { olderThan?: string } = {};
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({
        execute: async (input) => {
          received = input ?? {};
          return makeResult();
        },
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep', '--older-than', '3d']);

    expect(received.olderThan).toBe('3d');
  });

  it('turns off the dry run with --yes', async () => {
    let received: { dryRun?: boolean } = {};
    const lines: string[] = [];
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({
        execute: async (input) => {
          received = input ?? {};
          return makeResult({
            dryRun: false,
            deleted: makeResult().candidates,
            reclaimedBytes: 2000,
          });
        },
      }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep', '--yes']);

    expect(received.dryRun).toBe(false);
    expect(lines.join('\n')).toContain('Deleted');
  });

  it('lists each candidate with its size and age', async () => {
    const lines: string[] = [];
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({ execute: async () => makeResult() }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    const output = lines.join('\n');
    expect(output).toContain('worker-a.log');
    expect(output).toContain('2026-01-01');
    expect(output).toContain('2.0 KB');
  });

  it('says there is nothing to prune rather than printing an empty list', async () => {
    const lines: string[] = [];
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({
        execute: async () => makeResult({ candidates: [], reclaimableBytes: 0 }),
      }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(lines.join('\n')).toContain('Nothing to prune');
  });

  it('emits JSON with --json', async () => {
    const lines: string[] = [];
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({ execute: async () => makeResult() }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep', '--json']);

    const parsed = JSON.parse(lines.join('\n'));
    expect(parsed.logsDirectory).toBe('/home/u/.shep/logs');
    expect(parsed.candidates).toHaveLength(1);
  });

  it('exits non-zero when a delete failed', async () => {
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({
        execute: async () =>
          makeResult({
            dryRun: false,
            failures: [{ path: '/home/u/.shep/logs/worker-a.log', error: 'EACCES' }],
          }),
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep', '--yes']);

    expect(process.exitCode).toBe(1);
  });

  it('exits non-zero when the use case rejects an unparseable duration', async () => {
    const cmd = createLogsPruneCommand({
      resolveUseCase: () => ({
        execute: async () => {
          throw new Error('Invalid --older-than value "forever".');
        },
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep', '--older-than', 'forever']);

    expect(process.exitCode).toBe(1);
  });
});
