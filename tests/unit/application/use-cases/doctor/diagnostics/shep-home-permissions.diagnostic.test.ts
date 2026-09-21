/**
 * ShepHomePermissionsDiagnostic.
 *
 * `~/.shep` is `drwxrwxr-x` on the audited machine and `~/.shep/data` is
 * `-rw-r--r--` while holding plaintext tokens. Nothing checked either.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { ShepHomePermissionsDiagnostic } from '@/application/use-cases/doctor/diagnostics/shep-home-permissions.diagnostic.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type {
  IShepEnvironmentInspector,
  PathPermissions,
} from '@/application/ports/output/services/shep-environment-inspector.interface.js';

function inspector(
  permissions: PathPermissions[],
  posixMeaningful = true
): IShepEnvironmentInspector {
  return {
    getShepHomePath: () => '/home/u/.shep',
    getDatabasePath: () => '/home/u/.shep/data',
    getWorktreeRootPath: () => '/home/u/.shep/repos',
    getLogsPath: () => '/home/u/.shep/logs',
    arePosixPermissionsMeaningful: () => posixMeaningful,
    readSensitivePermissions: async () => permissions,
    readDiskSpace: async () => null,
    isWritable: async () => true,
    readLogsFootprint: async () => ({ totalBytes: 0, fileCount: 0, oldestModifiedAt: null }),
  };
}

const dir = (mode: number): PathPermissions => ({
  path: '/home/u/.shep',
  exists: true,
  mode,
  isDirectory: true,
});
const file = (mode: number): PathPermissions => ({
  path: '/home/u/.shep/data',
  exists: true,
  mode,
  isDirectory: false,
});

describe('ShepHomePermissionsDiagnostic', () => {
  it('has a stable name', () => {
    expect(new ShepHomePermissionsDiagnostic(inspector([])).name).toBe('shep-home-permissions');
  });

  it('is ok when the directory is 0700 and the database file is 0600', async () => {
    const result = await new ShepHomePermissionsDiagnostic(
      inspector([dir(0o700), file(0o600)])
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });

  it('FAILS on the group-readable directory this machine actually has', async () => {
    const result = await new ShepHomePermissionsDiagnostic(
      inspector([dir(0o775), file(0o600)])
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('/home/u/.shep');
    expect(result.detail).toContain('775');
    expect(result.fixHint).toContain('chmod');
  });

  it('FAILS on the world-readable database file that holds plaintext tokens', async () => {
    const result = await new ShepHomePermissionsDiagnostic(
      inspector([dir(0o700), file(0o644)])
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('/home/u/.shep/data');
    expect(result.detail).toContain('644');
  });

  it('names every offending path, not just the first', async () => {
    const result = await new ShepHomePermissionsDiagnostic(
      inspector([dir(0o775), file(0o644)])
    ).run();
    expect(result.detail).toContain('/home/u/.shep');
    expect(result.detail).toContain('/home/u/.shep/data');
  });

  it('skips a path that does not exist yet', async () => {
    const result = await new ShepHomePermissionsDiagnostic(
      inspector([
        dir(0o700),
        { path: '/home/u/.shep/data', exists: false, mode: null, isDirectory: false },
      ])
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });

  it('warns instead of failing where POSIX bits are meaningless', async () => {
    const result = await new ShepHomePermissionsDiagnostic(
      inspector([dir(0o777), file(0o666)], false)
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.detail).toMatch(/not enforced|Windows/i);
  });

  it('fails with the message when the inspector throws', async () => {
    const broken = inspector([]);
    broken.readSensitivePermissions = async () => {
      throw new Error('stat failed');
    };
    const result = await new ShepHomePermissionsDiagnostic(broken).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('stat failed');
  });
});
