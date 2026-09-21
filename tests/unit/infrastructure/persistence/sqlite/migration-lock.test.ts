/**
 * MigrationLock Unit Tests
 *
 * The lock is the thing that keeps two Shep processes (daemon, CLI, worker)
 * from executing the same pending migration set at the same time, so every
 * test here is about what happens when a SECOND holder shows up.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createFileDatabase } from '../../../../helpers/database.helper.js';
import { removeDirWithRetry } from '../../../../helpers/remove-dir.helper.js';
import {
  MigrationLock,
  MIGRATION_LOCK_TABLE,
  MIGRATION_LOCK_TTL_MS,
} from '@/infrastructure/persistence/sqlite/migration-lock.js';

describe('MigrationLock', () => {
  let dir: string;
  let dbPath: string;
  let first: Database.Database;
  let second: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-migration-lock-'));
    dbPath = join(dir, 'data');
    first = createFileDatabase(dbPath);
    second = createFileDatabase(dbPath);
  });

  afterEach(() => {
    first.close();
    second.close();
    removeDirWithRetry(dir);
  });

  it('creates its table on construction so the claim can be written', () => {
    new MigrationLock(first);

    const tables = first
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .all(MIGRATION_LOCK_TABLE) as { name: string }[];

    expect(tables).toHaveLength(1);
  });

  it('grants the claim to the first holder only', () => {
    const holderA = new MigrationLock(first, { holderId: 'process-a' });
    const holderB = new MigrationLock(second, { holderId: 'process-b' });

    expect(holderA.tryClaim()).toBe(true);
    expect(holderB.tryClaim()).toBe(false);
  });

  it('lets the same holder re-claim, so a retry never deadlocks against itself', () => {
    const holder = new MigrationLock(first, { holderId: 'process-a' });

    expect(holder.tryClaim()).toBe(true);
    expect(holder.tryClaim()).toBe(true);
  });

  it('hands the claim to the next holder once the owner releases it', () => {
    const holderA = new MigrationLock(first, { holderId: 'process-a' });
    const holderB = new MigrationLock(second, { holderId: 'process-b' });

    expect(holderA.tryClaim()).toBe(true);
    holderA.release();

    expect(holderB.tryClaim()).toBe(true);
  });

  it('ignores a release from a process that does not hold the claim', () => {
    const holderA = new MigrationLock(first, { holderId: 'process-a' });
    const holderB = new MigrationLock(second, { holderId: 'process-b' });

    expect(holderA.tryClaim()).toBe(true);
    holderB.release();

    expect(holderB.tryClaim()).toBe(false);
  });

  it('steals a claim whose TTL has expired, so a killed process cannot wedge startup', () => {
    let clock = 1_000_000;
    const holderA = new MigrationLock(first, { holderId: 'process-a', now: () => clock });
    const holderB = new MigrationLock(second, { holderId: 'process-b', now: () => clock });

    expect(holderA.tryClaim()).toBe(true);
    expect(holderB.tryClaim()).toBe(false);

    clock += MIGRATION_LOCK_TTL_MS + 1;

    expect(holderB.tryClaim()).toBe(true);
  });

  it('waits for the holder to release instead of failing', async () => {
    const holderA = new MigrationLock(first, { holderId: 'process-a' });
    const holderB = new MigrationLock(second, { holderId: 'process-b' });

    expect(holderA.tryClaim()).toBe(true);

    const waiting = holderB.acquire();
    setTimeout(() => holderA.release(), 30);

    await expect(waiting).resolves.toBeUndefined();
  });

  it('treats a write lock held by a migrating process as "not claimed", not as an error', async () => {
    const waiter = new MigrationLock(second, { holderId: 'process-b', waitTimeoutMs: 40 });
    // The holder's migration run keeps the write lock for longer than the
    // waiter's busy_timeout — a real possibility on a large upgrade.
    second.pragma('busy_timeout = 10');
    first.exec('BEGIN IMMEDIATE');

    try {
      expect(waiter.tryClaim()).toBe(false);
      // And the wait reports the wait, not SQLITE_BUSY.
      await expect(waiter.acquire()).rejects.toThrow(/Timed out/);
    } finally {
      first.exec('ROLLBACK');
    }
  });

  it('claims once the migrating process commits', async () => {
    const waiter = new MigrationLock(second, { holderId: 'process-b' });
    second.pragma('busy_timeout = 10');
    first.exec('BEGIN IMMEDIATE');
    expect(waiter.tryClaim()).toBe(false);

    first.exec('ROLLBACK');

    expect(waiter.tryClaim()).toBe(true);
  });

  it('reports a timeout naming the holder rather than hanging forever', async () => {
    const holderA = new MigrationLock(first, { holderId: 'process-a' });
    const holderB = new MigrationLock(second, { holderId: 'process-b', waitTimeoutMs: 40 });

    expect(holderA.tryClaim()).toBe(true);

    await expect(holderB.acquire()).rejects.toThrow(/process-a/);
  });
});
