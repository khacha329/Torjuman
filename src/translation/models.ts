// Every model ID and price in the app, in one file so they are trivial to
// update when a provider ships a new model.
//
// Verified against the providers' own current documentation rather than
// recalled: Anthropic's model list (docs.claude.com) and ai.google.dev's model
// page. A stale ID returns an error whose message does not say "stale ID", so
// this is deliberately the only place they appear.

import type { ModelOption, ProviderId } from './TranslationProvider';

// ---------------------------------------------------------------- Anthropic

export const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet — recommended',
    note: 'Best balance of quality and cost',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku — cheapest',
    note: 'Faster and cheaper; weaker glossary adherence on dense passages',
  },
  {
    id: 'claude-opus-5',
    label: 'Opus — highest quality',
    note: 'Noticeably more expensive; rarely necessary here',
  },
];

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5';

/** Anthropic API version header value. */
export const ANTHROPIC_VERSION = '2023-06-01';

// ------------------------------------------------------------------- Gemini

export const GEMINI_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.7-flash',
    label: 'Flash 3.7 — recommended',
    note: 'Current Flash model; fast and good at Arabic',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Flash Lite 3.5 — fastest',
    note: 'Lowest latency and cost; weakest on dense commentary',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Flash 2.5 — previous generation',
    note: 'Older but well-established; use if 3.7 is unavailable on your key',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Pro 2.5 — highest quality',
    note: 'Strongest Gemini for this task; may fall outside the free tier',
  },
];

export const GEMINI_DEFAULT_MODEL = 'gemini-3.7-flash';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// -------------------------------------------------------------------- Pricing

/**
 * USD per million tokens. Used only to show the user what a translation cost.
 *
 * Anthropic's published list rates. Cache reads bill at ~0.1x input and cache
 * writes at ~1.25x (5-minute TTL) or ~2x (1-hour TTL); this app uses the 1-hour
 * TTL, so CACHE_WRITE_MULTIPLIER reflects that.
 *
 * Gemini is deliberately absent: the app's Gemini path is the free tier, where
 * the meaningful budget is requests rather than dollars, so the UI shows a
 * request count instead of a currency amount.
 */
export interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const PRICES: Record<string, Price> = {
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
};

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 2.0;

export function modelsFor(providerId: ProviderId): ModelOption[] {
  return providerId === 'anthropic' ? ANTHROPIC_MODELS : GEMINI_MODELS;
}

export function defaultModelFor(providerId: ProviderId): string {
  return providerId === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL;
}

/**
 * Cap on generated tokens, sized from the passage rather than left at a fixed
 * large ceiling. Output is billed on actual tokens so this does not change the
 * normal bill; it stops a malformed response generating for thousands of tokens.
 *
 * Arabic runs roughly 2.5 characters per token. The translation plus its JSON
 * envelope is allowed 2.5x that, with a floor for very short selections.
 */
export function maxTokensFor(targetText: string, multiplier = 4): number {
  const estimatedTargetTokens = Math.ceil(targetText.length / 2.5);
  return Math.min(
    Math.max(Math.round(estimatedTargetTokens * multiplier), 2048),
    MAX_TOKENS_CEILING,
  );
}

/**
 * Ceiling for the automatic retry after a truncated answer.
 *
 * The naive estimate was too tight: every segment carries *both* the Arabic and
 * its English, plus the JSON envelope, so the output routinely exceeds the
 * input rather than approximating it. Hence the 4x multiplier and a floor that
 * leaves room for short passages that still produce several segments.
 */
export const MAX_TOKENS_CEILING = 32000;

/** Rough token estimate for UI display. Mixed Arabic/English, so ~3 chars. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
