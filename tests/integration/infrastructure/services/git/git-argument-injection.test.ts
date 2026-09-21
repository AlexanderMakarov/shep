/**
 * Integration: a branch name must never be parsed as a git option (H11)
 *
 * Every assertion runs REAL git against a REAL repository — the behaviour
 * being defended against is git's own argument parsing, which no mock
 * reproduces faithfully.
 *
 * Verified against git 2.53.0 before the fix:
 *   git fetch origin --upload-pack=<script>  → EXECUTED <script>
 *   git pull  origin --upload-pack=<script>  → EXECUTED <script>
 *   git checkout --orphan=inj                → "Switched to a new branch 'inj'"
 *   git push origin --delete                 → parsed as an option
 *   git branch --list --all                  → listed every branch
 *
 * The `--upload-pack` case is arbitrary local binary execution, and it
 * survives a `--` separator on `git pull`, which hands option-shaped
 * operands to fetch regardless. So the guard rejects the ref outright; the
 * `--` separators added alongside are defence in depth.
 *
 * Each test gets its own repository: an injection that half-succeeds leaves
 * the repo on an unborn orphan branch, and a shared fixture then makes the
 * next test pass for the wrong reason.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import { noopWorktreeHookRunner } from '@tests/helpers/worktree-hook-runner.stub.js';

import { GitPrService } from '../../../../../packages/core/src/infrastructure/services/git/git-pr.service.js';
import { WorktreeService } from '../../../../../packages/core/src/infrastructure/services/git/worktree.service.js';
import { GitForkService } from '../../../../../packages/core/src/infrastructure/services/git/git-fork.service.js';
import type { ExecFunction } from '../../../../../packages/core/src/infrastructure/services/git/worktree.service.js';

const execFileRaw = promisify(execFileCb);

const realExec: ExecFunction = (file, args, options) =>
  execFileRaw(file, args, { encoding: 'utf-8', ...(options ?? {}) });

function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return realExec('git', args, { cwd });
}

/**
 * The guard's own wording. Asserting on it — rather than on "throws" — is
 * what makes these tests discriminating: git fails on an unknown option too,
 * so `rejects.toThrow()` alone passes both before and after the fix.
 */
const REFUSAL = /not a valid git ref argument/;

/** Marker the fake upload-pack writes; its absence is the real assertion. */
const MARKER = 'upload-pack-was-executed';

let workDir: string;
let repoDir: string;
let markerPath: string;
let uploadPackPayload: string;

/** `--upload-pack=<script>`: the shape that executes an arbitrary binary. */
function payload(): string {
  return uploadPackPayload;
}

beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'shep-git-arg-inj-'));
  repoDir = join(workDir, 'repo');
  const originDir = join(workDir, 'origin.git');
  markerPath = join(workDir, MARKER);

  await realExec('git', ['init', '--bare', originDir], { cwd: workDir });
  await realExec('git', ['init', '-b', 'main', repoDir], { cwd: workDir });
  await git(repoDir, ['config', 'user.email', 'test@shep.test']);
  await git(repoDir, ['config', 'user.name', 'Shep Test']);
  await git(repoDir, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(repoDir, 'README.md'), '# injection harness\n');
  await git(repoDir, ['add', '-A']);
  await git(repoDir, ['commit', '-m', 'Initial commit']);
  await git(repoDir, ['branch', 'feature-branch']);
  await git(repoDir, ['remote', 'add', 'origin', originDir]);
  await git(repoDir, ['push', '-u', 'origin', 'main']);

  const fakeUploadPack = join(workDir, 'fake-upload-pack.sh');
  writeFileSync(fakeUploadPack, `#!/bin/sh\ntouch "${markerPath}"\nexit 1\n`, 'utf-8');
  chmodSync(fakeUploadPack, 0o755);
  uploadPackPayload = `--upload-pack=${fakeUploadPack}`;
});

afterEach(() => {
  removeDirWithRetry(workDir);
});

