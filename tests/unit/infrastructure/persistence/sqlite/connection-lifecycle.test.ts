import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureDirectory: vi.fn(),
  open: vi.fn(),
  quickCheck: vi.fn(),
}));

vi.mock('better-sqlite3', () => ({
  default: class {
    constructor() {
      return mocks.open();
    }
  },
}));

vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  ensureShepDirectory: mocks.ensureDirectory,
  getShepDbPath: () => ':memory:',
}));

vi.mock('@/infrastructure/persistence/sqlite/database-integrity.js', () => ({
  quickCheckProblems: mocks.quickCheck,
  quarantineDatabaseFile: vi.fn(),
  describeQuarantine: vi.fn(),
  isSqliteCorruptionError: () => false,
  isSqliteBusyError: (error: { code?: string }) => error?.code === 'SQLITE_BUSY',
}));

import {
  closeSQLiteConnection,
  getExistingConnection,
  getSQLiteConnection,
} from '@/infrastructure/persistence/sqlite/connection.js';

function connection() {
  return { pragma: vi.fn(), close: vi.fn() };
}

describe('SQLite connection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDirectory.mockResolvedValue(undefined);
    mocks.quickCheck.mockReturnValue([]);
    mocks.open.mockImplementation(connection);
  });

  afterEach(() => {
    closeSQLiteConnection();
    vi.useRealTimers();
  });

  it('shares one initialized connection between concurrent first callers', async () => {
    const [first, second] = await Promise.all([getSQLiteConnection(), getSQLiteConnection()]);

    expect(first).toBe(second);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(getExistingConnection()).toBe(first);
  });

  it('registers one exit cleanup and removes it when the connection is closed', async () => {
    await Promise.all([getSQLiteConnection(), getSQLiteConnection()]);
    expect(
      process.listeners('exit').filter((listener) => listener === closeSQLiteConnection)
    ).toHaveLength(1);

    closeSQLiteConnection();
    expect(process.listeners('exit')).not.toContain(closeSQLiteConnection);
  });

  it('closes a connection whose configuration failed and allows a fresh retry', async () => {
    const failed = connection();
    failed.pragma.mockImplementation(() => {
      throw new Error('database is locked');
    });
    mocks.open.mockReturnValueOnce(failed);

    await expect(getSQLiteConnection()).rejects.toThrow('database is locked');
    expect(getExistingConnection()).toBeNull();
    expect(failed.close).toHaveBeenCalledTimes(1);

    const retried = await getSQLiteConnection();
    expect(retried).not.toBe(failed);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it('closes the connection if its integrity check throws', async () => {
    const failed = connection();
    mocks.open.mockReturnValueOnce(failed);
    mocks.quickCheck.mockImplementationOnce(() => {
      throw new Error('integrity check failed');
    });

    await expect(getSQLiteConnection()).rejects.toThrow('integrity check failed');
    expect(getExistingConnection()).toBeNull();
    expect(failed.close).toHaveBeenCalledTimes(1);
    await expect(getSQLiteConnection()).resolves.toBeDefined();
  });

  it('retries a transient startup lock and shares the recovered connection', async () => {
    const failed = connection();
    failed.pragma.mockImplementation(() => {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    });
    mocks.open.mockReturnValueOnce(failed);

    const [first, second] = await Promise.all([getSQLiteConnection(), getSQLiteConnection()]);

    expect(first).toBe(second);
    expect(first).not.toBe(failed);
    expect(failed.close).toHaveBeenCalledTimes(1);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it('retries a transient lock while opening the database', async () => {
    mocks.open.mockImplementationOnce(() => {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    });

    await expect(getSQLiteConnection()).resolves.toBeDefined();
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it('closes and retries when the integrity check encounters a transient lock', async () => {
    const failed = connection();
    mocks.open.mockReturnValueOnce(failed);
    mocks.quickCheck.mockImplementationOnce(() => {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    });

    await expect(getSQLiteConnection()).resolves.toBeDefined();
    expect(failed.close).toHaveBeenCalledTimes(1);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it('bounds persistent startup lock retries and leaves no cached connection', async () => {
    vi.useFakeTimers();
    const failed = connection();
    failed.pragma.mockImplementation(() => {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    });
    mocks.open.mockReturnValue(failed);

    const outcome = getSQLiteConnection().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await outcome).toMatchObject({ name: 'SqliteDatabaseBusyError' });
    expect(getExistingConnection()).toBeNull();
    expect(mocks.open.mock.calls.length).toBeGreaterThan(1);
    expect(failed.close).toHaveBeenCalledTimes(mocks.open.mock.calls.length);

    mocks.open.mockImplementation(connection);
    await expect(getSQLiteConnection()).resolves.toBeDefined();
  });
});
