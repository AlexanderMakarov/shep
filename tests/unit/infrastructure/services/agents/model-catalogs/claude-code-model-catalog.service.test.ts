/**
 * ClaudeCodeModelCatalogService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClaudeCodeModelCatalogService,
  parseClaudeModelHelpOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/claude-code-model-catalog.service.js';
import { MODEL_CATALOG_TTL_MS } from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';

const SAMPLE = `Current model: Opus 5.5 (default)
Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.`;

describe('parseClaudeModelHelpOutput', () => {
  it('extracts aliases from the Available: line', () => {
    const listings = parseClaudeModelHelpOutput(SAMPLE);
    expect(listings.map((l) => l.id)).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'fable',
      'best',
      'sonnet[1m]',
      'opus[1m]',
      'fable[1m]',
      'opusplan',
      'default',
    ]);
  });

  it('returns empty when Available: is missing', () => {
    expect(parseClaudeModelHelpOutput('no models here')).toEqual([]);
  });
});

describe('ClaudeCodeModelCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches within the shared TTL', async () => {
    const run = vi.fn().mockResolvedValue(SAMPLE);
    const catalog = new ClaudeCodeModelCatalogService(run);

    await catalog.listModels();
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
