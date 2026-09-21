// @vitest-environment node

/**
 * Worktree slug unit tests.
 *
 * The slug becomes a real directory name that is later interpolated into
 * shell command templates by the IDE launcher and the "open shell" action.
 * `git check-ref-format 'refs/heads/feat/x$(touch proof)'` exits 0, so a
 * branch name is attacker-controlled shell syntax unless it is sanitized
 * here, at the single point where a branch becomes a path segment.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { toWorktreeSlug } from '@/domain/shared/worktree-slug.js';

/** Every character a POSIX shell or cmd.exe treats as syntax. */
const SHELL_METACHARACTERS = [
  '$',
  '`',
  ';',
  '&',
  '|',
  '<',
  '>',
  '(',
  ')',
  "'",
  '"',
  '^',
  '%',
  '*',
  '?',
  '\n',
  '\r',
  ' ',
];

describe('toWorktreeSlug', () => {
  describe('backward compatibility — ordinary branch names are untouched', () => {
    it.each([
      ['main', 'main'],
      ['feat/my-feature', 'feat-my-feature'],
      ['feat/some/nested/branch', 'feat-some-nested-branch'],
      ['release/v1.2.3', 'release-v1.2.3'],
      ['fix_123', 'fix_123'],
    ])('maps %s to %s with no hash suffix', (branch, expected) => {
      expect(toWorktreeSlug(branch)).toBe(expected);
    });
  });

  describe('shell metacharacters are removed', () => {
    it.each(SHELL_METACHARACTERS)('strips %j from the slug', (char) => {
      const slug = toWorktreeSlug(`feat/x${char}y`);

      expect(slug).not.toContain(char);
    });

    it('neutralizes a command-substitution payload', () => {
      const slug = toWorktreeSlug('feat/x$(touch proof)');

      expect(slug).not.toMatch(/[$()\s]/);
    });

    it('neutralizes a backtick payload', () => {
      const slug = toWorktreeSlug('feat/x`touch proof`');

      expect(slug).not.toMatch(/[`\s]/);
    });

    it('keeps every character inside the safe set', () => {
      const slug = toWorktreeSlug('feat/a b;c&d|e$(f)`g`"h"\'i\'<j>*k?');

      expect(slug).toMatch(/^[A-Za-z0-9._-]+$/);
    });
  });

  describe('sanitized slugs stay distinct', () => {
    it('appends a branch hash when sanitization changed the name', () => {
      const branch = 'feat/a b';
      const expectedSuffix = createHash('sha256').update(branch).digest('hex').slice(0, 8);

      expect(toWorktreeSlug(branch)).toBe(`feat-a-b-${expectedSuffix}`);
    });

    it('does not collide with a branch that already had the sanitized shape', () => {
      expect(toWorktreeSlug('feat/a b')).not.toBe(toWorktreeSlug('feat/a-b'));
    });

    it('gives two different unsafe branches two different slugs', () => {
      expect(toWorktreeSlug('feat/a b')).not.toBe(toWorktreeSlug('feat/a\tb'));
    });

    it('is deterministic', () => {
      expect(toWorktreeSlug('feat/a b')).toBe(toWorktreeSlug('feat/a b'));
    });
  });

  describe('degenerate input', () => {
    it('never returns an empty segment', () => {
      expect(toWorktreeSlug('')).not.toBe('');
    });

    it('never returns a name a shell would read as an option', () => {
      expect(toWorktreeSlug('--upload-pack=x').startsWith('-')).toBe(false);
    });
  });
});
