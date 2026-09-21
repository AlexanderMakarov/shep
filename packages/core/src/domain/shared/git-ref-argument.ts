/**
 * Guard for branch/ref names that become positional git arguments.
 *
 * A ref that begins with `-` is parsed by git as an option, not an operand.
 * That is not theoretical: `git check-ref-format 'refs/heads/--upload-pack=x'`
 * exits 0, `adopt-branch.use-case.ts` stores a branch name verbatim from a
 * real repository, and the name flows from there into every git service.
 * Verified against git 2.53.0:
 *
 *   git fetch origin --upload-pack=<script>  → EXECUTED <script>
 *   git pull  origin --upload-pack=<script>  → EXECUTED <script>
 *   git checkout --orphan=x                  → created branch x
 *   git push origin --delete                 → parsed as an option
 *   git branch --list --all                  → listed every branch
 *
 * Why a guard rather than only a `--` separator: a separator is the right
 * answer for `push`, `fetch`, `branch`, `merge`, `rebase` and `worktree`, and
 * those call sites do pass one now. But it is *not* available everywhere.
 * `git checkout -- <x>` and `git diff -- <x>` mean "pathspec", which silently
 * changes what the command does, and `git pull` was measured forwarding
 * option-shaped operands to fetch even with `--` in place — all three
 * separator spellings (`--`, `--end-of-options` before and after the remote)
 * still ran the payload. So rejection at the boundary is the load-bearing
 * defence and the separators are depth.
 *
 * Pure function, no imports — a legitimate inhabitant of `domain/shared/`.
 */

/** Marker used by callers and tests to recognise a refusal. */
export const UNSAFE_GIT_REF_MESSAGE = 'is not a valid git ref argument';

/** Raised when a branch or ref name would be parsed as a git option. */
export class UnsafeGitRefError extends Error {
  constructor(
    readonly parameterName: string,
    readonly value: string
  ) {
    super(
      `${parameterName} ${JSON.stringify(value)} ${UNSAFE_GIT_REF_MESSAGE}: ` +
        `a ref starting with "-" is parsed by git as an option, and an empty ref is meaningless.`
    );
    this.name = 'UnsafeGitRefError';
  }
}

/**
 * True when `ref` is safe to pass to git as a positional argument.
 *
 * Deliberately narrow: this rejects the option shape and nothing else.
 * Shell metacharacters are irrelevant here because every git call site uses
 * `execFile` with an argv array, never a shell — the worktree *path* derived
 * from a branch is the shell concern, and `domain/shared/worktree-slug.ts`
 * owns that one.
 */
export function isSafeGitRef(ref: string): boolean {
  return ref.trim().length > 0 && !ref.trimStart().startsWith('-');
}

/**
 * Return `ref` when it is safe, otherwise throw {@link UnsafeGitRefError}.
 *
 * @param ref - The branch or ref name, untrusted.
 * @param parameterName - Name of the parameter, so the message says which.
 */
export function assertSafeGitRef(ref: string, parameterName: string): string {
  if (!isSafeGitRef(ref)) throw new UnsafeGitRefError(parameterName, ref);
  return ref;
}
