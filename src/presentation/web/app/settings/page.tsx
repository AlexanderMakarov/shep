import { loadSettings } from '@/app/actions/load-settings';
import { getAvailableTerminals } from '@/app/actions/get-available-terminals';
import { SettingsPageClient } from '@/components/features/settings/settings-page-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [{ settings, secrets, shepHome, dbFileSize, error }, availableTerminals] =
    await Promise.all([loadSettings(), getAvailableTerminals()]);

  if (error || !settings) {
    return (
      <div className="flex h-full flex-col p-6">
        <p className="text-destructive text-sm">Failed to load settings: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col px-4 pb-6 sm:px-6">
      <SettingsPageClient
        settings={settings}
        secrets={secrets}
        shepHome={shepHome ?? ''}
        dbFileSize={dbFileSize ?? 'Unknown'}
        availableTerminals={availableTerminals}
      />
    </div>
  );
}
