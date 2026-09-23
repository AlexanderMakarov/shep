/**
 * Model catalog port — live discovery of models an agent can run.
 *
 * Implementations fetch from a provider API or CLI (OpenRouter HTTP, Cursor
 * `--list-models`, Claude Code `/model`, …). An empty result means "fall back
 * to the hardcoded AGENT_CATALOG list" — callers must not treat empty as an
 * error.
 */

import type { AgentConfig } from '../../../../domain/generated/output.js';
import type { AgentModelListing } from './agent-executor-factory.interface.js';

export interface IModelCatalog {
  /**
   * Discover currently available models for this provider.
   *
   * @param authConfig - Optional auth (API token / base URL) when the catalog
   *   endpoint requires it (e.g. Together AI).
   * @returns Listings, or `[]` when discovery fails / is unavailable
   */
  listModels(authConfig?: AgentConfig): Promise<AgentModelListing[]>;
}
