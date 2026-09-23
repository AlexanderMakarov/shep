/**
 * Default {@link IModelCatalog} registry keyed by AgentType string.
 *
 * The executor factory looks up a catalog by agent type; missing entries fall
 * back to the hardcoded AGENT_CATALOG models. Add a provider here when it
 * gains a discovery CLI or HTTP API.
 */

import type { IModelCatalog } from '../../../../../application/ports/output/agents/model-catalog.interface.js';
import { OpenRouterModelCatalogService } from './openrouter-model-catalog.service.js';
import { TogetherAiModelCatalogService } from './together-ai-model-catalog.service.js';
import { CursorModelCatalogService } from './cursor-model-catalog.service.js';
import { ClaudeCodeModelCatalogService } from './claude-code-model-catalog.service.js';

export type ModelCatalogRegistry = ReadonlyMap<string, IModelCatalog>;

export function createDefaultModelCatalogs(): ModelCatalogRegistry {
  return new Map<string, IModelCatalog>([
    ['openrouter', new OpenRouterModelCatalogService()],
    ['together-ai', new TogetherAiModelCatalogService()],
    ['cursor', new CursorModelCatalogService()],
    ['claude-code', new ClaudeCodeModelCatalogService()],
    // Codex / Gemini / Copilot / Kimi: add when a stable list command exists.
  ]);
}
