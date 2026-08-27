import {
  isCloudProvider,
  type CloudProviderId,
  type ProviderId,
} from '../translation/TranslationProvider';

// API keys, kept apart from the rest of the settings.
//
// Every provider's key is stored independently, so the user can hold a Gemini
// key and an Anthropic key at once and switch between them without re-entering
// either.
//
// Three deliberate properties:
//
//   1. No key is embedded in the app. A key shipped inside a distributed client
//      is trivially extractable and the resulting bill is unbounded. Every key
//      here is the user's own.
//   2. Keys are NOT part of AppSettings, so they never reach the backup file —
//      which is a file the user will copy between devices.
//   3. A key is never logged and never interpolated into an error message.
//
// The spec allows localStorage for the web phase. Under Capacitor these move to
// encrypted preferences; only this file changes.

// The offline path has no key, which is the point of it.
const PROVIDER_KEYS: Record<CloudProviderId, string> = {
  anthropic: 'shamela-reader.anthropic-api-key',
  gemini: 'shamela-reader.gemini-api-key',
};

const SUNNAH_KEY = 'shamela-reader.sunnah-api-key';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    // Private browsing, or a browser configured to block site data.
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value.trim() === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value.trim());
  } catch {
    // Nothing useful to do; the settings screen shows the value as unsaved.
  }
}

export const secrets = {
  getProviderKey: (id: ProviderId) =>
    isCloudProvider(id) ? read(PROVIDER_KEYS[id]) : '',
  setProviderKey: (id: CloudProviderId, value: string) => write(PROVIDER_KEYS[id], value),
  hasProviderKey: (id: ProviderId) =>
    isCloudProvider(id) && read(PROVIDER_KEYS[id]) !== '',
  /** True once the user can translate with a cloud provider. */
  hasAnyProviderKey: () =>
    (Object.keys(PROVIDER_KEYS) as CloudProviderId[]).some(
      (id) => read(PROVIDER_KEYS[id]) !== '',
    ),
  getSunnahKey: () => read(SUNNAH_KEY),
  setSunnahKey: (value: string) => write(SUNNAH_KEY, value),
};
