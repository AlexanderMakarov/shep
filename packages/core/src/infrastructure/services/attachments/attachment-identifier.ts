/**
 * Attachment identifier validation.
 *
 * Attachment directories are named after caller-supplied ids:
 * `~/.shep/attachments/pending-<sessionId>` and
 * `~/.shep/attachments/pm/<workItemId>`. The filename inside was sanitised;
 * the id never was. The `pending-` prefix does not help, because
 * `pending-..` is still a poppable segment — a sessionId of
 * `"../../../../.config/systemd/user"` resolved to `~/.config/systemd/user`,
 * which was then `mkdir -p`'d and written into.
 *
 * Ids therefore have to be a single, safe path segment. The rule is
 * deliberately wider than "UUID" because legitimate ids in the product are
 * not all UUIDs — the onboarding flow uses `onboarding` and the chat tab uses
 * `chat-<featureId>` — but it admits nothing that can traverse, hide, or
 * escape the attachments directory.
 */

/** Longest id accepted; comfortably above a UUID or `chat-<uuid>`. */
export const MAX_IDENTIFIER_LENGTH = 128;

/**
 * One path segment: starts alphanumeric, then alphanumerics, dot, hyphen or
 * underscore. No separators, no leading dot, no NUL, and `.`/`..` cannot
 * match because both start with a dot.
 */
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * True when `value` is safe to use as a single directory-name component.
 */
export function isSafePathSegment(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return false;
  return SAFE_SEGMENT_PATTERN.test(value);
}

/** Validate an attachment upload session id before it names a directory. */
export function isValidAttachmentSessionId(value: unknown): value is string {
  return isSafePathSegment(value);
}

/** Validate a project-management work item id before it names a directory. */
export function isValidWorkItemId(value: unknown): value is string {
  return isSafePathSegment(value);
}

/** Validate a feature slug before it names an attachment directory. */
export function isValidAttachmentSlug(value: unknown): value is string {
  return isSafePathSegment(value);
}
