import { describe, it, expect } from 'vitest';
import {
  featureNodeStateConfig,
  type FeatureNodeState,
} from '@/components/common/feature-node/feature-node-state-config';

/**
 * A1 — the feature card renders on `dark:bg-neutral-800/80` (~#202020) and dark
 * is the default theme. Every `badgeClass` therefore needs a dark-mode text
 * colour; the light-mode class alone measures 2.1:1 – 3.2:1 there, far under the
 * 4.5:1 WCAG AA floor for this text size.
 *
 * Verified ratios on #202020 (Tailwind v4 palette, sRGB):
 *   blue-400 6.18:1 · red-400 5.63:1 · amber-400 9.49:1 ·
 *   emerald-400 8.43:1 · gray-400 6.26:1 · slate-400 6.20:1
 */
const EXPECTED_DARK_BADGE_CLASS: Record<FeatureNodeState, string> = {
  creating: 'dark:text-blue-400',
  running: 'dark:text-blue-400',
  'action-required': 'dark:text-amber-400',
  done: 'dark:text-emerald-400',
  blocked: 'dark:text-gray-400',
  pending: 'dark:text-slate-400',
  error: 'dark:text-red-400',
  deleting: 'dark:text-gray-400',
  archived: 'dark:text-gray-400',
};

/** The light-mode classes already pass AA on the white card and must not move. */
const EXPECTED_LIGHT_BADGE_CLASS: Record<FeatureNodeState, string> = {
  creating: 'text-blue-700',
  running: 'text-blue-700',
  'action-required': 'text-amber-700',
  done: 'text-emerald-700',
  blocked: 'text-gray-600',
  pending: 'text-slate-600',
  error: 'text-red-700',
  deleting: 'text-gray-600',
  archived: 'text-gray-600',
};

const states = Object.keys(featureNodeStateConfig) as FeatureNodeState[];

describe('featureNodeStateConfig badge contrast', () => {
  it.each(states)('%s has a dark-mode badge colour', (state) => {
    expect(featureNodeStateConfig[state].badgeClass).toContain('dark:text-');
  });

  it.each(states)('%s maps to the verified dark badge colour', (state) => {
    expect(featureNodeStateConfig[state].badgeClass.split(/\s+/)).toContain(
      EXPECTED_DARK_BADGE_CLASS[state]
    );
  });

  it.each(states)('%s keeps its passing light-mode badge colour', (state) => {
    expect(featureNodeStateConfig[state].badgeClass.split(/\s+/)).toContain(
      EXPECTED_LIGHT_BADGE_CLASS[state]
    );
  });

  it('never pairs a dark text colour with a light-only badge background', () => {
    // `badgeBgClass` is a light-mode-only surface (bg-blue-50 …). Adding a
    // dark text colour on top of it would trade one failure for another, so
    // the two must not be composed anywhere — this asserts the background
    // stays light-only and is documented as such.
    for (const state of states) {
      expect(featureNodeStateConfig[state].badgeBgClass).not.toContain('dark:');
    }
  });
});
