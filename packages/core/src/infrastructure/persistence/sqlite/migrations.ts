/**
 * SQLite Migrations Module
 *
 * Manages database schema migrations using umzug v3.
 * Legacy migrations (V1–V36) are registered programmatically from legacy-migrations.ts.
 * New migrations (36+) are individual .ts files in the migrations/ directory,
 * discovered at runtime via directory scan.
 *
 * Preserves the same export API (runSQLiteMigrations, LATEST_SCHEMA_VERSION) so
 * all 16+ importing files require zero changes.
 */

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Umzug } from 'umzug';
import type { RunnableMigration, MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { SQLiteMigrationStorage } from './sqlite-migration-storage.js';
import { LEGACY_MIGRATIONS, LEGACY_MIGRATION_NAMES } from './legacy-migrations.js';
import { MigrationLock } from './migration-lock.js';
import { withImmediateTransaction } from './migration-transaction.js';

/**
 * The latest schema version (highest legacy migration version number).
 * Exported for test assertions so they don't hardcode version numbers.
 */
export const LATEST_SCHEMA_VERSION = 36;

/**
 * Resolves the migrations directory path.
 * Works both in source (src/) and compiled (dist/) contexts.
 */
function getMigrationsDir(): string {
  // import.meta.url is available in ESM; fallback to __dirname for CJS
  // The migrations/ directory is a sibling of this file
  return join(dirname(fileURLToPath(import.meta.url)), 'migrations');
}

/**
 * Discovers new migration files (035+) in the migrations/ directory.
 * Files must be .js (compiled from .ts) and follow the naming convention:
 *   035-description.js, 036-description.js, etc.
 *
 * Each file must export:
 *   - up(params: MigrationParams<Database.Database>): Promise<void>
 *   - down(params: MigrationParams<Database.Database>): Promise<void> (required for 35+)
 */
async function discoverNewMigrations(
  migrationsDir: string
): Promise<RunnableMigration<Database.Database>[]> {
  let files: string[];
  try {
    const allFiles = readdirSync(migrationsDir);
    // Accept .js (compiled) and .ts (dev via tsx) but exclude .d.ts declaration files
    const candidates = allFiles.filter(
      (f) =>
        (f.endsWith('.js') || f.endsWith('.ts')) && !f.endsWith('.d.ts') && !f.endsWith('.d.js')
    );
    // Deduplicate: if both .ts and .js exist for the same migration, prefer .js
    const byName = new Map<string, string>();
    for (const f of candidates) {
      const base = f.replace(/\.(js|ts)$/, '');
      if (!byName.has(base) || f.endsWith('.js')) {
        byName.set(base, f);
      }
    }
    files = [...byName.values()].sort();
  } catch {
    // Directory doesn't exist or is unreadable — no new migrations
    return [];
  }

  const migrations: RunnableMigration<Database.Database>[] = [];

  for (const file of files) {
    const name = file.replace(/\.(js|ts)$/, '');
    const filePath = join(migrationsDir, file);
    const mod = (await import(pathToFileURL(filePath).href)) as {
      up: (params: MigrationParams<Database.Database>) => Promise<unknown>;
      down?: (params: MigrationParams<Database.Database>) => Promise<unknown>;
    };

    migrations.push({
      name,
      path: filePath,
      up: async (params) => mod.up(params),
      ...(mod.down
        ? { down: async (params: MigrationParams<Database.Database>) => mod.down!(params) }
        : {}),
    });
  }

  return migrations;
}

/**
 * Creates a configured Umzug instance for the given database.
 *
 * Combines legacy inline migrations with the already-discovered new migration
 * files (035+). Discovery is done by the caller, before the migration
 * transaction opens: it imports 130+ modules from disk, and doing that while
 * holding the database write lock would keep every other process waiting on
 * filesystem work that has nothing to do with the database.
 */
function createUmzug(
  db: Database.Database,
  newMigrations: RunnableMigration<Database.Database>[]
): Umzug<Database.Database> {
  const storage = new SQLiteMigrationStorage(db, LEGACY_MIGRATION_NAMES);

  return new Umzug<Database.Database>({
    storage,
    context: db,
    // Legacy migrations first (001–035), then new migrations (035+) sorted by name
    migrations: [...LEGACY_MIGRATIONS, ...newMigrations],
    /* eslint-disable no-console */
    logger: process.env.DEBUG_SQL
      ? {
          info: (msg) => console.log('[umzug:info]', msg),
          warn: (msg) => console.warn('[umzug:warn]', msg),
          error: (msg) => console.error('[umzug:error]', msg),
          debug: (msg) => console.debug('[umzug:debug]', msg),
        }
      : undefined,
    /* eslint-enable no-console */
  });
}

/**
 * Returns the total number of registered migrations (legacy + discovered).
 * Exported for test assertions so they don't hardcode migration counts.
 */
export async function getTotalMigrationCount(): Promise<number> {
  const migrationsDir = getMigrationsDir();
  const newMigrations = await discoverNewMigrations(migrationsDir);
  return LEGACY_MIGRATIONS.length + newMigrations.length;
}

/**
 * Runs all pending database migrations.
 *
 * Safe to call multiple times, and safe to call from several processes at
 * once — which matters, because the daemon, the CLI and every detached worker
 * call it on startup against the same file.
 *
 * Two gates make that true:
 *   1. a cross-process claim, so exactly one process migrates and the others
 *      wait and then find nothing pending;
 *   2. one transaction around the whole run, so DDL and the rows recording it
 *      commit together and a killed process leaves nothing half-applied.
 *
 * @param db - Database instance to run migrations on
 */
export async function runSQLiteMigrations(db: Database.Database): Promise<void> {
  try {
    // Import the migration modules before anything is claimed or locked —
    // this is filesystem work, not database work.
    const newMigrations = await discoverNewMigrations(getMigrationsDir());

    // Gate 1 — the advisory claim. Serialises whole migration RUNS across
    // processes so a loser waits and then re-reads an up-to-date applied set,
    // instead of re-executing the same DDL and dying on the log insert.
    const lock = new MigrationLock(db);
    await lock.acquire();

    try {
      // Gate 2 — one transaction around the entire run, so schema changes and
      // the rows recording them commit together. A process killed mid-upgrade
      // leaves the database exactly as it found it, which is what makes the
      // re-run on the next start safe.
      await withImmediateTransaction(db, async () => {
        const umzug = createUmzug(db, newMigrations);
        await umzug.up();
      });
    } finally {
      lock.release();
    }
  } catch (error) {
    throw new Error(
      `Failed to run database migrations: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
