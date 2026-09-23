/**
 * Claude Code Model Catalog
 *
 * Discovers model aliases via `claude -p --restricted --safe-mode "/model"`,
 * which prints a line like:
 *   Usage: /model <name>. Available: sonnet, opus, haiku, …, or a full model ID.
 *
 * Caching lives in {@link TtlModelCatalog}.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';

const execFileAsync = promisify(execFile);
const CLAUDE_BINARY = 'claude';

/** Injectable runner for Claude `/model` help stdout/stderr. */
export type ClaudeListModelsFn = () => Promise<string>;

/**
 * Parse Claude's `/model` usage line into catalog listings.
 *
 * Accepts either the full prompt output or a snippet containing `Available:`.
 */
export function parseClaudeModelHelpOutput(text: string): AgentModelListing[] {
  const match = text.match(/Available:\s*([^.]+)/i);
  if (!match) return [];

  const chunk = match[1];
  // Drop trailing "or a full model ID" if the regex stopped early.
  const cleaned = chunk.replace(/\bor a full model ID\b/gi, '');

  const ids = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter((id) => id.length > 0 && !/^or\b/i.test(id));

  return ids.map((id) => ({ id, displayName: id }));
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
    return parseClaudeModelHelpOutput(text);
  }
}
