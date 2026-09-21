/**
 * Cross-process migration claim.
 *
 * Shep runs several OS processes against one SQLite file — the daemon, the
 * CLI, and one detached worker per running feature — and each of them calls
 * `runSQLiteMigrations` while starting up. On the first launch after an
 * upgrade they all compute the SAME pending set, and umzug has no locking of
 * its own: between `executed()` and `logMigration()` two processes will each
 * execute the migration, and the loser dies on
 * `UNIQUE constraint failed: umzug_migrations.name` — or, for the
 * non-idempotent `ALTER TABLE ADD COLUMN` migrations, on `duplicate column
 * name`, having already re-run the DDL.
 *
 * `busy_timeout` does not help: this is two legitimate writers racing across
 * a read/write gap, not lock contention.
 *
 * The claim is the same one-statement conditional write `pr-sync-watcher`
 * uses for its poll lock: an `INSERT OR REPLACE ... WHERE NOT EXISTS` whose
 * `changes` count says whether THIS process won. A process that loses waits
 * for the winner to finish and then re-reads the applied set, which is a
 * no-op run — it never crashes and never re-executes DDL.
 *
 * The TTL exists for one case only: a process killed while migrating. Without
 * it the claim row would wedge every future startup.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { isSqliteBusyError } from './database-integrity.js';

/** Table holding the single claim row. Created on demand, outside umzug. */
export const MIGRATION_LOCK_TABLE = 'migration_lock';

/**
 * How long a claim stays valid without being released.
 *
 * Sized for the worst honest case — a fresh database applying every migration
 * on slow storage — not for the typical one, because stealing a claim from a
 * process that is still migrating is the failure this module exists to
 * prevent.
 */
export const MIGRATION_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * How long a losing process waits for the winner before giving up.
 *
 * Matches the TTL: if the holder is alive it finishes well inside this, and if
 * it is dead the TTL expires and the claim is stealable at the same moment.
 */
export const MIGRATION_LOCK_WAIT_TIMEOUT_MS = MIGRATION_LOCK_TTL_MS;

/** Gap between claim attempts while waiting. Short — migrations are quick. */
const CLAIM_POLL_INTERVAL_MS = 25;

export interface MigrationLockOptions {
  /** Identity written into the claim row. Defaults to a per-process value. */
  holderId?: string;
  /** Clock source, injectable so TTL expiry is testable without sleeping. */
  now?: () => number;
  /** How long {@link MigrationLock.acquire} waits before throwing. */
  waitTimeoutMs?: number;
}

interface MigrationLockRow {
  locked_by: string;
  expires_at: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MigrationLock {
  private readonly db: Database.Database;
  private readonly holderId: string;
  private readonly now: () => number;
  private readonly waitTimeoutMs: number;

  constructor(db: Database.Database, options?: MigrationLockOptions) {
    this.db = db;
    // PID alone is not unique enough: PIDs are reused, and a reused PID would
    // let an unrelated process release or steal a live claim.
    this.holderId = options?.holderId ?? `${process.pid}-${randomUUID()}`;
    this.now = options?.now ?? (() => Date.now());
    this.waitTimeoutMs = options?.waitTimeoutMs ?? MIGRATION_LOCK_WAIT_TIMEOUT_MS;
    this.ensureTable();
  }

  /**
   * Try once to take the claim.
   *
   * A single conditional statement, so the check and the write cannot be
   * separated by another process. Re-claiming while already the holder
   * succeeds and refreshes the TTL.
   *
   * @returns True when this process now holds the claim.
   */
  tryClaim(): boolean {
    const now = this.now();
    try {
      const result = this.db
        .prepare(
          `INSERT OR REPLACE INTO ${MIGRATION_LOCK_TABLE} (id, locked_by, locked_at, expires_at)
           SELECT 1, @holder, @now, @expires
           WHERE NOT EXISTS (
             SELECT 1 FROM ${MIGRATION_LOCK_TABLE}
              WHERE id = 1 AND locked_by != @holder AND expires_at > @now
           )`
        )
        .run({ holder: this.holderId, now, expires: now + MIGRATION_LOCK_TTL_MS });

      return result.changes > 0;
    } catch (error) {
      if (isSqliteBusyError(error)) {
        // The claim itself is a write, and the holder runs its migrations
        // inside a transaction that holds the write lock. A migration run
        // longer than `busy_timeout` therefore makes this statement fail —
        // which is not an error, it is the answer: somebody else is migrating.
        // Reporting it as "not claimed" lets acquire() keep waiting instead of
        // failing startup with "database is locked".
        return false;
      }
      throw error;
    }
  }

  /**
   * Wait until the claim is ours.
   *
   * @throws When the holder neither finishes nor expires within the wait
   *   budget — a hung migration must surface, not hang the CLI silently.
   */
  async acquire(): Promise<void> {
    const deadline = this.now() + this.waitTimeoutMs;

    while (!this.tryClaim()) {
      if (this.now() >= deadline) {
        throw new Error(
          `Timed out after ${this.waitTimeoutMs}ms waiting for another process (${this.describeHolder()}) to finish database migrations`
        );
      }
      await sleep(CLAIM_POLL_INTERVAL_MS);
    }
  }

  /** Give the claim up. Does nothing when another process now holds it. */
  release(): void {
    this.db
      .prepare(`DELETE FROM ${MIGRATION_LOCK_TABLE} WHERE id = 1 AND locked_by = @holder`)
      .run({ holder: this.holderId });
  }

  /** Identity of the current holder, for an error a user can act on. */
  private describeHolder(): string {
    const row = this.db
      .prepare(`SELECT locked_by, expires_at FROM ${MIGRATION_LOCK_TABLE} WHERE id = 1`)
      .get() as MigrationLockRow | undefined;
    return row ? `holder ${row.locked_by}` : 'unknown holder';
  }

  /**
   * The claim table cannot live in a migration — it has to exist before the
   * first migration runs. `IF NOT EXISTS` makes concurrent creation safe.
   */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_LOCK_TABLE} (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        locked_by  TEXT    NOT NULL,
        locked_at  INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }
}
