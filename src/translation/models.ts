// Every model ID and price in the app, in one file so they are trivial to
// update when a provider ships a new model.
//
// Verified against the providers' own current documentation rather than
// recalled: Anthropic's model list (docs.claude.com) and ai.google.dev's model
// page. A stale ID returns an error whose message does not say "stale ID", so
// this is deliberately the only place they appear.

import type { ModelOption } from './TranslationProvider';
import type { TranslationUsage } from '../types';

// ---------------------------------------------------------------- Anthropic

// Constants rather than string literals at the call sites, so that a grep for
// "claude-" in src/ finds this file and nothing else.
export const CLAUDE_FABLE_5_1 = 'claude-fable-5-1';
export const CLAUDE_OPUS_5_5 = 'claude-opus-5-5';
export const CLAUDE_SONNET_5_5 = 'claude-sonnet-5-5';
export const CLAUDE_HAIKU_5_5 = 'claude-haiku-5-5';

// The previous generation. Still served, and still named on cards made with
// them, so they keep a price and a label — but they are no longer offered.
export const CLAUDE_OPUS_5 = 'claude-opus-5';
export const CLAUDE_SONNET_5 = 'claude-sonnet-5';
export const CLAUDE_HAIKU_4_5 = 'claude-haiku-4-5';

export const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: CLAUDE_SONNET_5_5,
    label: 'Sonnet 5.5 — recommended',
    note: 'Best balance of quality and cost',
  },
  {
    id: CLAUDE_HAIKU_5_5,
    label: 'Haiku 5.5 — cheapest',
    note: 'Faster and much cheaper; weaker glossary adherence on dense passages',
  },
  {
    id: CLAUDE_OPUS_5_5,
    label: 'Opus 5.5 — highest quality',
    note: 'Twice the price of Sonnet; rarely necessary here',
  },
  {
    id: CLAUDE_FABLE_5_1,
    label: 'Fable 5.1 — hardest texts only',
    note: 'Five times the price of Sonnet and slower; for passages the others get wrong',
  },
];

export const ANTHROPIC_DEFAULT_MODEL = CLAUDE_SONNET_5_5;

/** Checking a key needs a model; the cheapest one will do. */
export const ANTHROPIC_KEY_CHECK_MODEL = CLAUDE_HAIKU_5_5;

/** The reader's "Meaning" lookup: a tiny request, so the cheapest model. */
export const ANTHROPIC_GLOSS_MODEL = CLAUDE_HAIKU_5_5;

// Small in, small out. The answer itself is a few hundred tokens, but
// Haiku 5.5 thinks by default and thinking counts against this limit,
// so it leaves room for some. Billing is on what is actually generated.
export const GLOSS_MAX_TOKENS = 2000;

// A glance, not an article: the least thinking that does the job. Haiku
// 5.5's own default is `medium`.
export const GLOSS_OUTPUT_CONFIG: { effort: Effort } = { effort: 'low' };

/**
 * Explain runs on Claude even when the active profile is on Gemini, since it
 * relies on Anthropic's web-search tool. This is the model it uses then.
 */
export const ANTHROPIC_EXPLAIN_FALLBACK_MODEL = CLAUDE_SONNET_5_5;

/**
 * Labels for models no longer offered, so a card made with one still shows
 * which model wrote it rather than a bare ID.
 */
export const SUPERSEDED_ANTHROPIC_MODELS: ModelOption[] = [
  { id: CLAUDE_SONNET_5, label: 'Sonnet 5', note: 'Previous generation' },
  { id: CLAUDE_HAIKU_4_5, label: 'Haiku 4.5', note: 'Previous generation' },
  { id: CLAUDE_OPUS_5, label: 'Opus 5', note: 'Previous generation' },
];

/**
 * What a saved profile pinned to a superseded model moves to on load.
 *
 * These are still served (see docs.claude.com's deprecations page), so this is
 * a choice rather than a forced repair: the profile follows its tier forward.
 * Cards keep the model that actually produced them.
 */
