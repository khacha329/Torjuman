import type { CloudProviderId, ProviderId } from '../types';

// The one piece of provider knowledge the lower layers need at run time:
// whether a provider id names a network service that takes an API key. It sits
// here rather than beside the provider contract so that the key store
// (services/secrets.ts) can use it without depending on translation/. Moved
// verbatim from translation/TranslationProvider.ts in restructure Phase 1
// step 1a.

export function isCloudProvider(id: ProviderId): id is CloudProviderId {
  return id !== 'offline';
}
