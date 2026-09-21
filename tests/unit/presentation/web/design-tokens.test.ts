/**
 * Design-token contrast guards.
 *
 * These assertions read the REAL stylesheet (app/globals.css) and recompute
 * WCAG 2.x relative-luminance contrast ratios from it, so a future token edit
 * that silently drops a pairing below its threshold fails here rather than in
 * an audit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest runs with the repository root as cwd (see vitest.config.ts).
const CSS_PATH = resolve(process.cwd(), 'src/presentation/web/app/globals.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** Everything inside the top-level `@theme { … }` block (the light palette). */
const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
/** Everything inside the first `.dark { … }` block (the dark overrides). */
const darkBlock = /\.dark\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

function token(block: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(block);
  if (!match) throw new Error(`token --${name} not found`);
  return match[1].toLowerCase();
}

function channels(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens — contrast (A2)', () => {
  it('dark-mode primary fill carries its foreground at AA', () => {
    expect(
      contrast(token(darkBlock, 'color-primary'), token(darkBlock, 'color-primary-foreground'))
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('primary fill carries white body text at AA (>= 4.5:1)', () => {
    const primary = token(themeBlock, 'color-primary');
    const onPrimary = token(themeBlock, 'color-primary-foreground');
    expect(contrast(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('primary reads as AA text on the light background (the `link` button variant)', () => {
    const primary = token(themeBlock, 'color-primary');
    const background = token(themeBlock, 'color-background');
    expect(contrast(primary, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark-mode primary still reads as AA text on the dark background', () => {
    // Guard against "fixing" the dark token to the light value: #155dfc is
    // only 3.77:1 on #0a0a0a and would REGRESS dark-mode `text-primary`.
    const primary = token(darkBlock, 'color-primary');
    const background = token(darkBlock, 'color-background');
    expect(contrast(primary, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('destructive fill carries white body text at AA (>= 4.5:1)', () => {
    const destructive = token(themeBlock, 'color-destructive');
    const onDestructive = token(themeBlock, 'color-destructive-foreground');
    expect(contrast(destructive, onDestructive)).toBeGreaterThanOrEqual(4.5);
  });

  it('destructive reads as AA text on the light background', () => {
    expect(
      contrast(token(themeBlock, 'color-destructive'), token(themeBlock, 'color-background'))
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('dark destructive fill carries its foreground at AA', () => {
    expect(
      contrast(
        token(darkBlock, 'color-destructive'),
        token(darkBlock, 'color-destructive-foreground')
      )
    ).toBeGreaterThanOrEqual(4.5);
  });

  for (const surface of ['background', 'card', 'muted', 'accent']) {
    it(`dark error text is readable on the ${surface} surface`, () => {
      expect(
        contrast(token(darkBlock, 'color-destructive'), token(darkBlock, `color-${surface}`))
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('design tokens — focus ring (A3)', () => {
  it('the ring colour clears 3:1 against both backgrounds at full opacity', () => {
    expect(
      contrast(token(themeBlock, 'color-ring'), token(themeBlock, 'color-background'))
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast(token(darkBlock, 'color-ring'), token(darkBlock, 'color-background'))
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('design tokens — control boundary (A4)', () => {
  it('the input boundary token clears 3:1 in light mode', () => {
    expect(
      contrast(token(themeBlock, 'color-input-border'), token(themeBlock, 'color-background'))
    ).toBeGreaterThanOrEqual(3);
  });

  it('the input boundary token clears 3:1 in dark mode', () => {
    expect(
      contrast(token(darkBlock, 'color-input-border'), token(darkBlock, 'color-background'))
    ).toBeGreaterThanOrEqual(3);
  });

  it('leaves --color-input alone, because it also paints surfaces', () => {
    // The Switch track (`data-[state=unchecked]:bg-input`) and the
    // `dark:bg-input/30` field fills consume this token as a FILL, so it must
    // not be repainted to a boundary colour.
    expect(token(themeBlock, 'color-input')).toBe('#e2e8f0');
    expect(token(darkBlock, 'color-input')).toBe('#3a3a3a');
  });
});

describe('globals.css — OS reduced motion (A9)', () => {
  const reduceBlocks =
    css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? [];
  const allReduce = reduceBlocks.join('\n');

  it('kills animation and transition durations at first paint, not just view transitions', () => {
    expect(allReduce).toMatch(/animation-duration:\s*0s\s*!important/);
    expect(allReduce).toMatch(/transition-duration:\s*0s\s*!important/);
    expect(allReduce).toMatch(/animation-delay:\s*0s\s*!important/);
    expect(allReduce).toMatch(/transition-delay:\s*0s\s*!important/);
    expect(allReduce).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it('mirrors the body.no-animations selector shape (element + ::before + ::after)', () => {
    expect(allReduce).toMatch(/\*::before/);
    expect(allReduce).toMatch(/\*::after/);
  });

  it('lets an explicit opt-in override the OS preference', () => {
    // Without an escape hatch the CSS would veto the stored user choice the
    // hook is required to honour.
    expect(allReduce).toMatch(/:not\(\.animations-forced\)/);
  });
});

describe('globals.css — toast / bulk-toolbar collision (P2)', () => {
  it('lifts bottom-anchored toasts while the bulk-action toolbar is mounted', () => {
    expect(css).toMatch(/--shep-toast-offset-bottom/);
    expect(css).toMatch(/:has\(\[data-bulk-action-toolbar\]\)/);
  });
});
