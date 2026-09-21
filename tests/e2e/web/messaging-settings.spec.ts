/**
 * E2E: Messaging remote control settings section.
 *
 * Exercises the Telegram/WhatsApp pairing flow in the web UI against a
 * real Next.js dev server and a local gateway fixture. The server performs
 * real OAuth/route HTTP requests and persists the pairing code in settings.
 */

import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { COLD_ROUTE_READY_TIMEOUT_MS, COLD_ROUTE_TEST_TIMEOUT_MS } from './helpers/timeouts';

test.describe('messaging settings', () => {
  // Lands on /settings, which may still be compiling on a cold runner.
  test.describe.configure({ timeout: COLD_ROUTE_TEST_TIMEOUT_MS });

  let gateway: ReturnType<typeof createServer>;
  let gatewayUrl: string;

  test.beforeAll(async () => {
    gateway = createServer((request, response) => {
      request.resume();
      response.setHeader('content-type', 'application/json');
      if (request.method === 'POST' && request.url === '/oauth/token') {
        response.end(JSON.stringify({ access_token: 'e2e-gateway-access', expires_in: 3600 }));
        return;
      }
      if (
        request.method === 'POST' &&
        request.url === '/gateway/v1/integrations/routes' &&
        request.headers.authorization === 'Bearer e2e-gateway-access'
      ) {
        response.end(
          JSON.stringify({
            route: { route_id: 'e2e-route' },
            route_token: 'e2e-route-token',
            public_url: `${gatewayUrl}/integrations/e2e-route/e2e-route-token`,
          })
        );
        return;
      }
      response.writeHead(404).end(JSON.stringify({ error: 'Unexpected gateway request' }));
    });
    await new Promise<void>((resolve, reject) => {
      gateway.once('error', reject);
      gateway.listen(0, '127.0.0.1', resolve);
    });
    gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    if (!gateway) return;
    gateway.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      gateway.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test('enables messaging, sets gateway URL, pairs telegram, then disconnects', async ({
    page,
  }) => {
    await page.goto('/settings');

    const section = page.getByTestId('messaging-settings-section');
    await expect(section).toBeVisible({ timeout: COLD_ROUTE_READY_TIMEOUT_MS });
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    // Master toggle: turn messaging on
    const enableSwitch = page.getByTestId('switch-messaging-enabled');
    if ((await enableSwitch.getAttribute('data-state')) !== 'checked') {
      await enableSwitch.click();
    }

    // Gateway URL
    const gatewayInput = page.getByTestId('input-gateway-url');
    await gatewayInput.fill(gatewayUrl);
    await gatewayInput.blur();

    // Start Telegram pairing
    await page.getByTestId('btn-telegram-pair').click();

    const dialog = page.getByTestId('messaging-pairing-dialog');
    await expect(dialog).toBeVisible();

    // Code box should contain a 6-digit number
    const codeBox = page.getByTestId('pairing-code-box');
    await expect(codeBox).toBeVisible();
    const codeText = (await codeBox.textContent())?.trim() ?? '';
    expect(codeText).toMatch(/\d{6}/);

    // Public URL box should be visible and point into the gateway
    await expect(page.getByTestId('pairing-public-url-box')).toBeVisible();
    const publicUrl = (await page.getByTestId('pairing-public-url').textContent()) ?? '';
    expect(publicUrl).toMatch(/\/integrations\//);

    // Confirm button is disabled until chat id is typed
    const confirmBtn = page.getByTestId('btn-confirm-pairing');
    await expect(confirmBtn).toBeDisabled();

    await page.getByTestId('input-pairing-chat-id').fill('@e2e-tester');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Dialog closes after successful confirm
    await expect(dialog).toBeHidden();

    // Telegram row now shows a disconnect button
    await expect(page.getByTestId('btn-telegram-disconnect')).toBeVisible();
    await expect(page.getByTestId('btn-disconnect-all')).toBeVisible();

    // Disconnect all — row should flip back to Pair button
    await page.getByTestId('btn-disconnect-all').click();
    await expect(page.getByTestId('btn-telegram-pair')).toBeVisible();
    await expect(page.getByTestId('btn-disconnect-all')).toBeHidden();
  });

  test('refuses to begin pairing with an invalid gateway URL', async ({ page }) => {
    await page.goto('/settings');

    const section = page.getByTestId('messaging-settings-section');
    await expect(section).toBeVisible({ timeout: COLD_ROUTE_READY_TIMEOUT_MS });
    await section.scrollIntoViewIfNeeded();

    const enableSwitch = page.getByTestId('switch-messaging-enabled');
    if ((await enableSwitch.getAttribute('data-state')) !== 'checked') {
      await enableSwitch.click();
    }

    const gatewayInput = page.getByTestId('input-gateway-url');
    await gatewayInput.fill('not a url');
    await page.getByTestId('btn-telegram-pair').click();

    // Observe the handler's rejection before asserting that no dialog opened.
    await expect(
      page.getByText('Set a valid Gateway URL before pairing', { exact: true })
    ).toBeVisible();
    await expect(gatewayInput).toHaveValue('not a url');
    await expect(page.getByTestId('messaging-pairing-dialog')).toBeHidden();
  });
});
