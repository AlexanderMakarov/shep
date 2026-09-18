/**
 * Shared timeout for infrastructure services that shell out to a CLI binary
 * via execFile (e.g. k3d, kubectl). Bounds a single invocation so a hung
 * binary fails cleanly instead of leaving a caller (e.g. a LangGraph node)
 * parked indefinitely — well inside the provisioning staleness backstop.
 */
export const NODE_CLI_TIMEOUT_MS = 60_000;
