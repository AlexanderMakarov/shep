/**
 * Database integrity checking and corruption recovery.
 *
 * A damaged SQLite file used to surface as
 * `Failed to run database migrations: database disk image is malformed` —
 * a dead end that told the user nothing about what to do, and left them with a
 * Shep that could not start at all.
 *
 * Nothing here tries to repair the file: SQLite corruption is not reliably
 * repairable, and pretending otherwise risks building on top of bad pages. The
 * damaged file is moved ASIDE (never deleted — it is the only copy of the
 * user's history and a `.recover` may still get something out of it) and a
 * fresh database takes its place, so the tool starts.
 *
 * The other unhelpful failure is SQLITE_BUSY at open time, which means another
 * process holds the database — nothing is wrong with the data, and the user
 * needs to be told that rather than shown a stack trace.
 */

import { renameSync, existsSync } from 'node:fs';
import type Database from 'better-sqlite3';

/** What `PRAGMA quick_check` reports for a healthy database. */
export const QUICK_CHECK_OK = 'ok';

/** Suffix given to a database moved aside after failing its integrity check. */
export const SALVAGED_SUFFIX = 'corrupt';

/** Sidecar files WAL mode keeps next to the database. */
const SIDECAR_SUFFIXES = ['-wal', '-shm'] as const;

/** SQLite error codes that mean the file itself is damaged. */
const CORRUPTION_CODES = new Set(['SQLITE_CORRUPT', 'SQLITE_NOTADB']);

/** SQLite error codes that mean someone else holds the database right now. */
const BUSY_CODES = new Set(['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT', 'SQLITE_BUSY_TIMEOUT']);

function errorCode(error: unknown): string | null {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** True when the error says the database file is damaged. */
export function isSqliteCorruptionError(error: unknown): boolean {
  const code = errorCode(error);
  if (code !== null && [...CORRUPTION_CODES].some((c) => code.startsWith(c))) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('malformed') || message.includes('file is not a database');
}

/** True when the error says another connection holds the database. */
export function isSqliteBusyError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== null && [...BUSY_CODES].some((c) => code.startsWith(c));
}

/**
 * Runs `PRAGMA quick_check` and returns the problems it found.
 *
 * `quick_check` rather than `integrity_check`: it skips the index/table
 * cross-referencing that dominates the cost, which keeps this affordable on
 * every process start (measured: ~100ms on a 255MB database) while still
 * catching the page-level damage that stops the tool from opening at all.
 *
 * A database that is too damaged to answer the pragma at all throws, and that
 * throw is itself the answer — it is translated into a problem, not re-thrown.
 *
 * @param db - An open connection.
 * @returns The reported problems; empty when the database is healthy.
 */
export function quickCheckProblems(db: Database.Database): string[] {
  try {
    const rows = db.pragma('quick_check') as { quick_check: string }[];
    return rows.map((row) => row.quick_check).filter((result) => result !== QUICK_CHECK_OK);
  } catch (error) {
    if (isSqliteCorruptionError(error)) {
      return [error instanceof Error ? error.message : String(error)];
    }
    throw error;
  }
}

/**
 * Moves a damaged database (and its WAL sidecars) aside.
 *
 * The timestamp keeps every salvaged copy: a user who hits this twice has two
 * damaged files worth looking at, and silently overwriting the first would
 * destroy the older, possibly more recoverable one.
 *
 * @param databasePath - Path to the damaged database file.
 * @param now - Clock, injectable so the name is deterministic in tests.
 * @returns The path the database was moved to.
 */
export function quarantineDatabaseFile(databasePath: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const salvagedPath = `${databasePath}.${SALVAGED_SUFFIX}-${stamp}`;

  renameSync(databasePath, salvagedPath);

  // The sidecars belong to the file that just moved; leaving them behind would
  // make SQLite read a WAL that does not match the new, empty database.
  for (const suffix of SIDECAR_SUFFIXES) {
    const sidecar = `${databasePath}${suffix}`;
    if (existsSync(sidecar)) {
      renameSync(sidecar, `${salvagedPath}${suffix}`);
    }
  }

  return salvagedPath;
}

/**
 * The message shown after a damaged database is moved aside.
 *
 * Says what happened, where the old data went, and what was lost — in that
 * order, because the user's first question is "where is my work?".
 *
 * @param salvagedPath - Where the damaged file was moved to.
 * @param problems - What `quick_check` reported.
 */
export function describeQuarantine(salvagedPath: string, problems: string[]): string {
  return [
    'The Shep database failed its integrity check and could not be opened.',
    `Reported: ${problems.slice(0, 3).join('; ')}`,
    `The damaged file has been kept at: ${salvagedPath}`,
    'Shep has started with a new, empty database. Features, runs and history',
    'from before this point are only in the salvaged file; `sqlite3 <file> .recover`',
    'can often extract them.',
  ].join('\n');
}
