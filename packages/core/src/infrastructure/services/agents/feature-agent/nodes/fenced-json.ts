/**
 * Fenced JSON Extractor
 *
 * Shared helper for pulling a JSON array out of an agent's free-form text
 * output. Every node that asks an agent for structured data gets it back
 * inside a markdown code fence, and the fence is written by a language model,
 * so its exact shape varies run to run.
 */

/** Why extraction produced no array. */
export const FencedJsonFailure = {
  /** No fenced block and no bare JSON array anywhere in the output. */
  NoBlock: 'no-block',
  /** A candidate payload was found but it is not valid JSON. */
  InvalidJson: 'invalid-json',
  /** Valid JSON was found, but it is not an array. */
  NotAnArray: 'not-an-array',
} as const;

export type FencedJsonFailure = (typeof FencedJsonFailure)[keyof typeof FencedJsonFailure];

export interface FencedJsonResult {
  /**
   * True when a JSON array was located and parsed.
   *
   * `found: true` with `items: []` means the agent explicitly reported an
   * empty list. `found: false` means we could not read its answer at all —
   * a very different thing, and the reason this helper exists.
   */
  found: boolean;
  /** The parsed array; always empty when `found` is false. */
  items: unknown[];
  /** Set when `found` is false. */
  failure?: FencedJsonFailure;
}

/**
 * A markdown code fence and its payload.
 *
 * Tolerates every shape a model produces: any (or no) language tag
 * (```json, ```JSON, ```jsonc, ```), a payload on the same line as the
 * opening fence, and a closing fence with no preceding newline.
 */
const FENCED_BLOCK_RE = /```[ \t]*[A-Za-z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g;

/** Parse `text` and return it only if it is a JSON array. */
function parseJsonArray(text: string): { items: unknown[] } | { failure: FencedJsonFailure } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { failure: FencedJsonFailure.InvalidJson };
  }
  if (!Array.isArray(parsed)) return { failure: FencedJsonFailure.NotAnArray };
  return { items: parsed };
}

/**
 * Last resort: an unfenced JSON array somewhere in the output.
 * Returns null when there is no bracketed span to try at all.
 */
function rawJsonArrayCandidate(output: string): string | null {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  return output.slice(start, end + 1);
}

/**
 * Extract a JSON array from an agent's free-form output.
 *
 * Tries every fenced block in order, then falls back to a raw JSON scan.
 * The result always states whether an array was actually found, so a caller
 * can tell "the agent reported nothing" from "we could not read the agent".
 */
export function extractFencedJsonArray(output: string): FencedJsonResult {
  let failure: FencedJsonFailure | undefined;

  FENCED_BLOCK_RE.lastIndex = 0;
  for (const match of output.matchAll(FENCED_BLOCK_RE)) {
    const payload = match[1].trim();
    if (payload.length === 0) continue;
    const parsed = parseJsonArray(payload);
    if ('items' in parsed) return { found: true, items: parsed.items };
    failure ??= parsed.failure;
  }

  const raw = rawJsonArrayCandidate(output);
  if (raw !== null) {
    const parsed = parseJsonArray(raw);
    if ('items' in parsed) return { found: true, items: parsed.items };
    failure ??= parsed.failure;
  }

  return { found: false, items: [], failure: failure ?? FencedJsonFailure.NoBlock };
}
