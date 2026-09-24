/**
 * TtlModelCatalog Unit Tests
 *
 * Covers singleflight, auth-key isolation, empty-after-populated last-good,
 * and defensive copies — shared by every provider catalog.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentConfig } from '@/domain/generated/output.js';
import type { AgentModelListing } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import { TtlModelCatalog } from '@/infrastructure/services/agents/common/model-catalogs/ttl-model-catalog.js';
import { MODEL_CATALOG_TTL_MS } from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';

class TestCatalog extends TtlModelCatalog {
  constructor(private readonly fetchFn: () => Promise<AgentModelListing[]>) {
    super();
  }

  protected fetchModels(_authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    return this.fetchFn();
  }
}

const A: AgentModelListing[] = [{ id: 'a' }];
const B: AgentModelListing[] = [{ id: 'b' }];

describe('TtlModelCatalog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces concurrent fetches for the same cache key (singleflight)', async () => {
    let releases!: (value: AgentModelListing[]) => void;
    const gate = new Promise<AgentModelListing[]>((resolve) => {
      releases = resolve;
    });
    const fetchFn = vi.fn().mockReturnValue(gate);
    const catalog = new TestCatalog(fetchFn);

    const p1 = catalog.listModels();
    const p2 = catalog.listModels();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    releases(A);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(A);
    expect(r2).toEqual(A);
    expect(r1).not.toBe(r2);
  });

  it('does not reuse last-good across different auth tokens', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(A).mockResolvedValueOnce(B);
    const catalog = new TestCatalog(fetchFn);
    const tok1 = { token: 'one' } as AgentConfig;
    const tok2 = { token: 'two' } as AgentConfig;

    await expect(catalog.listModels(tok1)).resolves.toEqual(A);
    await expect(catalog.listModels(tok2)).resolves.toEqual(B);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps last-good for the same key when a later fetch returns empty', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(A).mockResolvedValueOnce([]);
    const catalog = new TestCatalog(fetchFn);

    const first = await catalog.listModels();
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    const second = await catalog.listModels();

    expect(first).toEqual(A);
    expect(second).toEqual(A);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns empty for a new key when the only last-good belongs to another key', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(A).mockRejectedValueOnce(new Error('fail'));
    const catalog = new TestCatalog(fetchFn);

    await catalog.listModels({ token: 'one' } as AgentConfig);
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);

    await expect(catalog.listModels({ token: 'two' } as AgentConfig)).resolves.toEqual([]);
  });

  it('returns defensive copies so callers cannot mutate the cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: 'x' }]);
    const catalog = new TestCatalog(fetchFn);

    const first = await catalog.listModels();
    first.push({ id: 'mutated' });
    first[0]!.id = 'changed';

    const second = await catalog.listModels();
    expect(second).toEqual([{ id: 'x' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
