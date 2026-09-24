/**
 * Default {@link IModelCatalog} registry keyed by {@link AgentType}.
 *
 * The executor factory looks up a catalog by agent type; missing entries fall
 * back to the hardcoded AGENT_CATALOG models. Add a provider here when it
 * gains a discovery CLI or HTTP API.
 */

import { AgentType } from '../../../../../domain/generated/output.js';
import type { IModelCatalog } from '../../../../../application/ports/output/agents/model-catalog.interface.js';
import { OpenRouterModelCatalogService } from './openrouter-model-catalog.service.js';
import { TogetherAiModelCatalogService } from './together-ai-model-catalog.service.js';
import { CursorModelCatalogService } from './cursor-model-catalog.service.js';
import { ClaudeCodeModelCatalogService } from './claude-code-model-catalog.service.js';
import { CodexCliModelCatalogService } from './codex-cli-model-catalog.service.js';

export type ModelCatalogRegistry = ReadonlyMap<AgentType, IModelCatalog>;

export function createDefaultModelCatalogs(): ModelCatalogRegistry {
  return new Map<AgentType, IModelCatalog>([
    [AgentType.OpenRouter, new OpenRouterModelCatalogService()],
    [AgentType.TogetherAi, new TogetherAiModelCatalogService()],
    [AgentType.Cursor, new CursorModelCatalogService()],
    [AgentType.ClaudeCode, new ClaudeCodeModelCatalogService()],
    [AgentType.CodexCli, new CodexCliModelCatalogService()],
    // Gemini / Copilot / Kimi: add when a stable list command exists.
  ]);
}
