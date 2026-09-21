/**
 * Shep Environment Inspector
 *
 * Filesystem adapter behind `IShepEnvironmentInspector`. Everything here is
 * best-effort and non-throwing: `shep doctor` must survive a missing
 * directory, a permission error or a filesystem that cannot report free
 * space, and still say what it found.
 */

import { constants } from 'node:fs';
import { access, mkdir, readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';

import { injectable } from 'tsyringe';

import type {
  DiskSpace,
  IShepEnvironmentInspector,
  LogsFootprint,
  PathPermissions,
} from '../../../application/ports/output/services/shep-environment-inspector.interface.js';
import { getShepDbPath, getShepHomeDir } from '../filesystem/shep-directory.service.js';

/** Sub-directory of the Shep home that holds per-repository worktrees. */
const WORKTREE_ROOT_DIRNAME = 'repos';

/** Sub-directory of the Shep home that holds feature-agent worker logs. */
const LOGS_DIRNAME = 'logs';

/** Node's identifier for Windows, where POSIX mode bits carry no meaning. */
const WINDOWS_PLATFORM = 'win32';

/** Name of the probe directory written to test worktree-root writability. */
const WRITE_PROBE_DIRNAME = '.shep-write-probe';

/** Mask isolating the permission bits from a `stat` mode. */
const PERMISSION_BITS_MASK = 0o777;

@injectable()
export class ShepEnvironmentInspectorService implements IShepEnvironmentInspector {
  getShepHomePath(): string {
    return getShepHomeDir();
  }

  getDatabasePath(): string {
    return getShepDbPath();
  }

  getWorktreeRootPath(): string {
    return join(getShepHomeDir(), WORKTREE_ROOT_DIRNAME);
  }

  getLogsPath(): string {
    return join(getShepHomeDir(), LOGS_DIRNAME);
  }

  arePosixPermissionsMeaningful(): boolean {
    return process.platform !== WINDOWS_PLATFORM;
  }

  async readSensitivePermissions(): Promise<PathPermissions[]> {
    return Promise.all(
      [this.getShepHomePath(), this.getDatabasePath()].map((path) => readPermissions(path))
    );
  }

  async readDiskSpace(): Promise<DiskSpace | null> {
    try {
      const stats = await statfs(this.getShepHomePath());
      return {
        freeBytes: Number(stats.bavail) * Number(stats.bsize),
        totalBytes: Number(stats.blocks) * Number(stats.bsize),
      };
    } catch {
      // statfs is unavailable on some filesystems and on older platforms.
      return null;
    }
  }

  async isWritable(path: string): Promise<boolean> {
    try {
      // Create the directory if it is missing — that is what Shep does on
      // first use, so "missing but creatable" is a pass, not a failure.
      await mkdir(path, { recursive: true });
      await access(path, constants.W_OK | constants.X_OK);
      // access() answers the permission question, not the quota / read-only
      // mount question, so actually create something.
      const probe = join(path, WRITE_PROBE_DIRNAME);
      await mkdir(probe, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async readLogsFootprint(): Promise<LogsFootprint> {
    const empty: LogsFootprint = { totalBytes: 0, fileCount: 0, oldestModifiedAt: null };
    let entries: string[];
    try {
      entries = await readdir(this.getLogsPath());
    } catch {
      // No logs directory yet — nothing has run.
      return empty;
    }

    let totalBytes = 0;
    let fileCount = 0;
    let oldestMs: number | null = null;
    for (const entry of entries) {
      try {
        const stats = await stat(join(this.getLogsPath(), entry));
        if (!stats.isFile()) continue;
        totalBytes += stats.size;
        fileCount += 1;
        const modifiedMs = stats.mtimeMs;
        if (oldestMs === null || modifiedMs < oldestMs) oldestMs = modifiedMs;
      } catch {
        // Log rotated or deleted mid-walk — skip it.
        continue;
      }
    }

    return {
      totalBytes,
      fileCount,
      oldestModifiedAt: oldestMs === null ? null : new Date(oldestMs),
    };
  }
}

async function readPermissions(path: string): Promise<PathPermissions> {
  try {
    const stats = await stat(path);
    return {
      path,
      exists: true,
      mode: stats.mode & PERMISSION_BITS_MASK,
      isDirectory: stats.isDirectory(),
    };
  } catch {
    return { path, exists: false, mode: null, isDirectory: false };
  }
}
