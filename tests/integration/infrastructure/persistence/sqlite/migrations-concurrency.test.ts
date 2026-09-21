/**
 * Concurrent Migration Integration Tests
 *
 * Shep runs several OS processes against ONE SQLite file — the daemon, the
 * CLI, and one detached worker per running feature — and every one of them
 * calls `runSQLiteMigrations` on startup. The first launch after an upgrade is
 * therefore two-or-more writers computing the same pending set at the same
 * time. Without serialisation the loser re-executes the DDL and then dies on
 * `UNIQUE constraint failed: umzug_migrations.name` (or, for the
 * `ALTER TABLE ADD COLUMN` migrations, on `duplicate column name`).
 *
 * These tests use a file-backed database and two connections, because
 * `:memory:` is private to its connection and cannot express the race.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import {
  createFileDatabase,
  getAppliedMigrations,
  tableExists,
} from '../../../../helpers/database.helper.js';
import { removeDirWithRetry } from '../../../../helpers/remove-dir.helper.js';
import {
  runSQLiteMigrations,
  getTotalMigrationCount,
} from '@/infrastructure/persistence/sqlite/migrations.js';

describe('runSQLiteMigrations — concurrent processes', () => {
  let dir: string;
  let dbPath: string;
  let processA: Database.Database;
  let processB: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-migrate-race-'));
    dbPath = join(dir, 'data');
    processA = createFileDatabase(dbPath);
    processB = createFileDatabase(dbPath);
  });

  afterEach(() => {
    processA.close();
    processB.close();
    removeDirWithRetry(dir);
  });

  it('lets two processes migrate the same fresh database without either crashing', async () => {
    await expect(
      Promise.all([runSQLiteMigrations(processA), runSQLiteMigrations(processB)])
    ).resolves.toBeDefined();
  });

  it('records every migration exactly once when two processes race', async () => {
    await Promise.all([runSQLiteMigrations(processA), runSQLiteMigrations(processB)]);

    const applied = getAppliedMigrations(processA);
    const total = await getTotalMigrationCount();

    expect(applied).toHaveLength(total);
    expect(new Set(applied).size).toBe(applied.length);
  });

  it('leaves the loser with a fully migrated database, not a half-built one', async () => {
    await Promise.all([runSQLiteMigrations(processA), runSQLiteMigrations(processB)]);

    // `settings` is created by migration 001 and `features` by 004: if the
    // loser had bailed out early, one of these would be missing on its
    // connection even though the winner finished.
    expect(tableExists(processB, 'settings')).toBe(true);
    expect(tableExists(processB, 'features')).toBe(true);
  });

  it('is still idempotent for a single process running twice', async () => {
    await runSQLiteMigrations(processA);
    const afterFirst = getAppliedMigrations(processA);

    await runSQLiteMigrations(processA);

    expect(getAppliedMigrations(processA)).toEqual(afterFirst);
  });

  it('releases the claim so a later process can migrate again', async () => {
    await runSQLiteMigrations(processA);

    // A leaked claim would make this second, sequential run wait for the TTL
    // and then time out instead of returning immediately.
    await expect(runSQLiteMigrations(processB)).resolves.toBeUndefined();
  });
});
