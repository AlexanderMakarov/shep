/**
 * Version Service
 *
 * Infrastructure service that reads version information from package.json.
 * Follows Clean Architecture: Infrastructure layer implements data access.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_VERSION_INFO } from '../../domain/value-objects/version-info.js';
import type { VersionInfo } from '../../domain/value-objects/version-info.js';
import {
  GIT_SHA_ENV_VARS,
  SHORT_GIT_SHA_LENGTH,
  type BuildIdentity,
} from '../../domain/value-objects/build-identity.js';

// Re-export for backward compatibility
export type { VersionInfo } from '../../domain/value-objects/version-info.js';

/**
 * Find the root package.json by traversing up from a starting directory.
 * Skips workspace sub-packages (e.g. packages/core/package.json) that lack
 * the required version/name/description fields.
 * Works in both development (src/) and production (dist/) environments.
 */
function findPackageJson(startDir: string): string | null {
  let currentDir = startDir;

  // Traverse up to find package.json (max 10 levels for packages/core depth)
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(currentDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const content = readFileSync(pkgPath, 'utf-8');
        const parsed = JSON.parse(content) as Record<string, unknown>;
        // Only accept package.json with all required fields (skip workspace sub-packages)
        if (
          typeof parsed.version === 'string' &&
          typeof parsed.name === 'string' &&
          typeof parsed.description === 'string'
        ) {
          return pkgPath;
        }
      } catch {
        // Malformed JSON, continue traversing
      }
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }

  return null;
}

/** Max time (ms) the git SHA lookup may block for. */
const GIT_SHA_TIMEOUT_MS = 1000;

/** Arguments that ask git for the short SHA of HEAD. */
const GIT_SHORT_SHA_ARGS = ['rev-parse', '--short', 'HEAD'] as const;

/** Environment shape this service reads — a plain object in tests. */
export type VersionEnvironment = Record<string, string | undefined>;

export interface VersionServiceOptions {
  /** Environment consulted for a baked-in commit SHA. Defaults to `process.env`. */
  env?: VersionEnvironment;
  /**
   * Reads the short SHA from git. Injected so tests never shell out and so
   * a packaged install with no git on PATH degrades to `null` instead of
   * throwing. May throw; the caller treats a throw as "unavailable".
   */
  readGitSha?: () => string;
}

/**
 * Read the short SHA of HEAD from the git checkout this file lives in.
 *
 * Bounded by a timeout and with stderr discarded: a non-repository install
 * must cost a failed exec, not a hung `shep doctor`.
 */
function readGitShaFromCheckout(): string {
  return execFileSync('git', [...GIT_SHORT_SHA_ARGS], {
    cwd: dirname(fileURLToPath(import.meta.url)),
    encoding: 'utf-8',
    timeout: GIT_SHA_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * Service for reading version information from package.json
 */
export class VersionService {
  private readonly versionInfo: VersionInfo;
  private readonly env: VersionEnvironment;
  private readonly readGitSha: () => string;

  constructor(options: VersionServiceOptions = {}) {
    this.versionInfo = this.loadVersionInfo();
    this.env = options.env ?? (process.env as VersionEnvironment);
    this.readGitSha = options.readGitSha ?? readGitShaFromCheckout;
  }

  private loadVersionInfo(): VersionInfo {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const packageJsonPath = findPackageJson(__dirname);

      if (!packageJsonPath) {
        return DEFAULT_VERSION_INFO;
      }

      const content = readFileSync(packageJsonPath, 'utf-8');
      const parsed: unknown = JSON.parse(content);

      // Validate parsed JSON has required fields
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'version' in parsed &&
        'name' in parsed &&
        'description' in parsed &&
        typeof (parsed as Record<string, unknown>).version === 'string' &&
        typeof (parsed as Record<string, unknown>).name === 'string' &&
        typeof (parsed as Record<string, unknown>).description === 'string'
      ) {
        return {
          version: (parsed as Record<string, string>).version,
          name: (parsed as Record<string, string>).name,
          description: (parsed as Record<string, string>).description,
        };
      }

      return DEFAULT_VERSION_INFO;
    } catch {
      // If anything goes wrong, return defaults to keep CLI functional
      return DEFAULT_VERSION_INFO;
    }
  }

  /**
   * Get version information
   */
  getVersion(): VersionInfo {
    return this.versionInfo;
  }

  /**
   * Get the full build identity: CLI version, Node version, OS and commit.
   *
   * This is what `shep doctor` prints at the top so a bug report carries
   * the build it reproduced on. Never throws — every field degrades to a
   * value that reads correctly in the output.
   */
  getBuildIdentity(): BuildIdentity {
    return {
      cliVersion: this.versionInfo.version,
      nodeVersion: process.version,
      platform: platform(),
      osRelease: release(),
      arch: arch(),
      gitSha: this.resolveGitSha(),
    };
  }

  /**
   * Environment first (a packaged build or CI has no git checkout to ask),
   * then git itself. A full 40-character SHA is shortened so the line stays
   * readable.
   */
  private resolveGitSha(): string | null {
    for (const name of GIT_SHA_ENV_VARS) {
      const shortened = shortenSha(this.env[name]);
      if (shortened !== null) return shortened;
    }
    try {
      return shortenSha(this.readGitSha());
    } catch {
      // No git on PATH, not a repository, or the lookup timed out.
      return null;
    }
  }
}

/** Trim and shorten a SHA; `null` when there is nothing usable. */
function shortenSha(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, SHORT_GIT_SHA_LENGTH);
}

/**
 * Set version info as NEXT_PUBLIC environment variables.
 * Must be called BEFORE starting the Next.js web server
 * so the values are available to the web UI.
 */
export function setVersionEnvVars(info: VersionInfo): void {
  process.env.NEXT_PUBLIC_SHEP_VERSION = info.version;
  process.env.NEXT_PUBLIC_SHEP_PACKAGE_NAME = info.name;
  process.env.NEXT_PUBLIC_SHEP_DESCRIPTION = info.description;
  process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH = process.cwd();
  // Branch is intentionally not set in production mode — only dev mode shows it
}
