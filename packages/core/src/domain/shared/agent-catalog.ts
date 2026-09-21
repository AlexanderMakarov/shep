/**
 * Agent Catalog — one source of truth for the facts about each AgentType.
 *
 * Before this existed, the same facts were restated in a dozen hand-maintained
 * tables (the executor factory's five lists, the validator's binary map, the
 * auth use case's metadata table, the model catalog, the TUI choices, and three
 * separate web tables). Nothing related them, so they drifted: `codex-cli` and
 * `llmproxy` were missing from the auth table and reported as "Unknown", the
 * Cursor binary was recorded as `cursor` in two places and `cursor-agent` in
 * two others, and two tool ids never matched a real tool file.
 *
 * The catalog is typed as a total `Record<AgentType, AgentDescriptor>`, so
 * adding a member to the TypeSpec `AgentType` enum is a COMPILE ERROR until its
 * facts are filled in here. That is the point: the compiler now produces the
 * "what do I have to touch" list that used to be tribal knowledge.
 *
 * This lives in `domain/` because it is pure data with no dependencies — every
 * layer (application use cases, infrastructure services, CLI, TUI and the web
 * app) reads the same rows.
 *
 * NOTE: relative imports inside `domain/` carry no file extension, because the
 * web package consumes `domain/` as raw TypeScript.
 */

import { AgentType } from '../generated/output';

/** How an agent is reached. */
export type AgentKind =
  /** A binary on PATH, driven as a subprocess. */
  | 'cli'
  /** An HTTP API reached through the Vercel AI SDK. */
  | 'sdk'
  /** The local mock — no binary, no network. */
  | 'mock';

/** Everything Shep needs to know about one agent type. */
export interface AgentDescriptor {
  /** The enum value, repeated so a descriptor is self-describing once detached. */
  readonly type: AgentType;
  /** Human-readable name shown in the CLI, TUI and web UI. */
  readonly label: string;
  /** One-line description for pickers. */
  readonly description: string;
  readonly kind: AgentKind;
  /**
   * False for agents listed for future extensibility. Unsupported agents are
   * shown as "Coming Soon" and must never be handed to the executor factory.
   */
  readonly supported: boolean;
  /** Binary name on PATH, or null for SDK and mock agents. */
  readonly binary: string | null;
  /** Arguments that make {@link binary} print its version. */
  readonly versionArgs: readonly string[];
  /**
   * Id in the tool-installer catalogue, or null when Shep cannot install it.
   * MUST equal the basename of the JSON file in
   * `infrastructure/services/tool-installer/tools/`, because that is how tool
   * ids are derived.
   */
  readonly toolId: string | null;
  /** Static model identifiers offered for this agent. */
  readonly models: readonly string[];
  /** Sort weight in pickers — lower first, demo last. */
  readonly order: number;
  /** Whether an API token is required (as opposed to the agent's own session). */
  readonly requiresToken: boolean;
  /** Where a user learns to install or authenticate this agent. */
  readonly docsUrl: string | null;
  /**
   * Key under `tui:prompts.selectAgent.choices` for this agent's translated
   * name and description. Held here rather than derived from the type, because
   * the existing keys are irregular (`openRouter`, `devMock`) and renaming them
   * would invalidate nine locale files.
   */
  readonly i18nKey: string;
}

const CLAUDE_CODE_MODELS = [
  'claude-fable-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'z-ai/glm-5.3',
  'glm-5.2',
  'glm-5.1',
] as const;

/**
 * Moonshot AI Kimi models.
 *
 * `--model` selects a model *configuration key* from `~/.kimi/config.toml`;
 * the shipped defaults use the API identifiers below. The `kimi-k2` series and
 * `kimi-k2.5` were discontinued in 2026 and are deliberately absent.
 * Source: https://platform.kimi.ai/docs/models (retrieved 2026-09-20).
 */
const KIMI_CODE_MODELS = [
  'kimi-k3',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
  'kimi-k2.6',
  'kimi-for-coding',
] as const;

const GEMINI_CLI_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

const CURSOR_MODELS = [
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'gpt-5.4-high',
  'gpt-5.2',
  'gpt-5.3-codex',
  'gemini-3.1-pro-preview',
  'composer-1.5',
  'grok-code',
] as const;

const CODEX_CLI_MODELS = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1',
  'gpt-5-codex',
  'gpt-5-codex-mini',
  'gpt-5',
] as const;

const COPILOT_CLI_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-sonnet-4',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'gpt-4.1',
  'gpt-5-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
] as const;

