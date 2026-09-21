import { describe, it, expect } from 'vitest';
import { MASK_DOTS, secretPlaceholder, secretUpdateValue } from '@/lib/secret-placeholder';

describe('secretPlaceholder', () => {
  it('shows the empty placeholder when nothing is stored', () => {
    expect(secretPlaceholder({ hasValue: false, lastFour: '' }, 'Enter your API token')).toBe(
      'Enter your API token'
    );
    expect(secretPlaceholder(undefined, 'Enter your API token')).toBe('Enter your API token');
  });

  it('shows dots plus the last four when one is stored', () => {
    expect(secretPlaceholder({ hasValue: true, lastFour: '1234' }, 'x')).toBe(`${MASK_DOTS}1234`);
  });

  it('shows dots alone when the secret was too short to hint at', () => {
    expect(secretPlaceholder({ hasValue: true, lastFour: '' }, 'x')).toBe(MASK_DOTS);
  });
});

describe('secretUpdateValue', () => {
  it('sends a typed value', () => {
    expect(secretUpdateValue('sk-new-token', false)).toBe('sk-new-token');
  });

  it('trims what the user typed', () => {
    expect(secretUpdateValue('  sk-new-token  ', false)).toBe('sk-new-token');
  });

  it('sends undefined for an untouched field so the stored secret survives', () => {
    // Several save paths re-send every field on any change. Sending '' there
    // would wipe a credential the user never touched.
    expect(secretUpdateValue('', false)).toBeUndefined();
    expect(secretUpdateValue('   ', false)).toBeUndefined();
  });

  it('sends an empty string only when the user deliberately cleared it', () => {
    expect(secretUpdateValue('', true)).toBe('');
  });
});
