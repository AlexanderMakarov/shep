/**
 * OpenRouter Model Catalog
 *
 * Fetches the current list of models from OpenRouter's public `/api/v1/models`
 * endpoint. Caching lives in {@link TtlModelCatalog}.
 *
 * OpenRouter allows anonymous access — a token is optional but still passed
 * when available so the response honours organisation filters.
 *
 * API docs: https://openrouter.ai/docs/api-reference/list-available-models
 */

import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/models';

interface OpenRouterPricing {
  prompt?: string;
  completion?: string;
}

interface OpenRouterModelEntry {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: OpenRouterPricing;
}

interface OpenRouterListResponse {
  data?: OpenRouterModelEntry[];
}

type FetchFn = typeof fetch;

export class OpenRouterModelCatalogService extends TtlModelCatalog {
  constructor(private readonly fetchFn: FetchFn = fetch) {
    super();
  }

  protected async fetchModels(authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const apiKey = authConfig?.token?.trim();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await this.fetchFn(ENDPOINT, {
      headers,
      signal: AbortSignal.timeout(MODEL_CATALOG_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return [];

    const body = (await response.json()) as OpenRouterListResponse;

    return (body.data ?? []).map((entry) => {
      const vendor = entry.id.includes('/') ? entry.id.split('/')[0] : undefined;
      return {
        id: entry.id,
        displayName: entry.name,
        description: entry.description,
        contextLength: entry.context_length,
        isFree: openRouterIsFree(entry.pricing),
        vendor,
      };
    });
  }
}

/** `isFree` only when both prices are present and numerically zero — never assume free. */
function openRouterIsFree(pricing: OpenRouterPricing | undefined): boolean | undefined {
  if (!pricing) return undefined;
  const promptPrice = parseFloat(pricing.prompt ?? 'NaN');
  const completionPrice = parseFloat(pricing.completion ?? 'NaN');
  if (Number.isNaN(promptPrice) || Number.isNaN(completionPrice)) return undefined;
  return promptPrice === 0 && completionPrice === 0;
}
