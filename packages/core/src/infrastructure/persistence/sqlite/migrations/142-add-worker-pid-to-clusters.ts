/**
 * Migration 142: Add worker_pid column to clusters table.
 *
 * Records the OS process ID of the spawned cluster-agent worker (spec 113
 * cluster-provisioning-error-details), so a dead or hung worker can be
 * detected via IClusterAgentProcessService.isAlive(workerPid) on read instead
 * of leaving the cluster stuck in Provisioning with no explanation.
 *
 * - worker_pid: nullable, no default — existing clusters predate this column
 *   and never had a worker PID recorded, so staleness detection for those
 *   rows falls back to lastHealthCheckAt alone.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(clusters)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('worker_pid')) {
    db.exec('ALTER TABLE clusters ADD COLUMN worker_pid INTEGER');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
