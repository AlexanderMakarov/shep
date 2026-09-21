import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMergeNode } from '@/infrastructure/services/agents/feature-agent/nodes/merge/merge.node.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import {
  createGitHarness,
  destroyHarness,
  makeRealExec,
  makeSelectiveExec,
  makeSpecDir,
  buildDeps,
  makeState,
} from './setup.js';
import { GitPrErrorCode } from '@/application/ports/output/services/git-pr-service.interface.js';
import { FAKE_PR_URL } from './fixtures.js';

describe('Merge Step — confirmed remote PR merge', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let harnessToCleanup: string[] = [];

  beforeAll(() => {
    initializeSettings(createDefaultSettings());
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    resetSettings();
  });

  afterEach(() => {
    destroyHarness(harnessToCleanup);
    harnessToCleanup = [];
  });

  it.each(['OPEN', 'MERGED'] as const)(
    'only completes and cleans up when GitHub confirms %s',
    async (remoteState) => {
      const harness = await createGitHarness();
      harnessToCleanup.push(harness.bareDir, harness.cloneDir);
      const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-spec-'));
      harnessToCleanup.push(tempDir);
      const specDir = makeSpecDir(tempDir, ['merge']);
      const realExec = makeRealExec();
      const selectiveExec = makeSelectiveExec(realExec);
      const featureSha = (await harness.runGit(['rev-parse', harness.featureBranch])).stdout.trim();
      const initialBaseSha = (await harness.runGit(['rev-parse', 'main'])).stdout.trim();
      const execFn: typeof realExec = async (file, args, options) => {
        if (file === 'gh' && args[0] === 'pr' && args[1] === 'merge') {
          if (remoteState === 'MERGED') {
            // GitHub advances the remote base; the local checkout is deliberately stale.
            await realExec('git', ['update-ref', 'refs/heads/main', featureSha], {
              cwd: harness.bareDir,
            });
          }
          return { stdout: '', stderr: '' };
        }
        if (file === 'gh' && args.includes('.state')) {
          return { stdout: remoteState, stderr: '' };
        }
        return selectiveExec(file, args, options);
      };
      const { deps, featureRepository } = buildDeps({
        execFn,
        featureBranch: harness.featureBranch,
      });
      const state = makeState({
        repositoryPath: harness.cloneDir,
        worktreePath: harness.cloneDir,
        specDir,
        push: true,
        openPr: true,
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        prUrl: FAKE_PR_URL,
        prNumber: 42,
      });
      const mergeNode = createMergeNode(deps);

      if (remoteState === 'OPEN') {
        await expect(mergeNode(state)).rejects.toMatchObject({ code: GitPrErrorCode.MERGE_FAILED });
        expect(featureRepository.update).not.toHaveBeenCalledWith(
          expect.objectContaining({ lifecycle: 'Maintain' })
        );
        expect(deps.cleanupFeatureWorktreeUseCase.execute).not.toHaveBeenCalled();
        expect((await harness.runGit(['rev-parse', harness.featureBranch])).stdout.trim()).toBe(
          featureSha
        );
      } else {
        await expect(mergeNode(state)).resolves.toMatchObject({ merged: true });
        expect(featureRepository.update).toHaveBeenCalledWith(
          expect.objectContaining({ lifecycle: 'Maintain' })
        );
        expect(deps.cleanupFeatureWorktreeUseCase.execute).toHaveBeenCalledOnce();
        const remoteBase = await realExec('git', ['rev-parse', 'main'], { cwd: harness.bareDir });
        expect(remoteBase.stdout.trim()).toBe(featureSha);
      }
      expect((await harness.runGit(['rev-parse', 'main'])).stdout.trim()).toBe(initialBaseSha);
    }
  );
});
