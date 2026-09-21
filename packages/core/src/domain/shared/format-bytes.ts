/**
 * Human-readable byte sizes.
 *
 * Extracted because four copies of this function had grown across the
 * tree — `cli/commands/settings/show.command.ts`, two web server actions,
 * and every new caller that needed one. Doctor diagnostics and the log
 * prune report need the same rendering, and a size that reads differently
 * depending on which surface printed it is its own small bug.
 */

/** Bytes per binary step. Sizes are KiB/MiB/GiB, labelled KB/MB/GB as the CLI always has. */
export const BYTES_PER_UNIT = 1024;

/** Unit labels, smallest first. */
const UNIT_LABELS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Decimal places used for every unit above bytes. */
const FRACTION_DIGITS = 1;

/**
 * Format a byte count, e.g. `0 B`, `512 B`, `1.5 KB`, `2.0 GB`.
 *
 * Negative and non-finite inputs render as `0 B` rather than producing
 * `NaN GB` in a diagnostic line.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${UNIT_LABELS[0]}`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < UNIT_LABELS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${Math.round(value)} ${UNIT_LABELS[0]}`;
  return `${value.toFixed(FRACTION_DIGITS)} ${UNIT_LABELS[unitIndex]}`;
}
