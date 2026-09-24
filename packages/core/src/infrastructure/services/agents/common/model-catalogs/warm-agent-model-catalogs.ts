/**
 * Warm live {@link IModelCatalog} caches after the web UI process starts.
 *
 * Catalogs are TTL-cached on the singleton {@link IAgentExecutorFactory}.
 * Prefetching in parallel at boot means the agent/model picker hits memory
 * instead of re-spawning CLI discovery on first open.
 */

import type { DependencyContainer } from 'tsyringe';
import type { IAgentExecutorFactory } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { ISettingsRepository } from '../../../../../application/ports/output/repositories/settings.repository.interface.js';
import type { AgentConfig } from '../../../../../domain/generated/output.js';

/**
 * Fire-and-forget safe: resolves settings for token-backed catalogs, then
 * warms every registered catalog concurrently. Never throws to the caller.
 */
export async function warmAgentModelCatalogs(container: DependencyContainer): Promise<void> {
  const factory = container.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');

  let authConfig: AgentConfig | undefined;
  try {
    const settingsRepo = container.resolve<ISettingsRepository>('ISettingsRepository');
    const settings = await settingsRepo.load();
    authConfig = settings?.agent;
  } catch {
    authConfig = undefined;
  }

  await factory.warmModelCatalogs(authConfig);
}
