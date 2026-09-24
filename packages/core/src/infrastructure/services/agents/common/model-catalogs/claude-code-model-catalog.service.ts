/**
 * Claude Code Model Catalog
 *
 * Discovers model aliases via `claude -p --restricted --safe-mode "/model"`,
 * which prints a line like:
 *   Usage: /model <name>. Available: sonnet, opus, haiku, …, or a full model ID.
 *
 * Aliases are mapped to Shep's canonical `CLAUDE_CODE_MODELS` ids so the picker,
 * adaptive tiers, and validation share one ID space. Hardcoded catalog models
 * that are not present in the live alias list are merged in.
 *
 * Caching lives in {@link TtlModelCatalog}.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentType } from '../../../../../domain/generated/output.js';
import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { AGENT_CATALOG } from '../../../../../domain/shared/agent-catalog.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';

const execFileAsync = promisify(execFile);
const CLAUDE_BINARY = 'claude';

/**
 * Claude `/model` aliases → Shep catalog ids used by adaptive selection and
 * the hardcoded CLAUDE_CODE_MODELS list.
 */
export const CLAUDE_MODEL_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
  haiku: 'claude-haiku-4-5',
  fable: 'claude-fable-5',
  best: 'claude-opus-5',
  default: 'claude-opus-5',
  opusplan: 'claude-opus-5',
  'sonnet[1m]': 'claude-sonnet-5',
  'opus[1m]': 'claude-opus-5',
  'fable[1m]': 'claude-fable-5',
};

/** Injectable runner for Claude `/model` help stdout/stderr. */
export type ClaudeListModelsFn = () => Promise<string>;

/**
 * Map a Claude CLI model token to a Shep canonical id when known.
 * Unmapped tokens (full model IDs) pass through unchanged.
 */
export function resolveClaudeModelId(token: string): string {
  return CLAUDE_MODEL_ALIAS_TO_CANONICAL[token] ?? token;
}

/**
 * Parse Claude's `/model` usage line into catalog listings with canonical ids.
 *
 * Accepts either the full prompt output or a snippet containing `Available:`.
 * Trailing "or a full model ID" prose inside the capture is stripped.
 */
export function parseClaudeModelHelpOutput(text: string): AgentModelListing[] {
  const match = text.match(/Available:\s*([^.]+)/i);
  if (!match) return [];

  const chunk = match[1];
  // Strip the trailing "… or a full model ID" clause inside the capture.
  const cleaned = chunk.replace(/\bor a full model ID\b/gi, '');

  const ids = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter((id) => id.length > 0 && !/^or\b/i.test(id));

  const seen = new Set<string>();
  const listings: AgentModelListing[] = [];
  for (const alias of ids) {
    const id = resolveClaudeModelId(alias);
    if (seen.has(id)) continue;
    seen.add(id);
    listings.push({
      id,
      displayName: alias === id ? id : alias,
    });
  }
  return listings;
}

/** Union live (mapped) listings with hardcoded Claude catalog models. */
export function mergeClaudeCatalogWithHardcoded(live: AgentModelListing[]): AgentModelListing[] {
  const seen = new Set(live.map((entry) => entry.id));
  const merged = [...live];
  for (const id of AGENT_CATALOG[AgentType.ClaudeCode].models) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ id });
  }
  return merged;
}

async function defaultClaudeListModels(): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(
      CLAUDE_BINARY,
      ['-p', '--restricted', '--safe-mode', '/model'],
      {
        timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    );
    return `${stdout ?? ''}\n${stderr ?? ''}`;
  } catch (error: unknown) {
    // Claude often exits non-zero while still printing the Available: line.
    if (error && typeof error === 'object' && 'stdout' in error) {
      const e = error as { stdout?: string; stderr?: string };
      return `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    }
    throw error;
  }
}

export class ClaudeCodeModelCatalogService extends TtlModelCatalog {
  constructor(private readonly listModelsFn: ClaudeListModelsFn = defaultClaudeListModels) {
    super();
  }

  protected async fetchModels(_authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const text = await this.listModelsFn();
    return mergeClaudeCatalogWithHardcoded(parseClaudeModelHelpOutput(text));
  }
}
