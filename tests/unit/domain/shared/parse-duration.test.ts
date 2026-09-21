import { describe, it, expect } from 'vitest';
import { DURATION_SYNTAX_HINT, parseDurationMs } from '@/domain/shared/parse-duration.js';

describe('parseDurationMs', () => {
  it('parses every supported unit', () => {
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('15m')).toBe(15 * 60_000);
    expect(parseDurationMs('12h')).toBe(12 * 3_600_000);
    expect(parseDurationMs('7d')).toBe(7 * 86_400_000);
    expect(parseDurationMs('2w')).toBe(14 * 86_400_000);
  });

  it('accepts a fractional value', () => {
    expect(parseDurationMs('1.5h')).toBe(5_400_000);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(parseDurationMs('  7D ')).toBe(7 * 86_400_000);
  });

  it('rejects a missing unit rather than guessing one', () => {
    expect(parseDurationMs('7')).toBeNull();
  });

  it('rejects an unknown unit', () => {
    expect(parseDurationMs('7y')).toBeNull();
  });

  it('rejects zero, negative and non-string input', () => {
    expect(parseDurationMs('0d')).toBeNull();
    expect(parseDurationMs('-1d')).toBeNull();
    expect(parseDurationMs('')).toBeNull();
    expect(parseDurationMs(undefined)).toBeNull();
  });

  it('publishes a hint listing the units it accepts', () => {
    expect(DURATION_SYNTAX_HINT).toContain('d');
    expect(DURATION_SYNTAX_HINT).toContain('h');
  });
});
