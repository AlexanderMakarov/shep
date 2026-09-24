/**
 * ClaudeCodeModelCatalogService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClaudeCodeModelCatalogService,
  mergeClaudeCatalogWithHardcoded,
  parseClaudeModelHelpOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/claude-code-model-catalog.service.js';
import { MODEL_CATALOG_TTL_MS } from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';
import { AgentType } from '@/domain/generated/output.js';
import { AGENT_CATALOG } from '@/domain/shared/agent-catalog.js';

const SAMPLE = `Current model: Opus 5.5 (default)
Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.`;

describe('parseClaudeModelHelpOutput', () => {
  it('maps aliases to Shep canonical ids and dedupes', () => {
    const listings = parseClaudeModelHelpOutput(SAMPLE);
    expect(listings.map((l) => l.id)).toEqual([
      'claude-sonnet-5',
      'claude-opus-5',
      'claude-haiku-4-5',
      'claude-fable-5',
    ]);
    expect(listings.find((l) => l.id === 'claude-sonnet-5')?.displayName).toBe('sonnet');
  });

  it('returns empty when Available: is missing', () => {
    expect(parseClaudeModelHelpOutput('no models here')).toEqual([]);
  });

  it('passes through unmapped full model ids', () => {
    const text = 'Available: claude-opus-4-6-20250514, or a full model ID.';
    expect(parseClaudeModelHelpOutput(text).map((l) => l.id)).toEqual(['claude-opus-4-6-20250514']);
  });
});

describe('mergeClaudeCatalogWithHardcoded', () => {
  it('appends hardcoded Claude models missing from live', () => {
    const live = [{ id: 'claude-opus-5', displayName: 'opus' }];
    const merged = mergeClaudeCatalogWithHardcoded(live);
    const hardcoded = AGENT_CATALOG[AgentType.ClaudeCode].models;

    expect(merged[0]).toEqual(live[0]);
    expect(merged.map((l) => l.id)).toEqual(
      expect.arrayContaining([...hardcoded.slice(0, 5), 'claude-opus-5'])
    );
    expect(merged.length).toBeGreaterThanOrEqual(hardcoded.length);
  });
});

describe('ClaudeCodeModelCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches within the shared TTL and merges hardcoded models', async () => {
    const run = vi.fn().mockResolvedValue(SAMPLE);
    const catalog = new ClaudeCodeModelCatalogService(run);

    const first = await catalog.listModels();
    const second = await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(1);
    expect(first.map((l) => l.id)).toContain('claude-opus-5');
    expect(first.map((l) => l.id)).toContain('claude-opus-4-8');
    expect(second).toEqual(first);
    expect(second).not.toBe(first);

    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('returns last-good when a later fetch fails', async () => {
    const run = vi.fn().mockResolvedValueOnce(SAMPLE).mockRejectedValueOnce(new Error('timeout'));
    const catalog = new ClaudeCodeModelCatalogService(run);

    const first = await catalog.listModels();
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    const second = await catalog.listModels();

    expect(second.map((l) => l.id)).toEqual(first.map((l) => l.id));
    expect(run).toHaveBeenCalledTimes(2);
  });
});
