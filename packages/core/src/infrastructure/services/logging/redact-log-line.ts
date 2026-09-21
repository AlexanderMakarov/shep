/**
 * Redaction for log output.
 *
 * `redactSecrets` and its pattern table already existed and were wired into
 * ASPM findings ingestion ONLY — no logging call site called them, so a
 * `git push https://x-access-token:ghs_…@github.com/o/r` reached
 * `~/.shep/logs/worker-*.log` verbatim. Everything that goes through
 * {@link ConsoleLogger} now goes through here first.
 *
 * Why not the whole pattern table? The `high-entropy-blob` fallback matches
 * any 32+ character run of `[A-Za-z0-9+/_-]`, which is right for opaque
 * scanner payloads and wrong for logs: `/home/ben/Documents/ben-is-a-dev/shep`
 * and `shep/feat-097-add-observability-diagnostics` both reach that length,
 * and a log whose paths have been replaced by `[REDACTED:…]` is a log
 * operators switch off — which loses more secrets than it hides. So this
 * uses NAMED_SECRET_PATTERNS (every provider-specific shape: `gh[pousr]_`,
 * `github_pat_`, `sk-ant-`, `sk-`, JWT, PEM, AWS, GCP, Azure, Slack,
 * Stripe) and buys back the missing coverage with two shape-independent
 * rules that do not fire on prose:
 *
 *   - a `KEY=value` assignment whose key names a credential;
 *   - the `user:password@` userinfo segment of a URL.
 *
 * Known gap, stated rather than papered over: a bare opaque token with no
 * recognisable prefix, not in an assignment and not in a URL, is not
 * matched. Closing that needs a real entropy classifier, not a length rule.
 */

import { redactSecrets } from '../../../domain/aspm/redactor/redact-secrets';
import { NAMED_SECRET_PATTERNS } from '../../../domain/aspm/redactor/secret-patterns';

/** Placeholder substituted for a redacted span. */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Key names that make the value after `=` or `:` a credential. Matched
 * case-insensitively against the tail of the key, so `GITHUB_TOKEN`,
 * `api_key` and `x-auth-secret` all qualify.
 */
const SECRET_KEY_WORDS = [
  'token',
  'secret',
  'password',
  'passwd',
  'apikey',
  'api_key',
  'auth',
  'credential',
  'private_key',
] as const;

/** Minimum length of a value worth masking — shorter values are placeholders. */
const MIN_REDACTABLE_VALUE_LENGTH = 6;

/**
 * `KEY=value` / `KEY: value` where KEY names a credential. The key is kept
 * so the line still says WHICH variable was set.
 */
const SECRET_ASSIGNMENT_REGEX = new RegExp(
  `([A-Za-z0-9_.\\-]*(?:${SECRET_KEY_WORDS.join('|')})[A-Za-z0-9_.\\-]*)` +
    `(\\s*[:=]\\s*)(["']?)(?!\\[REDACTED)([^\\s"',;]{${MIN_REDACTABLE_VALUE_LENGTH},})\\3`,
  'gi'
);

/**
 * The `user:password@` segment of a URL. The username is kept.
 *
 * The negative lookahead stops this rule from overwriting a placeholder a
 * named pattern already wrote: `https://x-access-token:[REDACTED:github-…]@`
 * must keep the pattern name, which is the audit signal.
 */
const URL_USERINFO_REGEX = /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):(?!\[REDACTED)([^\s/@]+)@/gi;

/** Guard against unbounded recursion when walking a meta object. */
const MAX_META_DEPTH = 6;

/**
 * Mask every secret this module can recognise in a single log line.
 */
export function redactLogLine(input: string): string {
  if (input.length === 0) return '';

  let output = redactSecrets(input, NAMED_SECRET_PATTERNS).redacted;
  output = output.replace(URL_USERINFO_REGEX, `$1$2:${REDACTED_PLACEHOLDER}@`);
  output = output.replace(
    SECRET_ASSIGNMENT_REGEX,
    (_match, key: string, separator: string, quote: string) =>
      `${key}${separator}${quote}${REDACTED_PLACEHOLDER}${quote}`
  );
  return output;
}

/**
 * Apply {@link redactLogLine} to every string reachable in a structured
 * meta object. Non-string values are returned as they are; cycles are
 * replaced with a marker so a self-referential object cannot hang the
 * logger.
 */
export function redactLogMeta(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (meta === undefined) return undefined;
  return redactValue(meta, 0, new WeakSet()) as Record<string, unknown>;
}

/** Marker used in place of a value that would recurse forever. */
const CYCLE_MARKER = '[Circular]';
/** Marker used in place of a value nested deeper than {@link MAX_META_DEPTH}. */
const DEPTH_MARKER = '[Truncated]';

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactLogLine(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_META_DEPTH) return DEPTH_MARKER;
  if (seen.has(value)) return CYCLE_MARKER;

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }
  if (value instanceof Error) {
    return redactLogLine(value.stack ?? value.message);
  }
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactValue(nested, depth + 1, seen);
  }
  return out;
}
