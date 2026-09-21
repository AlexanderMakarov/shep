import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';

import {
  ensureShepDirectory,
  getDaemonStatePath,
} from '@/infrastructure/services/filesystem/shep-directory.service.js';

describe('getDaemonStatePath', () => {
  let originalShepHome: string | undefined;

  beforeEach(() => {
    originalShepHome = process.env.SHEP_HOME;
  });

  afterEach(() => {
    if (originalShepHome === undefined) {
      delete process.env.SHEP_HOME;
    } else {
      process.env.SHEP_HOME = originalShepHome;
    }
  });

  it('returns ~/.shep/daemon.json when SHEP_HOME is not set', () => {
    delete process.env.SHEP_HOME;
    const expected = join(homedir(), '.shep', 'daemon.json');
    expect(getDaemonStatePath()).toBe(expected);
  });

  it('returns SHEP_HOME/daemon.json when SHEP_HOME is set', () => {
    process.env.SHEP_HOME = '/tmp/test-shep-home';
    expect(getDaemonStatePath()).toBe(join('/tmp/test-shep-home', 'daemon.json'));
  });
});

/**
 * H2 — `ensureShepDirectory` set mode 0700 only on a directory it CREATED and
 * returned early when one already existed, so an existing directory kept
 * whatever mode it had. Observed on a real machine: `drwxrwxr-x ~/.shep` and
 * `-rw-r--r-- ~/.shep/data` — the settings database, which stores the agent
 * token and messaging tokens in plaintext, was world-readable.
 *
 * POSIX only: Windows ignores every mode bit except the read-only flag, so
 * asserting a mode there would assert the filesystem's behaviour, not ours.
 */
describe.skipIf(process.platform === 'win32')('ensureShepDirectory permissions', () => {
  let shepHome: string;
  let originalShepHome: string | undefined;

  beforeEach(() => {
    originalShepHome = process.env.SHEP_HOME;
    shepHome = join(mkdtempSync(join(tmpdir(), 'shep-perms-')), '.shep');
    process.env.SHEP_HOME = shepHome;
  });

  afterEach(() => {
    if (originalShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = originalShepHome;
    removeDirWithRetry(join(shepHome, '..'));
  });

  function mode(path: string): number {
    return statSync(path).mode & 0o777;
  }

  it('creates the directory with mode 0700', async () => {
    await ensureShepDirectory();

    expect(mode(shepHome)).toBe(0o700);
  });

  it('repairs the mode of a directory that already exists', async () => {
    mkdirSync(shepHome, { recursive: true, mode: 0o775 });
    chmodSync(shepHome, 0o775);

    await ensureShepDirectory();

    expect(mode(shepHome)).toBe(0o700);
  });

  it('repairs a world-readable database file', async () => {
    mkdirSync(shepHome, { recursive: true });
    const dbPath = join(shepHome, 'data');
    writeFileSync(dbPath, 'not really sqlite');
    chmodSync(dbPath, 0o644);

    await ensureShepDirectory();

    expect(mode(dbPath)).toBe(0o600);
  });

  it('does not create a database file that is not there yet', async () => {
    await ensureShepDirectory();

    expect(existsSync(join(shepHome, 'data'))).toBe(false);
  });

  it('is idempotent', async () => {
    await ensureShepDirectory();
    await ensureShepDirectory();

    expect(mode(shepHome)).toBe(0o700);
  });
});
