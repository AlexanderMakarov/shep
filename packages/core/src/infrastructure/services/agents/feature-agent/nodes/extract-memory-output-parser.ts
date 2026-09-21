/**
 * Extract-Memory Output Parser
 *
 * Extracts structured project-memory entries from the free-form text output of
 * the post-merge extraction agent. Looks for a fenced JSON code block containing
 * an array of { category, entryKey, content } objects, validates each against
 * the MemoryCategory enum, and returns a clean list.
 *
 * Extraction is best-effort, but the result says WHY it is empty: an agent
 * that correctly found nothing and an agent whose answer we failed to read
 * are two different events, and the caller logs them differently.
 */

import { MemoryCategory } from '../../../../../domain/generated/output.js';
import type { ProjectMemoryEntryInput } from '../../../../../application/use-cases/project-memory/record-project-memory.use-case.js';
import { extractFencedJsonArray, type FencedJsonFailure } from './fenced-json.js';

export interface ParsedMemoryEntries {
  /** Valid entries found. Empty when none were reported, or none were valid. */
  entries: ProjectMemoryEntryInput[];
  /** Set only when no JSON array could be read from the output at all. */
  failure?: FencedJsonFailure;
}

const VALID_CATEGORIES = new Set<string>(Object.values(MemoryCategory));

function isValidEntry(record: unknown): record is ProjectMemoryEntryInput {
  if (record === null || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  if (typeof r.category !== 'string' || !VALID_CATEGORIES.has(r.category)) return false;
  if (typeof r.entryKey !== 'string' || r.entryKey.trim().length === 0) return false;
  if (typeof r.content !== 'string' || r.content.trim().length === 0) return false;
  return true;
}

/**
 * Parse project-memory entries from agent text output.
 *
 * @param output - Raw agent output that should contain a fenced JSON array
 * @returns The valid entries plus, when nothing could be read, the reason
 */
export function parseMemoryEntries(output: string): ParsedMemoryEntries {
  const extracted = extractFencedJsonArray(output);
  if (!extracted.found) return { entries: [], failure: extracted.failure };

  return {
    entries: extracted.items.filter(isValidEntry).map((e) => ({
      category: e.category,
      entryKey: e.entryKey.trim(),
      content: e.content.trim(),
    })),
  };
}
