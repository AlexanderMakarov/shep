/**
 * Retention Repository Integration Tests
 *
 * Every log-shaped table Shep writes used to grow without bound: the operation
 * log had a `pruneBefore()` with no caller, and the activity log, agent and
 * interactive messages, phase timings and PM notifications had no retention at
 * all — about 184 MB a year at five agents a day.
 *
 * The interval claim is exercised across TWO CONNECTIONS, because its job is
 * to stop several Shep processes starting at once from all pruning the same
 * tables at the same moment.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createFileDatabase } from '../../../helpers/database.helper.js';
import { removeDirWithRetry } from '../../../helpers/remove-dir.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteRetentionRepository } from '@/infrastructure/repositories/sqlite-retention.repository.js';
import { DATA_RETENTION_PRUNE_INTERVAL_MS } from '@/domain/shared/data-retention.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const CUTOFF = new Date('2026-03-03T00:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z').getTime();
const RECENT = new Date('2026-05-31T00:00:00Z').getTime();

/**
 * Inserts one old and one recent row into every pruned table.
 *
 * Raw SQL with foreign keys off: these tables reference work items, apps and
 * agent runs, none of which bear on what is being tested.
 */
function seedHistory(db: Database.Database): void {
  db.pragma('foreign_keys = OFF');

  const insert = (sql: string, params: unknown[]): void => {
    db.prepare(sql).run(...params);
  };

  for (const [id, createdAt] of [
    ['old', OLD],
    ['recent', RECENT],
  ] as const) {
    insert(
      'INSERT INTO activity_log (id, work_item_id, field_name, actor_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`activity-${id}`, 'work-1', 'status', 'actor-1', createdAt, createdAt]
    );
    insert(
      'INSERT INTO agent_messages (id, app_id, from_actor, to_target, to_kind, message_kind, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [`message-${id}`, 'app-1', 'agent-0', 'agent-1', 'agent', 'note', '{}', createdAt, createdAt]
    );
    insert(
      'INSERT INTO interactive_messages (id, feature_id, session_id, role, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`interactive-${id}`, 'feat-1', 'session-1', 'user', 'hello', createdAt, createdAt]
    );
    insert(
      'INSERT INTO phase_timings (id, agent_run_id, phase, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`timing-${id}`, 'run-1', 'implement', createdAt, createdAt, createdAt]
    );
    insert(
      'INSERT INTO pm_notifications (id, project_id, recipient_id, type, title, is_read, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)',
      [`notification-${id}`, 'project-1', 'user-1', 'mention', 'Title', createdAt, createdAt]
    );
  }
  db.pragma('foreign_keys = ON');
}

function idsIn(db: Database.Database, table: string): string[] {
  return (db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as { id: string }[]).map(
    (r) => r.id
  );
}

describe('SQLiteRetentionRepository', () => {
  let dir: string;
  let db: Database.Database;
  let otherDb: Database.Database;
  let repository: SQLiteRetentionRepository;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-retention-'));
    const dbPath = join(dir, 'data');
    db = createFileDatabase(dbPath);
    await runSQLiteMigrations(db);
    otherDb = createFileDatabase(dbPath);
    repository = new SQLiteRetentionRepository(db);
  });

  afterEach(() => {
    db.close();
    otherDb.close();
    removeDirWithRetry(dir);
  });

  describe('pruneOlderThan', () => {
    beforeEach(() => {
      seedHistory(db);
    });

    it('removes history older than the cutoff from every log table', async () => {
      const counts = await repository.pruneOlderThan(CUTOFF);

      expect(counts).toEqual({
        activityLog: 1,
        agentMessages: 1,
        interactiveMessages: 1,
        phaseTimings: 1,
        notifications: 1,
      });
    });

    it('keeps everything inside the window', async () => {
      await repository.pruneOlderThan(CUTOFF);

      expect(idsIn(db, 'activity_log')).toEqual(['activity-recent']);
      expect(idsIn(db, 'agent_messages')).toEqual(['message-recent']);
      expect(idsIn(db, 'interactive_messages')).toEqual(['interactive-recent']);
      expect(idsIn(db, 'phase_timings')).toEqual(['timing-recent']);
      expect(idsIn(db, 'pm_notifications')).toEqual(['notification-recent']);
    });

    it('is a no-op the second time', async () => {
      await repository.pruneOlderThan(CUTOFF);

      const second = await repository.pruneOlderThan(CUTOFF);

      expect(Object.values(second).every((n) => n === 0)).toBe(true);
    });
  });

  describe('claimPruneCycle', () => {
    it('is due on a fresh database', async () => {
      expect(await repository.claimPruneCycle(NOW, DATA_RETENTION_PRUNE_INTERVAL_MS)).toBe(true);
    });

    it('is not due again inside the interval', async () => {
      await repository.claimPruneCycle(NOW, DATA_RETENTION_PRUNE_INTERVAL_MS);

      const soon = new Date(NOW.getTime() + DATA_RETENTION_PRUNE_INTERVAL_MS - 1);
      expect(await repository.claimPruneCycle(soon, DATA_RETENTION_PRUNE_INTERVAL_MS)).toBe(false);
    });

    it('is due again once the interval has passed', async () => {
      await repository.claimPruneCycle(NOW, DATA_RETENTION_PRUNE_INTERVAL_MS);

      const later = new Date(NOW.getTime() + DATA_RETENTION_PRUNE_INTERVAL_MS);
      expect(await repository.claimPruneCycle(later, DATA_RETENTION_PRUNE_INTERVAL_MS)).toBe(true);
    });

    it('lets exactly one of two processes own a cycle', async () => {
      const other = new SQLiteRetentionRepository(otherDb);

      const results = await Promise.all([
        repository.claimPruneCycle(NOW, DATA_RETENTION_PRUNE_INTERVAL_MS),
        other.claimPruneCycle(NOW, DATA_RETENTION_PRUNE_INTERVAL_MS),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });
});
