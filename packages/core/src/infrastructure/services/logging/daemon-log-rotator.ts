/**
 * Daemon log rotation.
 *
 * `start-daemon.ts` renames `daemon.log` → `daemon.log.old` exactly once,
 * at startup. A daemon that stays up for weeks therefore writes ONE
 * unbounded file, and the only thing that ever caps it is restarting Shep.
 *
 * This rotates on SIZE, on a timer, while the daemon runs — same
 * one-generation policy, applied when it matters.
 *
 * Why copy-then-truncate rather than rename? The daemon child holds the
 * log open by file descriptor (`stdio: ['ignore', logFd, logFd]`). A
 * rename leaves that descriptor pointing at the renamed inode, so the
 * child happily keeps writing to `daemon.log.old` and the fresh
 * `daemon.log` stays empty forever. Truncating in place keeps the
 * descriptor valid. It depends on the log being opened with `'a'`
 * (O_APPEND), which start-daemon.ts does — without O_APPEND the writer's
 * offset would survive the truncate and leave a sparse hole.
 */

import { copyFileSync, statSync, truncateSync } from 'node:fs';

/** Suffix of the single retained previous generation. */
export const ROTATED_LOG_SUFFIX = '.old';

/** Size at which the daemon log is rotated. */
export const DAEMON_LOG_MAX_BYTES = 32 * 1024 * 1024;

/** How often the running daemon checks its own log size. */
export const DAEMON_LOG_ROTATION_INTERVAL_MS = 5 * 60_000;

export interface RotationOutcome {
  rotated: boolean;
  /** Size observed, or `null` when the log could not be stat'ed. */
  sizeBytes: number | null;
  /** Why rotation was skipped or failed; `null` on a clean result. */
  error: string | null;
}

/**
 * Rotate `logPath` when it exceeds `maxBytes`. Never throws — a failed
 * rotation must not take the daemon down with it.
 */
export function rotateIfOversized(
  logPath: string,
  maxBytes: number = DAEMON_LOG_MAX_BYTES
): RotationOutcome {
  let sizeBytes: number;
  try {
    sizeBytes = statSync(logPath).size;
  } catch (err) {
    return { rotated: false, sizeBytes: null, error: messageOf(err) };
  }

  if (sizeBytes <= maxBytes) {
    return { rotated: false, sizeBytes, error: null };
  }

  try {
    copyFileSync(logPath, `${logPath}${ROTATED_LOG_SUFFIX}`);
    truncateSync(logPath, 0);
    return { rotated: true, sizeBytes, error: null };
  } catch (err) {
    return { rotated: false, sizeBytes, error: messageOf(err) };
  }
}

/**
 * Timer that applies {@link rotateIfOversized} while the daemon runs.
 * Follows the `initializeX()` / `getX()` watcher pattern the daemon
 * already uses for its other background services.
 */
export class DaemonLogRotator {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly logPath: string,
    private readonly maxBytes: number = DAEMON_LOG_MAX_BYTES,
    private readonly intervalMs: number = DAEMON_LOG_ROTATION_INTERVAL_MS
  ) {}

  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Check once immediately, then on the interval. */
  start(): void {
    if (this.timer !== null) return;
    this.rotateNow();
    this.timer = setInterval(() => this.rotateNow(), this.intervalMs);
    // Never hold the process open just to check a log size.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  rotateNow(): RotationOutcome {
    return rotateIfOversized(this.logPath, this.maxBytes);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
