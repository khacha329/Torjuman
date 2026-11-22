// Providers, usage, profiles, the glossary and word glosses.
// Re-exported by index.ts: outside types/, import them from `types`.

/**
 * `offline` labels a card produced by the on-device model. It is a label, not a
 * member of the provider registry — see registry.ts for why the offline path is
 * deliberately not interchangeable with the cloud ones.
 */
export type ProviderId = 'anthropic' | 'gemini' | 'offline';

/** The providers that talk to a network service and take an API key. */
export type CloudProviderId = Exclude<ProviderId, 'offline'>;

/** Token counts, normalized across providers. */
export interface TranslationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Why a translation failed, in the terms the user needs.
 *
 * `auth` and `rate-limit` in particular must stay distinguishable: one means
 * "your key is wrong", the other means "wait a minute". A generic error message
 * sends the user hunting in entirely the wrong place.
 */
export type TranslationErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'refusal'
  | 'parse'
  /** The token limit was reached mid-answer. A different remedy from a parse error. */
  | 'truncated'
  /**
   * The model stopped for a reason of its own that is neither a refusal nor
   * the token limit — Gemini's RECITATION, LANGUAGE, OTHER and the rest. The
   * card names the reason; it is never reported as a parse failure.
   */
  | 'stopped'
  /** The reply's stream closed with no finish reason: the connection was cut. */
  | 'interrupted'
  | 'api';

/**
 * An English gloss for a single word, in the sense it carries in its sentence.
 *
 * Cached by normalized word form, so a repeated word is free and works offline
 * afterwards. Deliberately separate from the glossary: these are transient
 * lookups, not terminology decisions, and they never write to it.
 */
export interface WordGloss {
  /** Normalized form — the cache key. */
  word: string;
  /** As it appeared, harakāt intact. */
  display: string;
  root: string;
  meaning: string;
  note: string | null;
  isTechnicalTerm: boolean;
  model: string;
  createdAt: number;
}

export interface TranslationProfile {
  id: string;
  name: string;
  version: number; // bump on ANY edit — invalidates cache
  systemPrompt: string;
  useTransliteration: boolean; // default: false
  allowExternalLookup: boolean; // default: false
  /** A profile pins both the service and the model it runs on. */
  providerId: ProviderId;
  model: string;
}

export interface GlossaryEntry {
  id: string;
  arabic: string;
  english: string;
  note: string | null;
  addedAt: number;
}
