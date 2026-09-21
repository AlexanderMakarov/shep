/**
 * Migration 146: Create retention_state.
 *
 * A single row recording when history was last pruned.
 *
 * Retention is evaluated on every process start, and Shep starts a process per
 * CLI invocation, so "is a prune due?" must cost one indexed point read — not
 * a scan of six log tables. The row is also what keeps the daemon, the CLI and
 * a worker from all pruning at the same moment: the cycle is claimed with a
 * single conditional UPDATE whose `changes` count says who won, the same
 * one-statement claim the PR-sync lock and the migration lock use.
 *
 * `last_pruned_at` starts at 0 so the first process to look finds a prune due.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS retention_state (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      last_pruned_at INTEGER NOT NULL
    )
  `);

  db.exec('INSERT OR IGNORE INTO retention_state (id, last_pruned_at) VALUES (1, 0)');
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS retention_state');
}
