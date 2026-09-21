/**
 * Canonical separator form for a repository path.
 *
 * Windows dialogs and APIs hand back `C:\Users\dev\project` while git and most
 * Node APIs produce `C:/Users/dev/project`, so the same repository can reach
 * the database spelled two ways. The project rule is to STORE the forward-slash
 * form; this function is that rule, in one place.
 *
 * Why it matters beyond tidiness: the queries used to compensate at read time
 * with `REPLACE(repository_path, '\', '/') = ?`. Wrapping an indexed column in
 * a function makes its index unusable, so a feature lookup by branch visited
 * every live row. Normalising on the way IN lets the column be compared —
 * and therefore indexed — directly.
 *
 * Note the import convention for `domain/`: this module has no imports at all
 * and performs no I/O, which is what makes it a legitimate inhabitant of
 * `domain/shared/` (see absolute-path.ts).
 */

/**
 * Converts every backslash to a forward slash.
 *
 * Idempotent, and safe for an already-normalised path.
 *
 * @param path - A repository path in either separator form.
 * @returns The same path spelled with forward slashes.
 */
export function normalizeRepositoryPath(path: string): string {
  return path.replace(/\\/g, '/');
}
