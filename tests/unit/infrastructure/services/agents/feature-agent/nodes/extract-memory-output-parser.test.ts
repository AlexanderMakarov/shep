import { describe, it, expect } from 'vitest';
import { parseMemoryEntries } from '@/infrastructure/services/agents/feature-agent/nodes/extract-memory-output-parser.js';
import { FencedJsonFailure } from '@/infrastructure/services/agents/feature-agent/nodes/fenced-json.js';
import { MemoryCategory } from '@/domain/generated/output.js';

describe('parseMemoryEntries', () => {
  it('extracts valid entries from a fenced JSON block', () => {
    const out = `prose
\`\`\`json
[
  { "category": "Convention", "entryKey": "k1", "content": "A." },
  { "category": "CiFixResolution", "entryKey": "k2", "content": "B." }
]
\`\`\`
more prose`;
    const { entries } = parseMemoryEntries(out);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      category: MemoryCategory.Convention,
      entryKey: 'k1',
      content: 'A.',
    });
  });

  it('returns empty array when there is no JSON block', () => {
    expect(parseMemoryEntries('just text').entries).toEqual([]);
  });

  it('returns empty array on malformed JSON', () => {
    expect(parseMemoryEntries('```json\n[ not json ]\n```').entries).toEqual([]);
  });

  it('drops entries with an invalid category', () => {
    const out = `\`\`\`json
[
  { "category": "Nonsense", "entryKey": "k", "content": "x" },
  { "category": "Library", "entryKey": "ok", "content": "keep" }
]
\`\`\``;
    const { entries } = parseMemoryEntries(out);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryKey).toBe('ok');
  });

  it('drops entries with blank entryKey or content and trims survivors', () => {
    const out = `\`\`\`json
[
  { "category": "Library", "entryKey": "  ", "content": "no key" },
  { "category": "Library", "entryKey": "k", "content": "   " },
  { "category": "Library", "entryKey": " trimmed ", "content": "  spaced  " }
]
\`\`\``;
    const { entries } = parseMemoryEntries(out);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      category: MemoryCategory.Library,
      entryKey: 'trimmed',
      content: 'spaced',
    });
  });

  it('returns empty array when the JSON is not an array', () => {
    expect(parseMemoryEntries('```json\n{"category":"Library"}\n```').entries).toEqual([]);
  });

  // ── "found nothing" must be distinguishable from "could not read" ───────
  it('reports no failure when the agent explicitly returned an empty list', () => {
    const result = parseMemoryEntries('```json\n[]\n```');
    expect(result.entries).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it('reports NoBlock when the output contains no JSON at all', () => {
    expect(parseMemoryEntries('just text').failure).toBe(FencedJsonFailure.NoBlock);
  });

  it('reports InvalidJson when the block cannot be parsed', () => {
    expect(parseMemoryEntries('```json\n[ not json ]\n```').failure).toBe(
      FencedJsonFailure.InvalidJson
    );
  });

  it('reads an uppercase ```JSON fence', () => {
    const { entries } = parseMemoryEntries(
      '```JSON\n[{"category":"Library","entryKey":"k","content":"c"}]\n```'
    );
    expect(entries).toHaveLength(1);
  });

  it('reads a bare ``` fence', () => {
    const { entries } = parseMemoryEntries(
      '```\n[{"category":"Library","entryKey":"k","content":"c"}]\n```'
    );
    expect(entries).toHaveLength(1);
  });
});
