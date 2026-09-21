/**
 * Corruption Recovery Integration Tests
 *
 * A damaged database used to reach the user as
 * `Failed to run database migrations: database disk image is malformed`,
 * through the CLI's generic error branch — no integrity check anywhere, no
 * SQLITE_CORRUPT handling, no backup, and no way to start Shep again.
 *
 * These tests corrupt a REAL database file (overwriting pages with garbage,
 * the way a torn write or failing disk does) and assert that Shep comes up on
 * a fresh database while the damaged one is kept for salvage.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readdirSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { removeDirWithRetry } from '../../../../helpers/remove-dir.helper.js';
import {
  getSQLiteConnection,
  closeSQLiteConnection,
} from '@/infrastructure/persistence/sqlite/connection.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import {
  quickCheckProblems,
  quarantineDatabaseFile,
  isSqliteCorruptionError,
  isSqliteBusyError,
  SALVAGED_SUFFIX,
} from '@/infrastructure/persistence/sqlite/database-integrity.js';

/** Where the connection module puts the database inside SHEP_HOME. */
const DB_FILE = 'data';

/** Rows needed to grow the file past a few pages, so damage is detectable. */
const SEED_ROWS = 400;

/** SQLite's file header; everything after it is b-tree pages. */
const FILE_HEADER_BYTES = 100;

function seedDatabase(path: string): void {
  const db = new Database(path);
  db.pragma('journal_mode = DELETE');
  db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
  const insert = db.prepare('INSERT INTO notes (body) VALUES (?)');
  const body = 'x'.repeat(200);
  for (let i = 0; i < SEED_ROWS; i++) insert.run(body);
  db.exec('CREATE INDEX idx_notes_body ON notes(body)');
  db.close();
}

/**
 * Overwrites everything past the 100-byte file header with garbage.
 *
 * That range starts with the `sqlite_master` b-tree, which is the page every
 * startup reads first — the damage a failing disk or a torn write does that
 * actually stops Shep, and the one that produced
 * "Failed to run database migrations: database disk image is malformed".
 * The header is left alone so SQLite still recognises the file and reports
 * corruption rather than "file is not a database".
 */
function corruptPages(path: string): void {
  const size = statSync(path).size;
  const fd = openSync(path, 'r+');
  try {
    writeSync(
      fd,
      Buffer.alloc(size - FILE_HEADER_BYTES, 0xa5),
      0,
      size - FILE_HEADER_BYTES,
      FILE_HEADER_BYTES
    );
  } finally {
    closeSync(fd);
  }
}

function salvagedFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.includes(`.${SALVAGED_SUFFIX}-`));
}

describe('database corruption recovery', () => {
  let shepHome: string;
  let dbPath: string;
  let previousShepHome: string | undefined;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shepHome = mkdtempSync(join(tmpdir(), 'shep-corrupt-'));
    dbPath = join(shepHome, DB_FILE);
    previousShepHome = process.env.SHEP_HOME;
    process.env.SHEP_HOME = shepHome;
    closeSQLiteConnection();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    closeSQLiteConnection();
    if (previousShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = previousShepHome;
    removeDirWithRetry(shepHome);
  });

  it('reports no problems for a healthy database', () => {
    seedDatabase(dbPath);
    const db = new Database(dbPath);

    expect(quickCheckProblems(db)).toEqual([]);

    db.close();
  });

  it('detects a database whose pages were overwritten', () => {
    seedDatabase(dbPath);
    corruptPages(dbPath);
    const db = new Database(dbPath);

    expect(quickCheckProblems(db).length).toBeGreaterThan(0);

    db.close();
  });

  it('opens a database that migrations can run on, instead of failing on a corrupt one', async () => {
    seedDatabase(dbPath);
    corruptPages(dbPath);

    const db = await getSQLiteConnection();

    // The reported symptom was "Failed to run database migrations: database
    // disk image is malformed" — so the migration run is the assertion.
    await expect(runSQLiteMigrations(db)).resolves.toBeUndefined();
    expect(quickCheckProblems(db)).toEqual([]);
  });

  it('keeps the damaged file and says where it went', async () => {
    seedDatabase(dbPath);
    corruptPages(dbPath);

    await getSQLiteConnection();

    const salvaged = salvagedFiles(shepHome);
    expect(salvaged).toHaveLength(1);
    const message = warn.mock.calls.flat().join('\n');
    expect(message).toContain(salvaged[0]);
    expect(message).toContain('.recover');
  });

  it('leaves a healthy database alone', async () => {
    seedDatabase(dbPath);

    await getSQLiteConnection();

    expect(salvagedFiles(shepHome)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('moves the WAL sidecars with the database they belong to', () => {
    seedDatabase(dbPath);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.prepare('INSERT INTO notes (body) VALUES (?)').run('in the wal');
    db.close();
    // Recreate a sidecar by hand: the point is that a stray -wal must not be
    // left pointing at the replacement database.
    closeSync(openSync(`${dbPath}-wal`, 'w'));

    const salvagedPath = quarantineDatabaseFile(dbPath, new Date('2026-03-04T05:06:07Z'));

    expect(readdirSync(shepHome).sort()).toEqual(
      [salvagedPath, `${salvagedPath}-wal`].map((p) => p.slice(shepHome.length + 1)).sort()
    );
  });

  describe('error classification', () => {
    it('recognises a malformed-image error as corruption', () => {
      expect(isSqliteCorruptionError(new Error('database disk image is malformed'))).toBe(true);
      expect(
        isSqliteCorruptionError(Object.assign(new Error('x'), { code: 'SQLITE_CORRUPT' }))
      ).toBe(true);
      expect(
        isSqliteCorruptionError(Object.assign(new Error('x'), { code: 'SQLITE_NOTADB' }))
      ).toBe(true);
    });

    it('does not mistake a lock for corruption', () => {
      const busy = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });

      expect(isSqliteBusyError(busy)).toBe(true);
      expect(isSqliteCorruptionError(busy)).toBe(false);
    });
  });
});
