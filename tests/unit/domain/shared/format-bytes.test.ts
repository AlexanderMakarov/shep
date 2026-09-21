import { describe, it, expect } from 'vitest';
import { BYTES_PER_UNIT, formatBytes } from '@/domain/shared/format-bytes.js';

describe('formatBytes', () => {
  it('renders bytes without a fraction', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('steps up through the binary units', () => {
    expect(formatBytes(BYTES_PER_UNIT * 1.5)).toBe('1.5 KB');
    expect(formatBytes(BYTES_PER_UNIT ** 2 * 2)).toBe('2.0 MB');
    expect(formatBytes(BYTES_PER_UNIT ** 3 * 3)).toBe('3.0 GB');
    expect(formatBytes(BYTES_PER_UNIT ** 4 * 4)).toBe('4.0 TB');
  });

  it('caps at the largest unit instead of inventing one', () => {
    expect(formatBytes(BYTES_PER_UNIT ** 5)).toContain('TB');
  });

  it('never renders NaN or a negative size in a diagnostic line', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});
