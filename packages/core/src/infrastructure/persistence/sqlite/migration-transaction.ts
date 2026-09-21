/**
 * Transactional execution for database migrations.
 *
 * Migrations are multi-statement by nature — add a column, copy values into
 * it, drop the old one — and a process that dies between two of those
 * statements leaves a schema that is neither the old shape nor the new one.
 * Worse, the migration was never logged, so it runs again against the
 * half-applied schema and takes the "already migrated" branch for the part
 * that landed while still executing the destructive part. Migration 097 lost
 * `supervisor_policies.app_id` exactly that way.
 *
 * Wrapping is therefore done HERE, once, by the runner — not in each
 * migration file, because 135 of 136 of them had already forgotten to.
 *
 * `BEGIN IMMEDIATE` rather than a plain `BEGIN`: a deferred transaction takes
 * its read snapshot before it acquires the write lock, so two processes that
 * both read the pending set and then write can fail with
 * SQLITE_BUSY_SNAPSHOT, which `busy_timeout` does NOT retry. Taking the write
 * lock up front turns that into an ordinary lock wait.
 *
 * SQLite runs DDL inside transactions, unlike several other engines: an
 * `ALTER TABLE ADD COLUMN`, `DROP COLUMN` or `CREATE INDEX` issued inside one
 * is undone by ROLLBACK. `migration-transaction.test.ts` pins that.
 */

import type Database from 'better-sqlite3';

/**
 * Runs `body` inside a `BEGIN IMMEDIATE` transaction and commits it, rolling
 * back if it throws.
 *
 * `better-sqlite3`'s own `db.transaction()` cannot be used here: it refuses a
 * function that returns a promise, and every umzug migration is `async`.
 *
 * When the connection is already inside a transaction the body simply runs —
 * the outer transaction owns the commit, and starting a nested one here would
 * let an inner failure commit or roll back work the caller still owns.
 *
 * @param db - Connection to run on.
 * @param body - The work to perform atomically.
 * @returns Whatever `body` resolves to.
 */
export async function withImmediateTransaction<T>(
  db: Database.Database,
  body: () => Promise<T>
): Promise<T> {
  if (db.inTransaction) {
    return body();
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.inTransaction) {
      db.exec('ROLLBACK');
    }
    throw error;
  }
}
