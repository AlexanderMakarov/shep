/**
 * Together AI Model Catalog
 *
 * Fetches models from Together AI `/v1/models`. Requires an API key.
 * Caching lives in {@link TtlModelCatalog} (keyed by token).
 *
 * API docs: https://docs.together.ai/reference/models-1
 */

import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';

const ENDPOINT = 'https://api.together.xyz/v1/models';

interface TogetherAiPricing {
  input?: number;
  output?: number;
}

interface TogetherAiModelEntry {
  id: string;
  display_name?: string;
  organization?: string;
  context_length?: number;
  type?: string;
  pricing?: TogetherAiPricing;
}

type FetchFn = typeof fetch;

export class TogetherAiModelCatalogService extends TtlModelCatalog {
  constructor(private readonly fetchFn: FetchFn = fetch) {
    super();
  }

  protected async fetchModels(authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const apiKey = authConfig?.token?.trim();
    if (!apiKey) return [];

    const response = await this.fetchFn(ENDPOINT, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(MODEL_CATALOG_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return [];

    const body: unknown = await response.json();
    const entries = Array.isArray(body) ? (body as TogetherAiModelEntry[]) : [];

    return entries
      .filter((entry) => !entry.type || entry.type === 'chat' || entry.type === 'language')
      .map((entry) => {
        return {
          id: entry.id,
          displayName: entry.display_name,
          contextLength: entry.context_length,
          isFree: togetherIsFree(entry.pricing),
          vendor:
            entry.organization ?? (entry.id.includes('/') ? entry.id.split('/')[0] : undefined),
        };
      });
  }
}

/** `isFree` only when both prices are present and numerically zero — never assume free. */
function togetherIsFree(pricing: TogetherAiPricing | undefined): boolean | undefined {
  if (!pricing) return undefined;
  if (typeof pricing.input !== 'number' || typeof pricing.output !== 'number') return undefined;
  return pricing.input === 0 && pricing.output === 0;
}
