/**
 * Shep Directory Service
 *
 * Manages the ~/.shep/ directory for global settings and data storage.
 * Ensures directory exists with correct permissions before database operations.
 *
 * Supports SHEP_HOME env var for test isolation (overrides default ~/.shep/).
 */

import { chmod, mkdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/** Owner-only directory: nothing in ~/.shep is meant for other accounts. */
const SHEP_DIR_MODE = 0o700;

/** Owner-only file mode for the settings database. */
const SHEP_DB_FILE_MODE = 0o600;

/**
 * Resolves the Shep home directory.
 * Respects SHEP_HOME env var for test isolation, falls back to ~/.shep/
 */
function resolveShepHomeDir(): string {
  return process.env.SHEP_HOME ?? join(homedir(), '.shep');
}

/**
 * Gets the path to the Shep home directory.
 * Uses SHEP_HOME env var if set, otherwise ~/.shep/
 *
 * @returns Path to shep home directory
 */
export function getShepHomeDir(): string {
  return resolveShepHomeDir();
}

/**
 * Gets the path to the SQLite database file.
 *
 * @returns Path to the database file
 */
export function getShepDbPath(): string {
  return join(resolveShepHomeDir(), 'data');
}

/**
 * Gets the path to the daemon state file.
 * Uses SHEP_HOME env var if set (for test isolation), otherwise ~/.shep/daemon.json
 *
 * @returns Path to daemon.json
 */
export function getDaemonStatePath(): string {
  return join(resolveShepHomeDir(), 'daemon.json');
}

/**
 * Gets the path to the daemon log file.
 * Uses SHEP_HOME env var if set (for test isolation), otherwise ~/.shep/daemon.log
 *
 * @returns Path to daemon.log
 */
export function getDaemonLogPath(): string {
  return join(resolveShepHomeDir(), 'daemon.log');
}

/**
 * Ensures the shep home directory exists with correct permissions.
 * Creates the directory if it doesn't exist.
 * Safe to call multiple times (idempotent).
 *
 * Permissions: 700 (rwx------) on the directory, 600 on the settings database.
 *
 * The mode is applied on EVERY call, not only on create. The previous version
 * returned early when the directory already existed, so a `~/.shep` created
 * before the mode was introduced — or by a process with a looser umask — kept
 * whatever it had. Measured on a real install: `drwxrwxr-x ~/.shep` with
 * `-rw-r--r-- ~/.shep/data`, and that database holds the agent token and the
 * messaging tokens in plaintext. A mode that is only ever set at creation
 * time never repairs anything.
 *
 * Windows has no POSIX mode bits (`chmod` there only toggles read-only), so
 * the calls are skipped rather than pretending to enforce something.
 *
 * @throws Error if the directory cannot be created (permissions, disk space).
 */
export async function ensureShepDirectory(): Promise<void> {
  const shepDir = resolveShepHomeDir();

  if (!existsSync(shepDir)) {
    try {
      await mkdir(shepDir, { recursive: true, mode: SHEP_DIR_MODE });
    } catch (error) {
      throw new Error(
        `Failed to create Shep directory at ${shepDir}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await restrictPermissions(shepDir, SHEP_DIR_MODE);

  // The database file is created by better-sqlite3 with the process umask, so
  // its mode is tightened here rather than at open time.
  const dbPath = getShepDbPath();
  if (existsSync(dbPath)) {
    await restrictPermissions(dbPath, SHEP_DB_FILE_MODE);
  }
}

/**
 * Apply `mode`, tolerating a filesystem that cannot honour it.
 *
 * A failure here must not stop shep from starting: a mounted share or a
 * container volume may refuse chmod outright, and the alternative is refusing
 * to run at all on an otherwise working install.
 */
async function restrictPermissions(path: string, mode: number): Promise<void> {
  if (platform() === 'win32') return;

  try {
    await chmod(path, mode);
  } catch {
    // Filesystem does not support mode changes — nothing more we can do here.
  }
}
