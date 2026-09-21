/**
 * Shep Environment Inspector (port)
 *
 * Read-only facts about the local `~/.shep` installation that `shep doctor`
 * needs and had no way to obtain: the permission bits on the directory that
 * holds plaintext tokens, free disk, whether the worktree root can be
 * written, and how much the worker logs have accumulated.
 *
 * Shaped as ready-to-use facts rather than a filesystem handle so the
 * diagnostics stay in the application layer and never import `node:fs`.
 * Every method resolves — a diagnostic must report a problem, not throw.
 */

/** Permission facts for one sensitive path. */
export interface PathPermissions {
  /** Absolute path inspected. */
  path: string;
  /** Whether the path exists at all. */
  exists: boolean;
  /**
   * POSIX permission bits (e.g. `0o700`), or `null` when the path is
   * missing or the platform does not carry meaningful bits.
   */
  mode: number | null;
  /** True when this path is a directory (affects the expected mode). */
  isDirectory: boolean;
}

/** Free / total bytes on the filesystem backing `~/.shep`. */
export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
}

/** Aggregate size of `~/.shep/logs`. */
export interface LogsFootprint {
  totalBytes: number;
  fileCount: number;
  /** Modification time of the oldest log file, or `null` when empty. */
  oldestModifiedAt: Date | null;
}

export interface IShepEnvironmentInspector {
  /** Absolute path of the Shep home directory (`SHEP_HOME` or `~/.shep`). */
  getShepHomePath(): string;

  /** Absolute path of the SQLite database file. */
  getDatabasePath(): string;

  /** Absolute path of the worktree root (`<shep home>/repos`). */
  getWorktreeRootPath(): string;

  /** Absolute path of the worker log directory (`<shep home>/logs`). */
  getLogsPath(): string;

  /**
   * Whether POSIX permission bits mean anything here. False on Windows,
   * where an ACL model makes a mode check meaningless rather than failing.
   */
  arePosixPermissionsMeaningful(): boolean;

  /**
   * Permissions for the paths that hold secrets: the Shep home directory
   * and the SQLite database file (which stores plaintext tokens).
   */
  readSensitivePermissions(): Promise<PathPermissions[]>;

  /** Free space on the filesystem backing `~/.shep`, or `null` if unknown. */
  readDiskSpace(): Promise<DiskSpace | null>;

  /**
   * Whether a directory can be created and written under `path`. Creates
   * the directory when it is missing, because that is what Shep itself
   * does on first use.
   */
  isWritable(path: string): Promise<boolean>;

  /** Aggregate size of the worker log directory. */
  readLogsFootprint(): Promise<LogsFootprint>;
}
