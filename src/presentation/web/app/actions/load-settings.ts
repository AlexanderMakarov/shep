'use server';

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from '@/lib/server-container';
import type {
  LoadSettingsUseCase,
  SettingsSecretPresence,
} from '@shepai/core/application/use-cases/settings/load-settings.use-case';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';
import type { Settings } from '@shepai/core/domain/generated/output';

export interface LoadSettingsResult {
  /** Settings with every credential stripped — see `executeMasked()`. */
  settings?: Settings;
  /** What is stored for each credential, without the values. */
  secrets?: SettingsSecretPresence;
  shepHome?: string;
  dbFileSize?: string;
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loadSettings(): Promise<LoadSettingsResult> {
  try {
    const useCase = resolve<LoadSettingsUseCase>('LoadSettingsUseCase');
    // Masked: this result is passed as a prop into a 'use client' component,
    // and client props are serialised whole into the RSC Flight payload
    // embedded in the HTML. An unmasked load here put every stored token in
    // `curl -s http://localhost:4050/settings`.
    const { settings, secrets } = await useCase.executeMasked();

    const shepHome = getShepHomeDir();
    let dbFileSize = 'Unknown';
    try {
      const dbPath = join(shepHome, 'data');
      const stat = statSync(dbPath);
      dbFileSize = formatFileSize(stat.size);
    } catch {
      // DB file may not exist yet
    }

    return { settings, secrets, shepHome, dbFileSize };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load settings';
    return { error: message };
  }
}
