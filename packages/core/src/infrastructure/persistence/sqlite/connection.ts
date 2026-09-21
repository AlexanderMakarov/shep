/**
 * SQLite Connection Module
 *
 * Provides singleton database connection to ~/.shep/data
 * Configures pragmas for optimal performance and reliability.
 */

import Database from 'better-sqlite3';
import {
  ensureShepDirectory,
  getShepDbPath,
} from '../../services/filesystem/shep-directory.service.js';
import {
  isSqliteNativeBindingError,
  toSqliteNativeBindingError,
} from '../../errors/sqlite-native-binding-error.js';
import { SqliteDatabaseBusyError } from '../../errors/sqlite-database-busy-error.js';
import {
  quickCheckProblems,
  quarantineDatabaseFile,
  describeQuarantine,
  isSqliteCorruptionError,
  isSqliteBusyError,
} from './database-integrity.js';

/**
 * Singleton database instance.
 * Initialized on first call to getSQLiteConnection().
 */
let dbInstance: Database.Database | null = null;
let initialization: Promise<Database.Database> | null = null;

/**
 * Opens the database file, translating the failures a user can act on.
 *
 * better-sqlite3 is a native addon: when its compiled binary is missing or was
 * built for a different Node ABI, construction throws a raw "Could not locate
 * the bindings file" error. And because Shep runs several processes against one
 * file, "another process holds it" is an ordinary situation, not a broken
 * install. Both become typed errors carrying a fix rather than a stack trace.
 *
 * @param dbPath - Path to the database file.
 * @returns An open connection.
 */
function openDatabase(dbPath: string): Database.Database {
  try {
    return new Database(dbPath, {
      // eslint-disable-next-line no-console
      verbose: process.env.DEBUG_SQL ? console.log : undefined,
    });
  } catch (err) {
    if (isSqliteNativeBindingError(err)) {
      throw toSqliteNativeBindingError(err);
    }
    if (isSqliteBusyError(err)) {
      throw new SqliteDatabaseBusyError(dbPath, err);
    }
    if (isSqliteCorruptionError(err)) {
      // Too damaged for SQLite to open at all — the quick-check path below
      // never gets a connection to run on, so the file is moved aside here.
      const salvagedPath = quarantineDatabaseFile(dbPath);
      // eslint-disable-next-line no-console
      console.warn(
        describeQuarantine(salvagedPath, [err instanceof Error ? err.message : String(err)])
      );
      return new Database(dbPath, {
        // eslint-disable-next-line no-console
        verbose: process.env.DEBUG_SQL ? console.log : undefined,
      });
    }
    throw err;
  }
}

/**
 * Gets or creates the SQLite database connection.
 * Singleton pattern ensures only one connection exists.
 *
 * On first call:
 * - Ensures ~/.shep/ directory exists
 * - Creates database file at ~/.shep/data
 * - Configures pragmas for performance and reliability
 *
 * @returns Database connection instance
 *
 * @example
 * ```typescript
 * const db = await getSQLiteConnection();
 * const settings = db.prepare('SELECT * FROM settings').get();
 * ```
 */
export async function getSQLiteConnection(): Promise<Database.Database> {
  if (dbInstance) {
    return dbInstance;
  }

  initialization ??= initializeConnection().finally(() => {
    initialization = null;
  });
  return initialization;
}

async function initializeConnection(): Promise<Database.Database> {
  await ensureShepDirectory();

  // Get database path
  const dbPath = getShepDbPath();

  let connection = openDatabase(dbPath);

  try {
    // Integrity gate. A damaged file otherwise surfaces several layers later as
    // "Failed to run database migrations: database disk image is malformed",
    // which tells the user nothing and leaves Shep unable to start at all. The
    // damaged file is kept — it is the only copy of their history — and a fresh
    // database takes its place so the tool runs.
    const problems = quickCheckProblems(connection);
    if (problems.length > 0) {
      connection.close();
      const salvagedPath = quarantineDatabaseFile(dbPath);
      // eslint-disable-next-line no-console
      console.warn(describeQuarantine(salvagedPath, problems));
      connection = openDatabase(dbPath);
    }

    // Configure pragmas for production use
    // WAL mode: Better concurrency, write performance
    connection.pragma('journal_mode = WAL');

    // NORMAL synchronous: Balance between safety and performance
    connection.pragma('synchronous = NORMAL');

    // Enable foreign keys
    connection.pragma('foreign_keys = ON');

    // Defensive mode: Additional safety checks
    connection.pragma('defensive = ON');

    // Cache size: 16384 pages (~64MB with 4KB page size). The web UI's SSE
    // poll re-reads features/runs/timings every 2s; the previous 8MB cache
    // was too small to keep the hot pages resident across cycles.
    connection.pragma('cache_size = -65536');

    // Keep temp tables (sorts, GROUP BY spills, intermediate joins) in RAM
    // instead of writing them to disk.
    connection.pragma('temp_store = MEMORY');

    // Memory-map up to 256MB of the database file for faster reads. The OS
    // backs this with the page cache; cost is virtual address space only.
    connection.pragma('mmap_size = 268435456');

    // Wait up to 5s for write locks before failing with SQLITE_BUSY. Without
    // this, concurrent SSE polls + watcher writes (PR sync, notifications,
    // auto-archive) can race and surface "database is locked" errors.
    connection.pragma('busy_timeout = 5000');

    // Publish only a fully configured connection. Failed initialization is
    // retryable and must never leave a partially configured cached handle.
    dbInstance = connection;
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

/**
 * Closes the database connection.
 * Should be called when application exits.
 * Safe to call multiple times.
 */
export function closeSQLiteConnection(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Gets the current database instance without creating one.
 * Returns null if connection hasn't been established yet.
 *
 * @returns Database instance or null
 */
export function getExistingConnection(): Database.Database | null {
  return dbInstance;
}
