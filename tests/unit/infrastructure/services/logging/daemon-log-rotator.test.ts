/**
 * Daemon log rotation. The daemon log got ONE generation, and only at
 * startup — a daemon up for weeks wrote one unbounded file.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DAEMON_LOG_MAX_BYTES,
  DAEMON_LOG_ROTATION_INTERVAL_MS,
  DaemonLogRotator,
  ROTATED_LOG_SUFFIX,
  rotateIfOversized,
} from '@/infrastructure/services/logging/daemon-log-rotator.js';

let dir: string;
let logPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shep-rotate-'));
  logPath = join(dir, 'daemon.log');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('rotateIfOversized', () => {
  it('leaves a log below the cap alone', () => {
    writeFileSync(logPath, 'small');
    const outcome = rotateIfOversized(logPath, 1000);
    expect(outcome.rotated).toBe(false);
    expect(outcome.sizeBytes).toBe(5);
    expect(existsSync(`${logPath}${ROTATED_LOG_SUFFIX}`)).toBe(false);
  });

  it('copies the content aside and truncates the live file in place', () => {
    writeFileSync(logPath, 'x'.repeat(100));
    const inodeBefore = statSync(logPath).ino;

    const outcome = rotateIfOversized(logPath, 10);

    expect(outcome.rotated).toBe(true);
    expect(readFileSync(`${logPath}${ROTATED_LOG_SUFFIX}`, 'utf-8')).toBe('x'.repeat(100));
    expect(statSync(logPath).size).toBe(0);
    // Same inode: the daemon child holds this file open by fd, and a
    // rename would leave it writing to the rotated copy forever.
    expect(statSync(logPath).ino).toBe(inodeBefore);
  });

  it('keeps exactly one generation', () => {
    writeFileSync(`${logPath}${ROTATED_LOG_SUFFIX}`, 'previous');
    writeFileSync(logPath, 'y'.repeat(100));

    rotateIfOversized(logPath, 10);

    expect(readFileSync(`${logPath}${ROTATED_LOG_SUFFIX}`, 'utf-8')).toBe('y'.repeat(100));
    expect(existsSync(`${logPath}${ROTATED_LOG_SUFFIX}${ROTATED_LOG_SUFFIX}`)).toBe(false);
  });

  it('reports rather than throws when the log does not exist', () => {
    const outcome = rotateIfOversized(join(dir, 'missing.log'), 10);
    expect(outcome.rotated).toBe(false);
    expect(outcome.sizeBytes).toBeNull();
    expect(outcome.error).toBeTruthy();
  });

  it('defaults to a cap large enough not to churn on a normal log', () => {
    expect(DAEMON_LOG_MAX_BYTES).toBeGreaterThan(1024 * 1024);
  });
});

describe('DaemonLogRotator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rotates immediately on start rather than waiting a full interval', () => {
    writeFileSync(logPath, 'z'.repeat(100));
    const rotator = new DaemonLogRotator(logPath, 10);

    rotator.start();

    expect(statSync(logPath).size).toBe(0);
    expect(rotator.isRunning()).toBe(true);
    rotator.stop();
  });

  it('keeps checking on the interval — the whole point of not only rotating at startup', () => {
    writeFileSync(logPath, 'a');
    const rotator = new DaemonLogRotator(logPath, 10, 1000);
    rotator.start();
    expect(statSync(logPath).size).toBe(1);

    writeFileSync(logPath, 'b'.repeat(100));
    vi.advanceTimersByTime(1000);

    expect(statSync(logPath).size).toBe(0);
    rotator.stop();
  });

  it('stops cleanly and is idempotent', () => {
    const rotator = new DaemonLogRotator(logPath, 10);
    writeFileSync(logPath, 'a');
    rotator.start();
    rotator.start();
    rotator.stop();
    rotator.stop();
    expect(rotator.isRunning()).toBe(false);
  });

  it('checks often enough to matter but not every second', () => {
    expect(DAEMON_LOG_ROTATION_INTERVAL_MS).toBeGreaterThan(60_000);
  });
});
