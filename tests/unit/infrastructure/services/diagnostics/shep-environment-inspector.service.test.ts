/**
 * ShepEnvironmentInspectorService — the facts `shep doctor` needs about
 * the local install and previously had no way to obtain.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ShepEnvironmentInspectorService } from '@/infrastructure/services/diagnostics/shep-environment-inspector.service.js';

let home: string;
let originalShepHome: string | undefined;

beforeEach(() => {
  originalShepHome = process.env.SHEP_HOME;
  home = mkdtempSync(join(tmpdir(), 'shep-inspector-'));
  process.env.SHEP_HOME = home;
});

afterEach(() => {
  if (originalShepHome === undefined) delete process.env.SHEP_HOME;
  else process.env.SHEP_HOME = originalShepHome;
  rmSync(home, { recursive: true, force: true });
});

describe('paths', () => {
  it('derives every path from the Shep home directory', () => {
    const inspector = new ShepEnvironmentInspectorService();
    expect(inspector.getShepHomePath()).toBe(home);
    expect(inspector.getWorktreeRootPath()).toBe(join(home, 'repos'));
    expect(inspector.getLogsPath()).toBe(join(home, 'logs'));
    expect(inspector.getDatabasePath()).toBe(join(home, 'data'));
  });
});

describe('readSensitivePermissions', () => {
  it('marks POSIX permission checks meaningful only on supported platforms', () => {
    expect(new ShepEnvironmentInspectorService().arePosixPermissionsMeaningful()).toBe(
      process.platform !== 'win32'
    );
  });

  it('reports the mode bits of the home directory and the database file', async () => {
    chmodSync(home, 0o700);
    writeFileSync(join(home, 'data'), 'x');
    chmodSync(join(home, 'data'), 0o600);

    const results = await new ShepEnvironmentInspectorService().readSensitivePermissions();

    const homeResult = results.find((r) => r.path === home);
    expect(homeResult?.exists).toBe(true);
    expect(homeResult?.isDirectory).toBe(true);
    expect(homeResult?.mode).toBe(statSync(home).mode & 0o777);

    const dbResult = results.find((r) => r.path === join(home, 'data'));
    expect(dbResult?.mode).toBe(statSync(join(home, 'data')).mode & 0o777);
    expect(dbResult?.isDirectory).toBe(false);
  });

  it('reports a missing database file rather than throwing', async () => {
    const results = await new ShepEnvironmentInspectorService().readSensitivePermissions();
    const dbResult = results.find((r) => r.path === join(home, 'data'));
    expect(dbResult?.exists).toBe(false);
    expect(dbResult?.mode).toBeNull();
  });

  it.skipIf(process.platform === 'win32')(
    'reports group- and world-readable POSIX bits',
    async () => {
      chmodSync(home, 0o775);
      const results = await new ShepEnvironmentInspectorService().readSensitivePermissions();
      expect(results.find((r) => r.path === home)?.mode).toBe(0o775);
    }
  );
});

describe('readDiskSpace', () => {
  it('reports positive free and total bytes for a real directory', async () => {
    const space = await new ShepEnvironmentInspectorService().readDiskSpace();
    expect(space).not.toBeNull();
    expect(space!.totalBytes).toBeGreaterThan(0);
    expect(space!.freeBytes).toBeGreaterThanOrEqual(0);
    expect(space!.freeBytes).toBeLessThanOrEqual(space!.totalBytes);
  });

  it('returns null instead of throwing when the path is gone', async () => {
    process.env.SHEP_HOME = join(home, 'does', 'not', 'exist');
    expect(await new ShepEnvironmentInspectorService().readDiskSpace()).toBeNull();
  });
});

describe('isWritable', () => {
  it('creates the worktree root when it is missing and reports true', async () => {
    const inspector = new ShepEnvironmentInspectorService();
    expect(await inspector.isWritable(inspector.getWorktreeRootPath())).toBe(true);
  });

  it('reports false when a file prevents creating the requested directory', async () => {
    const blocker = join(home, 'file');
    writeFileSync(blocker, 'not a directory');
    expect(await new ShepEnvironmentInspectorService().isWritable(join(blocker, 'child'))).toBe(
      false
    );
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports false for a directory that cannot be written',
    async () => {
      const locked = join(home, 'locked');
      mkdirSync(locked);
      chmodSync(locked, 0o500);
      try {
        const writable = await new ShepEnvironmentInspectorService().isWritable(
          join(locked, 'child')
        );
        expect(writable).toBe(false);
      } finally {
        chmodSync(locked, 0o700);
      }
    }
  );
});

describe('readLogsFootprint', () => {
  it('returns an empty footprint when no logs directory exists', async () => {
    expect(await new ShepEnvironmentInspectorService().readLogsFootprint()).toEqual({
      totalBytes: 0,
      fileCount: 0,
      oldestModifiedAt: null,
    });
  });

  it('sums the size of every log file and finds the oldest', async () => {
    const logs = join(home, 'logs');
    mkdirSync(logs);
    writeFileSync(join(logs, 'worker-a.log'), 'a'.repeat(100));
    writeFileSync(join(logs, 'worker-b.log'), 'b'.repeat(50));

    const footprint = await new ShepEnvironmentInspectorService().readLogsFootprint();

    expect(footprint.totalBytes).toBe(150);
    expect(footprint.fileCount).toBe(2);
    expect(footprint.oldestModifiedAt).toBeInstanceOf(Date);
  });

  it('ignores sub-directories', async () => {
    const logs = join(home, 'logs');
    mkdirSync(join(logs, 'nested'), { recursive: true });
    writeFileSync(join(logs, 'worker-a.log'), 'a'.repeat(10));

    const footprint = await new ShepEnvironmentInspectorService().readLogsFootprint();
    expect(footprint.fileCount).toBe(1);
    expect(footprint.totalBytes).toBe(10);
  });
});
