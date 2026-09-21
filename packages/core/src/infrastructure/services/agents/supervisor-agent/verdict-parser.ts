/**
 * Supervisor Verdict Parser
 *
 * Extracts a structured {@link SupervisorVerdict} + rationale from the
 * supervisor evaluator's free-form text response.
 *
 * This is a governance control — the verdict it returns can auto-resolve a
 * human approval gate for an agent that holds shell access and push rights
 * (see `feature-agent-supervisor-gate-evaluator.ts`). It therefore fails
 * CLOSED rather than guessing:
 *
 * - Only a line that *starts* with a verdict marker counts. Prose that
 *   merely mentions "verdict: approve" while rejecting ("I cannot give
 *   verdict: approve here") is not a verdict.
 * - Repeated identical verdict lines agree and retain that verdict.
 * - Two DIFFERENT verdict lines anywhere means the response is ambiguous —
 *   that escalates to a human instead of picking one.
 * - No verdict line at all keeps the non-binding default, `advise`.
 */

import { SupervisorVerdict } from '../../../../domain/generated/output.js';

/** Verdict used when the model produced no parseable verdict line. */
export const DEFAULT_VERDICT: SupervisorVerdict = SupervisorVerdict.advise;

/** Verdict used when the model emitted conflicting verdict lines. */
export const AMBIGUOUS_VERDICT: SupervisorVerdict = SupervisorVerdict.escalate;

/** Rationale used when the model returned nothing usable. */
export const EMPTY_RATIONALE = 'no rationale supplied';

/** Maximum rationale length persisted on a decision. */
export const MAX_RATIONALE_CHARS = 4000;

/**
 * A verdict declaration at the start of a line.
 *
 * Tolerates markdown emphasis on either side of the label (`**Verdict:**
 * reject`, `*verdict*: reject`), an optional colon (`Verdict reject`), and
 * both `verdict:x` and `verdict: x`.
 */
const VERDICT_LINE_RE = /^\s*[*_]*\s*verdict\s*[*_]*\s*:?\s*[*_]*\s*(\w+)/i;

const KNOWN_VERDICTS = new Set<string>(Object.values(SupervisorVerdict));

export interface ParsedEvaluatorResponse {
  verdict: SupervisorVerdict;
  rationale: string;
}

/**
 * Collect every known verdict declared on its own line, in document order.
 */
function collectVerdictLines(raw: string): SupervisorVerdict[] {
  const found: SupervisorVerdict[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(VERDICT_LINE_RE);
    if (!match) continue;
    const word = match[1].toLowerCase();
    if (KNOWN_VERDICTS.has(word)) found.push(word as SupervisorVerdict);
  }
  return found;
}

/**
 * Resolve the verdict the evaluator actually issued.
 *
 * @returns the single declared verdict, {@link AMBIGUOUS_VERDICT} when the
 *   response declares more than one distinct verdict, or
 *   {@link DEFAULT_VERDICT} when it declares none.
 */
export function resolveVerdict(raw: string): SupervisorVerdict {
  const declared = collectVerdictLines(raw);
  if (declared.length === 0) return DEFAULT_VERDICT;

  const distinct = new Set(declared);
  if (distinct.size > 1) return AMBIGUOUS_VERDICT;

  // Bottom-up convention: with one distinct value the last line is it.
  return declared[declared.length - 1];
}

export function parseEvaluatorResponse(raw: string): ParsedEvaluatorResponse {
  const rationale = raw.trim().slice(0, MAX_RATIONALE_CHARS);
  return {
    verdict: resolveVerdict(raw),
    rationale: rationale.length > 0 ? rationale : EMPTY_RATIONALE,
  };
}
