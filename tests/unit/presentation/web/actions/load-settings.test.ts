// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';

const mockExecuteMasked = vi.fn();
const mockResolve = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock('@shepai/core/application/use-cases/settings/load-settings.use-case', () => ({
  LoadSettingsUseCase: class LoadSettingsUseCase {},
}));

vi.mock('@shepai/core/infrastructure/services/filesystem/shep-directory.service', () => ({
  getShepHomeDir: () => '/home/user/.shep',
}));

vi.mock('node:fs', async () => {
  const { join } = await import('node:path');
  const expectedPath = join('/home/user/.shep', 'data');
  return {
    statSync: (path: string) => {
      if (path === expectedPath) {
        return { size: 2516582 }; // ~2.4 MB
      }
      throw new Error('ENOENT');
    },
  };
});

const { loadSettings } = await import(
  '../../../../../src/presentation/web/app/actions/load-settings.js'
);

const ABSENT = { hasValue: false, lastFour: '' };
const SECRETS = {
  agentToken: ABSENT,
  whatsappCloudApiAccessToken: ABSENT,
  whatsappCloudApiVerifyToken: ABSENT,
  whatsappCloudApiAppSecret: ABSENT,
  telegramBotToken: ABSENT,
  telegramRouteToken: ABSENT,
  messagingWhatsappBotToken: ABSENT,
  messagingWhatsappRouteToken: ABSENT,
};

describe('loadSettings server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockReturnValue({ executeMasked: mockExecuteMasked });
  });

  it('returns settings with shepHome and dbFileSize', async () => {
    const settings = createDefaultSettings();
    mockExecuteMasked.mockResolvedValue({ settings, secrets: SECRETS });

    const result = await loadSettings();

    expect(result.settings).toEqual(settings);
    expect(result.secrets).toEqual(SECRETS);
    expect(result.shepHome).toBe('/home/user/.shep');
    expect(result.dbFileSize).toBe('2.4 MB');
    expect(result.error).toBeUndefined();
  });

  it('loads through the MASKED entry point', async () => {
    // The result is a prop of a 'use client' component, and client props are
    // serialised whole into the RSC Flight payload embedded in the HTML.
    // `execute()` would put every stored token in `curl -s .../settings`.
    const settings = createDefaultSettings();
    mockExecuteMasked.mockResolvedValue({ settings, secrets: SECRETS });
    const useCase = { execute: vi.fn(), executeMasked: mockExecuteMasked };
    mockResolve.mockReturnValue(useCase);

    await loadSettings();

    expect(mockExecuteMasked).toHaveBeenCalledOnce();
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('returns error when use case throws', async () => {
    mockExecuteMasked.mockRejectedValue(new Error('Settings not found'));

    const result = await loadSettings();

    expect(result.error).toBe('Settings not found');
    expect(result.settings).toBeUndefined();
    expect(result.secrets).toBeUndefined();
  });

  it('handles unknown database file gracefully', async () => {
    const settings = createDefaultSettings();
    mockExecuteMasked.mockResolvedValue({ settings, secrets: SECRETS });

    // Re-mock fs to simulate missing db file
    const fs = await import('node:fs');
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = await loadSettings();

    expect(result.settings).toEqual(settings);
    expect(result.dbFileSize).toBe('Unknown');
  });
});
