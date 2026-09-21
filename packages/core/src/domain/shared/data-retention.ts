/**
 * Data-retention rule.
 *
 * Shep's log-shaped tables — the operation log, the activity log, agent and
 * interactive messages, phase timings, PM notifications — only ever grew.
 * `pruneBefore()` existed on the operation log and had no caller; everything
 * else had no retention at all. Measured growth at five agents a day is about
 * 184 MB a year, all of it history nobody reads.
 *
 * One window governs all of them, for the same reason one place owns the
 * parallel-feature rule: a per-table window is a per-table surprise, and the
 * question a user actually asks is "how much history does Shep keep?".
 *
 * Note the import convention for `domain/`: no imports, no I/O.
 */

/**
 * How long log-shaped history is kept, in days.
 *
 * Matches the 90-day window already applied to security events, so the two
 * cannot drift into meaning different things.
 */
export const DEFAULT_DATA_RETENTION_DAYS = 90;

/**
 * How often a prune is worth doing.
 *
 * Retention is checked on every process start, and Shep starts a process per
 * CLI invocation, so the check has to be nearly free. Pruning once a day and
 * skipping otherwise keeps the scan off the hot path while bounding growth to
 * one day's worth beyond the window.
 */
export const DATA_RETENTION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Milliseconds in a day, used to turn a retention window into a cutoff. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The instant before which history may be deleted.
 *
 * @param now - Current time.
 * @param retentionDays - Window to keep, in days.
 * @returns The cutoff; rows created strictly before it are prunable.
 */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}
