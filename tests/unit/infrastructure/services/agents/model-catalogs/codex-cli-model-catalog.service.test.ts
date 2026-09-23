/**
 * CodexCliModelCatalogService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CodexCliModelCatalogService,
  parseCodexDebugModelsOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/codex-cli-model-catalog.service.js';
import { MODEL_CATALOG_TTL_MS } from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';

const FIXTURE = JSON.stringify({
  models: [
    {
      slug: 'gpt-5.4',
      display_name: 'GPT-5.4',
      description: 'Flagship',
      context_window: 200000,
      visibility: 'list',
    },
    {
      slug: 'hidden-internal',
      display_name: 'Hidden',
      visibility: 'hidden',
    },
  ],
});

describe('parseCodexDebugModelsOutput', () => {
  it('maps slug/display_name and skips non-list visibility', () => {
    expect(parseCodexDebugModelsOutput(FIXTURE)).toEqual([
      {
        id: 'gpt-5.4',
        displayName: 'GPT-5.4',
        description: 'Flagship',
        contextLength: 200000,
      },
    ]);
  });

  it('returns empty on invalid JSON', () => {
    expect(parseCodexDebugModelsOutput('not-json')).toEqual([]);
  });
});

describe('CodexCliModelCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches within the shared TTL', async () => {
    const run = vi.fn().mockResolvedValue(FIXTURE);
    const catalog = new CodexCliModelCatalogService(run);

    await catalog.listModels();
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
