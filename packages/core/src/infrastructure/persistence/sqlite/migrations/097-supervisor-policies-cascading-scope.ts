/**
 * Migration 097: Backfill cascading scope columns on supervisor_policies.
 *
 * Migration 089 originally created `supervisor_policies` with a single
 * `app_id` column. The cascading-scope model (spec 093) replaced that with
 * `(scope_type, scope_id, feature_id)`. The 089 migration was rewritten in
 * place to emit the new schema for fresh installs, but DBs that already
 * applied the original 089 are silently skipped by its
 * `if (tables.length === 0)` guard, leaving them with the legacy `app_id`
 * column.
 *
 * This migration brings those legacy DBs forward without losing data:
 *   - adds `scope_type` (NOT NULL, default 'app') and `scope_id` columns
 *   - copies any existing `app_id` values into `scope_id`
 *   - drops the legacy `app_id` index and unique scope index
 *   - recreates the unique scope index over the new tuple
 *
 * Idempotent: if `scope_type` already exists, the migration is a no-op.
 *
 * Atomic, and it has to be. The add/copy/drop sequence is only safe as a unit:
 * a process killed between the ADD COLUMN and the UPDATE was never logged, so
 * the migration re-ran — but `hasScopeId` was now true, so the copy was
 * skipped permanently while the DROP still fired, and the only copy of
 * `app_id` was deleted. The runner wraps every migration in a transaction; the
 * explicit one here states the requirement at the place that depends on it.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.transaction(() => backfillCascadingScope(db))();
}

function backfillCascadingScope(db: Database.Database): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supervisor_policies'")
    .all() as { name: string }[];
  if (tables.length === 0) {
    // Table doesn't exist yet — migration 089 will create it with the new
    // schema directly. Nothing to back-fill.
    return;
  }

  const columns = db.pragma('table_info(supervisor_policies)') as { name: string }[];
  const colNames = new Set(columns.map((c) => c.name));
  const hasScopeType = colNames.has('scope_type');
  const hasScopeId = colNames.has('scope_id');
  const hasAppId = colNames.has('app_id');

  if (!hasScopeType) {
    db.exec("ALTER TABLE supervisor_policies ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'app'");
  }
  if (!hasScopeId) {
    db.exec('ALTER TABLE supervisor_policies ADD COLUMN scope_id TEXT');
    if (hasAppId) {
      db.exec('UPDATE supervisor_policies SET scope_id = app_id WHERE scope_id IS NULL');
    }
  }

  // Every index that mentions app_id has to go BEFORE the column does:
  // SQLite refuses `DROP COLUMN` while an index still references it
  // ("error in index ... after drop column: no such column: app_id").
  //
  // Dropped unconditionally (IF EXISTS) because the index may or may not
  // exist depending on which version of 089 created the table — NOT because
  // a partial prior run would be survivable. It would not be: the enclosing
  // transaction is what makes re-running this migration safe.
  db.exec('DROP INDEX IF EXISTS idx_supervisor_policies_app_id');

  const legacyUniqueScopeSql = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_supervisor_policies_unique_scope'"
    )
    .get() as { sql: string | null } | undefined;
  if (legacyUniqueScopeSql?.sql?.includes('app_id')) {
    db.exec('DROP INDEX idx_supervisor_policies_unique_scope');
  }

  // Drop the legacy app_id column once values are copied — it carries a
  // NOT NULL constraint that breaks INSERTs from the new code path.
  // Requires SQLite >= 3.35; better-sqlite3 ships a newer build.
  if (hasAppId) {
    db.exec('ALTER TABLE supervisor_policies DROP COLUMN app_id');
  }

  const indexNamesAfter = new Set(
    (db.pragma('index_list(supervisor_policies)') as { name: string }[]).map((i) => i.name)
  );
  if (!indexNamesAfter.has('idx_supervisor_policies_unique_scope')) {
    db.exec(
      "CREATE UNIQUE INDEX idx_supervisor_policies_unique_scope ON supervisor_policies(scope_type, COALESCE(scope_id, ''), COALESCE(feature_id, ''))"
    );
  }
  if (!indexNamesAfter.has('idx_supervisor_policies_scope')) {
    db.exec(
      'CREATE INDEX idx_supervisor_policies_scope ON supervisor_policies(scope_type, scope_id)'
    );
  }
}

export async function down({ context: _db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite cannot drop columns in older versions; leave the new columns in
  // place. The 089 down() drops the entire table anyway.
}
