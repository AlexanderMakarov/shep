import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openShepDb } from './helpers/collaboration-flag';
import { removeDirWithRetry } from '../../helpers/remove-dir.helper';

const REPO_ID = `e2e-clickability-${randomUUID()}`;
const FEATURES = [
  {
    id: `${REPO_ID}-implementation`,
    name: 'Existing implementation feature',
    lifecycle: 'Implementation',
  },
  { id: `${REPO_ID}-review`, name: 'Existing review feature', lifecycle: 'Review' },
];
let repoPath: string;

test.beforeAll(() => {
  repoPath = mkdtempSync(join(tmpdir(), 'shep-clickability-'));
  const db = openShepDb();
  try {
    const now = Date.now();
    db.prepare(
      'INSERT INTO repositories (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(REPO_ID, 'Clickability fixture', repoPath, now, now);
    const insertFeature = db.prepare(
      `INSERT INTO features
      (id, name, slug, description, user_query, repository_path, repository_id, branch,
       lifecycle, messages, related_artifacts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const feature of FEATURES) {
      insertFeature.run(
        feature.id,
        feature.name,
        feature.id,
        'Clickability fixture',
        'Fixture',
        repoPath,
        REPO_ID,
        `feat/${feature.id}`,
        feature.lifecycle,
        '[]',
        '[]',
        now,
        now
      );
    }
  } finally {
    db.close();
  }
});

test.afterAll(() => {
  const db = openShepDb();
  try {
    for (const feature of FEATURES) {
      db.prepare('DELETE FROM features WHERE id = ?').run(feature.id);
    }
    db.prepare('DELETE FROM repositories WHERE id = ?').run(REPO_ID);
  } finally {
    db.close();
    if (repoPath) removeDirWithRetry(repoPath);
  }
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('shep:collaboration-onboarding-dismissed', '1');
  });
});

test.describe('Feature node clickability — drawer opens after feature creation', () => {
  test('clicking existing feature nodes opens the detail drawer after submitting the create form', async ({
    page,
  }) => {
    // Mock the repositories API to provide at least one repo
    await page.route('**/api/repositories', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: REPO_ID,
            path: repoPath,
            name: 'Test Repo',
          },
        ]),
      })
    );

    // Intercept createFeature server action to delay it (simulate slow creation)
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST' && request.headers()['next-action']) {
        const body = request.postData();
        if (body?.includes('E2E Optimistic Clickability Test')) {
          // Delay for 10 seconds — long enough to click other nodes
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: '1:{"error":"Test intercepted"}\n',
          });
          return;
        }
      }
      await route.fallback();
    });

    // Navigate to control center
    await page.goto('/control-center');

    // Keep the target stable while unrelated background agents update their own nodes.
    const firstNode = page
      .locator(`[data-id="feat-${FEATURES[0].id}"]`)
      .getByTestId('feature-node-card');
    await expect(firstNode).toBeVisible({ timeout: 10000 });

    // Step 1: Open the create-feature drawer by navigating to /create with repo selected
    await page.goto(`/create?repo=${encodeURIComponent(repoPath)}`);

    // Wait for the create drawer heading
    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).toBeVisible({
      timeout: 15000,
    });

    // Step 2: Fill the feature description and submit
    const descriptionInput = page.getByPlaceholder(
      'e.g. Add GitHub OAuth login with callback handling and token refresh...'
    );
    await descriptionInput.fill('E2E Optimistic Clickability Test');

    const submitButton = page.getByRole('button', { name: '+ Create Feature' });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Step 3: Drawer should close (router.push('/') fires immediately on submit)
    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).not.toBeVisible({
      timeout: 5000,
    });

    // Step 4: While the server action is still in-flight, click on an existing feature node
    await expect(firstNode).toBeVisible();
    await firstNode.click();

    // Step 5: Verify the feature detail drawer opens for the clicked node
    const drawerHeader = page.locator('[data-testid="feature-drawer-header"]');
    await expect(drawerHeader).toBeVisible({ timeout: 5000 });

    // The drawer should show the name of the clicked feature
    await expect(drawerHeader).toContainText(FEATURES[0].name);

    // Step 6: Close the drawer by pressing Escape
    await page.keyboard.press('Escape');
    await expect(drawerHeader).not.toBeVisible({ timeout: 3000 });

    // Step 7: The second fixture guarantees that changing the selected feature is exercised.
    const secondNode = page
      .locator(`[data-id="feat-${FEATURES[1].id}"]`)
      .getByTestId('feature-node-card');
    await secondNode.click();
    await expect(drawerHeader).toBeVisible({ timeout: 5000 });
    await expect(drawerHeader).toContainText(FEATURES[1].name);
    await page.keyboard.press('Escape');
    await expect(drawerHeader).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Feature nodes open their corresponding drawers on click', () => {
  test('implementation and review nodes each open the correct drawer', async ({ page }) => {
    await page.goto('/control-center');
    const drawerHeader = page.getByTestId('feature-drawer-header');

    // Seed both states ourselves; other suites create features whose agents rename them live.
    for (const feature of FEATURES) {
      const node = page.locator(`[data-id="feat-${feature.id}"]`).getByTestId('feature-node-card');
      await expect(node).toBeVisible({ timeout: 10000 });
      await expect(node).not.toHaveAttribute('aria-busy', 'true');
      await expect(node.getByTestId('feature-node-title')).toHaveText(feature.name);
      await node.click();
      await expect(drawerHeader).toBeVisible({ timeout: 5000 });
      await expect(drawerHeader).toContainText(feature.name);
      await page.keyboard.press('Escape');
      await expect(drawerHeader).not.toBeVisible({ timeout: 3000 });
    }
  });
});
