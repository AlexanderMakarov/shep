/**
 * TTL-backed base for {@link IModelCatalog} implementations.
 *
 * Subclasses implement {@link fetchModels}; this class owns the in-process
 * cache, singleflight coalescing, last-good fallback (same cache key only),
 * and defensive copies so callers cannot mutate the shared cache.
 */

import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { IModelCatalog } from '../../../../../application/ports/output/agents/model-catalog.interface.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_TTL_MS } from './catalog-fetch.js';

export abstract class TtlModelCatalog implements IModelCatalog {
  private cache: { expiresAt: number; data: AgentModelListing[]; key: string } | null = null;
  private readonly inflight = new Map<string, Promise<AgentModelListing[]>>();

  constructor(private readonly ttlMs: number = MODEL_CATALOG_TTL_MS) {}

  async listModels(authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const key = this.cacheKey(authConfig);
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now && this.cache.key === key) {
      return copyListings(this.cache.data);
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending.then(copyListings);
    }

    const load = this.loadAndCache(key, authConfig).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, load);
    return load.then(copyListings);
  }

  private async loadAndCache(key: string, authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    let listings: AgentModelListing[];
    try {
      listings = await this.fetchModels(authConfig);
    } catch (error) {
      this.reportFetchFailure(error);
      return this.lastGoodForKey(key);
    }

    if (listings.length === 0) {
      return this.lastGoodForKey(key);
    }

    const data = copyListings(listings);
    this.cache = { expiresAt: Date.now() + this.ttlMs, data, key };
    return data;
  }

  /** Last-good only when the cached entry was stored under the same auth key. */
  private lastGoodForKey(key: string): AgentModelListing[] {
    if (this.cache?.key === key) {
      return this.cache.data;
    }
    return [];
  }

  /** Override when the cache must vary by auth (e.g. API key). */
  protected cacheKey(authConfig?: AgentConfig): string {
    return authConfig?.token?.trim() ?? '';
  }

  /** Log a single failed fetch without failing boot / picker. */
  protected reportFetchFailure(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[model-catalog] ${this.constructor.name} fetch failed: ${detail}\n`);
  }

  /** Provider-specific discovery. Throw or return `[]` on failure. */
  protected abstract fetchModels(authConfig?: AgentConfig): Promise<AgentModelListing[]>;
}

function copyListings(listings: AgentModelListing[]): AgentModelListing[] {
  return listings.map((entry) => ({ ...entry }));
}
