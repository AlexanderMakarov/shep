/**
 * Migration 144: Canonicalise features.repository_path and index branch lookups.
 *
 * Feature lookups used to compensate for mixed separators at READ time —
 * `WHERE branch = ? AND REPLACE(repository_path, '\', '/') = ?`. Wrapping an
 * indexed column in a function makes its index unusable, so `idx_features_repo`
 * never applied and, with no index on `branch` either, the lookup fell back to
 * walking every live feature (measured: `SEARCH features USING INDEX
 * idx_features_deleted_at`, i.e. all non-deleted rows).
 *
 * The fix is to normalise on the way IN. New writes go through
 * `normalizeRepositoryPath`; this migration brings existing rows into the same
 * form so nothing written before the change becomes invisible to a query that
 * no longer compensates.
 *
 * `idx_features_branch_repo` then serves `findByBranch` directly, and the
 * existing `idx_features_slug (slug, repository_path)` becomes fully usable for
 * `findBySlug` instead of matching on the slug alone.
 *
 * Idempotent: the UPDATE only touches rows that still contain a backslash, and
 * the index is created IF NOT EXISTS.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='features'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    return;
  }

  // char(92) is a backslash. SQLite has no portable backslash escape in a
  // string literal, and this spelling reads the same on every platform.
  db.exec(`
    UPDATE features
       SET repository_path = REPLACE(repository_path, char(92), '/')
     WHERE instr(repository_path, char(92)) > 0
  `);

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_features_branch_repo ON features(branch, repository_path)'
  );
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // The separator normalisation is not reversed: the original spelling is not
  // recorded anywhere, and both forms name the same repository.
  db.exec('DROP INDEX IF EXISTS idx_features_branch_repo');
}
