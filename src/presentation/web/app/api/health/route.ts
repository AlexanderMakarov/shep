/**
 * GET /api/health — the canonical readiness endpoint.
 *
 * The real check has always lived at `/api/agent-events/health`, namespaced
 * under a feature nobody would guess when looking for health. It is a genuine
 * readiness probe — it resolves use cases from the container and performs real
 * database reads, returning 503 with a per-check breakdown — so it deserves the
 * path an operator, a monitor, `shep status` and `shep doctor` actually try.
 *
 * This re-exports the same handler rather than duplicating it, so the two paths
 * can never report different health.
 */

export { GET } from '../agent-events/health/route';

// Next.js statically analyzes route configuration; re-exports are not supported.
export const dynamic = 'force-dynamic';
