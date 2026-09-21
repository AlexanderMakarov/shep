/**
 * Daemon Health Probe (port)
 *
 * The web app already serves a genuine readiness check — it resolves use
 * cases from DI and does real database reads, returning 503 with a
 * per-check breakdown — but it lives under `/api/agent-events/health`,
 * where nobody looks, and neither `shep doctor` nor `shep status` ever
 * called it. `shep status` reported daemon.json plus `ps` output, which
 * says a process exists, not that it can serve a request.
 *
 * This port is the readiness answer in a form any presentation layer can
 * render.
 */

/** One check from the readiness endpoint's breakdown. */
export interface DaemonHealthCheck {
  /** Check name as reported by the endpoint (e.g. `container`, `features`). */
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DaemonHealthReport {
  /** True when a daemon record exists and its process is alive. */
  daemonRunning: boolean;
  /** True when the readiness endpoint answered at all. */
  reachable: boolean;
  /** True when the endpoint answered AND reported every check healthy. */
  healthy: boolean;
  /** URL probed, or `null` when no daemon record was found. */
  url: string | null;
  /** HTTP status returned, or `null` when nothing answered. */
  httpStatus: number | null;
  /** Per-check breakdown from the endpoint; empty when unreachable. */
  checks: DaemonHealthCheck[];
  /** Why the probe failed, when it did. */
  error: string | null;
}

export interface IDaemonHealthProbe {
  /**
   * Probe the daemon's readiness endpoint. Always resolves — an unreachable
   * daemon is a report with `reachable: false`, never a thrown error.
   */
  probe(): Promise<DaemonHealthReport>;
}
