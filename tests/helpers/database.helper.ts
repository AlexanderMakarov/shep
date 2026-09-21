/**
 * Database Test Helper
 *
 * Provides utilities for creating and managing in-memory SQLite databases
 * for integration tests. Ensures tests are isolated and fast.
 */

import Database from 'better-sqlite3';

/**
 * How long a file-backed test connection waits for a write lock before it
 * gives up with SQLITE_BUSY. Matches the production `busy_timeout` pragma so a
 * test that contends for the write lock behaves the way the real app does.
 */
const FILE_DATABASE_BUSY_TIMEOUT_MS = 5000;

/**
 * Creates an in-memory SQLite database for testing.
 * Database is destroyed when the connection is closed.
 *
 * @returns In-memory database instance
 *
 * @example
 * ```typescript
 * const db = createInMemoryDatabase();
 * // Use db for testing
 * db.close();
 * ```
 */
export function createInMemoryDatabase(): Database.Database {
  const db = new Database(':memory:', {
    verbose: process.env.DEBUG_SQL ? console.log : undefined,
  });

  // Set pragmas for testing (same as production but optimized for testing)
  db.pragma('journal_mode = MEMORY'); // Faster than WAL for in-memory
  db.pragma('synchronous = OFF'); // Faster for tests (no disk writes)
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');

  return db;
}

/**
 * Creates an in-memory database with migrations applied.
 * Useful for integration tests that need a fully initialized schema.
 *
 * @param runMigrations - Function to run migrations
 * @returns Database with migrations applied
 *
 * @example
 * ```typescript
 * const db = await createDatabaseWithMigrations(runSQLiteMigrations);
 * // Database has complete schema
 * db.close();
 * ```
 */
export async function createDatabaseWithMigrations(
  runMigrations: (db: Database.Database) => Promise<void>
): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  return db;
}

/**
 * Verifies that a table exists in the database.
 *
 * @param db - Database instance
 * @param tableName - Name of the table to check
 * @returns True if table exists, false otherwise
 */
export function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare(
      `
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name=?
  `
    )
    .get(tableName);
  return result !== undefined;
}

/**
 * Gets the current schema version from user_version pragma.
 *
 * @param db - Database instance
 * @returns Current schema version
 */
export function getSchemaVersion(db: Database.Database): number {
  const result = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  return result.user_version;
}

/**
 * Gets table schema information.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @returns Array of column definitions
 */
export function getTableSchema(
  db: Database.Database,
  tableName: string
): { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[] {
  return db.prepare(`PRAGMA table_info(${tableName})`).all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[];
}

/**
 * Gets all indexes for a table.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @returns Array of index names
 */
export function getTableIndexes(db: Database.Database, tableName: string): string[] {
  const results = db
    .prepare(
      `
    SELECT name
    FROM sqlite_master
    WHERE type='index' AND tbl_name=?
  `
    )
    .all(tableName) as { name: string }[];
  return results.map((r) => r.name);
}

/**
 * Returns the names of all applied migrations from the umzug_migrations table.
 *
 * @param db - Database instance
 * @returns Ordered array of migration names, or empty array if table doesn't exist
 */
export function getAppliedMigrations(db: Database.Database): string[] {
  const tableCheck = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='umzug_migrations'")
    .get();
  if (!tableCheck) {
    return [];
  }
  const rows = db.prepare('SELECT name FROM umzug_migrations ORDER BY name').all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}

/**
 * Removes umzug_migrations records for migrations after the specified version.
 * Used in tests to simulate partial migration state under umzug.
 *
 * @param db - Database instance
 * @param afterVersion - Remove records for migrations with version > afterVersion (zero-padded, e.g. '022')
 */
export function clearMigrationsAfter(db: Database.Database, afterVersion: string): void {
  db.prepare('DELETE FROM umzug_migrations WHERE name > ?').run(afterVersion);
}

/**
 * Creates a file-backed SQLite database configured like production.
 *
 * Concurrency defects cannot be reproduced against `:memory:` — an in-memory
 * database is private to its connection, so two "processes" would never see
 * each other's writes. Tests that exercise two connections (or two real OS
 * processes) against one database file use this instead, with the same WAL +
 * busy_timeout + foreign_keys pragmas `connection.ts` applies in production.
 *
 * @param filePath - Absolute path to the database file (created if absent).
 * @returns Database instance pointed at that file
 */
export function createFileDatabase(filePath: string): Database.Database {
  const db = new Database(filePath, {
    verbose: process.env.DEBUG_SQL ? console.log : undefined,
  });

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma(`busy_timeout = ${FILE_DATABASE_BUSY_TIMEOUT_MS}`);

  return db;
}

/** How a `db.transaction(...)` was actually run. */
export type TransactionMode = 'deferred' | 'immediate' | 'exclusive';

/**
 * Wraps a database so every `db.transaction(...)` invocation records the mode
 * it ran in.
 *
 * A read-then-write transaction must take the write lock up front
 * (`.immediate()`), or a concurrent writer turns it into SQLITE_BUSY_SNAPSHOT
 * — an error `busy_timeout` never retries. That choice is invisible in the
 * result of a successful call, so it is asserted here instead.
 *
 * @param db - The database to wrap.
 * @param sink - Array that receives one entry per transaction run.
 * @returns A proxy that behaves exactly like `db`.
 */
export function recordTransactionModes(
  db: Database.Database,
  sink: TransactionMode[]
): Database.Database {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'transaction') {
        return (fn: (...args: never[]) => unknown) => {
          const real = target.transaction(fn);
          const record =
            (mode: TransactionMode, variant: (...args: never[]) => unknown) =>
            (...args: never[]) => {
              sink.push(mode);
              return variant(...args);
            };
          return Object.assign(record('deferred', real), {
            deferred: record('deferred', real.deferred),
            immediate: record('immediate', real.immediate),
            exclusive: record('exclusive', real.exclusive),
          });
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Database.Database;
}
