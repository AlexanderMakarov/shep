/**
 * Merge Output Parser
 *
 * Extracts structured data (commit SHA, PR URL/number) from agent text output
 * using regex patterns. Falls back gracefully to null when patterns don't match.
 */

// Matches git commit output: [branch SHA] message
// Also matches "Created commit SHA" or "commit SHA" patterns
const COMMIT_SHA_RE = /\[[\w/.-]+\s+([0-9a-f]{7,40})\]|(?:commit\s+)([0-9a-f]{7,40})/i;

// Matches GitHub PR URL: https://github.com/owner/repo/pull/123
const PR_URL_RE = /(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+))/;

export interface PrParseResult {
  url: string;
  number: number;
}

/**
 * `indeterminate` means the agent could not establish CI's verdict at all
 * (rate limit, API error). It is neither a pass nor a failure and must never
 * be collapsed into either.
 */
export type CiWatchParseStatus = 'success' | 'failure' | 'indeterminate';

export interface CiWatchParseResult {
  status: CiWatchParseStatus;
  summary?: string;
  runUrl?: string;
}

/**
 * Leading noise allowed before the CI_STATUS marker on its own line:
 * indentation, a markdown list bullet, a blockquote arrow, emphasis.
 *
 * The marker is anchored to the start of the line on purpose. The ci-watch
 * prompt asks the agent to summarise which runs failed, so a FAILED line
 * routinely quotes the word PASSED ("3 of 4 runs reported CI_STATUS: PASSED,
 * but lint failed"), and prose that merely restates the instructions must
 * never be read as a verdict.
 */
const CI_STATUS_LINE_PREFIX = String.raw`^[\s>*_-]*CI_STATUS\s*:?\s*`;

/** Separators a model uses between FAILED and its summary: — – - : or none. */
const CI_SUMMARY_SEPARATOR = String.raw`(?:[—–:-]\s*)?`;

// Matches CI_STATUS: PASSED / CI_STATUS: FAILED <sep> <summary>, line-anchored.
const CI_STATUS_PASSED_RE = new RegExp(`${CI_STATUS_LINE_PREFIX}PASSED`, 'i');
const CI_STATUS_FAILED_RE = new RegExp(
  `${CI_STATUS_LINE_PREFIX}FAILED\\s*${CI_SUMMARY_SEPARATOR}(.*)$`,
  'i'
);
const CI_STATUS_INDETERMINATE_RE = new RegExp(
  `${CI_STATUS_LINE_PREFIX}INDETERMINATE\\s*${CI_SUMMARY_SEPARATOR}(.*)$`,
  'i'
);

/** Markdown emphasis characters trimmed off a captured summary. */
const SUMMARY_TRIM_RE = /^[\s*_]+|[\s*_]+$/g;

/** Summary recorded when CI failed but the agent gave no detail. */
const NO_DETAIL_SUMMARY = 'CI failed (no details provided)';

/** Summary recorded when the agent reported INDETERMINATE without detail. */
const INDETERMINATE_SUMMARY = 'CI status could not be read';

/** Summary recorded when no CI_STATUS marker could be found at all. */
const UNDETERMINED_SUMMARY = 'CI status could not be determined from agent output';

// Matches GitHub Actions run URL
const RUN_URL_RE = /(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+)/;

/**
 * Extract the first commit SHA from agent output text.
 * Looks for git commit output format `[branch SHA]` or `commit SHA`.
 * Returns null if no SHA found.
 */
export function parseCommitHash(output: string): string | null {
  const match = output.match(COMMIT_SHA_RE);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

/**
 * Extract the first GitHub PR URL and number from agent output text.
 * Returns null if no PR URL found.
 */
export function parsePrUrl(output: string): PrParseResult | null {
  const match = output.match(PR_URL_RE);
  if (!match) return null;
  return { url: match[1], number: parseInt(match[2], 10) };
}

/**
 * Extract CI watch result from agent output text.
 * Looks for CI_STATUS: PASSED / FAILED / INDETERMINATE markers.
 * When multiple CI_STATUS markers appear, uses the last one.
 * Returns failure with diagnostic summary if no marker found.
 */
export function parseCiWatchResult(output: string): CiWatchParseResult {
  const runUrlMatch = output.match(RUN_URL_RE);
  const runUrl = runUrlMatch ? runUrlMatch[1] : undefined;

  // Split into lines and check from bottom up (last status wins).
  // FAILED is tested BEFORE PASSED on each line: a failing verdict whose
  // summary quotes "PASSED" must resolve to failure, never to success.
  const lines = output.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const failedMatch = line.match(CI_STATUS_FAILED_RE);
    if (failedMatch) {
      const summary = failedMatch[1]?.replace(SUMMARY_TRIM_RE, '') || NO_DETAIL_SUMMARY;
      return { status: 'failure', summary, runUrl };
    }
    const indeterminateMatch = line.match(CI_STATUS_INDETERMINATE_RE);
    if (indeterminateMatch) {
      const summary = indeterminateMatch[1]?.replace(SUMMARY_TRIM_RE, '') || INDETERMINATE_SUMMARY;
      return { status: 'indeterminate', summary, runUrl };
    }
    if (CI_STATUS_PASSED_RE.test(line)) {
      return { status: 'success', runUrl };
    }
  }

  return {
    status: 'failure',
    summary: UNDETERMINED_SUMMARY,
    runUrl,
  };
}
