import type { SecretPresence } from '@shepai/core/application/use-cases/settings/load-settings.use-case';

/**
 * Stored credentials never reach the browser — `LoadSettingsUseCase.executeMasked()`
 * strips them, because a `'use client'` component's props are serialised whole
 * into the RSC Flight payload embedded in the page HTML.
 *
 * What the UI shows instead is presence: a row of dots, plus the last four
 * characters when the secret is long enough that four characters do not
 * disclose it. The input itself stays empty and is write-only — typing a new
 * value replaces the stored one, leaving it untouched does nothing.
 */
export const MASK_DOTS = '••••••••';

/** Placeholder for a secret input, given what the server said is stored. */
export function secretPlaceholder(
  presence: SecretPresence | undefined,
  emptyPlaceholder: string
): string {
  if (!presence?.hasValue) {
    return emptyPlaceholder;
  }
  return presence.lastFour ? `${MASK_DOTS}${presence.lastFour}` : MASK_DOTS;
}

/**
 * What to send for a write-only secret field.
 *
 * `undefined` means "leave the stored value alone" — the settings deep-merge
 * skips undefined. An empty string would be written through and would wipe
 * the credential, which is what made the masking change dangerous: several
 * save paths re-send every field on any change.
 */
export function secretUpdateValue(typed: string, cleared: boolean): string | undefined {
  const trimmed = typed.trim();
  if (trimmed.length > 0) return trimmed;
  return cleared ? '' : undefined;
}
