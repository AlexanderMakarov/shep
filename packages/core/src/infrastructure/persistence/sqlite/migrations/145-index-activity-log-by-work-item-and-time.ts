/**
 * Migration 145: Index activity_log by (work_item_id, created_at).
 *
 * `listByWorkItem` reads one work item's history ordered by `created_at`.
 * `idx_activity_log_work_item_id` covers the lookup but carries no ordering,
 * so SQLite sorted the result on every read: measured plan was
 * `SEARCH activity_log USING INDEX idx_activity_log_work_item_id
 *  (work_item_id=?) | USE TEMP B-TREE FOR ORDER BY`.
 *
 * The composite index returns the rows already in order, which removes the
 * sort entirely — and matters most exactly where it hurts, on the busiest work
 * items with the longest histories.
 *
 * The single-column index is left in place: it is the prefix of this one and
 * costs little, and dropping an index other queries may have planned around is
 * not this migration's business.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_log'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    return;
  }

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_activity_log_work_item_created ON activity_log(work_item_id, created_at)'
  );
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP INDEX IF EXISTS idx_activity_log_work_item_created');
}
