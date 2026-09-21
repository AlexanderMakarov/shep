/**
 * Path containment helpers.
 *
 * `resolved.startsWith(root)` is the bug this module exists to prevent: it
 * accepts `<root>-evil` as if it were inside `<root>`. Every containment
 * check appends `path.sep` first, the same way `resolveInside()` does in
 * `node-application-file-system.service.ts`.
 */

import { resolve, sep } from 'node:path';

/** Windows paths are case-insensitive, so the comparison must be too. */
const IS_CASE_INSENSITIVE_FS = process.platform === 'win32';

function forComparison(value: string): string {
  return IS_CASE_INSENSITIVE_FS ? value.toLowerCase() : value;
}

/** Canonical form of a root, always ending in the path separator. */
export function rootWithSeparator(root: string): string {
  const absolute = resolve(root);
  return absolute.endsWith(sep) ? absolute : absolute + sep;
}

/**
 * Is `candidate` inside `root`?
 *
 * Lexical only — the caller is responsible for canonicalising symlinks with
 * `realpath` first when that matters.
 *
 * @param allowRootItself - when true, the root path itself counts as inside.
 */
export function isPathInsideRoot(
  candidate: string,
  root: string,
  allowRootItself = false
): boolean {
  const absoluteCandidate = forComparison(resolve(candidate));
  const absoluteRoot = forComparison(resolve(root));

  if (allowRootItself && absoluteCandidate === absoluteRoot) {
    return true;
  }

  return absoluteCandidate.startsWith(forComparison(rootWithSeparator(root)));
}

/** Is `candidate` inside any of `roots`? */
export function isPathInsideAnyRoot(
  candidate: string,
  roots: string[],
  allowRootItself = false
): boolean {
  return roots.some((root) => isPathInsideRoot(candidate, root, allowRootItself));
}

/**
 * Split a platform path list (`:` on POSIX, `;` on Windows) into absolute
 * roots, dropping blank entries.
 */
export function parseRootsList(raw: string | undefined): string[] {
  const separator = process.platform === 'win32' ? ';' : ':';
  return (raw ?? '')
    .split(separator)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => resolve(entry));
}
