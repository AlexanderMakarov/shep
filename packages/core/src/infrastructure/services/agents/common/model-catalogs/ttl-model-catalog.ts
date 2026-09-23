/**
 * TTL-backed base for {@link IModelCatalog} implementations.
 *
 * Subclasses implement {@link fetchModels}; this class owns the in-process
 * cache, timeout-independent empty/last-good fallback, and cache-keying.
 */

import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { IModelCatalog } from '../../../../../application/ports/output/agents/model-catalog.interface.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_TTL_MS } from './catalog-fetch.js';

export abstract class TtlModelCatalog implements IModelCatalog {
  private cache: { expiresAt: number; data: AgentModelListing[]; key: string } | null = null;

  constructor(private readonly ttlMs: number = MODEL_CATALOG_TTL_MS) {}

  async listModels(authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const key = this.cacheKey(authConfig);
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now && this.cache.key === key) {
      return this.cache.data;
    }

    let listings: AgentModelListing[];
    try {
      listings = await this.fetchModels(authConfig);
    } catch {
      return this.cache?.data ?? [];
    }

    if (listings.length === 0) {
      return this.cache?.data ?? [];
    }

    this.cache = { expiresAt: now + this.ttlMs, data: listings, key };
    return listings;
  }

  /** Override when the cache must vary by auth (e.g. API key). */
  protected cacheKey(authConfig?: AgentConfig): string {
    return authConfig?.token?.trim() ?? '';
  }

  /** Provider-specific discovery. Throw or return `[]` on failure. */
  protected abstract fetchModels(authConfig?: AgentConfig): Promise<AgentModelListing[]>;
}
