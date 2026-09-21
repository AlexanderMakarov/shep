/**
 * LoadSettingsUseCase Unit Tests
 *
 * Tests for the LoadSettingsUseCase that retrieves existing settings.
 *
 * TDD Phase: RED
 * - These tests are written BEFORE implementation
 * - All tests should FAIL initially (use case doesn't exist yet)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { LoadSettingsUseCase } from '@/application/use-cases/settings/load-settings.use-case.js';
import { MockSettingsRepository } from '../../../helpers/mock-repository.helper.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

describe('LoadSettingsUseCase', () => {
  let useCase: LoadSettingsUseCase;
  let mockRepository: MockSettingsRepository;

  beforeEach(() => {
    mockRepository = new MockSettingsRepository();
    useCase = new LoadSettingsUseCase(mockRepository as any);
  });

  describe('when settings exist', () => {
    it('should load settings successfully', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(existingSettings.id);
      expect(result.models).toEqual(existingSettings.models);
      expect(result.environment).toEqual(existingSettings.environment);
      expect(result.system).toEqual(existingSettings.system);
    });

    it('should return correct Settings type', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      const result = await useCase.execute();

      // Assert - TypeScript compilation validates the type
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('models');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });

    it('should call repository.load()', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      await useCase.execute();

      // Assert
      expect(mockRepository.wasLoadCalled()).toBe(true);
    });
  });

  describe('when settings do not exist', () => {
    it('should throw error when settings are missing', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act & Assert
      await expect(useCase.execute()).rejects.toThrow(
        'Settings not found. Please run initialization first.'
      );
    });

    it('should include helpful error message', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act & Assert
      await expect(useCase.execute()).rejects.toThrow(/initialization/i);
    });
  });

  describe('repository interaction', () => {
    it('should call repository.load() exactly once', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      await useCase.execute();

      // Assert
      expect(mockRepository.wasLoadCalled()).toBe(true);
    });
  });
});

/**
 * H1: `/settings` shipped every stored token to the browser.
 *
 * `loadSettings()` returned settings unmasked, `settings/page.tsx` passed the
 * object as a prop into a `'use client'` component, and a client component's
 * props are serialised whole into the RSC Flight payload embedded in the
 * HTML — so `curl -s http://localhost:4050/settings | grep -o 'sk-[A-Za-z0-9]*'`
 * printed the agent token with no auth and no clicking the reveal toggle.
 */
describe('LoadSettingsUseCase.executeMasked', () => {
  let useCase: LoadSettingsUseCase;
  let mockRepository: MockSettingsRepository;

  const AGENT_TOKEN = 'sk-ant-secretvalue1234';
  const ACCESS_TOKEN = 'EAAG-whatsapp-access-9876';
  const APP_SECRET = 'whatsapp-app-secret-5555';
  const VERIFY_TOKEN = 'verify-me-4321';
  const BOT_TOKEN = '1234:telegram-bot-token-0000';
  const ROUTE_TOKEN = 'route-token-1111';

  function settingsWithSecrets() {
    const settings = createDefaultSettings();
    settings.agent.token = AGENT_TOKEN;
    settings.whatsapp = {
      ...(settings.whatsapp ?? {}),
      cloudApiAccessToken: ACCESS_TOKEN,
      cloudApiAppSecret: APP_SECRET,
      cloudApiVerifyToken: VERIFY_TOKEN,
    } as NonNullable<typeof settings.whatsapp>;
    settings.messaging = {
      ...(settings.messaging ?? {}),
      telegram: {
        ...(settings.messaging?.telegram ?? {}),
        botToken: BOT_TOKEN,
        routeToken: ROUTE_TOKEN,
      },
      whatsapp: {
        ...(settings.messaging?.whatsapp ?? {}),
        botToken: BOT_TOKEN,
        routeToken: ROUTE_TOKEN,
      },
    } as NonNullable<typeof settings.messaging>;
    return settings;
  }

  beforeEach(() => {
    mockRepository = new MockSettingsRepository();
    useCase = new LoadSettingsUseCase(mockRepository as any);
  });

  it('never returns a secret value', async () => {
    mockRepository.setSettings(settingsWithSecrets());

    const { settings } = await useCase.executeMasked();
    const serialised = JSON.stringify(settings);

    for (const secret of [
      AGENT_TOKEN,
      ACCESS_TOKEN,
      APP_SECRET,
      VERIFY_TOKEN,
      BOT_TOKEN,
      ROUTE_TOKEN,
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('reports presence and the last four characters instead', async () => {
    mockRepository.setSettings(settingsWithSecrets());

    const { secrets } = await useCase.executeMasked();

    expect(secrets.agentToken).toEqual({ hasValue: true, lastFour: '1234' });
    expect(secrets.whatsappCloudApiAccessToken).toEqual({ hasValue: true, lastFour: '9876' });
    expect(secrets.whatsappCloudApiAppSecret).toEqual({ hasValue: true, lastFour: '5555' });
    expect(secrets.whatsappCloudApiVerifyToken).toEqual({ hasValue: true, lastFour: '4321' });
    expect(secrets.telegramBotToken).toEqual({ hasValue: true, lastFour: '0000' });
    expect(secrets.telegramRouteToken).toEqual({ hasValue: true, lastFour: '1111' });
  });

  it('reports absence without inventing a last four', async () => {
    mockRepository.setSettings(createDefaultSettings());

    const { secrets } = await useCase.executeMasked();

    expect(secrets.agentToken).toEqual({ hasValue: false, lastFour: '' });
    expect(secrets.telegramBotToken).toEqual({ hasValue: false, lastFour: '' });
  });

  it('does not leak a short secret through its own last four', async () => {
    const settings = createDefaultSettings();
    settings.agent.token = 'abc';
    mockRepository.setSettings(settings);

    const { secrets, settings: masked } = await useCase.executeMasked();

    expect(secrets.agentToken.hasValue).toBe(true);
    expect(secrets.agentToken.lastFour).toBe('');
    expect(masked.agent.token).toBeUndefined();
  });

  it('keeps every non-secret field intact', async () => {
    const original = settingsWithSecrets();
    mockRepository.setSettings(original);

    const { settings } = await useCase.executeMasked();

    expect(settings.id).toBe(original.id);
    expect(settings.models).toEqual(original.models);
    expect(settings.workflow).toEqual(original.workflow);
    expect(settings.agent.type).toBe(original.agent.type);
    expect(settings.agent.authMethod).toBe(original.agent.authMethod);
  });

  it('leaves the caller-facing execute() unmasked for server-side consumers', async () => {
    // update-settings loads, deep-merges and saves. Masking execute() would
    // persist the mask and destroy the stored credentials.
    mockRepository.setSettings(settingsWithSecrets());

    const settings = await useCase.execute();

    expect(settings.agent.token).toBe(AGENT_TOKEN);
  });

  it('does not mutate the stored settings while masking', async () => {
    const original = settingsWithSecrets();
    mockRepository.setSettings(original);

    await useCase.executeMasked();

    expect(original.agent.token).toBe(AGENT_TOKEN);
    expect(original.whatsapp?.cloudApiAccessToken).toBe(ACCESS_TOKEN);
    expect(original.messaging?.telegram?.botToken).toBe(BOT_TOKEN);
  });

  it('throws the same way execute() does when settings are missing', async () => {
    mockRepository.setSettings(null as never);

    await expect(useCase.executeMasked()).rejects.toThrow(/Settings not found/);
  });
});