const CLINE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'gpt-4.1',
  'gpt-4.1-mini',
  'deepseek-chat',
  'llama3.2',
] as const;

const OPENROUTER_MODELS = [
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'moonshotai/kimi-k3',
  'openai/gpt-5.4',
  'openai/gpt-5.2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-pro-preview',
  'deepseek/deepseek-chat-v3-0324',
  'mistralai/mistral-large-latest',
] as const;

const TOGETHER_AI_MODELS = [
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
  'moonshotai/Kimi-K2-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-R1',
  'mistralai/Mistral-Small-24B-Instruct-2501',
  'google/gemma-2-27b-it',
  'codellama/CodeLlama-70b-Instruct-hf',
] as const;

const OLLAMA_MODELS = [
  'llama3.2',
  'llama3.1',
  'codellama',
  'deepseek-coder-v2',
  'qwen2.5-coder',
  'mistral',
  'gemma2',
  'phi3',
  'starcoder2',
] as const;

/**
 * LLMProxy fronts whatever a user has configured, so this is only a starting
 * list. Every entry must still be a model that is actually current — a picker
 * offering retired identifiers produces a failure on the first run.
 */
const LLMPROXY_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'gpt-5.4',
  'gpt-5.2',
  'kimi-k3',
  'deepseek-chat',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
] as const;

const NO_MODELS: readonly string[] = [];
const VERSION_FLAG = ['--version'] as const;

/**
 * Every agent type Shep knows about.
 *
 * Typed as a TOTAL Record on purpose — see the module comment.
 */