describe('GitPrService refuses option-shaped refs', () => {
  const service = (): GitPrService => new GitPrService(realExec);

  it('does not run an --upload-pack payload through syncMain', async () => {
    await expect(service().syncMain(repoDir, payload())).rejects.toThrow(REFUSAL);

    expect(existsSync(markerPath)).toBe(false);
  });

  it('does not run an --upload-pack payload through localMergeSquash', async () => {
    await expect(
      service().localMergeSquash(repoDir, 'feature-branch', payload(), 'squash commit', true)
    ).rejects.toThrow(REFUSAL);

    expect(existsSync(markerPath)).toBe(false);
  });

  it('does not run an --upload-pack payload through rebaseOnBranch', async () => {
    await expect(service().rebaseOnBranch(repoDir, 'feature-branch', payload())).rejects.toThrow(
      REFUSAL
    );

    expect(existsSync(markerPath)).toBe(false);
  });

  it('does not let --orphan= create a branch through localMergeSquash', async () => {
    await expect(
      service().localMergeSquash(repoDir, 'feature-branch', '--orphan=injected', 'msg', false)
    ).rejects.toThrow(REFUSAL);

    // A successful --orphan checkout leaves HEAD on an unborn branch, which
    // `git branch --list` does not show — so assert on HEAD itself.
    const { stdout } = await git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(stdout.trim()).toBe('main');
  });

  it('refuses an option-shaped branch on push', async () => {
    await expect(service().push(repoDir, '--delete', false)).rejects.toThrow(REFUSAL);
  });

  it('refuses an option-shaped branch on deleteBranch', async () => {
    await expect(service().deleteBranch(repoDir, '--all', false)).rejects.toThrow(REFUSAL);

    const { stdout } = await git(repoDir, ['branch', '--list', '--', 'feature-branch']);
    expect(stdout.trim()).toContain('feature-branch');
  });

  it('refuses an option-shaped ref on revParse', async () => {
    await expect(service().revParse(repoDir, payload())).rejects.toThrow(REFUSAL);
  });

  it('refuses an option-shaped base on getPrDiffSummary', async () => {
    await expect(service().getPrDiffSummary(repoDir, '--output=/tmp/x')).rejects.toThrow(REFUSAL);
  });

  it('refuses an option-shaped base on rebaseOnMain', async () => {
    await expect(service().rebaseOnMain(repoDir, 'feature-branch', payload())).rejects.toThrow(
      REFUSAL
    );

    expect(existsSync(markerPath)).toBe(false);
  });

  it('still performs an ordinary local squash merge', async () => {
    await git(repoDir, ['checkout', 'feature-branch']);
    writeFileSync(join(repoDir, 'feature.txt'), 'feature work\n');
    await git(repoDir, ['add', '-A']);
    await git(repoDir, ['commit', '-m', 'feature work']);
    await git(repoDir, ['checkout', 'main']);

    await service().localMergeSquash(repoDir, 'feature-branch', 'main', 'squashed feature', false);

    const { stdout } = await git(repoDir, ['log', '--oneline', '-1']);
    expect(stdout).toContain('squashed feature');
  });

  it('still pushes an ordinary branch', async () => {
    await expect(service().push(repoDir, 'main', true)).resolves.toBeUndefined();
  });

  it('still reports a diff summary against an ordinary base', async () => {
    await expect(service().getPrDiffSummary(repoDir, 'main')).resolves.toMatchObject({
      commitCount: expect.any(Number),
    });
  });
});

describe('WorktreeService refuses option-shaped refs', () => {
  const service = (): WorktreeService => new WorktreeService(realExec, noopWorktreeHookRunner());

  it('does not let --all make branchExists report a match', async () => {
    expect(await service().branchExists(repoDir, '--all')).toBe(false);
  });

  it('does not let --all make remoteBranchExists report a match', async () => {
    expect(await service().remoteBranchExists(repoDir, '--all')).toBe(false);
  });

  it('still reports a real local branch', async () => {
    expect(await service().branchExists(repoDir, 'feature-branch')).toBe(true);
  });

  it('still reports a real remote branch', async () => {
    expect(await service().remoteBranchExists(repoDir, 'main')).toBe(true);
  });

  it('refuses an option-shaped branch when creating a worktree', async () => {
    await expect(
      service().create(repoDir, '--orphan=injected', join(workDir, 'wt-injected'))
    ).rejects.toThrow(REFUSAL);

    const { stdout } = await git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(stdout.trim()).toBe('main');
  });

  it('refuses an option-shaped branch when adding an existing one', async () => {
    await expect(
      service().addExisting(repoDir, '--orphan=injected', join(workDir, 'wt-existing'))
    ).rejects.toThrow(REFUSAL);
  });

  it('still creates an ordinary worktree', async () => {
    const worktreePath = join(workDir, 'wt-ok');

    const info = await service().create(repoDir, 'wt-ok-branch', worktreePath);

    expect(info.branch).toBe('wt-ok-branch');
    expect(existsSync(worktreePath)).toBe(true);
  });
});

describe('GitForkService refuses option-shaped refs', () => {
  it('does not run an --upload-pack payload through pushToFork', async () => {
    await expect(new GitForkService(realExec).pushToFork(repoDir, payload())).rejects.toThrow(
      REFUSAL
    );

    expect(existsSync(markerPath)).toBe(false);
  });

  it('still pushes an ordinary branch to the fork', async () => {
    await expect(new GitForkService(realExec).pushToFork(repoDir, 'main')).resolves.toBeUndefined();
  });
});
