import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDirectory } from '@/app/actions/open-directory';
import { spawn } from 'node:child_process';
// Named type imports rather than inline `import()` annotations, which the
// repo's consistent-type-imports rule forbids.
import type * as NodeFs from 'node:fs';
import type * as NodeChildProcess from 'node:child_process';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  const mocked = { ...actual, existsSync: () => true };
  return { ...mocked, default: mocked };
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeChildProcess>();
  const mocked = { ...actual, spawn: vi.fn() };
  return { ...mocked, default: mocked };
});

describe('Open directory launcher failures', () => {
  let child: EventEmitter & { unref: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  });

  it('returns an actionable error when the desktop launcher is unavailable', async () => {
    const result = openDirectory('/projects/weather');
    expect(() => child.emit('error', new Error('spawn xdg-open ENOENT'))).not.toThrow();
    await expect(result).resolves.toEqual({ error: 'spawn xdg-open ENOENT' });
  });

  it('detaches a successfully spawned launcher without waiting for the window to close', async () => {
    const result = openDirectory('/projects/weather');
    child.emit('spawn');
    await expect(result).resolves.toEqual({});
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
