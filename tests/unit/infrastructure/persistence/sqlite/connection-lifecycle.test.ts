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
  isSqliteBusyError: () => false,
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

  afterEach(() => closeSQLiteConnection());

  it('shares one initialized connection between concurrent first callers', async () => {
    const [first, second] = await Promise.all([getSQLiteConnection(), getSQLiteConnection()]);

    expect(first).toBe(second);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(getExistingConnection()).toBe(first);
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
});
