/**
 * Consecutive-failure counter for fire-and-forget telemetry writes.
 *
 * The heartbeat and the phase-timing writes are correctly non-fatal: neither
 * must ever block graph execution, so both are dispatched without awaiting and
 * their failures are caught. The problem was that they were caught into an
 * EMPTY block.
 *
 * Under SQLite lock contention past the 5s `busy_timeout` — three processes
 * write this database — those writes start failing, and the only symptom is a
 * heartbeat that stops advancing. Nothing reads the heartbeat for staleness, so
 * a run whose telemetry died becomes indistinguishable from one that finished.
 * That is precisely what telemetry exists to tell you apart.
 *
 * Counting instead of logging per failure matters: a locked database fails
 * every write, and a line per failure would produce thousands of them and bury
 * the signal. One actionable line per episode is the useful amount.
 */

import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';

/** Consecutive failures tolerated before the episode is worth a log line. */
const CONSECUTIVE_FAILURE_LOG_THRESHOLD = 3;

export class TelemetryFailureCounter {
  private consecutive = 0;
  /** True once this episode has been logged, so it is reported only once. */
  private reported = false;

  /**
   * @param label - Names the write in the log line, e.g. "heartbeat".
   * @param logger - Where the one-per-episode line goes.
   * @param threshold - Consecutive failures before reporting.
   */
  constructor(
    private readonly label: string,
    private readonly logger: ILogger,
    private readonly threshold: number = CONSECUTIVE_FAILURE_LOG_THRESHOLD
  ) {}

  /** A write succeeded — end any episode in progress. */
  recordSuccess(): void {
    this.consecutive = 0;
    this.reported = false;
  }

  /** A write failed. Logs once when the episode crosses the threshold. */
  recordFailure(error: unknown): void {
    this.consecutive += 1;
    if (this.consecutive < this.threshold || this.reported) return;

    this.reported = true;
    this.logger.error(
      `${this.label} has failed ${this.consecutive} times in a row — telemetry for this run is incomplete`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }

  /** Consecutive failures since the last success. Exposed for tests. */
  get consecutiveFailures(): number {
    return this.consecutive;
  }

  /** Forget all state, so one test cannot leak an episode into the next. */
  reset(): void {
    this.consecutive = 0;
    this.reported = false;
  }
}