export const AGENT_CATALOG: Record<AgentType, AgentDescriptor> = {
  [AgentType.ClaudeCode]: {
    type: AgentType.ClaudeCode,
    label: 'Claude Code',
    description: 'Anthropic Claude Code CLI',
    kind: 'cli',
    supported: true,
    binary: 'claude',
    versionArgs: VERSION_FLAG,
    toolId: 'claude-code',
    models: CLAUDE_CODE_MODELS,
    order: 0,
    requiresToken: false,
    docsUrl: 'https://docs.claude.com/en/docs/claude-code',
    i18nKey: 'claudeCode',
  },
  [AgentType.KimiCode]: {
    type: AgentType.KimiCode,
    label: 'Kimi Code',
    description: "Moonshot AI's Kimi Code CLI terminal agent (Kimi K-series models)",
    kind: 'cli',
    supported: true,
    binary: 'kimi',
    versionArgs: VERSION_FLAG,
    toolId: 'kimi',
    models: KIMI_CODE_MODELS,
    order: 1,
    requiresToken: false,
    docsUrl: 'https://moonshotai.github.io/kimi-cli/en/',
    i18nKey: 'kimiCode',
  },
  [AgentType.CodexCli]: {
    type: AgentType.CodexCli,
    label: 'Codex CLI',
    description: "OpenAI's Codex CLI terminal agent (GPT models)",
    kind: 'cli',
    supported: true,
    binary: 'codex',
    versionArgs: VERSION_FLAG,
    // Tool ids come from the filename: tool-installer/tools/codex.json.
    toolId: 'codex',
    models: CODEX_CLI_MODELS,
    order: 2,
    requiresToken: false,
    docsUrl: 'https://developers.openai.com/codex/cli/',
    i18nKey: 'codexCli',
  },
  [AgentType.CopilotCli]: {
    type: AgentType.CopilotCli,
    label: 'Copilot CLI',
    description: 'GitHub Copilot CLI (requires a Copilot subscription)',
    kind: 'cli',
    supported: true,
    binary: 'copilot',
    versionArgs: VERSION_FLAG,
    // tool-installer/tools/copilot.json — NOT 'copilot-cli'.
    toolId: 'copilot',
    models: COPILOT_CLI_MODELS,
    order: 3,
    requiresToken: false,
    docsUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli',
    i18nKey: 'copilotCli',
  },
  [AgentType.Cursor]: {
    type: AgentType.Cursor,
    label: 'Cursor CLI',
    description: 'Cursor AI coding agent',
    kind: 'cli',
    supported: true,
    // The binary is `cursor-agent`; `cursor` is the desktop editor.
    binary: 'cursor-agent',
    versionArgs: VERSION_FLAG,
    toolId: 'cursor-cli',
    models: CURSOR_MODELS,
    order: 4,
    requiresToken: false,
    docsUrl: 'https://cursor.com/cli',
    i18nKey: 'cursor',
  },
  [AgentType.GeminiCli]: {
    type: AgentType.GeminiCli,
    label: 'Gemini CLI',
    description: 'Google Gemini CLI',
    kind: 'cli',
    supported: true,
    binary: 'gemini',
    versionArgs: VERSION_FLAG,
    toolId: 'gemini-cli',
    models: GEMINI_CLI_MODELS,
    order: 5,
    requiresToken: false,
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
    i18nKey: 'geminiCli',
  },
  [AgentType.Cline]: {
    type: AgentType.Cline,
    label: 'Cline',
    description: 'Multi-provider agentic coding assistant with full tool use',
    kind: 'cli',
    supported: true,
    binary: 'cline',
    // Cline uses a subcommand, not a flag.
    versionArgs: ['version'],
    toolId: null,
    models: CLINE_MODELS,
    order: 6,
    requiresToken: false,
    docsUrl: 'https://docs.cline.bot/',
    i18nKey: 'cline',
  },
  [AgentType.OpenRouter]: {
    type: AgentType.OpenRouter,
    label: 'OpenRouter',
    description: 'Access hundreds of AI models via the OpenRouter API',
    kind: 'sdk',
    supported: true,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: OPENROUTER_MODELS,
    order: 7,
    requiresToken: true,
    docsUrl: 'https://openrouter.ai/docs',
    i18nKey: 'openRouter',
  },
  [AgentType.TogetherAi]: {
    type: AgentType.TogetherAi,
    label: 'Together AI',
    description: 'Fast open-source model inference via the Together AI API',
    kind: 'sdk',
    supported: true,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: TOGETHER_AI_MODELS,
    order: 8,
    requiresToken: true,
    docsUrl: 'https://docs.together.ai/',
    i18nKey: 'togetherAi',
  },
  [AgentType.Ollama]: {
    type: AgentType.Ollama,
    label: 'Ollama',
    description: 'Run local LLMs via Ollama (no API key required)',
    kind: 'sdk',
    supported: true,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: OLLAMA_MODELS,
    order: 9,
    requiresToken: false,
    docsUrl: 'https://ollama.com/',
    i18nKey: 'ollama',
  },
  [AgentType.LlmProxy]: {
    type: AgentType.LlmProxy,
    label: 'LLM Proxy',
    description: 'Local OpenAI-compatible proxy (typically on port 4000)',
    kind: 'sdk',
    supported: true,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: LLMPROXY_MODELS,
    order: 10,
    requiresToken: false,
    docsUrl: null,
    i18nKey: 'llmProxy',
  },
  [AgentType.Aider]: {
    type: AgentType.Aider,
    label: 'Aider',
    description: 'Aider AI coding assistant',
    kind: 'cli',
    supported: false,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: NO_MODELS,
    order: 100,
    requiresToken: false,
    docsUrl: 'https://aider.chat/',
    i18nKey: 'aider',
  },
  [AgentType.Continue]: {
    type: AgentType.Continue,
    label: 'Continue',
    description: 'Continue IDE extension',
    kind: 'cli',
    supported: false,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: NO_MODELS,
    order: 101,
    requiresToken: false,
    docsUrl: 'https://continue.dev/',
    i18nKey: 'continue',
  },
  [AgentType.Dev]: {
    type: AgentType.Dev,
    label: 'Demo',
    description: 'Local development mock — no agent binary required',
    kind: 'mock',
    supported: true,
    binary: null,
    versionArgs: VERSION_FLAG,
    toolId: null,
    models: NO_MODELS,
    order: 90,
    requiresToken: false,
    docsUrl: null,
    i18nKey: 'devMock',
  },
};

/** Look up an agent's facts, or undefined for a value outside the enum. */
export function getAgentDescriptor(agentType: string): AgentDescriptor | undefined {
  return AGENT_CATALOG[agentType as AgentType];
}

/** Every descriptor, in picker order. */
export function listAgentDescriptors(): AgentDescriptor[] {
  return Object.values(AGENT_CATALOG).sort((a, b) => a.order - b.order);
}

/** Agent types Shep can actually run, in picker order. */
export function listSupportedAgentTypes(): AgentType[] {
  return listAgentDescriptors()
    .filter((descriptor) => descriptor.supported)
    .map((descriptor) => descriptor.type);
}

/** True when Shep has a working executor for this agent type. */
export function isSupportedAgentType(agentType: string): boolean {
  return getAgentDescriptor(agentType)?.supported ?? false;
}

/** Static model list for an agent type; empty for unknown or model-less agents. */
export function getModelsForAgent(agentType: string): string[] {
  return [...(getAgentDescriptor(agentType)?.models ?? NO_MODELS)];
}
