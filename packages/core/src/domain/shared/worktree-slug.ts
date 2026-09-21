/**
 * Branch name → worktree directory segment.
 *
 * A worktree path is not just a path. It is interpolated into shell command
 * templates by `json-driven-ide-launcher.service.ts` (`cd {dir} && exec claude`)
 * and by the web "open shell" action, and it is passed as a positional
 * argument to `git worktree add`. The branch it is derived from is untrusted:
 * `git check-ref-format 'refs/heads/feat/x$(touch proof)'` exits 0, the name
 * is stored verbatim from a real repository by `adopt-branch.use-case.ts`, and
 * a command substitution runs BEFORE the `cd` that would have failed.
 *
 * Quoting at the interpolation site is not sufficient on its own: six shipped
 * tool templates nest a second shell (`x-terminal-emulator -e bash -c 'cd {dir}
 * && exec claude'`), and substituting a quoted path into an already-quoted
 * template closes the template's quote and leaves the path bare. So the
 * character set is constrained HERE, at the single point where a branch name
 * becomes a path segment, and the quoting downstream is defence in depth.
 *
 * Compatibility matters as much as safety: an existing worktree lives at the
 * path the old rule produced, and changing the rule for ordinary branches
 * would orphan every one of them. So a branch whose slug is already safe is
 * returned byte-identical to the previous `branch.replace(/\//g, '-')`, and
 * only a branch that actually had to be rewritten gains a short hash of the
 * original name — which also keeps `feat/a b` and `feat/a-b` distinct.
 *
 * Pure function; `node:crypto` only (same as `agent-session-paths.ts`).
 */

import { createHash } from 'node:crypto';

/** Characters allowed in a worktree directory segment. */
const SAFE_SLUG_CHARACTERS = /[^A-Za-z0-9._-]/g;

/** A leading `-` reads as an option and a leading `.` hides the directory. */
const AMBIGUOUS_LEADING_CHARACTER = /^[-.]/;

/** Prefix applied to a slug that would otherwise start ambiguously or be empty. */
const SLUG_FALLBACK_PREFIX = 'wt';

/** Hex characters of the branch hash appended to a rewritten slug. */
const SLUG_HASH_LENGTH = 8;

/**
 * Compute the directory segment for a branch's worktree.
 *
 * @param branch - Git branch name, untrusted.
 * @returns A segment matching `[A-Za-z0-9._-]+` that never starts with `-` or `.`.
 */
export function toWorktreeSlug(branch: string): string {
  const naive = branch.replace(/\//g, '-');
  const safe = naive.replace(SAFE_SLUG_CHARACTERS, '-');

  const guarded =
    safe.length === 0
      ? SLUG_FALLBACK_PREFIX
      : AMBIGUOUS_LEADING_CHARACTER.test(safe)
        ? `${SLUG_FALLBACK_PREFIX}-${safe}`
        : safe;

  if (guarded === naive) return naive;

  const suffix = createHash('sha256').update(branch).digest('hex').slice(0, SLUG_HASH_LENGTH);
  return `${guarded}-${suffix}`;
}
