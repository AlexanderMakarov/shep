import { describe, it, expect } from 'vitest';
import {
  parseCommitHash,
  parsePrUrl,
  parseCiWatchResult,
} from '../../../../../../../packages/core/src/infrastructure/services/agents/feature-agent/nodes/merge/merge-output-parser.js';

describe('merge-output-parser', () => {
  describe('parseCommitHash', () => {
    it('should extract full 40-char SHA from git commit output', () => {
      const output =
        '[main abc1234567890abcdef1234567890abcdef1234] feat: add feature\n 3 files changed';
      expect(parseCommitHash(output)).toBe('abc1234567890abcdef1234567890abcdef1234');
    });

    it('should extract short 7-char SHA from abbreviated output', () => {
      const output = 'Created commit abc1234\nSome other output';
      expect(parseCommitHash(output)).toBe('abc1234');
    });

    it('should extract SHA from "git commit" style output line', () => {
      const output = '[feat/test 1a2b3c4] fix: something\n 1 file changed, 2 insertions(+)';
      expect(parseCommitHash(output)).toBe('1a2b3c4');
    });

    it('should return null when no SHA found', () => {
      expect(parseCommitHash('No commit information here')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseCommitHash('')).toBeNull();
    });

    it('should handle multi-line output and pick first SHA', () => {
      const output =
        'Running git commit...\n[main abc1234] feat: first\nSome other stuff\n[main def5678] feat: second';
      expect(parseCommitHash(output)).toBe('abc1234');
    });
  });

  describe('parsePrUrl', () => {
    it('should extract PR URL and number from gh pr create output', () => {
      const output = 'Creating pull request...\nhttps://github.com/owner/repo/pull/42\n';
      const result = parsePrUrl(output);
      expect(result).toEqual({
        url: 'https://github.com/owner/repo/pull/42',
        number: 42,
      });
    });

    it('should handle URL in middle of other output', () => {
      const output = 'Some preamble\nhttps://github.com/my-org/my-repo/pull/123\nDone!';
      const result = parsePrUrl(output);
      expect(result).toEqual({
        url: 'https://github.com/my-org/my-repo/pull/123',
        number: 123,
      });
    });

    it('should return null when no PR URL found', () => {
      expect(parsePrUrl('No PR was created')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parsePrUrl('')).toBeNull();
    });

    it('should handle URLs with complex org/repo names', () => {
      const output = 'https://github.com/shep-ai/shep/pull/88';
      const result = parsePrUrl(output);
      expect(result).toEqual({
        url: 'https://github.com/shep-ai/shep/pull/88',
        number: 88,
      });
    });
  });

  describe('parseCiWatchResult', () => {
    it('should return success for CI_STATUS: PASSED', () => {
      const output = 'All runs completed.\nCI_STATUS: PASSED\nDone.';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('success');
    });

    it('should return failure with summary for CI_STATUS: FAILED', () => {
      const output = 'Run 123 failed.\nCI_STATUS: FAILED — Unit Tests failed with 3 errors\nDone.';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('Unit Tests failed with 3 errors');
    });

    it('should return failure with unknown summary for unparseable output', () => {
      const output = 'Agent did something but no status marker';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('CI status could not be determined from agent output');
    });

    it('should extract run URL from output', () => {
      const output = 'Watching https://github.com/org/repo/actions/runs/12345\nCI_STATUS: PASSED';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('success');
      expect(result.runUrl).toBe('https://github.com/org/repo/actions/runs/12345');
    });

    it('should handle PASSED with extra whitespace', () => {
      const output = 'CI_STATUS:   PASSED  ';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('success');
    });

    it('should handle FAILED without summary after dash', () => {
      const output = 'CI_STATUS: FAILED';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('CI failed (no details provided)');
    });

    it('should return failure for empty string', () => {
      const result = parseCiWatchResult('');
      expect(result.status).toBe('failure');
    });

    it('should extract the last CI_STATUS if multiple appear', () => {
      const output = 'CI_STATUS: FAILED — first check\nRetrying...\nCI_STATUS: PASSED';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('success');
    });

    // ── Fail-closed: a FAILED verdict must never parse as success ──────────
    it('should NOT report success when a FAILED line summarises PASSED runs', () => {
      // The ci-watch prompt asks for a summary of which runs failed, so a
      // FAILED line that quotes the word PASSED is the specified output shape.
      const output = 'CI_STATUS: FAILED — 3 of 4 runs reported CI_STATUS: PASSED, but lint failed';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('3 of 4 runs reported CI_STATUS: PASSED, but lint failed');
    });

    it('should NOT report success when PASSED is quoted mid-line in prose', () => {
      const output =
        'The instructions said to report CI_STATUS: PASSED when green.\nCI_STATUS: FAILED — build broke';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('build broke');
    });

    it('should not treat a mid-line PASSED mention as a status marker', () => {
      const output = 'Reminder: report CI_STATUS: PASSED only when every check is green.';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('CI status could not be determined from agent output');
    });

    // ── Summary separators the model actually emits ────────────────────────
    it('should capture the summary after an ASCII hyphen', () => {
      const output = 'CI_STATUS: FAILED - Unit Tests failed with 3 errors';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('failure');
      expect(result.summary).toBe('Unit Tests failed with 3 errors');
    });

    it('should capture the summary after an en dash', () => {
      const output = 'CI_STATUS: FAILED – lint failed';
      expect(parseCiWatchResult(output).summary).toBe('lint failed');
    });

    it('should capture the summary after a colon', () => {
      const output = 'CI_STATUS: FAILED: typecheck failed';
      expect(parseCiWatchResult(output).summary).toBe('typecheck failed');
    });

    it('should capture the summary with no separator at all', () => {
      const output = 'CI_STATUS: FAILED build step exited 1';
      expect(parseCiWatchResult(output).summary).toBe('build step exited 1');
    });

    // ── Indeterminate: CI could not be read ───────────────────────────────
    it('should report indeterminate for CI_STATUS: INDETERMINATE', () => {
      const output = 'CI_STATUS: INDETERMINATE — rate limited (403)';
      const result = parseCiWatchResult(output);
      expect(result.status).toBe('indeterminate');
      expect(result.summary).toBe('rate limited (403)');
    });

    it('should report indeterminate with a default summary when none is given', () => {
      const result = parseCiWatchResult('CI_STATUS: INDETERMINATE');
      expect(result.status).toBe('indeterminate');
      expect(result.summary).toBe('CI status could not be read');
    });

    it('should prefer a later INDETERMINATE over an earlier PASSED', () => {
      const output = 'CI_STATUS: PASSED\nActually the API errored.\nCI_STATUS: INDETERMINATE';
      expect(parseCiWatchResult(output).status).toBe('indeterminate');
    });

    it('should tolerate markdown emphasis and list markers on the status line', () => {
      expect(parseCiWatchResult('- **CI_STATUS: PASSED**').status).toBe('success');
      expect(parseCiWatchResult('  - CI_STATUS: FAILED — nope').status).toBe('failure');
    });
  });
});
