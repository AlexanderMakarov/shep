/**
 * Consent gate for a repository's committed `.shep/dev.json`.
 *
 * The reader's own header names the threat — "UNTRUSTED input: it arrives via
 * `git pull` from anyone with commit access" — and the file's `command`,
 * `setupCommands` and `packageManager` reach three `shell: true` spawns,
 * one of them `detached: true` so it outlives shep. Tier zero also outranks
 * the entire detector chain, so a repository whose real dev server is an
 * ordinary `npm run dev` can silently redirect the "start dev server" button.
 * `cwd` being confined and `expectedPort` being range-checked does nothing
 * about any of that: the command was never validated, because a command
 * cannot be validated. It can only be shown to a person and agreed to.
 *
 * So the file is treated as a REQUEST rather than a directive. A command runs
 * only after an explicit approval recorded for that repository AND that exact
 * command fingerprint; editing the command — or adding a setup command —
 * invalidates the approval and asks again. Until then the reader returns
 * `null` and the caller falls through to the detector chain, which derives
 * its command from lockfiles and manifests rather than from a committed
 * string. That is the same "any doubt returns null" contract the reader
 * already had (NFR-4), so no caller needs to change.
 *
 * The record lives in `<shepHome>/approvals/repo-dev-config.json`, owner-only,
 * keyed by repository path. It is deliberately outside the repository: a
 * marker committed next to the file it authorises would be written by the
 * same `git pull`.
 */

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { toComparablePath } from '@/domain/shared/path-confinement.js';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';
import { createDeploymentLogger } from './deployment-logger.js';

/** Directory under the shep home that holds consent records. */
const APPROVALS_DIR = 'approvals';

/** File holding every approved repository + command fingerprint. */
const APPROVALS_FILE = 'repo-dev-config.json';

/** Owner-only: this file records what the user agreed to execute. */
const APPROVALS_FILE_MODE = 0o600;

/** Owner-only directory for the same reason. */
const APPROVALS_DIR_MODE = 0o700;

/** Hex characters kept from the fingerprint digest. */
const FINGERPRINT_LENGTH = 16;

const log = createDeploymentLogger('[repoDevConfigApproval]');

/** The parts of a dev config that actually get executed. */
export interface ExecutableDevConfig {
  command: string;
  cwd: string;
  setupCommands?: readonly string[];
  packageManager?: string;
}

/** Decides whether a given repository + command fingerprint may run. */
export interface RepoDevConfigApprovalGate {
  isApproved(repoPath: string, fingerprint: string): boolean;
}

/**
 * Fingerprint of everything in the document that will be executed.
 *
 * Descriptive fields (`language`, `framework`, `expectedPort`) are excluded
 * deliberately: re-prompting because someone corrected a label trains people
 * to approve without reading, which is the failure mode this gate exists to
 * avoid.
 */
export function computeRepoDevConfigFingerprint(config: ExecutableDevConfig): string {
  const executable = {
    command: config.command,
    cwd: toComparablePath(config.cwd),
    setupCommands: [...(config.setupCommands ?? [])],
    packageManager: config.packageManager ?? null,
  };

  return createHash('sha256')
    .update(JSON.stringify(executable))
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

/** Absolute path to the approvals file. */
function approvalsFilePath(): string {
  return join(getShepHomeDir(), APPROVALS_DIR, APPROVALS_FILE);
}

/** Repository key: canonical enough to survive separator and case differences. */
function repoKey(repoPath: string): string {
  return toComparablePath(repoPath);
}

type ApprovalRecord = Record<string, string[]>;

/** Read the record, degrading to "nothing approved" on any problem. */
function readApprovals(): ApprovalRecord {
  try {
    const parsed: unknown = JSON.parse(readFileSync(approvalsFilePath(), 'utf-8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const record: ApprovalRecord = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        record[key] = value.filter((entry): entry is string => typeof entry === 'string');
      }
    }
    return record;
  } catch {
    // Absent or unreadable — nothing has been approved.
    return {};
  }
}

/** Write the record owner-only, creating the directory on first use. */
function writeApprovals(record: ApprovalRecord): void {
  const filePath = approvalsFilePath();
  mkdirSync(join(getShepHomeDir(), APPROVALS_DIR), {
    recursive: true,
    ...(platform() === 'win32' ? {} : { mode: APPROVALS_DIR_MODE }),
  });
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');

  if (platform() === 'win32') return;
  try {
    chmodSync(filePath, APPROVALS_FILE_MODE);
  } catch {
    // Filesystem does not support mode changes — the record is still correct.
  }
}

/** The persisted gate used when a caller does not inject one. */
export function createRepoDevConfigApprovalGate(): RepoDevConfigApprovalGate {
  return {
    isApproved(repoPath: string, fingerprint: string): boolean {
      return (readApprovals()[repoKey(repoPath)] ?? []).includes(fingerprint);
    },
  };
}

/**
 * Record consent for one repository + command fingerprint.
 *
 * The caller validates the document first — this module never parses it, so
 * the dependency runs one way only (reader → approval).
 */
export function recordRepoDevConfigApproval(repoPath: string, fingerprint: string): void {
  const record = readApprovals();
  const key = repoKey(repoPath);
  const existing = record[key] ?? [];

  if (!existing.includes(fingerprint)) {
    record[key] = [...existing, fingerprint];
    writeApprovals(record);
  }

  log.info(`approved ${fingerprint} for ${repoPath}`);
}
