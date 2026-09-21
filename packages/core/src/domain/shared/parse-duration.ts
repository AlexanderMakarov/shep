/**
 * Relative duration parsing, e.g. `7d`, `12h`, `90m`.
 *
 * Shared by `shep logs prune --older-than` and `shep usage --since`, so
 * the two never diverge on what `7d` means or on which units exist.
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Suffix → milliseconds. */
const UNIT_MS: Record<string, number> = {
  s: MS_PER_SECOND,
  m: MS_PER_MINUTE,
  h: MS_PER_HOUR,
  d: MS_PER_DAY,
  w: MS_PER_WEEK,
};

/** Number, then exactly one unit suffix. A bare number is rejected. */
const DURATION_REGEX = /^(\d+(?:\.\d+)?)([smhdw])$/;

/** User-facing description of the accepted syntax. */
export const DURATION_SYNTAX_HINT =
  'Use a number followed by a unit: s (seconds), m (minutes), h (hours), d (days), w (weeks) — e.g. 7d';

/**
 * Parse a relative duration into milliseconds.
 *
 * @returns milliseconds, or `null` when the input is not a positive
 *   duration. A bare number is rejected on purpose: `--older-than 7` is
 *   ambiguous, and guessing "days" is how a prune deletes the wrong files.
 */
export function parseDurationMs(value: string | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = DURATION_REGEX.exec(value.trim().toLowerCase());
  if (match === null) return null;

  const amount = Number(match[1]);
  const unitMs = UNIT_MS[match[2] as string];
  if (!Number.isFinite(amount) || amount <= 0 || unitMs === undefined) return null;
  return amount * unitMs;
}