const ANTHROPIC_SUCCESSORS: Record<string, string> = {
  [CLAUDE_SONNET_5]: CLAUDE_SONNET_5_5,
  [CLAUDE_HAIKU_4_5]: CLAUDE_HAIKU_5_5,
  [CLAUDE_OPUS_5]: CLAUDE_OPUS_5_5,
};

/**
 * The model a profile should run on now, given the one it was saved with.
 * Claude's superseded models follow their tier forward; Gemini's retired ones
 * go where Google routes them (GEMINI_SUCCESSORS).
 */
export function successorModel(model: string): string {
  return ANTHROPIC_SUCCESSORS[model] ?? GEMINI_SUCCESSORS[model] ?? model;
}

/**
 * Where an overloaded Claude call goes next, in order (the owner's answer,
 * 2026-11-26: cheaper Claude models first, then Gemini). Most expensive
 * first, so the models after a profile's own are the cheaper ones: a
 * fallback never costs more per token than the model that failed. A model
 * not on this list (a superseded one) has no Claude step and goes straight
 * to Gemini.
 */
export const ANTHROPIC_FALLBACK_ORDER: string[] = [
  CLAUDE_FABLE_5_1,
  CLAUDE_OPUS_5_5,
  CLAUDE_SONNET_5_5,
  CLAUDE_HAIKU_5_5,
];

/**
 * The one Claude model an overloaded Gemini chain crosses to, when a Claude
 * key is set and Settings allows crossing providers: the cheapest.
 */
export const ANTHROPIC_CROSS_FALLBACK_MODEL = CLAUDE_HAIKU_5_5;

