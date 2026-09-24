/**
 * Shared upstream-request settings for the model catalogs.
 *
 * ## Caching (investigation summary)
 *
 * Today every catalog uses an **in-process TTL cache** ({@link MODEL_CATALOG_TTL_MS}):
 * - Hit while fresh → no HTTP/CLI call (picker reopen is cheap).
 * - Miss / expiry → fetch; on failure return last-good cache or `[]`.
 * - Together AI also keys the cache by API token so switching accounts
 *   cannot leak another org's model list.
 *
 * Not yet implemented (candidates for a follow-up):
 * - Persist last-good snapshot under `~/.shep/` so cold starts stay offline-friendly.
 * - Invalidate when `settings.agent.type` / token changes (today TTL alone handles it).
 * - Per-agent TTL overrides (CLI discovery is slower than HTTP).
 *
 * Do **not** call discovery on every agent turn — only via
 * `IAgentExecutorFactory.listAvailableModels` when the UI/settings load the picker.
 */

/** Longest a catalog request may take before it is abandoned. */
export const MODEL_CATALOG_FETCH_TIMEOUT_MS = 10_000;

/** In-process cache lifetime shared by all {@link TtlModelCatalog} providers. */
export const MODEL_CATALOG_TTL_MS = 60 * 60 * 1000;
