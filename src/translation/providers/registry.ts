import { type ModelOption, type TranslationProvider } from '../TranslationProvider';
import { isCloudProvider } from '../../lib/providers';
import type { CloudProviderId, ProviderId } from '../../types';
import { AnthropicProvider } from './AnthropicProvider';
import { GeminiProvider } from './GeminiProvider';
import { isClaudeModel } from '../models';

// Where the providers are listed, and the lookups on them.
//
// Everything else asks for the provider a profile pins and talks to the
// interface. Adding a third provider means its file, one entry in PROVIDERS
// and PROVIDER_ORDER, its id in ProviderId, and what tsc then reports: each
// Record<CloudProviderId, …> missing a key (PROVIDER_KEYS in
// services/secrets.ts, COMPILERS in qul/compile.ts) and the reader's
// Record<ProviderId, number> request counts (ui/reader/useTranslator.ts).
// Corrected in restructure Phase 3: this comment used to say it was the only
// place outside the settings screen that named a provider, which was never
// true (FOUND_ISSUES 4).

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

export function modelsFor(id: ProviderId): ModelOption[] {
  return providerFor(id).availableModels;
}

/** The option for a model ID, including ones no longer offered. */
export function findModelOption(id: ProviderId, model: string): ModelOption | undefined {
  return providerFor(id).knownModels.find((entry) => entry.id === model);
}

export function defaultModelFor(id: ProviderId): string {
  return providerFor(id).defaultModel;
}

/** A model's short name as a card's badge shows it ("Flash 3.8"), or its ID. */
export function modelLabel(id: ProviderId, model: string): string {
  const option = findModelOption(id, model);
  return option ? option.label.split(' — ')[0] : model;
}

/** Which provider a profile saved before providers existed was on (AppContext). */
export function providerIdForModel(model: string): CloudProviderId {
  return isClaudeModel(model) ? 'anthropic' : 'gemini';
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
