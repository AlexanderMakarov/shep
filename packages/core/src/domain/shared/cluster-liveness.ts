/**
 * Cluster Provisioning Staleness Rules
 *
 * The single named threshold and predicate for deciding when a cluster stuck
 * in `Provisioning` should be treated as dead/hung. Anchored at 3x
 * health-check.ts's own 120s exponential-backoff budget, so that node gets a
 * full opportunity to fail cleanly through the graph before this read-path
 * backstop second-guesses it.
 */

/** Milliseconds a Provisioning cluster may go without a health check before it is considered stale. */
export const PROVISIONING_STALENESS_THRESHOLD_MS = 180_000;

/**
 * Whether a Provisioning cluster's last health check is stale enough to treat
 * the worker as hung or dead.
 *
 * An undefined `lastHealthCheckAt` (never received a health check at all)
 * counts as stale — there is no evidence the worker is making progress.
 */
export function isProvisioningStale(lastHealthCheckAt: Date | undefined, now: Date): boolean {
  if (lastHealthCheckAt === undefined) return true;
  return now.getTime() - lastHealthCheckAt.getTime() > PROVISIONING_STALENESS_THRESHOLD_MS;
}
