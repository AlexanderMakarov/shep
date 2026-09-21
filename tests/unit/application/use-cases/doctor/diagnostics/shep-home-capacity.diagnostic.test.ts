/**
 * Free disk, worktree-root writability and worker-log footprint — three
 * runtime conditions `shep doctor` could not see.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import {
  DiskSpaceDiagnostic,
  DISK_FAIL_THRESHOLD_BYTES,
  DISK_WARN_THRESHOLD_BYTES,
} from '@/application/use-cases/doctor/diagnostics/disk-space.diagnostic.js';
import { WorktreeRootWritableDiagnostic } from '@/application/use-cases/doctor/diagnostics/worktree-root-writable.diagnostic.js';
import {
  LogsSizeDiagnostic,
  LOGS_FAIL_THRESHOLD_BYTES,
  LOGS_WARN_THRESHOLD_BYTES,
} from '@/application/use-cases/doctor/diagnostics/logs-size.diagnostic.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type {
  DiskSpace,
  IShepEnvironmentInspector,
  LogsFootprint,
} from '@/application/ports/output/services/shep-environment-inspector.interface.js';

function inspector(overrides: Partial<IShepEnvironmentInspector> = {}): IShepEnvironmentInspector {
  return {
    getShepHomePath: () => '/home/u/.shep',
    getDatabasePath: () => '/home/u/.shep/data',
    getWorktreeRootPath: () => '/home/u/.shep/repos',
    getLogsPath: () => '/home/u/.shep/logs',
    arePosixPermissionsMeaningful: () => true,
    readSensitivePermissions: async () => [],
    readDiskSpace: async (): Promise<DiskSpace | null> => ({
      freeBytes: DISK_WARN_THRESHOLD_BYTES * 4,
      totalBytes: DISK_WARN_THRESHOLD_BYTES * 20,
    }),
    isWritable: async () => true,
    readLogsFootprint: async (): Promise<LogsFootprint> => ({
      totalBytes: 0,
      fileCount: 0,
      oldestModifiedAt: null,
    }),
    ...overrides,
  };
}

describe('DiskSpaceDiagnostic', () => {
  it('has a stable name', () => {
    expect(new DiskSpaceDiagnostic(inspector()).name).toBe('disk-space');
  });

  it('orders its thresholds so fail is stricter than warn', () => {
    expect(DISK_FAIL_THRESHOLD_BYTES).toBeLessThan(DISK_WARN_THRESHOLD_BYTES);
  });

  it('is ok with plenty of free space', async () => {
    const result = await new DiskSpaceDiagnostic(inspector()).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toMatch(/free/i);
  });

  it('warns below the warn threshold', async () => {
    const result = await new DiskSpaceDiagnostic(
      inspector({
        readDiskSpace: async () => ({
          freeBytes: DISK_WARN_THRESHOLD_BYTES - 1,
          totalBytes: DISK_WARN_THRESHOLD_BYTES * 20,
        }),
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
  });

  it('fails below the fail threshold', async () => {
    const result = await new DiskSpaceDiagnostic(
      inspector({
        readDiskSpace: async () => ({
          freeBytes: DISK_FAIL_THRESHOLD_BYTES - 1,
          totalBytes: DISK_WARN_THRESHOLD_BYTES * 20,
        }),
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeTruthy();
  });

  it('warns when free space cannot be determined rather than claiming ok', async () => {
    const result = await new DiskSpaceDiagnostic(
      inspector({ readDiskSpace: async () => null })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
  });

  it('never throws', async () => {
    const result = await new DiskSpaceDiagnostic(
      inspector({
        readDiskSpace: async () => {
          throw new Error('statfs blew up');
        },
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('statfs blew up');
  });
});

describe('WorktreeRootWritableDiagnostic', () => {
  it('has a stable name', () => {
    expect(new WorktreeRootWritableDiagnostic(inspector()).name).toBe('worktree-root-writable');
  });

  it('is ok when the worktree root can be written', async () => {
    const result = await new WorktreeRootWritableDiagnostic(inspector()).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('/home/u/.shep/repos');
  });

  it('fails when it cannot, because every feature run needs a worktree there', async () => {
    const result = await new WorktreeRootWritableDiagnostic(
      inspector({ isWritable: async () => false })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('/home/u/.shep/repos');
    expect(result.fixHint).toBeTruthy();
  });

  it('never throws', async () => {
    const result = await new WorktreeRootWritableDiagnostic(
      inspector({
        isWritable: async () => {
          throw new Error('mkdir blew up');
        },
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('mkdir blew up');
  });
});

describe('LogsSizeDiagnostic', () => {
  it('has a stable name', () => {
    expect(new LogsSizeDiagnostic(inspector()).name).toBe('logs-size');
  });

  it('orders its thresholds so fail is above warn', () => {
    expect(LOGS_WARN_THRESHOLD_BYTES).toBeLessThan(LOGS_FAIL_THRESHOLD_BYTES);
  });

  it('is ok when nothing has accumulated', async () => {
    const result = await new LogsSizeDiagnostic(inspector()).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });

  it('warns past the warn threshold and points at the prune command', async () => {
    const result = await new LogsSizeDiagnostic(
      inspector({
        readLogsFootprint: async () => ({
          totalBytes: LOGS_WARN_THRESHOLD_BYTES + 1,
          fileCount: 42,
          oldestModifiedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.detail).toContain('42');
    expect(result.fixHint).toContain('shep logs prune');
  });

  it('fails past the fail threshold', async () => {
    const result = await new LogsSizeDiagnostic(
      inspector({
        readLogsFootprint: async () => ({
          totalBytes: LOGS_FAIL_THRESHOLD_BYTES + 1,
          fileCount: 900,
          oldestModifiedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
  });

  it('never throws', async () => {
    const result = await new LogsSizeDiagnostic(
      inspector({
        readLogsFootprint: async () => {
          throw new Error('readdir blew up');
        },
      })
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('readdir blew up');
  });
});
