/**
 * warmAgentModelCatalogs Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import { warmAgentModelCatalogs } from '@/infrastructure/services/agents/common/model-catalogs/warm-agent-model-catalogs.js';
import { AgentType } from '@/domain/generated/output.js';

describe('warmAgentModelCatalogs', () => {
  it('loads settings then warms the factory with the active agent', async () => {
    const warmModelCatalogs = vi.fn().mockResolvedValue(undefined);
    const agent = { type: AgentType.OpenRouter, token: 'tok' };
    const container = {
      resolve: vi.fn((token: string) => {
        if (token === 'IAgentExecutorFactory') return { warmModelCatalogs };
        if (token === 'ISettingsRepository') {
          return { load: vi.fn().mockResolvedValue({ agent }) };
        }
        throw new Error(`unexpected token ${token}`);
      }),
    } as unknown as DependencyContainer;

    await warmAgentModelCatalogs(container);

    expect(warmModelCatalogs).toHaveBeenCalledWith(agent);
  });

  it('warms without auth when settings cannot be loaded', async () => {
    const warmModelCatalogs = vi.fn().mockResolvedValue(undefined);
    const container = {
      resolve: vi.fn((token: string) => {
        if (token === 'IAgentExecutorFactory') return { warmModelCatalogs };
        if (token === 'ISettingsRepository') {
          return { load: vi.fn().mockRejectedValue(new Error('no settings')) };
        }
        throw new Error(`unexpected token ${token}`);
      }),
    } as unknown as DependencyContainer;

    await warmAgentModelCatalogs(container);

    expect(warmModelCatalogs).toHaveBeenCalledWith(undefined);
  });

  it('propagates warmModelCatalogs rejection to the caller', async () => {
    const warmModelCatalogs = vi.fn().mockRejectedValue(new Error('warm failed'));
    const container = {
      resolve: vi.fn((token: string) => {
        if (token === 'IAgentExecutorFactory') return { warmModelCatalogs };
        if (token === 'ISettingsRepository') {
          return { load: vi.fn().mockResolvedValue(null) };
        }
        throw new Error(`unexpected token ${token}`);
      }),
    } as unknown as DependencyContainer;

    await expect(warmAgentModelCatalogs(container)).rejects.toThrow('warm failed');
  });
});
