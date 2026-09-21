/**
 * Retention Repository Interface
 *
 * Output port for database housekeeping: deciding when a prune is due, and
 * deleting history past the retention window.
 *
 * It spans several tables on purpose. Pruning is one concern — "keep the
 * database from growing without bound" — and splitting it across six
 * repositories would have produced six copies of the same DELETE, six port
 * additions, and six chances for one of them to be forgotten. The tables it
 * touches are all log-shaped: append-only history that nothing references.
 */

/** How many rows a prune removed, per table. */
export interface RetentionPruneCounts {
  activityLog: number;
  agentMessages: number;
  interactiveMessages: number;
  phaseTimings: number;
  notifications: number;
}

export interface IRetentionRepository {
  /**
   * Claim the right to run a prune, at most once per interval.
   *
   * A single conditional UPDATE, so several processes starting at once produce
   * exactly one prune between them rather than six concurrent scans of the
   * same tables.
   *
   * @param now - Current time.
   * @param intervalMs - Minimum gap between prunes.
   * @returns True when this caller owns this prune cycle.
   */
  claimPruneCycle(now: Date, intervalMs: number): Promise<boolean>;

  /**
   * Delete log-shaped history created before the cutoff.
   *
   * @param cutoff - Rows created strictly before this are removed.
   * @returns How many rows went, per table.
   */
  pruneOlderThan(cutoff: Date): Promise<RetentionPruneCounts>;
}
