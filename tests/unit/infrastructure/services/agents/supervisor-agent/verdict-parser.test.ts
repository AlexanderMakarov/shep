/**
 * Supervisor Verdict Parser — unit tests
 *
 * The supervisor verdict is a governance control: it decides whether an
 * agent run that holds shell access and push rights is auto-approved.
 * These tests pin the failure modes that made the parser approve on a
 * rejection, and the fail-closed behaviour when the model is ambiguous.
 */

import { describe, it, expect } from 'vitest';
import { SupervisorVerdict } from '@/domain/generated/output.js';
import {
  parseEvaluatorResponse,
  EMPTY_RATIONALE,
  MAX_RATIONALE_CHARS,
} from '@/infrastructure/services/agents/supervisor-agent/verdict-parser.js';

describe('parseEvaluatorResponse', () => {
  describe('plain verdict lines', () => {
    it('parses "verdict: approve"', () => {
      expect(parseEvaluatorResponse('verdict: approve — diff is trivial.').verdict).toBe(
        SupervisorVerdict.approve
      );
    });

    it('parses "verdict: reject"', () => {
      expect(parseEvaluatorResponse('verdict: reject — destructive change.').verdict).toBe(
        SupervisorVerdict.reject
      );
    });

    it('parses "verdict: escalate"', () => {
      expect(parseEvaluatorResponse('verdict: escalate').verdict).toBe(SupervisorVerdict.escalate);
    });

    it('parses the no-space form "verdict:reject"', () => {
      expect(parseEvaluatorResponse('verdict:reject').verdict).toBe(SupervisorVerdict.reject);
    });

    it('parses without the colon: "Verdict reject"', () => {
      expect(parseEvaluatorResponse('Verdict reject').verdict).toBe(SupervisorVerdict.reject);
    });

    it('is case-insensitive', () => {
      expect(parseEvaluatorResponse('VERDICT: REJECT').verdict).toBe(SupervisorVerdict.reject);
    });

    it('tolerates leading whitespace', () => {
      expect(parseEvaluatorResponse('   verdict: reject').verdict).toBe(SupervisorVerdict.reject);
    });
  });

  describe('markdown emphasis', () => {
    it('parses "**Verdict:** reject"', () => {
      expect(parseEvaluatorResponse('**Verdict:** reject').verdict).toBe(SupervisorVerdict.reject);
    });

    it('parses "**Verdict:** approve"', () => {
      expect(parseEvaluatorResponse('**Verdict:** approve').verdict).toBe(
        SupervisorVerdict.approve
      );
    });

    it('parses "*verdict*: escalate"', () => {
      expect(parseEvaluatorResponse('*verdict*: escalate').verdict).toBe(
        SupervisorVerdict.escalate
      );
    });
  });

  describe('the word "approve" inside a rejection rationale must not win', () => {
    it('does not approve when the rejection mentions approve mid-sentence', () => {
      const raw =
        'I cannot give verdict: approve here.\nverdict: reject — the migration drops a table';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.reject);
    });

    it('does not approve when a trailing aside mentions approve', () => {
      const raw = 'verdict: reject\n(If tests were added I would switch to verdict: approve.)';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.reject);
    });

    it('reads the last verdict line when the model restates the same verdict', () => {
      const raw = 'Draft answer follows.\nverdict: reject\nOn reflection, still:\nverdict: reject';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.reject);
    });
  });

  describe('fails closed on ambiguity', () => {
    it('escalates when a menu of options is followed by a real verdict line', () => {
      const raw =
        'Options are verdict: approve, verdict: reject, verdict: escalate.\nverdict: escalate';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.escalate);
    });

    it('escalates when two different verdict lines disagree', () => {
      const raw = 'verdict: approve\nverdict: reject';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.escalate);
    });

    it('escalates when an approve line follows a reject line', () => {
      const raw = 'verdict: reject\nActually, on balance:\nVerdict: approve';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.escalate);
    });

    it('escalates when a draft advise is later changed to reject', () => {
      const raw = 'Draft answer follows.\nverdict: advise\nOn reflection:\nverdict: reject';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.escalate);
    });

    it('does NOT escalate when the same verdict is repeated', () => {
      const raw = 'verdict: approve\nverdict: approve';
      expect(parseEvaluatorResponse(raw).verdict).toBe(SupervisorVerdict.approve);
    });
  });

  describe('safe default', () => {
    it('falls back to advise when no verdict line is present', () => {
      expect(parseEvaluatorResponse('Looks fine to me.').verdict).toBe(SupervisorVerdict.advise);
    });

    it('falls back to advise when the verdict word is not a known verdict', () => {
      expect(parseEvaluatorResponse('verdict: maybe').verdict).toBe(SupervisorVerdict.advise);
    });

    it('falls back to advise for empty input', () => {
      const parsed = parseEvaluatorResponse('');
      expect(parsed.verdict).toBe(SupervisorVerdict.advise);
      expect(parsed.rationale).toBe(EMPTY_RATIONALE);
    });
  });

  describe('rationale', () => {
    it('keeps the trimmed raw response as the rationale', () => {
      expect(parseEvaluatorResponse('  verdict: reject\nbecause  ').rationale).toBe(
        'verdict: reject\nbecause'
      );
    });

    it('truncates an over-long rationale', () => {
      const raw = `verdict: approve\n${'x'.repeat(MAX_RATIONALE_CHARS * 2)}`;
      expect(parseEvaluatorResponse(raw).rationale.length).toBe(MAX_RATIONALE_CHARS);
    });
  });
});
