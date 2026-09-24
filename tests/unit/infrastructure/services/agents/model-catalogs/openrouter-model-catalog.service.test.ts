/**
 * OpenRouterModelCatalogService Unit Tests
 *
 * Catalog requests are bounded so a stalled upstream fails over to the
 * cached/empty list instead of hanging the caller. Boot may already have
 * warmed the TTL cache; these tests still exercise fetch mapping directly.
 */

import { describe, it, expect, vi } from 'vitest';
import { OpenRouterModelCatalogService } from '@/infrastructure/services/agents/common/model-catalogs/openrouter-model-catalog.service.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('OpenRouterModelCatalogService', () => {
  it('should bound the catalog request with an abort signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ data: [] }));
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await catalog.listModels();

    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should return an empty list when the request times out', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      );
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([]);
  });

  it('should map catalog entries to listings', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        data: [
          {
            id: 'vendor/model-a',
            name: 'Model A',
            context_length: 1000,
            pricing: { prompt: '0', completion: '0' },
          },
        ],
      })
    );
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([
      {
        id: 'vendor/model-a',
        displayName: 'Model A',
        description: undefined,
        contextLength: 1000,
        isFree: true,
        vendor: 'vendor',
      },
    ]);
  });

  it('marks non-zero OpenRouter pricing as not free', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        data: [
          {
            id: 'vendor/paid',
            name: 'Paid',
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
        ],
      })
    );
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([
      {
        id: 'vendor/paid',
        displayName: 'Paid',
        description: undefined,
        contextLength: undefined,
        isFree: false,
        vendor: 'vendor',
      },
    ]);
  });

  it('omits isFree when OpenRouter pricing is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        data: [{ id: 'vendor/unknown', name: 'Unknown' }],
      })
    );
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([
      {
        id: 'vendor/unknown',
        displayName: 'Unknown',
        description: undefined,
        contextLength: undefined,
        isFree: undefined,
        vendor: 'vendor',
      },
    ]);
  });
});
