/**
 * Build Identity Value Object
 *
 * Everything a maintainer needs on the first line of a bug report: which
 * Shep, which Node, which OS, which commit. `shep doctor` is the command
 * users are told to run for a bug report and it printed none of this,
 * because it never resolved `IVersionService` at all.
 *
 * Shared across presentation layers so the CLI, the web UI and anything
 * else render the same string — a maintainer should be able to recognise
 * the format at a glance, whichever surface produced it.
 */

export interface BuildIdentity {
  /** `@shepai/cli` version from package.json. */
  cliVersion: string;
  /** `process.version`, e.g. `v22.5.1`. */
  nodeVersion: string;
  /** `os.platform()`, e.g. `linux`, `darwin`, `win32`. */
  platform: string;
  /** `os.release()`, e.g. `6.8.0-generic`. */
  osRelease: string;
  /** `os.arch()`, e.g. `x64`, `arm64`. */
  arch: string;
  /** Short commit SHA, or `null` when it cannot be determined. */
  gitSha: string | null;
}

/** Printed in place of a SHA that could not be determined. */
export const GIT_SHA_UNAVAILABLE = 'unknown';

/** Length a full 40-character SHA is shortened to. */
export const SHORT_GIT_SHA_LENGTH = 7;

/**
 * Environment variables consulted for the commit SHA, in priority order.
 * `SHEP_GIT_SHA` lets a packaged build bake one in; `GITHUB_SHA` is what
 * GitHub Actions exports.
 */
export const GIT_SHA_ENV_VARS = ['SHEP_GIT_SHA', 'GITHUB_SHA'] as const;

/** Separator between fields of the paste-ready line. */
const FIELD_SEPARATOR = ' · ';

/**
 * One line, no newlines, safe to paste into an issue body verbatim.
 *
 * Example: `shep 1.6.1 · node v22.5.1 · linux 6.8.0-generic x64 · git 3f9a1c2`
 */
export function formatBuildIdentityLine(identity: BuildIdentity): string {
  return [
    `shep ${identity.cliVersion}`,
    `node ${identity.nodeVersion}`,
    `${identity.platform} ${identity.osRelease} ${identity.arch}`,
    `git ${identity.gitSha ?? GIT_SHA_UNAVAILABLE}`,
  ].join(FIELD_SEPARATOR);
}
