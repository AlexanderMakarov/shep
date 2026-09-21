/**
 * Per-agent model lists.
 *
 * The lists themselves now live in the domain agent catalog
 * (`domain/shared/agent-catalog.ts`), which is the single source of truth for
 * every per-agent fact. This module stays as the infrastructure-facing view of
 * that data so existing call sites keep working, and so a caller that only
 * wants models does not have to know about descriptors.
 *
 * To add or retire a model, edit the catalog — not this file.
 */

import { AgentType } from '../../../../domain/generated/output.js';
import { AGENT_CATALOG, getModelsForAgent } from '../../../../domain/shared/agent-catalog.js';

/** Models offered for a given agent type. Empty for unknown agents. */
export { getModelsForAgent };

export const CLAUDE_CODE_MODELS: string[] = [...AGENT_CATALOG[AgentType.ClaudeCode].models];
export const KIMI_CODE_MODELS: string[] = [...AGENT_CATALOG[AgentType.KimiCode].models];
export const GEMINI_CLI_MODELS: string[] = [...AGENT_CATALOG[AgentType.GeminiCli].models];
export const CURSOR_MODELS: string[] = [...AGENT_CATALOG[AgentType.Cursor].models];
export const CODEX_CLI_MODELS: string[] = [...AGENT_CATALOG[AgentType.CodexCli].models];
export const COPILOT_CLI_MODELS: string[] = [...AGENT_CATALOG[AgentType.CopilotCli].models];
export const CLINE_MODELS: string[] = [...AGENT_CATALOG[AgentType.Cline].models];
export const OPENROUTER_MODELS: string[] = [...AGENT_CATALOG[AgentType.OpenRouter].models];
export const TOGETHER_AI_MODELS: string[] = [...AGENT_CATALOG[AgentType.TogetherAi].models];
export const OLLAMA_MODELS: string[] = [...AGENT_CATALOG[AgentType.Ollama].models];
export const LLMPROXY_MODELS: string[] = [...AGENT_CATALOG[AgentType.LlmProxy].models];