/** True for any Claude model ID, current or not. */
export function isClaudeModel(model: string | undefined): boolean {
  return Boolean(model?.startsWith('claude-'));
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Effort, where a model's default is not what this app wants.
 *
 * Opus 5.5 defaults to `medium`, one level below Opus 5. Someone choosing Opus
 * here has chosen it for quality, so it runs at `high` — what Opus 5 did when
 * the parameter was omitted. Every other model is left at its own default.
 */
const EFFORT: Record<string, Effort> = {
  [CLAUDE_OPUS_5_5]: 'high',
};

/** The request's `output_config`, or undefined where the model's default stands. */
export function outputConfigFor(model: string): { effort: Effort } | undefined {
  const effort = EFFORT[model];
  return effort ? { effort } : undefined;
}

// ------------------------------------------------------------------- Gemini

// The four Gemini models the API's model page lists as stable for text
// (aistudio.google.com/docs/models, which ai.google.dev/gemini-api/docs/models
// now redirects to; read 2026-11-26). Until then the app offered
// gemini-3.7-flash, which the page no longer lists (its deprecations page says
// requests to it are routed to gemini-3.8-flash), and the two 2.5 models,
// which Google has closed to new keys: "Access to the 2.5 models is limited
// to users who have actively used them in the past."
export const GEMINI_3_8_FLASH = 'gemini-3.8-flash';
export const GEMINI_3_6_FLASH = 'gemini-3.6-flash';
export const GEMINI_3_5_FLASH_LITE = 'gemini-3.5-flash-lite';
export const GEMINI_3_1_FLASH_LITE = 'gemini-3.1-flash-lite';

// No longer offered, and still named on cards made with them.
export const GEMINI_3_7_FLASH = 'gemini-3.7-flash';
export const GEMINI_2_5_FLASH = 'gemini-2.5-flash';
export const GEMINI_2_5_PRO = 'gemini-2.5-pro';

/**
 * Offered, and in the order an overloaded Gemini call falls back through
 * (the owner's order, 2026-11-26): the profile's own model first, then every
 * other one in this order.
 */
export const GEMINI_MODELS: ModelOption[] = [
  {
    id: GEMINI_3_8_FLASH,
    label: 'Flash 3.8 — newest',
    note: 'The newest Flash model (September 2026)',
  },
  {
    id: GEMINI_3_6_FLASH,
    label: 'Flash 3.6',
    note: 'The previous Flash model (July 2026)',
  },
  {
    id: GEMINI_3_5_FLASH_LITE,
    label: 'Flash Lite 3.5 — recommended',
    note: 'Lowest latency and cost; weakest on dense commentary',
  },
  {
    id: GEMINI_3_1_FLASH_LITE,
    label: 'Flash Lite 3.1 — oldest',
    note: 'Google may shut it down from 7 May 2027',
  },
];

/** The owner's choice: the one that works on the owner's key (2026-11-26). */
export const GEMINI_DEFAULT_MODEL = GEMINI_3_5_FLASH_LITE;

/** Labels for Gemini models no longer offered, so their cards still name them. */
export const SUPERSEDED_GEMINI_MODELS: ModelOption[] = [
  { id: GEMINI_3_7_FLASH, label: 'Flash 3.7', note: 'No longer offered' },
  { id: GEMINI_2_5_FLASH, label: 'Flash 2.5', note: 'Closed to new keys' },
  { id: GEMINI_2_5_PRO, label: 'Pro 2.5', note: 'Closed to new keys' },
];

/**
 * What a saved profile on a retired Gemini model moves to on load: where
 * Google itself routes that model's requests, per its deprecations page
 * (read 2026-11-26). gemini-3.7-flash already goes to 3.8 Flash. From
 * 1 December 2026 gemini-2.5-pro goes to 3.8 Flash and gemini-2.5-flash to
 * 3.5 Flash Lite. A key that never used the 2.5 models is refused them today.
 * As with Claude, only the profile moves; cards keep the model that wrote them.
 */
const GEMINI_SUCCESSORS: Record<string, string> = {
  [GEMINI_3_7_FLASH]: GEMINI_3_8_FLASH,
  [GEMINI_2_5_PRO]: GEMINI_3_8_FLASH,
  [GEMINI_2_5_FLASH]: GEMINI_3_5_FLASH_LITE,
};

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// -------------------------------------------------------------------- Pricing

/**
 * USD per million tokens. Used only to show the user what a translation cost.
 *
 * Anthropic's published list rates (docs.claude.com/about-claude/pricing,
 * checked 2026-10-28). Cache writes bill at 2x input for the 1-hour TTL this
 * app uses, on every model listed. Cache reads are 0.1x input on most models
 * but not all, so a model that differs says so.
 *
 * Gemini is deliberately absent: the app's Gemini path is the free tier, where
 * the meaningful budget is requests rather than dollars, so the UI shows a
 * request count instead of a currency amount.
 */
export interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Cache-read price as a fraction of input. Defaults to CACHE_READ_MULTIPLIER. */
  cacheReadMultiplier?: number;
  /**
   * Higher rates for a request whose prompt (input plus cache reads and writes)
   * exceeds `overPromptTokens`. Haiku 5.5 is the only model priced this way.
   */
  longContext?: { overPromptTokens: number; inputPerMTok: number; outputPerMTok: number };
}

