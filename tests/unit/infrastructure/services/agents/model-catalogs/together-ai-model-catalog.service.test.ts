/**
 * TogetherAiModelCatalogService Unit Tests
 *
 * Catalog requests are bounded so a stalled upstream fails over to the
 * cached/empty list instead of hanging the caller. Boot may already have
 * warmed the TTL cache; these tests still exercise fetch mapping directly.
 */

import { describe, it, expect, vi } from 'vitest';
import { TogetherAiModelCatalogService } from '@/infrastructure/services/agents/common/model-catalogs/together-ai-model-catalog.service.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('TogetherAiModelCatalogService', () => {
  it('should bound the catalog request with an abort signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse([]));
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await catalog.listModels({
      type: 'together-ai' as never,
      authMethod: 'token' as never,
      token: 'tg-key',
    });

    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should return an empty list when the request times out', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      );
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(
      catalog.listModels({
        type: 'together-ai' as never,
        authMethod: 'token' as never,
        token: 'tg-key',
      })
    ).resolves.toEqual([]);
  });

  it('should not call upstream without an API key', async () => {
    const fetchFn = vi.fn();
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('isolates the cache by API token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(okResponse([{ id: 'org-a/model', pricing: { input: 0, output: 0 } }]))
      .mockResolvedValueOnce(okResponse([{ id: 'org-b/model', pricing: { input: 1, output: 1 } }]));
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    const a = await catalog.listModels({
      type: 'together-ai' as never,
      authMethod: 'token' as never,
      token: 'key-a',
    });
    const b = await catalog.listModels({
      type: 'together-ai' as never,
      authMethod: 'token' as never,
      token: 'key-b',
    });

    expect(a.map((m) => m.id)).toEqual(['org-a/model']);
    expect(b.map((m) => m.id)).toEqual(['org-b/model']);
    expect(a[0]?.isFree).toBe(true);
    expect(b[0]?.isFree).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('omits isFree when Together pricing is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse([{ id: 'org/model', type: 'chat' }]));
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(
      catalog.listModels({
        type: 'together-ai' as never,
        authMethod: 'token' as never,
        token: 'tg-key',
      })
    ).resolves.toEqual([
      {
        id: 'org/model',
        displayName: undefined,
        contextLength: undefined,
        isFree: undefined,
        vendor: 'org',
      },
    ]);
  });
});
