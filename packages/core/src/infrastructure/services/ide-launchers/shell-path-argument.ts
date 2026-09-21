/**
 * Embedding a filesystem path inside a shell command string.
 *
 * Several tool metadata templates are whole shell command lines with a
 * `{dir}` placeholder (`cd {dir} && exec claude`) and are spawned with
 * `shell: true`. Substituting a raw path there is a command injection: a
 * worktree directory derived from a branch named `feat/x$(touch proof)`
 * executes the substitution before the `cd` it was attached to.
 *
 * Two rules, both needed:
 *
 * 1. **Refuse what cannot be embedded safely.** Six shipped templates nest a
 *    second shell (`x-terminal-emulator -e bash -c 'cd {dir} && exec X'`).
 *    Quoting cannot help there — substituting `'…'` into an already-quoted
 *    template closes the template's own quote and leaves the path bare, which
 *    was verified to still execute a `$(…)` payload. So a path containing
 *    shell syntax is rejected with a clear message rather than guessed at.
 * 2. **Quote what is left.** Ordinary paths still contain spaces
 *    (`C:\\Users\\My User`), so the accepted path is quoted for the platform's
 *    shell: single quotes on POSIX, double quotes on cmd.exe (which does not
 *    understand single quotes).
 *
 * `toWorktreeSlug` already keeps shep's own worktree paths inside the safe
 * set; this guard covers every other path that reaches the launcher.
 */

/**
 * Characters permitted in a path that will be embedded in a shell template:
 * letters, digits, space, and the punctuation real paths need. Everything
 * else — `$ \` ; & | < > ( ) ' " ^ % * ? { } [ ] ! ~ #`, newlines, NUL — is
 * shell syntax somewhere and is refused.
 */
const SHELL_EMBEDDABLE_PATH = /^[A-Za-z0-9 _.\-/\\:@+,=]+$/;

/** Quote character used by POSIX shells. */
const POSIX_QUOTE = "'";

/** Quote character understood by cmd.exe and PowerShell. */
const WINDOWS_QUOTE = '"';

/** True when the path can be embedded in a shell command string at all. */
export function isShellEmbeddablePath(path: string): boolean {
  return path.length > 0 && SHELL_EMBEDDABLE_PATH.test(path);
}

/**
 * Quote a path for embedding in a shell command string.
 *
 * Callers MUST have checked {@link isShellEmbeddablePath} first — this
 * function assumes the path holds no quote characters of its own, which is
 * what makes the quoting total rather than best-effort.
 *
 * @param path - A path that passed {@link isShellEmbeddablePath}.
 * @param isWindows - True when the command string will be run by cmd.exe.
 */
export function quoteShellPath(path: string, isWindows: boolean): string {
  const quote = isWindows ? WINDOWS_QUOTE : POSIX_QUOTE;
  return `${quote}${path}${quote}`;
}
