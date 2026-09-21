'use server';

import { resolve } from '@/lib/server-container';
import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog';
import type { ListToolsUseCase } from '@shepai/core/application/use-cases/tools/list-tools.use-case';

/**
 * agentType → tool-installer id, from the domain catalog.
 *
 * The hand-written map this replaces omitted cline, ollama, openrouter,
 * together-ai and llmproxy, and used tool ids (`copilot-cli`, `codex-cli`) that
 * match no file in the tool catalogue — tool ids are the JSON filename, so
 * those two lookups never matched and both agents always reported "not
 * installed".
 */
const AGENT_TOOL_MAP: Record<string, string> = Object.fromEntries(
  listAgentDescriptors()
    .filter((descriptor) => descriptor.toolId !== null)
    .map((descriptor) => [descriptor.type as string, descriptor.toolId as string])
);

/** Agents that need no installed binary are always "available". */
const BINARY_FREE_AGENTS: string[] = listAgentDescriptors()
  .filter((descriptor) => descriptor.supported && descriptor.binary === null)
  .map((descriptor) => descriptor.type as string);

export type AgentInstallMap = Record<string, boolean>;

/**
 * Returns a map of agentType → installed (boolean) for all known agents.
 * Agents without a tool mapping (e.g. "dev") are considered installed.
 */
export async function checkAllAgentsStatus(): Promise<AgentInstallMap> {
  try {
    const useCase = resolve<ListToolsUseCase>('ListToolsUseCase');
    const tools = await useCase.execute();

    const result: AgentInstallMap = {};
    for (const [agentType, toolId] of Object.entries(AGENT_TOOL_MAP)) {
      const tool = tools.find((t) => t.id === toolId);
      result[agentType] = tool?.status.status === 'available';
    }
    // SDK providers and the demo mock need no binary.
    for (const agentType of BINARY_FREE_AGENTS) result[agentType] = true;

    return result;
  } catch {
    return {};
  }
}
