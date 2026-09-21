/**
 * DependencyInstaller — async, log-streamed package install.
 *
 * Runs a package manager's `install` non-interactively via an async
 * `spawn` (never `execFileSync`/`execSync`, so it never blocks the event
 * loop), streams every stdout/stderr line to a caller-supplied callback as
 * it arrives, and resolves with a summary once the process exits.
 *
 * This class does NOT persist anything: hash *stamping* (recording that an
 * install succeeded for a given `computeInstallHash()` value) is the
 * responsibility of the caller — the `install_deps` graph node — which
 * writes the stamp via the run-plan repository only after `install()`
 * resolves `success: true`.
 *
 * SECURITY: `packageManager` is untrusted. It can arrive from a repository's
 * committed `.shep/dev.json`, i.e. from anyone with commit access, and with
 * `shell: true` Node joins the file and its args into a single shell line —
 * so `"true; touch INJECTED; #"` executed (verified with a real subprocess).
 * It is therefore matched against a closed allowlist before any spawn, the
 * same way `node-project-build.service.ts` derives its manager from a
 * lockfile allowlist. `shell: true` itself stays: on Windows every package
 * manager is a `.cmd` shim that `spawn` cannot resolve without it, and with
 * the allowlist in place the command word is one of four constants.
 *
 * Lifecycle scripts are disabled for the same reason: `npm install` on an
 * untrusted repository runs that repository's `postinstall` script.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { buildDevServerEnv } from './dev-server-env.js';
import { createLineSplitter } from './line-splitter.js';
import { IS_WINDOWS } from '../../platform.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TAIL_LINES = 50;

/** The only package managers this installer will ever spawn. */
const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;

type SupportedPackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number];

/** Flag that disables lifecycle scripts, for the managers that accept it. */
const IGNORE_SCRIPTS_FLAG = '--ignore-scripts';

export interface InstallResult {
  success: boolean;
  exitCode: number | null;
  tail: string[];
}

export interface DependencyInstallerDeps {
  spawn: typeof spawn;
}

const defaultDeps: DependencyInstallerDeps = { spawn };

/** True when `value` is one of the managers we are willing to run. */
function isSupportedPackageManager(value: string): value is SupportedPackageManager {
  return (SUPPORTED_PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/**
 * Build the non-interactive install args for a supported package manager.
 *
 * No `default:` branch by construction — the parameter type is the allowlist,
 * so adding a manager is a compile error until its args are written down.
 *
 * Yarn is the exception to `--ignore-scripts`: Yarn Berry rejects it as an
 * unknown option and would fail the install outright, so yarn's lifecycle
 * scripts are disabled through the environment instead
 * (see {@link buildInstallEnvOverrides}).
 */
function buildInstallArgs(packageManager: SupportedPackageManager): string[] {
  switch (packageManager) {
    case 'npm':
      return ['install', '--no-audit', '--no-fund', IGNORE_SCRIPTS_FLAG];
    case 'pnpm':
      return ['install', IGNORE_SCRIPTS_FLAG];
    case 'yarn':
      return ['install', '--non-interactive'];
    case 'bun':
      return ['install', IGNORE_SCRIPTS_FLAG];
  }
}

/**
 * Environment overrides for the install.
 *
 * `YARN_ENABLE_SCRIPTS=false` is Berry's switch and `YARN_IGNORE_SCRIPTS=true`
 * is Classic's (`YARN_*` maps onto yarn 1's npm-style config), so both are set
 * and whichever yarn is present honours its own.
 */
function buildInstallEnvOverrides(packageManager: SupportedPackageManager): Record<string, string> {
  if (packageManager !== 'yarn') return { CI: '1' };
  return { CI: '1', YARN_ENABLE_SCRIPTS: 'false', YARN_IGNORE_SCRIPTS: 'true' };
}

export class DependencyInstaller {
  private readonly deps: DependencyInstallerDeps;

  constructor(deps: Partial<DependencyInstallerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * Run `<packageManager> install` (non-interactive) in `dir`, streaming
   * every output line to `onLogLine`. Never rejects — spawn errors,
   * non-zero exits, and timeouts all resolve with `success: false`.
   */
  install(
    dir: string,
    packageManager: string,
    onLogLine: (line: string) => void,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<InstallResult> {
    if (!isSupportedPackageManager(packageManager)) {
      const message =
        `"${packageManager}" is not a supported package manager — refusing to run it. ` +
        `Supported: ${SUPPORTED_PACKAGE_MANAGERS.join(', ')}.`;
      onLogLine(message);
      return Promise.resolve({ success: false, exitCode: null, tail: [message] });
    }

    return new Promise((resolve) => {
      const tail: string[] = [];
      let settled = false;

      const capture = (line: string): void => {
        tail.push(line);
        if (tail.length > MAX_TAIL_LINES) {
          tail.shift();
        }
        onLogLine(line);
      };

      const finish = (result: InstallResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      let child: ChildProcess;
      try {
        child = this.deps.spawn(packageManager, buildInstallArgs(packageManager), {
          shell: true,
          cwd: dir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: buildDevServerEnv(process.env, buildInstallEnvOverrides(packageManager)),
          ...(IS_WINDOWS ? { windowsHide: true } : {}),
        });
      } catch (err) {
        capture(`spawn threw: ${(err as Error).message}`);
        resolve({ success: false, exitCode: null, tail: [...tail] });
        return;
      }

      const stdoutSplitter = createLineSplitter(capture);
      const stderrSplitter = createLineSplitter(capture);

      child.stdout?.on('data', (chunk: Buffer) => stdoutSplitter.push(chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => stderrSplitter.push(chunk.toString()));

      const timer = setTimeout(() => {
        stdoutSplitter.flush();
        stderrSplitter.flush();
        capture(`Install timed out after ${timeoutMs}ms — killing process`);
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may already be dead.
        }
        finish({ success: false, exitCode: null, tail: [...tail] });
      }, timeoutMs);

      child.on('error', (err) => {
        capture(`spawn error: ${err.message}`);
        finish({ success: false, exitCode: null, tail: [...tail] });
      });

      child.on('close', (code) => {
        stdoutSplitter.flush();
        stderrSplitter.flush();
        finish({ success: code === 0, exitCode: code, tail: [...tail] });
      });
    });
  }
}
