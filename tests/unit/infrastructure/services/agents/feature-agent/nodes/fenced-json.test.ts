/**
 * Fenced JSON Extractor — unit tests
 *
 * The fence around an agent's structured answer is written by a language
 * model, so its exact shape varies. Every variant below was silently read as
 * "the agent found nothing", which is indistinguishable from the agent
 * correctly reporting an empty list — so the caller could never tell that it
 * had stopped receiving data at all.
 */

import { describe, it, expect } from 'vitest';
import {
  extractFencedJsonArray,
  FencedJsonFailure,
} from '@/infrastructure/services/agents/feature-agent/nodes/fenced-json.js';

describe('extractFencedJsonArray', () => {
  describe('fence variants the model actually emits', () => {
    it('reads a canonical ```json fence', () => {
      const result = extractFencedJsonArray('text\n```json\n[{"a":1}]\n```\nmore');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([{ a: 1 }]);
    });

    it('reads an uppercase ```JSON fence', () => {
      const result = extractFencedJsonArray('```JSON\n[1,2]\n```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1, 2]);
    });

    it('reads a ```jsonc fence', () => {
      const result = extractFencedJsonArray('```jsonc\n[1]\n```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1]);
    });

    it('reads a bare ``` fence with no language tag', () => {
      const result = extractFencedJsonArray('```\n[1,2,3]\n```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1, 2, 3]);
    });

    it('reads a single-line fence', () => {
      const result = extractFencedJsonArray('```json [1,2] ```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1, 2]);
    });

    it('reads a fence with no newline before the closing backticks', () => {
      const result = extractFencedJsonArray('```json\n[1,2]```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1, 2]);
    });

    it('reads a fence with trailing whitespace after the language tag', () => {
      const result = extractFencedJsonArray('```json   \n[1]\n```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1]);
    });

    it('reads a CRLF fence', () => {
      const result = extractFencedJsonArray('```json\r\n[1]\r\n```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1]);
    });
  });

  describe('raw JSON fallback', () => {
    it('reads a bare JSON array with no fence at all', () => {
      const result = extractFencedJsonArray('Here is the answer: [{"a":1}] — done.');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([{ a: 1 }]);
    });

    it('falls back to raw JSON when the fenced payload is unparseable', () => {
      const result = extractFencedJsonArray('```json\nnot json\n```\nthe real answer: [1,2]');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([1, 2]);
    });
  });

  describe('found-but-empty is NOT the same as not-found', () => {
    it('reports found=true for an explicitly empty array', () => {
      const result = extractFencedJsonArray('```json\n[]\n```');
      expect(result.found).toBe(true);
      expect(result.items).toEqual([]);
      expect(result.failure).toBeUndefined();
    });

    it('reports found=false with NoBlock when there is nothing to read', () => {
      const result = extractFencedJsonArray('I did not find anything worth recording.');
      expect(result.found).toBe(false);
      expect(result.items).toEqual([]);
      expect(result.failure).toBe(FencedJsonFailure.NoBlock);
    });

    it('reports found=false with NoBlock for empty input', () => {
      expect(extractFencedJsonArray('').failure).toBe(FencedJsonFailure.NoBlock);
    });

    it('reports InvalidJson when a block exists but cannot be parsed', () => {
      const result = extractFencedJsonArray('```json\n[ not json ]\n```');
      expect(result.found).toBe(false);
      expect(result.failure).toBe(FencedJsonFailure.InvalidJson);
    });

    it('reports NotAnArray when the block holds a JSON object', () => {
      const result = extractFencedJsonArray('```json\n{"a":1}\n```');
      expect(result.found).toBe(false);
      expect(result.failure).toBe(FencedJsonFailure.NotAnArray);
    });
  });

  describe('multiple blocks', () => {
    it('uses the first fenced block that parses as an array', () => {
      const output = '```text\nnot json\n```\n```json\n[7]\n```';
      const result = extractFencedJsonArray(output);
      expect(result.found).toBe(true);
      expect(result.items).toEqual([7]);
    });
  });
});
