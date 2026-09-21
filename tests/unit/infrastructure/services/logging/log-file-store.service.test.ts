import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LogFileStoreService } from '@/infrastructure/services/logging/log-file-store.service.js';

let home: string;
let originalShepHome: string | undefined;

beforeEach(() => {
  originalShepHome = process.env.SHEP_HOME;
  home = mkdtempSync(join(tmpdir(), 'shep-logstore-'));
  process.env.SHEP_HOME = home;
});

afterEach(() => {
  if (originalShepHome === undefined) delete process.env.SHEP_HOME;
  else process.env.SHEP_HOME = originalShepHome;
  rmSync(home, { recursive: true, force: true });
});

describe('LogFileStoreService', () => {
  it('points at <shep home>/logs', () => {
    expect(new LogFileStoreService().getLogsDirectory()).toBe(join(home, 'logs'));
  });

  it('returns an empty list when the directory does not exist', async () => {
    expect(await new LogFileStoreService().list()).toEqual([]);
  });

  it('lists each log file with its size and modification time', async () => {
    const logs = join(home, 'logs');
    mkdirSync(logs);
    writeFileSync(join(logs, 'worker-a.log'), 'x'.repeat(20));

    const [file] = await new LogFileStoreService().list();

    expect(file?.name).toBe('worker-a.log');
    expect(file?.path).toBe(join(logs, 'worker-a.log'));
    expect(file?.sizeBytes).toBe(20);
    expect(file?.modifiedAt).toBeInstanceOf(Date);
  });

  it('ignores sub-directories', async () => {
    const logs = join(home, 'logs');
    mkdirSync(join(logs, 'nested'), { recursive: true });
    writeFileSync(join(logs, 'worker-a.log'), 'x');
    expect(await new LogFileStoreService().list()).toHaveLength(1);
  });

  it('removes a file', async () => {
    const logs = join(home, 'logs');
    mkdirSync(logs);
    const path = join(logs, 'worker-a.log');
    writeFileSync(path, 'x');

    await new LogFileStoreService().remove(path);

    expect(existsSync(path)).toBe(false);
  });

  it('rejects rather than silently succeeding when a delete fails', async () => {
    await expect(
      new LogFileStoreService().remove(join(home, 'logs', 'missing.log'))
    ).rejects.toThrow();
  });
});
