/**
 * Content Sanitizer
 *
 * Sanitizes outbound messages to ensure no sensitive content
 * (file paths, environment variables, code blocks, secrets)
 * is transmitted through third-party messaging platforms.
 *
 * Security requirement FR-6: no source code, diffs, or file
 * contents transmitted through messaging platforms.
 *
 * The secret stripping is the shared table from
 * `domain/aspm/redactor/secret-patterns.ts`, not a second set of regexes:
 * this used to document secret removal it did not implement, because
 * `[A-Z_]{3,}=\S+` catches `API_KEY=…` and misses every bare token shape
 * (`sk-ant-…`, `ghp_…`, `AKIA…`) — on the egress path to Telegram/WhatsApp,
 * over raw agent output.
 *
 * The table's high-entropy fallback is deliberately excluded (see
 * NAMED_SECRET_PATTERNS): it matches any 32+ character run of
 * `[A-Za-z0-9+/_-]`, which ordinary branch and feature names reach, and a
 * notification whose body has been replaced by a placeholder is its own
 * defect. A secret in a shape the table does not name is therefore still
 * only covered by the `KEY=value` rule below.
 */

import { redactSecrets } from '../../../domain/aspm/redactor/redact-secrets.js';
import { NAMED_SECRET_PATTERNS } from '../../../domain/aspm/redactor/secret-patterns.js';

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Strip sensitive content from a message before sending to a messaging platform.
 *
 * Removes:
 * - Absolute file paths
 * - Environment variable assignments
 * - Code blocks (fenced with backticks)
 * - Potential secret patterns (API keys, tokens)
 *
 * Truncates to messaging-safe length.
 */
export function sanitizeForMessaging(text: string): string {
  // Secrets first: a token is recognised by its own shape, and the path and
  // code-block rules below would otherwise rewrite the span it lives in and
  // leave the remainder of the secret in place.
  let sanitized = redactSecrets(text, NAMED_SECRET_PATTERNS).redacted;

  // Strip absolute file paths (Unix and Windows)
  sanitized = sanitized.replace(/(?:\/[\w.\-/]+){2,}/g, '[path]');
  sanitized = sanitized.replace(/[A-Z]:\\[\w.\-\\]+/g, '[path]');

  // Strip env-var-like patterns (KEY=value)
  sanitized = sanitized.replace(/[A-Z_]{3,}=\S+/g, '[env]');

  // Strip fenced code blocks
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '[code block]');

  // Strip inline code that looks like file content
  sanitized = sanitized.replace(/`[^`]{100,}`/g, '[code]');

  // Truncate to messaging-safe length
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
  }

  return sanitized;
}
