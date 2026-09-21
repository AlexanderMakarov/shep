/**
 * SQLite Retention Repository
 *
 * Deletes log-shaped history past the retention window, and owns the
 * once-per-interval claim that keeps several Shep processes from all pruning
 * at the same moment.
 *
 * No VACUUM. Reclaiming the freed pages would rewrite the whole file under an
 * exclusive lock, which on a database several processes are using means
 * blocking the daemon, the CLI and every worker for the duration. SQLite
 * reuses free pages for subsequent inserts, so the file stops GROWING without
 * it — which is the problem retention exists to solve. Shrinking the file is a
 * separate, operator-initiated job.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IRetentionRepository,
  RetentionPruneCounts,
} from '../../application/ports/output/repositories/retention.repository.interface.js';

/**
 * Tables pruned by age, and the column that dates a row.
 *
 * Deliberately NOT included:
 *  - `archived_agent_sessions` — a record of a user's decision to archive a
 *    session, not history. Ageing it out would silently un-archive sessions.
 *  - `features`, `agent_runs` — the user's work, removed only by deletion.
 *  - `security_events`, `workflow_executions` — already have their own
 *    retention, applied at their own write sites.
 */
const PRUNABLE_TABLES = [
  { key: 'activityLog', table: 'activity_log', column: 'created_at' },
  { key: 'agentMessages', table: 'agent_messages', column: 'created_at' },
  { key: 'interactiveMessages', table: 'interactive_messages', column: 'created_at' },
  { key: 'phaseTimings', table: 'phase_timings', column: 'created_at' },
  { key: 'notifications', table: 'pm_notifications', column: 'created_at' },
] as const satisfies readonly {
  key: keyof RetentionPruneCounts;
  table: string;
  column: string;
}[];

@injectable()
export class SQLiteRetentionRepository implements IRetentionRepository {
  constructor(private readonly db: Database.Database) {}

  async claimPruneCycle(now: Date, intervalMs: number): Promise<boolean> {
    // One statement: the "is it due?" test and the "it is mine" write cannot
    // be separated, so concurrent starts produce one prune, not six.
    const result = this.db
      .prepare(
        `UPDATE retention_state
            SET last_pruned_at = @now
          WHERE id = 1 AND last_pruned_at <= @due`
      )
      .run({ now: now.getTime(), due: now.getTime() - intervalMs });

    return result.changes > 0;
  }

  async pruneOlderThan(cutoff: Date): Promise<RetentionPruneCounts> {
    const counts: RetentionPruneCounts = {
      activityLog: 0,
      agentMessages: 0,
      interactiveMessages: 0,
      phaseTimings: 0,
      notifications: 0,
    };

    // One transaction so a prune is all-or-nothing: a process killed halfway
    // through would otherwise have moved `last_pruned_at` forward while only
    // some tables were trimmed. Write-only, so the default deferred mode takes
    // the write lock on its first statement and no read snapshot can go stale.
    const prune = this.db.transaction(() => {
      for (const { key, table, column } of PRUNABLE_TABLES) {
        // Table and column names are compile-time constants from the list
        // above; the cutoff is always a bound parameter.
        counts[key] = this.db
          .prepare(`DELETE FROM ${table} WHERE ${column} < ?`)
          .run(cutoff.getTime()).changes;
      }
    });

    prune();

    return counts;
  }
}
