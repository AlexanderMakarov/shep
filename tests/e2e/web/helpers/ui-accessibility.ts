import { expect, type Page } from '@playwright/test';
import axe, { type AxeResults } from 'axe-core';

export async function expectAccessible(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    // Visible dialogs can still be fading/scaling. Inspect their settled
    // colors and target sizes; indefinite loading indicators must not block.
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Infinity
        )
        .map((animation) => animation.finished.catch(() => undefined))
    );
    const engine = (
      window as unknown as {
        axe: { run: (context: Document, options: unknown) => Promise<AxeResults> };
      }
    ).axe;
    const result = await engine.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    });
    return result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
      details: nodes.map((node) => node.failureSummary),
    }));
  });
  expect(violations).toEqual([]);
}
