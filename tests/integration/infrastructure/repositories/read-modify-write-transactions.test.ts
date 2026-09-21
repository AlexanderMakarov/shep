/**
 * Read-Modify-Write Transaction Integration Tests
 *
 * `db.transaction(fn)` opens a DEFERRED transaction. A deferred transaction
 * that READS before it WRITES takes its read snapshot first and only then asks
 * for the write lock; if another connection committed in between, SQLite
 * refuses with SQLITE_BUSY_SNAPSHOT — which `busy_timeout` does NOT retry,
 * because retrying would silently write from a stale snapshot. The whole
 * transaction is simply lost.
 *
 * Every repository method that appends to a JSON audit log does exactly that:
 * SELECT the log, push an entry, UPDATE the row. Those are the ones that must
 * run `.immediate()`, which takes the write lock up front and makes the OTHER
 * writer wait.
 *
 * Write-only transactions (bulk inserts, reorders, status flips) are left
 * deferred on purpose: their first statement is already a write, so there is no
 * snapshot to go stale.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createFileDatabase } from '../../../helpers/database.helper.js';
import { removeDirWithRetry } from '../../../helpers/remove-dir.helper.js';

interface SqliteErrorLike {
  code?: string;
  message: string;
}

describe('deferred vs immediate read-modify-write', () => {
  let dir: string;
  let mine: Database.Database;
  let other: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-snapshot-'));
    const dbPath = join(dir, 'data');
    mine = createFileDatabase(dbPath);
    mine.exec('CREATE TABLE audited (id TEXT PRIMARY KEY, log TEXT NOT NULL)');
    mine.prepare('INSERT INTO audited (id, log) VALUES (?, ?)').run('row-1', 'start');
    other = createFileDatabase(dbPath);
    // Keep the losing writer's wait short so the test does not sit on the
    // production five-second budget.
    other.pragma('busy_timeout = 50');
  });

  afterEach(() => {
    mine.close();
    other.close();
    removeDirWithRetry(dir);
  });

  /**
   * Appends to the row's log, with another connection committing in the middle.
   *
   * @param immediate - Run the transaction in IMMEDIATE mode.
   * @returns The error code, or 'committed' when the transaction survived.
   */
  function appendWithInterference(immediate: boolean): string {
    const transaction = mine.transaction(() => {
      const row = mine.prepare('SELECT log FROM audited WHERE id = ?').get('row-1') as {
        log: string;
      };

      try {
        other.prepare('UPDATE audited SET log = ? WHERE id = ?').run(`${row.log}+other`, 'row-1');
      } catch {
        // Under IMMEDIATE the other writer is the one that has to wait; its
        // failure is not this transaction's problem.
      }

      mine.prepare('UPDATE audited SET log = ? WHERE id = ?').run(`${row.log}+mine`, 'row-1');
    });

    try {
      if (immediate) {
        transaction.immediate();
      } else {
        transaction();
      }
      return 'committed';
    } catch (error) {
      return (error as SqliteErrorLike).code ?? (error as SqliteErrorLike).message;
    }
  }

  it('loses a deferred read-modify-write to a concurrent writer', () => {
    expect(appendWithInterference(false)).toBe('SQLITE_BUSY_SNAPSHOT');
  });

  it('completes the same work when the write lock is taken up front', () => {
    expect(appendWithInterference(true)).toBe('committed');
    const row = mine.prepare('SELECT log FROM audited WHERE id = ?').get('row-1') as {
      log: string;
    };
    expect(row.log).toBe('start+mine');
  });
});
