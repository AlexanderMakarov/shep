import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';

describe('SQLite process exit', () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) removeDirWithRetry(home);
  });

  it('checkpoints committed data and releases WAL files before an explicit process exit', () => {
    const home = mkdtempSync(join(tmpdir(), 'shep-sqlite-exit-'));
    homes.push(home);
    const moduleUrl = pathToFileURL(
      resolve('packages/core/src/infrastructure/persistence/sqlite/connection.ts')
    ).href;
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { getSQLiteConnection } from ${JSON.stringify(moduleUrl)};
         const db = await getSQLiteConnection();
         db.exec("CREATE TABLE exit_probe (value TEXT); INSERT INTO exit_probe VALUES ('saved')");
         process.exit(0);`,
      ],
      { env: { ...process.env, SHEP_HOME: home }, timeout: 15_000, stdio: 'pipe' }
    );

    const databasePath = join(home, 'data');
    // Check before reopening: opening SQLite could recover an unclean exit and
    // hide the missing shutdown cleanup that races other processes on Windows.
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
    const persisted = new Database(databasePath, { readonly: true });
    try {
      expect(persisted.prepare('SELECT value FROM exit_probe').get()).toEqual({ value: 'saved' });
    } finally {
      persisted.close();
    }
  }, 20_000);
});
