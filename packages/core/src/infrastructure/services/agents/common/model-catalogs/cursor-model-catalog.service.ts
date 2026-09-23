/**
 * Cursor Model Catalog
 *
 * Discovers the live model list from `cursor-agent --list-models`. Results are
 * cached in-process with a short TTL so opening the model picker does not spawn
 * the CLI on every keystroke or agent turn.
 *
 * On spawn/timeout/parse failure the service returns the last-good cache when
 * present, otherwise an empty list so the factory can fall back to the hardcoded
 * CURSOR_MODELS catalog (same pattern as OpenRouter/Together).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';

const execFileAsync = promisify(execFile);

/** In-process TTL — same spirit as OpenRouter's 5-minute cache. */
export const CURSOR_MODEL_CATALOG_TTL_MS = 5 * 60 * 1000;

const CURSOR_BINARY = 'cursor-agent';

/**
 * Injectable runner for `cursor-agent --list-models` stdout.
 * Tests stub this; production uses {@link defaultCursorListModels}.
 */
export type CursorListModelsFn = () => Promise<string>;

/**
 * Parse one stdout dump from `cursor-agent --list-models`.
 *
 * Lines look like `id - Display Name` (optional parenthetical notes). The
 * "Available models" header and blank/malformed lines are skipped. Trailing
 * zero-width / BOM junk from some CLI builds is stripped from both sides.
 */
export function parseCursorListModelsOutput(stdout: string): AgentModelListing[] {
  const listings: AgentModelListing[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!line || /^available models$/i.test(line)) continue;

    const sep = line.indexOf(' - ');
    if (sep <= 0) continue;

    const id = line.slice(0, sep).trim();
    const displayName = line.slice(sep + 3).trim();
    if (!id || /\s/.test(id)) continue;

    listings.push({ id, displayName: displayName || undefined });
  }
  return listings;
}

async function defaultCursorListModels(): Promise<string> {
  const { stdout } = await execFileAsync(CURSOR_BINARY, ['--list-models'], {
    timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  return typeof stdout === 'string' ? stdout : String(stdout);
}

export class CursorModelCatalogService {
  private cache: { expiresAt: number; data: AgentModelListing[] } | null = null;

  constructor(private readonly listModelsFn: CursorListModelsFn = defaultCursorListModels) {}

  async listModels(): Promise<AgentModelListing[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    let stdout: string;
    try {
      stdout = await this.listModelsFn();
    } catch {
      return this.cache?.data ?? [];
    }

    const listings = parseCursorListModelsOutput(stdout);
    if (listings.length === 0) {
      return this.cache?.data ?? [];
    }

    this.cache = { expiresAt: now + CURSOR_MODEL_CATALOG_TTL_MS, data: listings };
    return listings;
  }
}
