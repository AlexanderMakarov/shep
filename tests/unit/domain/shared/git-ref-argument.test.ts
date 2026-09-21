// @vitest-environment node

/**
 * Git ref argument guard unit tests.
 *
 * `git check-ref-format 'refs/heads/--upload-pack=x'` exits 0 and
 * `adopt-branch.use-case.ts` stores a branch name verbatim, so a ref that
 * begins with `-` reaches git's argv and is parsed as an option. Verified
 * against git 2.53.0: `git pull origin --upload-pack=/tmp/fake` executes an
 * arbitrary local binary, and no separator prevents it — `git pull` forwards
 * option-shaped operands to fetch even after `--`. Rejecting the ref is
 * therefore the primary defence, not a nicety.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import {
  assertSafeGitRef,
  isSafeGitRef,
  UnsafeGitRefError,
} from '@/domain/shared/git-ref-argument.js';

describe('isSafeGitRef', () => {
  it.each([
    'main',
    'master',
    'feat/my-feature',
    'release/v1.2.3',
    'origin/main',
    'HEAD',
    'a1b2c3d4',
    'feat/x$(touch proof)',
  ])('accepts %j', (ref) => {
    expect(isSafeGitRef(ref)).toBe(true);
  });

  it.each([
    ['an --upload-pack payload', '--upload-pack=/tmp/fake-up'],
    ['an --orphan payload', '--orphan=x'],
    ['a --delete flag', '--delete'],
    ['an --all flag', '--all'],
    ['a short flag', '-f'],
    ['a bare double dash', '--'],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('rejects %s', (_label, ref) => {
    expect(isSafeGitRef(ref)).toBe(false);
  });

  it('rejects a ref that only looks safe after trimming', () => {
    expect(isSafeGitRef(' --upload-pack=x')).toBe(false);
  });
});

describe('assertSafeGitRef', () => {
  it('returns the ref unchanged when it is safe', () => {
    expect(assertSafeGitRef('feat/x', 'branch')).toBe('feat/x');
  });

  it('throws UnsafeGitRefError for an option-shaped ref', () => {
    expect(() => assertSafeGitRef('--upload-pack=x', 'baseBranch')).toThrow(UnsafeGitRefError);
  });

  it('names the offending parameter and value in the message', () => {
    expect(() => assertSafeGitRef('--orphan=x', 'baseBranch')).toThrow(/baseBranch.*--orphan=x/s);
  });
});
