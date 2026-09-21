/**
 * Draft pull request behaviour.
 *
 * README.md presents the draft PR as a SAFETY CONTROL — "Output lands as a
 * draft PR. Your CI runs before any merge" and "Your safety net is three layers
 * deep: worktree isolation, draft PRs, and your CI pipeline." The prompt that
 * actually creates the PR never passed `--draft`, so every feature PR opened
 * ready-for-review and the documented control did not exist.
 *
 * The exception is deliberate: `gh pr merge` refuses a draft PR, so a run that
 * was told to auto-merge must open a normal PR. In that flow the user has
 * explicitly opted out of the human-review gate the draft state exists to hold.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      readSpecFile: vi.fn().mockReturnValue('name: Test Feature\nsummary: A test feature\n'),
    };
  }
);

import { buildCommitPushPrPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';
import type { PrTarget } from '@/application/services/pr-target-resolution.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function baseState(overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/specs',
    currentNode: 'merge',
    error: null,
    messages: [],
    approvalGates: undefined,
    validationRetries: 0,
    lastValidationTarget: '',
    lastValidationErrors: [],
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    push: true,
    openPr: true,
    evidence: [],
    ...overrides,
  } as FeatureAgentState;
}

const PR_TARGET: PrTarget = {
  targetRepo: 'upstream/repo',
  baseBranch: 'main',
  headRef: 'fork:feat/test',
} as PrTarget;

/** The `gh pr create` line the prompt instructs the agent to run. */
function prCreateLine(prompt: string): string {
  const line = prompt.split('\n').find((l) => l.includes('gh pr create'));
  expect(line, 'prompt should contain a gh pr create command').toBeDefined();
  return line as string;
}

describe('buildCommitPushPrPrompt — draft pull requests', () => {
  it('should open the PR as a draft by default', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');

    expect(prCreateLine(prompt)).toContain('--draft');
  });

  it('should open a draft PR when targeting an upstream fork too', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main', undefined, PR_TARGET);

    expect(prCreateLine(prompt)).toContain('--draft');
  });

  it('should keep the repo, base and head flags alongside --draft', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main', undefined, PR_TARGET);
    const line = prCreateLine(prompt);

    expect(line).toContain('--repo upstream/repo');
    expect(line).toContain('--base main');
    expect(line).toContain('--head fork:feat/test');
  });

  /**
   * `gh pr merge` exits non-zero on a draft PR. Opening one here would break
   * the documented `--allow-merge` flow, so auto-merge runs open a ready PR.
   */
  it('should NOT open a draft when the run is set to auto-merge', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true } }),
      'feat/test',
      'main'
    );

    expect(prCreateLine(prompt)).not.toContain('--draft');
  });

  it('should still open a draft when other gates are auto-approved but merge is not', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false } }),
      'feat/test',
      'main'
    );

    expect(prCreateLine(prompt)).toContain('--draft');
  });

  it('should tell the agent why the PR is a draft, so it does not undo it', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');

    expect(prompt).toMatch(/draft/i);
    expect(prompt).toMatch(/ready for review|gh pr ready/i);
  });
});