export const PRICES: Record<string, Price> = {
  [CLAUDE_FABLE_5_1]: { inputPerMTok: 10, outputPerMTok: 50, cacheReadMultiplier: 0.025 },
  [CLAUDE_OPUS_5_5]: { inputPerMTok: 4, outputPerMTok: 20, cacheReadMultiplier: 0.05 },
  [CLAUDE_SONNET_5_5]: { inputPerMTok: 2, outputPerMTok: 10, cacheReadMultiplier: 0.05 },
  [CLAUDE_HAIKU_5_5]: {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    longContext: { overPromptTokens: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
  },
  // Superseded, kept so cards made with them still cost correctly.
  [CLAUDE_OPUS_5]: { inputPerMTok: 5, outputPerMTok: 25 },
  [CLAUDE_SONNET_5]: { inputPerMTok: 2, outputPerMTok: 10 },
  [CLAUDE_HAIKU_4_5]: { inputPerMTok: 1, outputPerMTok: 5 },
};

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 2.0;

/**
 * USD estimate from the token counts the API reported.
 *
 * `usage` can be the sum of several requests (dig deeper, Explain). A model
 * with long-context pricing is priced at the higher rate when the summed prompt
 * crosses its threshold, which is exact for one request and an upper bound for
 * several. Only Haiku 5.5 has such a tier, at 100,000 prompt tokens.
 */
export function costOf(model: string, usage: TranslationUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;

  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const rates =
    price.longContext && promptTokens > price.longContext.overPromptTokens
      ? price.longContext
      : price;
  const cacheReadMultiplier = price.cacheReadMultiplier ?? CACHE_READ_MULTIPLIER;

  const input = usage.inputTokens * rates.inputPerMTok;
  const cacheRead = usage.cacheReadTokens * rates.inputPerMTok * cacheReadMultiplier;
  const cacheWrite = usage.cacheWriteTokens * rates.inputPerMTok * CACHE_WRITE_MULTIPLIER;
  const output = usage.outputTokens * rates.outputPerMTok;

  return (input + cacheRead + cacheWrite + output) / 1_000_000;
}

/**
 * Cap on generated tokens, sized from the passage rather than left at a fixed
 * large ceiling. Output is billed on actual tokens so this does not change the
 * normal bill; it stops a malformed response generating for thousands of tokens.
 *
 * Arabic runs roughly 2.5 characters per token. The translation plus its JSON
 * envelope is allowed 2.5x that, with a floor for very short selections.
 */
export function maxTokensFor(targetText: string, multiplier = 4, model?: string): number {
  const estimatedTargetTokens = Math.ceil(targetText.length / 2.5);
  return Math.min(
    Math.max(Math.round(estimatedTargetTokens * multiplier), 2048),
    model ? outputCeilingFor(model) : MAX_TOKENS_CEILING,
  );
}

/**
 * Floor for Explain's structuring pass, where a model thinks at length first.
 *
 * That pass is sized from the phrase, which is short, so it nearly always lands
 * on maxTokensFor's 2,048 floor. Thinking counts against max_tokens, and Opus
 * 5.5 runs at `high` effort here (see EFFORT), so 2,048 can be spent thinking
 * before the tool call is written — a reply cut off with nothing to show for
 * it. Billing is on what is generated, so the higher floor costs nothing when
 * it goes unused.
 */
const EXPLAIN_STRUCTURE_FLOOR: Record<string, number> = {
  [CLAUDE_OPUS_5_5]: 16_000,
};

/** max_tokens for Explain's second pass: the usual sizing, raised where needed. */
export function explainStructureMaxTokens(phrase: string, model: string): number {
  return Math.max(maxTokensFor(phrase, 6, model), EXPLAIN_STRUCTURE_FLOOR[model] ?? 0);
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

/**
 * Per-model output ceilings, where the model allows more than the default.
 *
 * The current Claude models all accept up to 128K output tokens, and the SDK
 * requires streaming for values that large — which this app already does, on
 * both providers. The shared 32,000 default would leave most of that unused:
 * `maxTokensFor` caps there, so any passage over roughly 20,000 characters got
 * the same budget as one of 20,000, and the retry after a truncation had
 * nowhere to grow.
 *
 * Only models whose limit has been checked against the model's own page on
 * docs.claude.com are listed. Gemini keeps the default because its limits were
 * not verified here.
 */
const OUTPUT_CEILINGS: Record<string, number> = {
  [CLAUDE_FABLE_5_1]: 128_000,
  [CLAUDE_OPUS_5_5]: 128_000,
  [CLAUDE_SONNET_5_5]: 128_000,
  [CLAUDE_HAIKU_5_5]: 128_000,
  [CLAUDE_OPUS_5]: 128_000,
  [CLAUDE_SONNET_5]: 128_000,
  [CLAUDE_HAIKU_4_5]: 64_000,
};

export function outputCeilingFor(model: string): number {
  return OUTPUT_CEILINGS[model] ?? MAX_TOKENS_CEILING;
}

/** Rough token estimate for UI display. Mixed Arabic/English, so ~3 chars. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
