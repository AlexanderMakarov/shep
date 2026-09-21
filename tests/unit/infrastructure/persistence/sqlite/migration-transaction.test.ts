/**
 * Migration Transaction Unit Tests
 *
 * Only 1 of 136 migration files opened a transaction of its own, so every
 * multi-statement migration had a partial-apply window. Rather than edit 136
 * files, the runner wraps execution centrally — these tests pin the behaviour
 * that wrapper has to provide, including the SQLite-specific question of
 * whether DDL actually rolls back (it does; SQLite is not Oracle or MySQL).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { withImmediateTransaction } from '@/infrastructure/persistence/sqlite/migration-transaction.js';

function columnNames(db: Database.Database, table: string): Set<string> {
  return new Set((db.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name));
}

function indexNames(db: Database.Database, table: string): Set<string> {
  return new Set((db.pragma(`index_list(${table})`) as { name: string }[]).map((i) => i.name));
}

describe('withImmediateTransaction', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
    db.exec('CREATE TABLE widgets (id TEXT PRIMARY KEY, legacy TEXT)');
    db.prepare('INSERT INTO widgets (id, legacy) VALUES (?, ?)').run('w1', 'keep-me');
  });

  afterEach(() => {
    db.close();
  });

  it('commits the work of a migration that succeeds', async () => {
    await withImmediateTransaction(db, async () => {
      db.exec('ALTER TABLE widgets ADD COLUMN modern TEXT');
      db.exec('UPDATE widgets SET modern = legacy');
    });

    expect(columnNames(db, 'widgets').has('modern')).toBe(true);
    expect(
      (db.prepare('SELECT modern FROM widgets WHERE id = ?').get('w1') as { modern: string }).modern
    ).toBe('keep-me');
  });

  it('rolls DDL back when a later statement throws', async () => {
    await expect(
      withImmediateTransaction(db, async () => {
        db.exec('ALTER TABLE widgets ADD COLUMN modern TEXT');
        db.exec('CREATE INDEX idx_widgets_modern ON widgets(modern)');
        throw new Error('migration failed halfway');
      })
    ).rejects.toThrow('migration failed halfway');

    expect(columnNames(db, 'widgets').has('modern')).toBe(false);
    expect(indexNames(db, 'widgets').has('idx_widgets_modern')).toBe(false);
  });

  it('rolls a DROP COLUMN back, so a failed rewrite cannot destroy data', async () => {
    await expect(
      withImmediateTransaction(db, async () => {
        db.exec('ALTER TABLE widgets DROP COLUMN legacy');
        throw new Error('migration failed after the drop');
      })
    ).rejects.toThrow();

    expect(columnNames(db, 'widgets').has('legacy')).toBe(true);
    expect(
      (db.prepare('SELECT legacy FROM widgets WHERE id = ?').get('w1') as { legacy: string }).legacy
    ).toBe('keep-me');
  });

  it('leaves no transaction open after a failure', async () => {
    await expect(
      withImmediateTransaction(db, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow();

    expect(db.inTransaction).toBe(false);
  });

  it('runs the body inside a transaction', async () => {
    let seen = false;
    await withImmediateTransaction(db, async () => {
      seen = db.inTransaction;
    });

    expect(seen).toBe(true);
  });

  it('leaves an already-open transaction to its owner instead of committing it', async () => {
    db.exec('BEGIN IMMEDIATE');
    await withImmediateTransaction(db, async () => {
      db.exec("UPDATE widgets SET legacy = 'rewritten'");
    });

    // The helper must not have committed on the caller's behalf: the outer
    // transaction still owns the connection, and rolling it back undoes the
    // nested body too.
    expect(db.inTransaction).toBe(true);
    db.exec('ROLLBACK');
    expect(
      (db.prepare('SELECT legacy FROM widgets WHERE id = ?').get('w1') as { legacy: string }).legacy
    ).toBe('keep-me');
  });

  it('returns the body result', async () => {
    const result = await withImmediateTransaction(db, async () => 'done');
    expect(result).toBe('done');
  });
});
