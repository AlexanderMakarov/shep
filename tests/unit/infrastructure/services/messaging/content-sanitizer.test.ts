/**
 * Content Sanitizer Unit Tests
 *
 * Tests for the sanitization of outbound messaging content
 * to prevent leaking sensitive information (paths, env vars, code)
 * through third-party messaging platforms.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeForMessaging } from '@/infrastructure/services/messaging/content-sanitizer.js';

describe('sanitizeForMessaging', () => {
  it('should strip Unix absolute file paths', () => {
    const result = sanitizeForMessaging('Error at /Users/john/projects/my-app/src/index.ts');
    expect(result).toBe('Error at [path]');
  });

  it('should strip Windows file paths', () => {
    const result = sanitizeForMessaging('Error at C:\\Users\\john\\projects\\app.ts');
    expect(result).toBe('Error at [path]');
  });

  it('should strip environment variable assignments', () => {
    const result = sanitizeForMessaging('Using API_KEY=test-value');
    expect(result).toBe('Using [env]');
  });

  it('should strip fenced code blocks', () => {
    const input = 'Here is the fix:\n```typescript\nconst x = 1;\n```\nDone.';
    const result = sanitizeForMessaging(input);
    expect(result).toBe('Here is the fix:\n[code block]\nDone.');
  });

  it('should strip long inline code', () => {
    const longCode = `\`${'a'.repeat(150)}\``;
    const result = sanitizeForMessaging(`Check this: ${longCode}`);
    expect(result).toBe('Check this: [code]');
  });

  it('should truncate messages exceeding 4000 characters', () => {
    const longMessage = 'a'.repeat(5000);
    const result = sanitizeForMessaging(longMessage);
    expect(result.length).toBe(4000);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should preserve normal text without sensitive content', () => {
    const text = 'Feature "add payments" completed successfully. PR #42 ready for review.';
    const result = sanitizeForMessaging(text);
    expect(result).toBe(text);
  });

  it('should handle empty strings', () => {
    expect(sanitizeForMessaging('')).toBe('');
  });

  it('should handle messages exactly at the limit', () => {
    const text = 'a'.repeat(4000);
    const result = sanitizeForMessaging(text);
    expect(result).toBe(text);
  });

  /**
   * M6 — the doc comment promised to remove "Potential secret patterns (API
   * keys, tokens)" and none of the five regexes matched a token. `[A-Z_]{3,}=\S+`
   * catches `API_KEY=…` and nothing else, while this function runs on the
   * egress path to Telegram/WhatsApp over raw agent output.
   *
   * The pattern table already existed at `domain/aspm/redactor/secret-patterns.ts`
   * and is now reachable from here rather than being written a second time.
   */
  describe('secret patterns', () => {
    it.each([
      ['an Anthropic key', 'key is sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123'],
      ['a GitHub PAT', 'token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789'],
      [
        'a GitHub fine-grained PAT',
        'github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDe',
      ],
      ['an OpenAI key', 'OPENAI is sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ'],
      ['an AWS access key id', 'creds AKIAIOSFODNN7EXAMPLE here'],
      ['a Slack bot token', 'slack xoxb-12345-67890-aBcDeFgHiJkLmN'],
      ['a Stripe secret key', 'stripe sk_live_aBcDeFgHiJkLmNoPqRsTuV'],
      ['a Google API key', 'google AIzaSyA-1234567890abcdefghijklmnopqrstu'],
    ])('redacts %s', (_label, text) => {
      const result = sanitizeForMessaging(text);

      expect(result).toContain('[REDACTED:');
      expect(result).not.toContain('aBcDeFgHiJkLmNoPqRsTuV');
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result).not.toContain('AIzaSyA-1234567890abcdefghijklmnopqrstu');
    });

    it('names the pattern that fired so a false positive is diagnosable', () => {
      expect(sanitizeForMessaging('token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789')).toContain(
        '[REDACTED:github-personal-access-token]'
      );
    });

    it('redacts a PEM private key block', () => {
      const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----';

      expect(sanitizeForMessaging(pem)).not.toContain('MIIEvQIBADANBgkq');
    });

    it('still keeps the env-var rule for unrecognised key shapes', () => {
      expect(sanitizeForMessaging('Using API_KEY=test-value')).toBe('Using [env]');
    });

    it('leaves an ordinary long feature name alone', () => {
      // The table's high-entropy fallback is deliberately NOT applied here:
      // it matches any 32+ character run of [A-Za-z0-9+/_-], which a hyphenated
      // branch or feature name easily reaches, and silently destroying the
      // body of a notification is its own defect.
      const text = 'Feature add-payments-to-the-checkout-flow is ready';

      expect(sanitizeForMessaging(text)).toBe(text);
    });

    it('still truncates rather than redacting a long run of one character', () => {
      const result = sanitizeForMessaging('a'.repeat(5000));

      expect(result.length).toBe(4000);
    });
  });
});
