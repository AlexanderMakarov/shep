/**
 * The shared `ExecFunction` every git / gh / npx / kubectl / docker call goes
 * through (18 services resolve it from the container).
 *
 * POSIX is unchanged and stays that way: `execFile` with an argv array and no
 * shell is already safe, because the arguments never become one string.
 *
 * Windows needs a resolution step. Agent CLIs ship as `.cmd` shims (cursor's
 * `agent.cmd`, `npx.cmd`), and `execFile` without a shell cannot resolve a
 * PATHEXT extension, which is why the old adapter reached for `shell: true`.
 * That is exactly what made the injection possible: with `shell: true`, Node
 * concatenates `file + ' ' + args.join(' ')` and hands the result to cmd.exe
 * with no escaping of its own, so the adapter's hand-rolled quoting was the
 * only thing standing between raw LLM output and a command separator.
 *
 * So the extension is resolved explicitly instead, with the `which` package
 * already used by `binary-exists.ts` (it implements PATHEXT lookup):
 *
 *   - a real executable (`git.exe`) is spawned with its argv array and NO
 *     shell — Node's own CreateProcess quoting applies and there is nothing
 *     left to get wrong;
 *   - a `.cmd` / `.bat` shim must go through cmd.exe, so it is spawned as
 *     `cmd.exe /d /s /c "<command line>"` with `windowsVerbatimArguments`,
 *     where the command line is built by `windows-command-line.ts` rather
 *     than by string concatenation.
 *
 * Resolution is cached per executable name: this function is called for every
 * git invocation and a PATH walk per call would be a real cost.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import which from 'which';
import { IS_WINDOWS } from '../../platform.js';
import { buildWindowsCommandLine } from './windows-command-line.js';
import type { ExecFunction } from '../git/worktree.service.js';

/** Extensions that cmd.exe must interpret; everything else runs directly. */
const SHELL_SCRIPT_EXTENSIONS = ['.cmd', '.bat'];

/** cmd.exe flags: no AutoRun, take the rest of the line as-is, then run it. */
const CMD_FLAGS = ['/d', '/s', '/c'];

/** Fallback when COMSPEC is unset. */
const DEFAULT_COMSPEC = 'cmd.exe';

type ExecFileAsync = (
  file: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

export interface ExecFunctionDeps {
  /** True when the command line will be interpreted by cmd.exe. */
  isWindows: boolean;
  /** Promisified `child_process.execFile`. */
  execFileAsync: ExecFileAsync;
  /** PATH + PATHEXT lookup; resolves to an absolute path or null. */
  resolveExecutable: (file: string) => Promise<string | null>;
  /** Path to cmd.exe. */
  comspec: string;
}

const defaultExecFileAsync = promisify(execFile) as unknown as ExecFileAsync;

const defaultResolveExecutable = async (file: string): Promise<string | null> => {
  try {
    return await which(file, { nothrow: true });
  } catch {
    return null;
  }
};

function isShellScript(resolvedPath: string): boolean {
  const lower = resolvedPath.toLowerCase();
  return SHELL_SCRIPT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Build the `ExecFunction` registered under the `ExecFunction` token.
 *
 * @param overrides - Injection seams for tests; production passes none.
 */
export function createExecFunction(overrides: Partial<ExecFunctionDeps> = {}): ExecFunction {
  const deps: ExecFunctionDeps = {
    isWindows: IS_WINDOWS,
    execFileAsync: defaultExecFileAsync,
    resolveExecutable: defaultResolveExecutable,
    comspec: process.env['ComSpec'] ?? process.env['COMSPEC'] ?? DEFAULT_COMSPEC,
    ...overrides,
  };

  if (!deps.isWindows) {
    return (file, args, options) => deps.execFileAsync(file, args, options);
  }

  const resolutions = new Map<string, Promise<string | null>>();
  const resolveOnce = (file: string): Promise<string | null> => {
    const cached = resolutions.get(file);
    if (cached) return cached;
    const pending = deps.resolveExecutable(file);
    resolutions.set(file, pending);
    return pending;
  };

  return async (file, args, options) => {
    const resolved = await resolveOnce(file);

    if (resolved !== null && isShellScript(resolved)) {
      // cmd.exe with /s strips the outermost pair of quotes and runs the rest
      // verbatim — the same shape Node uses internally for `shell: true`,
      // but with a command line we escaped correctly.
      const commandLine = buildWindowsCommandLine(resolved, args);
      return deps.execFileAsync(deps.comspec, [...CMD_FLAGS, `"${commandLine}"`], {
        ...options,
        windowsVerbatimArguments: true,
        windowsHide: true,
      });
    }

    return deps.execFileAsync(resolved ?? file, args, { ...options, windowsHide: true });
  };
}
