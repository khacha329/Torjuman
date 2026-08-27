import {
  isCloudProvider,
  type CloudProviderId,
  type ProviderId,
  type TranslationProvider,
} from './TranslationProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GeminiProvider } from './providers/GeminiProvider';

// The only place outside the settings screen that names a provider.
//
// Everything else asks for the provider a profile pins and talks to the
// interface, so adding a third provider means adding a file and one line here.

const PROVIDERS: Record<CloudProviderId, TranslationProvider> = {
  gemini: new GeminiProvider(),
  anthropic: new AnthropicProvider(),
};

/** Gemini first: it is the zero-cost path and the default for a new install. */
export const PROVIDER_ORDER: CloudProviderId[] = ['gemini', 'anthropic'];

/**
 * The offline path is not in PROVIDERS.
 *
 * It does not implement the same contract in any useful sense — it never sees a
 * system prompt, cannot emit anything but prose, and above all must only ever
 * receive the prose spans that offline/segmentSelection.ts hands it. Listing it
 * beside the cloud providers would invite code to treat the three
 * interchangeably and pass it a whole selection, scripture included. Keeping it
 * out makes that mistake impossible to make by accident.
 */
export const OFFLINE_PROVIDER_ID = 'offline' as const;

export const DEFAULT_PROVIDER_ID: CloudProviderId = 'gemini';

export function providerFor(id: ProviderId): TranslationProvider {
  return isCloudProvider(id) ? PROVIDERS[id] : PROVIDERS[DEFAULT_PROVIDER_ID];
}

/** How a card labels the thing that produced it. */
export function badgeFor(id: ProviderId): { displayName: string; isFree: boolean } {
  if (!isCloudProvider(id)) return { displayName: 'On device', isFree: true };
  return { displayName: PROVIDERS[id].displayName, isFree: PROVIDERS[id].isFree };
}

export function allProviders(): TranslationProvider[] {
  return PROVIDER_ORDER.map((id) => PROVIDERS[id]);
}

export function cloudProviderIds(): CloudProviderId[] {
  return [...PROVIDER_ORDER];
}
