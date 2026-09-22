import { expect, test } from '@playwright/test';

// A long, deterministic list exercises the paint area beyond the first viewport.
// No app is created, deployed, or sent to an installed agent.
const applications = Array.from({ length: 16 }, (_, index) => ({
  id: `scroll-fixture-${index}`,
  name: `Scrolling application ${index + 1}`,
  description: 'A complete row must keep its page background while scrolling.',
  slug: `scroll-fixture-${index}`,
  repositoryPath: `/projects/scroll-fixture-${index}`,
  agentType: 'dev',
  status: 'Idle',
  setupComplete: true,
  effectiveStatus: 'ready',
  createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`Applications paints the whole scrolling page at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 720 });
      await page.addInitScript((value) => localStorage.setItem('shep-theme', value), theme);
      await page.route('**/api/applications', (route) => route.fulfill({ json: applications }));
      await page.goto('/applications');
      const surface = page.getByTestId('applications-page-client');
      await expect(page.getByTestId('application-card')).toHaveCount(applications.length);
      const background = await surface.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );

      for (const progress of [0.5, 1]) {
        const painted = await surface.evaluate((element, fraction) => {
          let scroller = element.parentElement;
          while (scroller) {
            if (
              /auto|scroll/.test(getComputedStyle(scroller).overflowY) &&
              scroller.scrollHeight > scroller.clientHeight
            )
              break;
            scroller = scroller.parentElement;
          }
          if (!scroller) throw new Error('The application fixtures must overflow the viewport');
          scroller.scrollTo({
            top: (scroller.scrollHeight - scroller.clientHeight) * fraction,
            behavior: 'instant',
          });
          const bounds = scroller.getBoundingClientRect();
          // Sample the page gutter, away from cards, headers, and scrollbars.
          const x = bounds.left + 8;
          const y = Math.max(bounds.top, 0) + Math.min(bounds.height, innerHeight - bounds.top) / 2;
          return document
            .elementsFromPoint(x, y)
            .map((node) => getComputedStyle(node).backgroundColor)
            .find((color) => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent');
        }, progress);
        await testInfo.attach(`scroll-${progress}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        expect.soft(painted, `The background at scroll position ${progress}`).toBe(background);
      }

      const lastCard = page.getByTestId('application-card').last();
      await expect(lastCard).toBeInViewport();
      const surfaceBounds = (await surface.boundingBox())!;
      const lastBounds = (await lastCard.boundingBox())!;
      expect(
        surfaceBounds.y + surfaceBounds.height,
        'The page background and create overlay must cover the last application row'
      ).toBeGreaterThanOrEqual(lastBounds.y + lastBounds.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
    });
  }
}
