/**
 * Migration 097 Integration Tests
 *
 * 097 moves a legacy `supervisor_policies.app_id` value into the cascading
 * scope column and then drops `app_id`. Three statements, no transaction: a
 * process killed between the ADD COLUMN and the UPDATE leaves `scope_id`
 * present but empty, and because the migration was never logged it runs again
 * — this time taking the `hasScopeId` branch, so the copy is skipped FOREVER
 * while the DROP still fires and the only copy of the value is deleted.
 *
 * The interrupt is simulated with a database proxy that throws on the copy
 * statement, which is exactly where a SIGKILL between two `db.exec` calls
 * leaves the process.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { up as migration097Up } from '@/infrastructure/persistence/sqlite/migrations/097-supervisor-policies-cascading-scope.js';

/** The value that must survive the interrupt + re-run. */
const LEGACY_APP_ID = 'APP-CRITICAL-123';

/** Marker the fake interrupt looks for — the statement that copies the value. */
const COPY_STATEMENT_MARKER = 'SET scope_id = app_id';

/**
 * Creates the pre-097 (original migration 089) table shape, with one row.
 *
 * @param db - Database to build the legacy schema in.
 * @param withLegacyUniqueScopeIndex - When true, the unique index is the
 *   app_id-based one. Both shapes exist in the field, and 097 has to survive
 *   either: an index that still mentions app_id blocks `DROP COLUMN app_id`.
 */
function createLegacySupervisorPolicies(
  db: Database.Database,
  withLegacyUniqueScopeIndex = false
): void {
  db.exec(`
    CREATE TABLE supervisor_policies (
      id                              TEXT PRIMARY KEY,
      app_id                          TEXT NOT NULL,
      feature_id                      TEXT,
      enabled                         INTEGER NOT NULL DEFAULT 0,
      autonomy_level                  TEXT NOT NULL DEFAULT 'advisory',
      created_at                      INTEGER NOT NULL,
      updated_at                      INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX idx_supervisor_policies_app_id ON supervisor_policies(app_id)');
  if (withLegacyUniqueScopeIndex) {
    db.exec(
      "CREATE UNIQUE INDEX idx_supervisor_policies_unique_scope ON supervisor_policies(app_id, COALESCE(feature_id, ''))"
    );
  }
  db.prepare(
    'INSERT INTO supervisor_policies (id, app_id, enabled, autonomy_level, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)'
  ).run('policy-1', LEGACY_APP_ID, 'advisory', Date.now(), Date.now());
}

/**
 * Wraps a database so the copy statement throws, imitating a process killed
 * after the ADD COLUMN but before the UPDATE.
 */
function interruptOnCopy(db: Database.Database): Database.Database {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'exec') {
        return (sql: string) => {
          if (sql.includes(COPY_STATEMENT_MARKER)) {
            throw new Error('simulated process kill between ADD COLUMN and UPDATE');
          }
          return target.exec(sql);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Database.Database;
}

function readPolicyScopeId(db: Database.Database): string | null {
  const row = db
    .prepare('SELECT scope_id FROM supervisor_policies WHERE id = ?')
    .get('policy-1') as { scope_id: string | null } | undefined;
  return row?.scope_id ?? null;
}

describe('Migration 097 — cascading scope backfill', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
    createLegacySupervisorPolicies(db);
  });

  afterEach(() => {
    db.close();
  });

  it('copies app_id into scope_id on a clean run', async () => {
    await migration097Up({ context: db, name: '097', path: '' });

    expect(readPolicyScopeId(db)).toBe(LEGACY_APP_ID);
  });

  it('does not lose the app_id value when a run is interrupted before the copy', async () => {
    await expect(
      migration097Up({ context: interruptOnCopy(db), name: '097', path: '' })
    ).rejects.toThrow();

    // The interrupted run was never logged, so umzug re-runs it on the next
    // process start. The value must still be there to copy.
    await migration097Up({ context: db, name: '097', path: '' });

    expect(readPolicyScopeId(db)).toBe(LEGACY_APP_ID);
  });

  it('rolls the whole migration back when it is interrupted, leaving no half-applied schema', async () => {
    await expect(
      migration097Up({ context: interruptOnCopy(db), name: '097', path: '' })
    ).rejects.toThrow();

    const columns = db.pragma('table_info(supervisor_policies)') as { name: string }[];
    const names = new Set(columns.map((c) => c.name));

    expect(names.has('app_id')).toBe(true);
    expect(names.has('scope_id')).toBe(false);
    expect(names.has('scope_type')).toBe(false);
  });

  it('migrates a database whose unique index still references app_id', async () => {
    db.exec('DROP TABLE supervisor_policies');
    createLegacySupervisorPolicies(db, true);

    await migration097Up({ context: db, name: '097', path: '' });

    expect(readPolicyScopeId(db)).toBe(LEGACY_APP_ID);
    const columns = db.pragma('table_info(supervisor_policies)') as { name: string }[];
    expect(new Set(columns.map((c) => c.name)).has('app_id')).toBe(false);
  });

  it('is a no-op on a second clean run', async () => {
    await migration097Up({ context: db, name: '097', path: '' });
    await migration097Up({ context: db, name: '097', path: '' });

    expect(readPolicyScopeId(db)).toBe(LEGACY_APP_ID);
  });
});
